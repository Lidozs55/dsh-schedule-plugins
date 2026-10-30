import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchOfficial, parseAnnouncement, stripHtml, BiliError } from '../host/bili.js'

/** Install a stubbed global fetch that records requests and replays canned responses. */
function stubFetch(routes) {
  const requests = []
  const previous = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    const route = routes.find(route => route.match.test(String(url)))
    if (route === undefined) return { ok: false, status: 404, json: async () => ({}) }
    if (route.status !== undefined) {
      return { ok: false, status: route.status, json: async () => ({}) }
    }
    if (route.body !== undefined && typeof route.body !== 'string') return route.body
    return {
      ok: true, status: 200,
      json: async () => (typeof route.body === 'string' ? JSON.parse(route.body) : route.json),
      text: async () => route.page ?? '',
    }
  }
  return { requests, restore: () => { globalThis.fetch = previous } }
}

test('fetch articles builds the official URL with built-in account mapping and browser headers', async () => {
  const { requests, restore } = stubFetch([{
    match: /x\/space\/article/,
    json: { code: 0, data: { total: 1, articles: [{ id: 40253020, title: '版本更新公告', publish_time: 1798243200 }] } },
  }])
  try {
    const view = await fetchOfficial({ game: 'genshin', kind: 'articles' })
    assert.equal(view.game, 'genshin')
    assert.equal(view.articles[0].id, '40253020')
    assert.equal(view.articles[0].url, 'https://www.bilibili.com/read/cv40253020')
    assert.equal(view.articles[0].publishTime, '2026-12-26T08:00:00+08:00')
    const request = requests[0]
    assert.match(request.url, /mid=401742377&pn=1&ps=30&sort=publish_time/)
    assert.match(request.init.headers['User-Agent'], /Mozilla\/5\.0/)
    assert.equal(request.init.headers.Referer, 'https://space.bilibili.com/401742377/article')
  } finally {
    restore()
  }
})

test('article view strips announcement HTML to evidence text', async () => {
  const { restore } = stubFetch([{
    match: /x\/article\/view\?id=40253020/,
    json: {
      code: 0,
      data: {
        id: 40253020, title: '7.2版本更新公告', author_name: '原神',
        publish_time: 1798243200,
        content: '<p>7.2版本将于<p>2026年10月28日 06:00</p> 更新</p>&nbsp;',
      },
    },
  }])
  try {
    const view = await fetchOfficial({ game: 'genshin', kind: 'article', id: '40253020' })
    assert.equal(view.title, '7.2版本更新公告')
    assert.match(view.text, /2026年10月28日 06:00/)
    assert.doesNotMatch(view.text, /<p>/)
    assert.equal(view.publishTime, '2026-12-26T08:00:00+08:00')
  } finally {
    restore()
  }
})

test('risk control surfaces as a typed error pointing at the live fallback', async () => {
  const { restore } = stubFetch([
    { match: /web-dynamic\/v1\/feed\/space/, status: 412 },
  ])
  try {
    await assert.rejects(
      fetchOfficial({ game: 'hsr', kind: 'dynamics' }),
      error => error instanceof BiliError && error.code === 'risk_control'
        && /--kind live/.test(error.message),
    )
  } finally {
    restore()
  }
  const { restore: restore352 } = stubFetch([
    { match: /web-dynamic\/v1\/feed\/space/, json: { code: -352, message: '风控校验失败' } },
  ])
  try {
    await assert.rejects(
      fetchOfficial({ game: 'zzz', kind: 'dynamics' }),
      error => error.code === 'risk_control',
    )
  } finally {
    restore352()
  }
})

test('live kind returns room info plus the embedded reservation announcement', async () => {
  const page = JSON.stringify({
    sys_msg: { list: [{ ctime: '2026-10-21 12:00:30', content: '《原神》7.2版本前瞻特别节目将于10月23日晚20:00开启！' }] },
  })
  const { requests, restore } = stubFetch([
    {
      match: /room\/v1\/Room\/get_info/,
      json: { code: 0, data: { roomid: 21987615, title: '原神', live_status: 0, description: '官方直播间' } },
    },
    { match: /live\.bilibili\.com\/21987615$/, page, json: { code: 0, data: {} } },
  ])
  try {
    const view = await fetchOfficial({ game: 'genshin', kind: 'live' })
    assert.equal(view.room, '21987615')
    assert.equal(view.title, '原神')
    assert.equal(view.description, '官方直播间')
    assert.equal(view.announcement.content, '《原神》7.2版本前瞻特别节目将于10月23日晚20:00开启！')
    assert.equal(view.announcement.publishedAt, '2026-10-21T04:00:30.000Z')
    const pageRequest = requests.find(request => /live\.bilibili\.com\/21987615$/.test(request.url))
    assert.match(pageRequest.init.headers['User-Agent'], /Mozilla\/5\.0/)
  } finally {
    restore()
  }
})

test('videos view maps series archives to stable URLs', async () => {
  const { restore } = stubFetch([{
    match: /recArchivesByKeywords/,
    json: { code: 0, data: { archives: [{ bvid: 'BV1abc', title: '7.2前瞻直播', pubdate: 1798243200 }] } },
  }])
  try {
    const view = await fetchOfficial({ game: 'wuwa', kind: 'videos' })
    assert.equal(view.keywords, '前瞻')
    assert.equal(view.videos[0].url, 'https://www.bilibili.com/video/BV1abc')
    assert.match(view.videos[0].publishTime, /^\d{4}-\d{2}-\d{2}T/)
  } finally {
    restore()
  }
})

test('input validation rejects unknown games, kinds and malformed ids', async () => {
  await assert.rejects(fetchOfficial({ game: 'star-rail', kind: 'articles' }),
    error => error.code === 'invalid_input')
  await assert.rejects(fetchOfficial({ game: 'genshin', kind: 'search' }),
    error => error.code === 'invalid_input' && /kind/.test(error.message))
  await assert.rejects(fetchOfficial({ game: 'genshin', kind: 'article' }),
    error => error.code === 'invalid_input' && /--id/.test(error.message))
})

test('parseAnnouncement keeps the newest timestamped entry and drops text without digits', () => {
  const html = '"x","ctime":"2026-10-01 10:00:00","content":"旧公告",'
    + '"ctime":"2026-10-21 12:00:30","content":"\\"新公告\\" 10月23日 20:00 开启"'
  const parsed = parseAnnouncement(html)
  assert.equal(parsed.content, '"新公告" 10月23日 20:00 开启')
  assert.equal(parsed.publishedAt, '2026-10-21T04:00:30.000Z')
  assert.equal(parseAnnouncement('"ctime":"2026-10-01 10:00:00","content":"无数字内容"'), null)
  assert.equal(parseAnnouncement(''), null)
})

test('stripHtml collapses block tags and decodes entities', () => {
  assert.equal(stripHtml('<p>A<br>line</p><p>B&nbsp;&amp;&nbsp;C</p>'), 'A\nline\nB & C')
  assert.equal(stripHtml(''), '')
})
