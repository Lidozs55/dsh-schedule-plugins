/**
 * Built-in Bilibili reader behind the `schedule gacha fetch` command.
 *
 * The working agent's sandbox often cannot reach api.bilibili.com (TLS/proxy
 * fences) and the raw endpoints churn with risk control. The Host process
 * therefore proxies a whitelist of read-only official endpoints: the game →
 * account mapping (UID / live room) and browser headers are owned here, so
 * prompts, guides and agents never carry them. Responses are trimmed to the
 * fields verification actually needs — evidence text plus stable URLs.
 */
import { getGame } from './games.js'
import { fetchJson } from './http.js'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_TEXT_CHARS = 20_000

/** Official accounts: B 站 UID（mid）与直播间号（room），随官方迁移时只改这里。 */
const ACCOUNTS = {
  genshin: { mid: '401742377', room: '21987615' },
  hsr: { mid: '1340190821', room: '27263119' },
  zzz: { mid: '1636034895', room: '32805602' },
  wuwa: { mid: '1955897084', room: '27354807' },
  endfield: { mid: '1265652806', room: '1921300321' },
  nte: { mid: '3546636978489848', room: '1890951177' },
}

export class BiliError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BiliError'
    this.code = code
  }
}

const invalid = message => new BiliError('invalid_input', message)
const riskControl = () => new BiliError('risk_control',
  '被 B 站风控拦截（-352/HTTP 412）：稍后重试，或改用 --kind videos / --kind live 兜底')

/** Re-express a unix instant as an explicit +08:00 wall-clock ISO string. */
const cstIso = seconds => new Date(seconds * 1000 + 8 * 3_600_000)
  .toISOString().replace(/\.\d{3}Z$/, '+08:00')

async function getJson(url, referer, signal) {
  return fetchJson(url, {
    headers: { 'User-Agent': USER_AGENT, Referer: referer, Accept: 'application/json' },
    signal,
    wrap: (code, message) => new BiliError(code, message),
    interpret: async response => {
      if (response.status === 412) throw riskControl()
      if (!response.ok) {
        throw new BiliError(`http_${response.status}`, `B 站接口 HTTP ${response.status}`)
      }
      const body = await response.json()
      if (body?.code !== 0) {
        if (body?.code === -352) throw riskControl()
        throw new BiliError('bili_error', `B 站返回 ${body?.code}：${body?.message ?? '未知错误'}`)
      }
      return body.data
    },
  })
}

const clampText = text => (typeof text === 'string' && text.length > MAX_TEXT_CHARS
  ? text.slice(0, MAX_TEXT_CHARS) + '…（已截断）'
  : text)

/** Collapse announcement HTML into the plain text the evidence needs. */
export function stripHtml(html) {
  if (typeof html !== 'string' || html === '') return ''
  const text = html
    .replace(/<\s*(br|\/p|\/div|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
  return clampText(text.trim())
}

const textOf = value => (typeof value === 'string' ? value : '')

function articlesView(data, page) {
  const rows = Array.isArray(data?.articles) ? data.articles : []
  return {
    kind: 'articles',
    total: typeof data?.total === 'number' ? data.total : rows.length,
    page,
    articles: rows.map(row => ({
      id: String(row.id ?? ''),
      title: textOf(row.title),
      publishTime: typeof row.publish_time === 'number' ? cstIso(row.publish_time) : null,
      url: typeof row.id === 'number' || typeof row.id === 'string'
        ? `https://www.bilibili.com/read/cv${row.id}` : null,
    })),
  }
}

function articleView(data) {
  return {
    kind: 'article',
    id: String(data?.id ?? ''),
    title: textOf(data?.title),
    author: textOf(data?.author_name),
    publishTime: typeof data?.publish_time === 'number' ? cstIso(data.publish_time) : null,
    text: stripHtml(data?.content),
  }
}

function dynamicsView(data) {
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    kind: 'dynamics',
    dynamics: items.map(item => {
      const dynamic = item?.modules?.module_dynamic
      const author = item?.modules?.module_author
      const text = textOf(dynamic?.desc?.text)
        || textOf(dynamic?.major?.opus?.summary?.text)
        || textOf(dynamic?.major?.opus?.title)
      return {
        id: textOf(item?.id_str),
        time: typeof author?.pub_ts === 'number' ? cstIso(author.pub_ts) : null,
        text: clampText(text),
        url: item?.id_str ? `https://t.bilibili.com/${item.id_str}` : null,
      }
    }),
  }
}

function videosView(data) {
  const rows = Array.isArray(data?.archives) ? data.archives : []
  return {
    kind: 'videos',
    videos: rows.map(row => ({
      bvid: textOf(row.bvid),
      title: textOf(row.title),
      publishTime: typeof row.pubdate === 'number' ? cstIso(row.pubdate) : null,
      url: row.bvid ? `https://www.bilibili.com/video/${row.bvid}` : null,
    })),
  }
}

/**
 * The live room page embeds the reservation announcement as plain
 * HTML-escaped JSON: "ctime":"2026-10-21 12:00:30","content":"将于…开启".
 * This teaser survives dynamics-feed risk control and carries the room's
 * fixed +08:00 wall-clock time.
 */
const ANNOUNCEMENT_PAIR = /"ctime":"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})","content":"((?:[^"\\]|\\.)+)"/g

