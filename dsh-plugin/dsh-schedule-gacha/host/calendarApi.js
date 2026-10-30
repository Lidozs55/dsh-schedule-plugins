/**
 * HTTP client for the gacha-calendar service (gacha.modenc.top).
 *
 * The service owns Bilibili collection, announcement parsing and next-version
 * planning; this adapter only reads the formatted results and forwards
 * official-time corrections. Configuration comes from
 * `globalThis.__GACHA_CALENDAR__ = { baseUrl, token }` (optional) so hosts
 * and tests can point the plugin at another deployment.
 */
import { fetchJson } from './http.js'

const DEFAULT_BASE_URL = 'https://gacha.modenc.top'

export class CalendarApiError extends Error {
  constructor(code, message, status) {
    super(message || `gacha-calendar error ${code}`)
    this.name = 'CalendarApiError'
    this.code = code
    this.status = status
  }
}

const config = () => {
  const override = globalThis.__GACHA_CALENDAR__
  return {
    baseUrl: (typeof override?.baseUrl === 'string' && override.baseUrl !== ''
      ? override.baseUrl : DEFAULT_BASE_URL).replace(/\/+$/, ''),
    token: typeof override?.token === 'string' ? override.token : '',
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const { baseUrl, token } = config()
  return fetchJson(baseUrl + path, {
    method,
    body,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' || token === '' ? {} : { Authorization: `Bearer ${token}` }),
    },
    wrap: (code, message) => new CalendarApiError(code, message),
    interpret: async response => {
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const parsed = await response.json()
          if (parsed?.error?.message) message = parsed.error.message
        } catch { /* keep status text */ }
        throw new CalendarApiError(`http_${response.status}`, message, response.status)
      }
      return await response.json()
    },
  })
}

export function createCalendarApi() {
  return {
    /** Formatted per-game state with the active prediction. */
    async games(signal) {
      const body = await request('/api/games?page_size=100', { signal })
      return Array.isArray(body?.data) ? body.data : []
    },

    /** Newest version-update notice post of one game (article metadata). */
    async latestNotice(gameId, signal) {
      const body = await request(
        `/api/posts?games=${encodeURIComponent(gameId)}&is_update_notice=1&page_size=1&sort=publish_time&order=desc`,
        { signal })
      return Array.isArray(body?.data) && body.data.length > 0 ? body.data[0] : null
    },

    /** Raw posts page, for the Agent to read announcement originals. */
    async posts({ gameId, page = 1, pageSize = 20, type, from, to, order = 'desc' } = {}, signal) {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), order })
      if (gameId !== undefined) params.set('games', gameId)
      if (type !== undefined) params.set('type', type)
      if (from !== undefined) params.set('from', from)
      if (to !== undefined) params.set('to', to)
      const body = await request(`/api/posts?${params.toString()}`, { signal })
      return body
    },

    /** Write the official-time correction layer for one game. */
    async putOverride(gameId, payload, signal) {
      return request(`/api/admin/overrides/${encodeURIComponent(gameId)}`, {
        method: 'PUT', body: payload, signal,
      })
    },

    async deleteOverride(gameId, signal) {
      return request(`/api/admin/overrides/${encodeURIComponent(gameId)}`, { method: 'DELETE', signal })
    },
  }
}
