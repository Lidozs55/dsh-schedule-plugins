/**
 * BYKC (博雅课程) client — chosen-course import.
 *
 * BYKC is a third application behind the same SSO as JW and SPOC. Unlike
 * SPOC it needs no memory session: the chosen list only changes when the
 * user (de)selects a course, so the manual sync is the intended refresh
 * path. This module is call-scoped like `jw.js` — the BYKC bearer token and
 * the borrowed JW jar die when the sync returns, and nothing is persisted.
 *
 * Protocol source: UBAA's `LocalBykcApi.kt` / `LocalBykcCrypto.kt`
 * (BUAASubnet/UBAA, MIT). Every request body is AES-128-ECB encrypted with a
 * random 16-char key; the key and the body's SHA-1 are RSA-wrapped into the
 * `ak`/`sk` headers, `ts` is the epoch milliseconds. The response body is a
 * JSON string literal of Base64 ciphertext (or, sometimes, plain JSON) —
 * both shapes are accepted below. The RSA key and the key alphabet are
 * shipped inside the school's page bundle; they are not secrets, and they
 * can change with a BYKC release, which is why a failed decode is a `data`
 * error, not an auth error.
 */
import {
  constants, createCipheriv, createDecipheriv, createHash, publicEncrypt, randomInt,
} from 'node:crypto'
import { BuaaError, request, ssoLoginAt, walkRedirects } from './jw.js'

const BYKC_BASE = 'https://bykc.buaa.edu.cn'
const CAS_LOGIN = `${BYKC_BASE}/sscv/cas/login`
const API_URL = name => `${BYKC_BASE}/sscv/${name}`
const REFERER = `${BYKC_BASE}/system/course-select`

