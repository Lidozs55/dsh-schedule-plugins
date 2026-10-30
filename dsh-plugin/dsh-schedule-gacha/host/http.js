/**
 * Shared HTTP plumbing for the two host-side clients (the Bilibili reader in
 * bili.js and the gacha-calendar client in calendarApi.js): one request
 * timeout, one bridge from an external AbortSignal, and one classification of
 * transport failures into aborted / timeout / network.
 *
 * `interpret` owns every endpoint-specific rule — risk control, error bodies,
 * payload shaping — and the typed errors it throws (anything carrying a
 * string `code`) pass through unchanged. `wrap` builds the caller's typed
 * error from a classified transport failure.
 */

const REQUEST_TIMEOUT_MS = 20_000

export async function fetchJson(url, { method = 'GET', body, headers, signal, interpret, wrap }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return await interpret(response)
  } catch (error) {
    if (typeof error?.code === 'string') throw error
    if (error?.name === 'AbortError') {
      const aborted = signal?.aborted === true
      throw wrap(aborted ? 'aborted' : 'timeout', aborted ? '已取消' : '请求超时')
    }
    throw wrap('network', error.message ?? String(error))
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