export function parseAnnouncement(html) {
  if (typeof html !== 'string' || html === '') return null
  let best = null
  for (const match of html.matchAll(ANNOUNCEMENT_PAIR)) {
    let content
    try {
      content = JSON.parse(`"${match[2]}"`)
    } catch {
      content = match[2]
    }
    if (!/\d/.test(content)) continue
    const seconds = Date.parse(`${match[1]}+08:00`)
    const publishedAt = Number.isFinite(seconds) ? new Date(seconds).toISOString() : null
    if (best === null || (publishedAt !== null && (best.publishedAt === null || publishedAt > best.publishedAt))) {
      best = { content: clampText(content), publishedAt }
    }
  }
  return best
}

async function liveView(account, signal) {
  const info = await getJson(
    `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${encodeURIComponent(account.room)}`,
    `https://live.bilibili.com/${account.room}`, signal)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let page = ''
  try {
    const response = await fetch(`https://live.bilibili.com/${account.room}`, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Referer: 'https://live.bilibili.com/' },
    })
    if (response.ok) page = await response.text()
  } catch { /* announcement is best-effort; room info already succeeded */ }
  finally {
    clearTimeout(timer)
  }
  return {
    kind: 'live',
    room: account.room,
    title: textOf(info?.title),
    liveStatus: info?.live_status,
    description: clampText(textOf(info?.description)),
    announcement: parseAnnouncement(page),
  }
}

/**
 * Read one whitelisted official source for one game.
 * @param {{game: string, kind: string, id?: string, keywords?: string, page?: number}} input
 * @param {AbortSignal} [signal]
 */
export async function fetchOfficial(input, signal) {
  const game = getGame(input.game)
  if (game === undefined) throw invalid(`未知游戏：${input.game}`)
  const account = ACCOUNTS[input.game]
  if (account === undefined) throw invalid(`该游戏暂无内置官方账号：${input.game}`)

  switch (input.kind) {
    case 'articles': {
      const page = input.page ?? 1
      if (!Number.isInteger(page) || page < 1) throw invalid('page 必须是正整数')
      const data = await getJson(
        `https://api.bilibili.com/x/space/article?mid=${encodeURIComponent(account.mid)}`
        + `&pn=${page}&ps=30&sort=publish_time`,
        `https://space.bilibili.com/${account.mid}/article`, signal)
      return { game: input.game, ...articlesView(data, page) }
    }
    case 'article': {
      const id = String(input.id ?? '').trim()
      if (!/^\d+$/.test(id)) throw invalid('article 需要数字文章 id（--id）')
      const data = await getJson(`https://api.bilibili.com/x/article/view?id=${id}`,
        `https://www.bilibili.com/read/cv${id}`, signal)
      return { game: input.game, ...articleView(data) }
    }
    case 'dynamics': {
      const data = await getJson(
        `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${encodeURIComponent(account.mid)}`,
        `https://space.bilibili.com/${account.mid}`, signal)
      return { game: input.game, ...dynamicsView(data) }
    }
    case 'videos': {
      const keywords = (input.keywords ?? '前瞻').trim() || '前瞻'
      const data = await getJson(
        `https://api.bilibili.com/x/series/recArchivesByKeywords?mid=${encodeURIComponent(account.mid)}`
        + `&keywords=${encodeURIComponent(keywords)}&ps=20`,
        `https://space.bilibili.com/${account.mid}`, signal)
      return { game: input.game, keywords, ...videosView(data) }
    }
    case 'live':
      return { game: input.game, ...(await liveView(account, signal)) }
    default:
      throw invalid(`未知 kind：${input.kind}（可用 articles|article|dynamics|videos|live）`)
  }
}