const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDlHMQ3B5GsWnCe7Nlo1YiG/YmHdlOiKOST5aRm4iaqYSvhvWmwcigoyWTM+8bv2+sf6nQBRDWTY4KmNV7DBk1eDnTIQo6ENA31k5/tYCLEXgjPbEjCK9spiyB62fCT6cqOhbamJB0lcDJRO6Vo1m3dy+fD0jbxfDVBBNtyltIsDQIDAQAB
-----END PUBLIC KEY-----`
const KEY_CHARS = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'

const sha1Hex = data => createHash('sha1').update(data).digest('hex')

const rsaWrap = data => publicEncrypt(
  { key: RSA_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING }, data,
).toString('base64')

function encryptRequest(jsonText) {
  const data = Buffer.from(jsonText, 'utf8')
  let key = ''
  for (let i = 0; i < 16; i += 1) key += KEY_CHARS[randomInt(KEY_CHARS.length)]
  const aesKey = Buffer.from(key, 'utf8')
  const cipher = createCipheriv('aes-128-ecb', aesKey, null)
  const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]).toString('base64')
  return {
    ak: rsaWrap(aesKey),
    sk: rsaWrap(Buffer.from(sha1Hex(data), 'utf8')),
    ts: String(Date.now()),
    encryptedData,
    aesKey,
  }
}

/** Accept both the double-encoded ciphertext body and a plain JSON body. */
function decryptResponse(body, aesKey) {
  let payload = body
  try {
    const unwrapped = JSON.parse(body)
    if (typeof unwrapped === 'string') payload = unwrapped
  } catch {
    // Not a JSON string literal — treat the raw body as the payload.
  }
  try {
    const decipher = createDecipheriv('aes-128-ecb', aesKey, null)
    return Buffer.concat([
      decipher.update(Buffer.from(payload, 'base64')), decipher.final(),
    ]).toString('utf8')
  } catch {
    return payload
  }
}

const TOKEN_RE = /[?&]token=([^&]+)/
const tokenOf = url => {
  if (typeof url !== 'string' || url === '') return null
  const match = TOKEN_RE.exec(url)
  const token = match === null ? null : decodeURIComponent(match[1])
  return token === '' ? null : token
}

/**
 * Walk the BYKC CAS redirect chain with an authenticated jar and take the
 * `token=` the app finally lands on. The empty-token fallback page
 * (`/cas-login?token=`) never matches: `[^&]+` requires at least one char.
 */
async function resolveToken(jar, signal) {
  const { value } = await walkRedirects(jar, CAS_LOGIN, tokenOf, { signal })
  return value
}

/**
 * Exchange the sync's SSO jar (or a fresh password login) for a BYKC token.
 * The JW jar already carries the SSO TGC, so the redirect chain usually
 * yields the token with no second credential dance; the fallback reruns the
 * full SSO form login at the BYKC CAS entry with a pristine jar.
 */
async function bykcLogin({ jar, username, password, signal }) {
  let token = await resolveToken(jar, signal)
  if (token === null) {
    const fresh = await ssoLoginAt(CAS_LOGIN, username, password, signal, { requireTgc: false })
    token = await resolveToken(fresh, signal)
  }
  if (token === null) {
    throw new BuaaError('auth', '博雅登录未取得 token（上游页面可能已变化）')
  }
  return token
}

async function bykcCall(jar, token, name, payload, signal) {
  const encrypted = encryptRequest(JSON.stringify(payload))
  // `referrer` is a fetch init option, not a header (the spec forbids the
  // header form); Origin is likewise forbidden, so it is simply not sent —
  // the upstream keys on auth_token/ak/sk/ts, as JW keys on fetch-api.
  const response = await request(jar, API_URL(name), {
    method: 'POST',
    signal,
    referrer: REFERER,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json',
      auth_token: token,
      authtoken: token,
      ak: encrypted.ak,
      sk: encrypted.sk,
      ts: encrypted.ts,
    },
    body: encrypted.encryptedData,
  })
  if (response.status === 401) throw new BuaaError('auth', '博雅登录失效，请重新同步')
  if (response.status !== 200) throw new BuaaError('network', `博雅接口返回 HTTP ${response.status}`)
  const text = await response.text()
  if (/^\s*<!DOCTYPE html/i.test(text) || /^\s*<html/i.test(text)) {
    throw new BuaaError('auth', '博雅会话被重定向到登录页')
  }
  const decoded = decryptResponse(text, encrypted.aesKey)
  if (decoded.includes('会话已失效') || decoded.includes('未登录')) {
    throw new BuaaError('auth', '博雅会话已失效，请重新同步')
  }
  let envelope
  try {
    envelope = JSON.parse(decoded)
  } catch {
    throw new BuaaError('data', '博雅接口响应不是合法 JSON')
  }
  if (envelope === null || typeof envelope !== 'object' || !('status' in envelope)) {
    throw new BuaaError('data', '博雅接口返回格式无法识别')
  }
  if (envelope.status !== '0') {
    throw new BuaaError('data', `博雅接口报错：${envelope.errmsg || envelope.msg || '未知错误'}`)
  }
  return envelope.data
}

/** Beijing wall clock as `YYYY-MM-DDTHH:mm:ss`, for semester window compare. */
const beijingNowText = () => new Date(Date.now() + 8 * 3_600_000)
  .toISOString().slice(0, 19)

/**
 * Pick the semester whose window contains today; outside every window (term
 * break) fall back to the one that ends latest. Returns the RAW date strings
 * — the chosen-course query must echo the exact upstream format.
 */
export function pickSemester(semesters, nowText = beijingNowText()) {
  let containing = null
  let latest = null
  for (const item of Array.isArray(semesters) ? semesters : []) {
    if (item === null || typeof item !== 'object') continue
    const start = normalizeDateTime(item.semesterStartDate)
    const end = normalizeDateTime(item.semesterEndDate)
    if (start === null || end === null || end <= start) continue
    const picked = {
      id: item.id, name: String(item.semesterName ?? '').trim(),
      startDate: item.semesterStartDate, endDate: item.semesterEndDate,
    }
    if (nowText >= start && nowText <= end && containing === null) containing = picked
    if (latest === null || end > latest.end) latest = { ...picked, end }
  }
  return containing ?? latest
}

/** `YYYY-MM-DD HH:mm[:ss]` → `YYYY-MM-DDTHH:mm:ss` (+08:00 wall clock). */
function normalizeDateTime(text) {
  if (typeof text !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(text.trim())
  if (match === null) return null
  return `${match[1]}T${match[2]}:${match[3] ?? '00'}`
}

/**
 * Read the current semester's chosen BYKC courses.
 * @returns {{term: string, courses: object[]}} raw chosen records; parsing
 *   into entries is `parseChosenCourses` below, kept pure for fixtures.
 */
export async function fetchChosenCourses({ jar, username, password, signal }) {
  const token = await bykcLogin({ jar, username, password, signal })
  const config = await bykcCall(jar, token, 'getAllConfig', {}, signal)
  const semester = pickSemester(config?.semester)
  if (semester === null) throw new BuaaError('data', '博雅接口未返回可用学期')
  const payload = await bykcCall(jar, token, 'queryChosenCourse', {
    startDate: semester.startDate,
    endDate: semester.endDate,
  }, signal)
  return { term: semester.name, courses: Array.isArray(payload?.courseList) ? payload.courseList : [] }
}

/**
 * Turn chosen records into calendar entries. Each BYKC course is one
 * lecture-style block with its own absolute dates — no week projection, no
 * extrapolation. Records without a usable name or time window are counted
 * and skipped, never fabricated.
 */
export function parseChosenCourses(courseList) {
  const entries = new Map()
  let skipped = 0
  for (const chosen of Array.isArray(courseList) ? courseList : []) {
    if (chosen === null || typeof chosen !== 'object') continue
    const course = chosen.courseInfo
    const name = String(course?.courseName ?? '').trim()
    const start = normalizeDateTime(course?.courseStartDate)
    const end = normalizeDateTime(course?.courseEndDate)
    if (name === '' || start === null || end === null || end <= start) {
      skipped += 1
      continue
    }
    // Course id survives re-selection; the chosen-record id does not.
    const sourceKey = `bykc:${course?.id ?? `rec-${chosen.id ?? ''}`}`
    const teacher = String(course?.courseTeacher ?? '').trim()
    const kind = String(course?.courseNewKind2?.kindName ?? '').trim()
      || String(course?.courseNewKind1?.kindName ?? '').trim()
    const description = [kind, teacher === '' ? '' : `主讲：${teacher}`]
      .filter(part => part !== '').join(' · ')
    entries.set(sourceKey, {
      sourceKey,
      title: name,
      description: description === '' ? null : description,
      location: String(course?.coursePosition ?? '').trim() || null,
      start: `${start}+08:00`,
      end: `${end}+08:00`,
      category: 'course',
      lock: true,
      allDay: false,
    })
  }
  return { entries: [...entries.values()], skipped }
}
