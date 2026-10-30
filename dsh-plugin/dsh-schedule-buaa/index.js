/**
 * Host half of @buaaer/dsh-schedule-buaa — the BUAA JW source adapter.
 *
 * Hard dependency: `scheduleCore` (the generic schedule core). This bundle
 * owns the BUAA-specific parts (student id, SSO login, JW endpoints, SPOC
 * assignments, parsing) and writes dated teaching/exam entries plus exam and
 * homework tasks through the core service. Removing it leaves the core and its
 * data untouched.
 *
 * One sync = one whole term: the JW timetable endpoint returns every cell of
 * the semester with its own week information, so there is no window, no
 * paging, and nothing to extrapolate. BYKC and SPOC are further applications
 * behind the same CAS: chosen Boya courses become locked course entries in
 * their own snapshot, unsubmitted SPOC assignments become homework tasks,
 * and the SPOC memory-only session lets the host refresh deadlines while it
 * runs.
 */
import { registerBuaaApi } from './host/api.js'
import { fetchChosenCourses } from './host/bykc.js'
import { runSpocPoll, runSync } from './host/sync.js'
import { registerBuaaCommands } from './host/commands.js'
import {
  clearSession, fetchAssignments, hasSession, refreshAssignments, sessionSnapshot,
} from './host/spoc.js'
import {
  acquireSession, clearSession as clearSigninSession, hasSession as hasSigninSession,
  sessionSnapshot as signinSessionSnapshot, signinEntry,
} from './host/signin.js'

const SPOC_POLL_MS = 30 * 60_000

export const inject = ['scheduleCore', 'connection', 'scheduleCommands', 'timer']

export async function apply(ctx) {
  const service = ctx.scheduleCore
  // BYKC keeps no session: its chosen-course read borrows the sync's SSO jar
  // and dies with the call, exactly like the JW import itself.
  const bykc = { fetchChosenCourses }
  // The session is module memory in spoc.js: credentials stay call-scoped, and
  // the token never reaches the store, the API payload or the CLI receipt.
  const spoc = { fetchAssignments, refreshAssignments, hasSession, sessionSnapshot, clearSession }
  // iclass has its own memory-only login session (userId/sessionId); the
  // remote check-in button uses it after the call-scoped password is gone.
  const signin = {
    acquireSession,
    clearSession: clearSigninSession,
    hasSession: hasSigninSession,
    sessionSnapshot: signinSessionSnapshot,
    signinEntry,
  }
  let syncing = false
  let active = true
  const deps = {
    service, bykc, spoc, signin,
    isSyncing: () => syncing,
    runSync: async creds => {
      if (syncing) throw Object.assign(new Error('正在同步，请稍后再试'), { code: 'busy' })
      syncing = true
      try {
        return await runSync({ service, bykc, spoc, signin, isActive: () => active }, creds)
      } finally {
        if (!active) {
          clearSession()
          clearSigninSession()
        }
        syncing = false
      }
    },
  }

  ctx.effect(() => () => {
    active = false
    clearSession()
    clearSigninSession()
  }, 'buaa-schedule: memory sessions')

  ctx.effect(() => registerBuaaCommands(ctx.scheduleCommands, deps), 'buaa-schedule: commands')
  ctx.effect(() => registerBuaaApi(ctx, deps), 'buaa-schedule: api')

  // Homework deadlines move, so SPOC is re-read while the host is alive. There
  // is no password here: after a restart the session is gone and this tick is
  // a no-op until one manual sync rebuilds it.
  ctx.effect(() => ctx.timer.interval(async () => {
    if (!active || syncing) return
    syncing = true
    try {
      await runSpocPoll({ service, spoc })
    } catch {
      ctx.logger.warn('buaa-schedule: SPOC poll failed')
    } finally {
      syncing = false
    }
  }, SPOC_POLL_MS), 'buaa-schedule: SPOC poll')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) {
    ctx.effect(() => systemPrompt.section({
      name: 'buaa-schedule',
      order: 1001,
      text: () => [
        '北航教务导入插件已启用：用 `schedule buaa sync` 一次导入整学期快照（课表、考试、博雅已选课程与 SPOC 未提交作业）；先运行 `schedule buaa --help`，机制细节见其 guide。',
        '密码仅当次使用、不保存：用 --password-stdin 或 --password-env，不要写进普通命令行参数；学期起点已保存在日程设置里则不必重复给。',
        'SPOC 会话仅存内存，宿主重启后需再手动同步一次，之后的 30 分钟轮询才会继续；关闭 SPOC 开关会同时清除会话。',
        '导入以统计回执为准，不手工补建同批条目或读取内部文件校验；不要在回复中复述密码。',
      ].join('\n'),
    }), 'buaa-schedule: prompt section')
  }

  ctx.logger.info('buaa-schedule: BUAA source adapter active')
}