/**
 * Host half of @lidozs55/dsh-schedule-gacha.
 *
 * The generic schedule core owns the calendar, entries, conflict detection
 * and settings page. This adapter owns only the six games' source identity:
 * since the gacha-calendar service went live, collection, parsing and
 * next-version planning happen server-side; the adapter reads the formatted
 * plans over /api and keeps one preview entry per game. Version updates
 * remain source information. Removing it leaves every existing entry in
 * place; only future refreshes stop.
 */
import { registerGachaApi } from './host/api.js'
import { createGachaService } from './host/service.js'
import { registerGachaCommands } from './host/commands.js'

export const inject = ['scheduleCore', 'connection', 'scheduleCommands', 'timer']

export async function apply(ctx) {
  const service = createGachaService(ctx, { service: ctx.scheduleCore })

  ctx.effect(() => registerGachaCommands(ctx.scheduleCommands, service), 'gacha-schedule: commands')
  ctx.effect(() => registerGachaApi(ctx, service), 'gacha-schedule: api')
  ctx.effect(() => () => service.dispose(), 'gacha-schedule: dispose')
  await service.reconcileCachedEntries()

  // Background refresh reads the formatted service state: no Agent turn is
  // required, and a profile without the optional schedule bundle still gets
  // correct dates. The service itself re-collects from Bilibili every 6 h.
  // `timer` is an injected service — a profile without it parks this bundle
  // instead of activating it, so it is always available here.
  ctx.effect(() => ctx.timer.timeout(() => {
    if (service.needsRefresh()) void service.requestRefresh()
  }, 20_000), 'gacha-schedule: first refresh')
  ctx.effect(() => ctx.timer.interval(() => {
    if (service.needsRefresh()) void service.requestRefresh()
  }, service.autoRefreshMs), 'gacha-schedule: six-hour refresh')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) {
    ctx.effect(() => systemPrompt.section({
      name: 'gacha-schedule',
      order: 1002,
      text: () => [
        '二游前瞻插件已启用：六款游戏的版本前瞻直播与版本更新时间由本插件每 6 小时经 gacha-calendar 服务同步；仅「版本前瞻直播」进入日程，「版本更新」只是来源信息。',
        '相关操作都用 `schedule gacha` CLI（先 `schedule gacha --help`）；不要用 `schedule entry` 替代刷新或额外创建同一前瞻，也不要把其他日程改成二游内容。',
        '核对官方时间以 `schedule gacha fetch` 读取官方账号原文为主，`list`/`posts` 是服务端缓存摘要，不作为官方证据；只核对与写入尚未发生（当前时间之后）的直播与版本更新，官方明确时间用 `schedule gacha apply-official` 按游戏写入。',
      ].join('\n'),
    }), 'gacha-schedule: prompt section')
  }

  ctx.logger.info('gacha-schedule: six-game preview tracker active (data: gacha-calendar)')
}
