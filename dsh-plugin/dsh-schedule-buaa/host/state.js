/**
 * Durable adapter state lives in the schedule core's opaque `sourceState`
 * map — the source plugin owns the shape, the core guarantees persistence.
 *
 * Shape:
 * `{ buaaId, termCode, bykcEnabled, bykcTerm, bykcLastSyncAt, bykcError,
 *    spocEnabled, spocTermCode, spocLastSyncAt, spocError, signinError }`.
 * It is written for display and opt-out only (which account/term the current
 * timetable came from, whether BYKC/SPOC sync is on, when each last
 * succeeded, and the last error). The term anchor and every dated entry/task
 * live in the core.
 *
 * No password, cookie or token is stored here. The SPOC session (bearer token
 * + cookie jar) lives in `host/spoc.js` module memory and dies with the host
 * process; the iclass check-in session (userId + sessionId) lives in
 * `host/signin.js` memory. BYKC keeps no session at all — its chosen-course
 * read is call-scoped inside the manual sync, like the JW import itself.
 * After a restart one manual sync re-establishes everything.
 */

/** Entry/task source of the JW timetable + exam snapshot. */
export const SOURCE_ID = 'buaa'

/**
 * Separate snapshot source for chosen BYKC (博雅) course entries: a BYKC
 * read failure must not wipe the timetable (and vice versa), so the two
 * snapshots reconcile independently. BYKC state fields above still live
 * under `SOURCE_ID` — one settings card, one account.
 */
export const BYKC_SOURCE_ID = 'buaa-bykc'
