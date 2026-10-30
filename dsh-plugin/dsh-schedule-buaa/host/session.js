/**
 * Shared "memory-only session" machinery for the adapters behind the BUAA
 * CAS (SPOC, iclass).
 *
 * Each adapter keeps ONE live session in its module memory — never in the
 * store, an API payload or a CLI receipt — with a single-flight login and an
 * epoch guard: `clearSession()` bumps the epoch, so a login still in flight
 * when the user clears (or switches) the session can never resurrect the dead
 * session with its late result. Everything dies with the host process.
 *
 * The factory owns every generic part — joining or refusing an in-flight
 * login, the epoch check, wrapping transport failures, the safe snapshot —
 * so the modules carry only their own login protocol. `decide` picks the
 * pre-login policy for a live session:
 * - 'reuse'  return it as-is, no network (same account, no force);
 * - 'clear'  drop it first (account switch, or manual repair);
 * - 'login'  relogin without dropping it (forced refresh of the same account).
 */
import { BuaaError } from './jw.js'

/** Default public facts: the account and liveness, never the secret. */
const snapshotOfUsername = session => ({
  username: session.username,
  lastUsedAt: new Date(session.lastUsedAt).toISOString(),
})

/**
 * @param {(credentials: { jar?: object, username: string, password: string }) => Promise<object>}
 *   doLogin - the module's login protocol; must resolve a session object
 *   carrying at least `username` and `lastUsedAt` (epoch milliseconds).
 * @param {{ label?: string, snapshotOf?: (session: object) => object }} [options]
 *   `label` names the adapter in the error messages ('SPOC', 'iclass');
 *   `snapshotOf` maps a live session to its safe public facts.
 */
export function createMemorySession(doLogin, { label = '', snapshotOf = snapshotOfUsername } = {}) {
  /** @type {object|null} */
  let session = null
  let loginPromise = null
  let loginUsername = ''
  // Bumped by clearSession() so an in-flight login cannot resurrect a session
  // that the user just disabled (or that failed and was cleared).
  let sessionEpoch = 0

  const hasSession = () => session !== null

  const clearSession = () => {
    sessionEpoch += 1
    session = null
  }

  /** Safe public facts for the settings card; never the session secret. */
  const sessionSnapshot = () => (session === null ? null : snapshotOf(session))

  /** The live session object, for the module's polling/read paths. */
  const activeSession = () => session

  /**
   * Establish the session: join an in-flight login for the same account,
   * refuse a different account while one is in flight, otherwise apply the
   * policy for the live session and run the single-flight login.
   */
  async function acquire({ jar, username, password, decide = () => 'clear' } = {}) {
    const name = typeof username === 'string' ? username.trim() : ''
    if (name === '') throw new BuaaError('invalid_input', `缺少学号，无法登录 ${label}`)
    if (loginPromise !== null) {
      if (loginUsername !== name) throw new BuaaError('busy', `${label} 正在登录另一账号，请稍后重试`)
      return loginPromise
    }
    const decision = session === null ? 'login' : decide(session, name)
    if (decision === 'reuse') return session
    if (decision === 'clear') clearSession()
    if (typeof password !== 'string' || password === '') {
      throw new BuaaError('auth', `${label} 会话不存在，请先手动同步一次`)
    }

    const epoch = sessionEpoch
    loginUsername = name
    const pending = doLogin({ jar, username: name, password })
      .then(next => {
        if (epoch !== sessionEpoch) throw new BuaaError('cancelled', `${label} 会话已清除，请重新同步`)
        session = next
        return next
      })
      .catch(error => {
        if (error instanceof BuaaError) throw error
        throw new BuaaError('network', `${label} 登录失败，请稍后重试`)
      })
      .finally(() => {
        loginPromise = null
        loginUsername = ''
      })
    loginPromise = pending
    return loginPromise
  }

  return { hasSession, clearSession, sessionSnapshot, activeSession, acquire }
}
