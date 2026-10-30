/**
 * @lidozs55/dsh-schedule-bridge — the schedule ⇄ vivarium bridge (docs 09 v2).
 *
 * Host-only pet surfaces layered on the MAIN plugin's timing and truth:
 * reminder bubbles at the moment (tasks completable from the bubble),
 * facts-only task state reported to the base (§4c), confirmed pet drops
 * staged into the core's drop queue and opened as an Agent session, and
 * that session's two-option questions/approvals relayed as pet bubbles.
 * No client half, no UI, no data copy; a missing vivarium or main plugin
 * parks this bundle. Full ruling: docs/dsh-plugin/09-vivarium-bridge.md.
 */
import Schema from '@deepseek-ai/schemastery'
import { attachBridge } from './bridge.js'

export const inject = ['scheduleCore', 'vivarium']

export const Config = Schema.object({
  noticeOnReminder: Schema.boolean().default(true).description('提醒时刻到达时弹桌宠气泡（任务截止/日程条目）'),
  statusSignals: Schema.boolean().default(true).description('向桌宠上报任务状态（待办/过期/下一截止）'),
  dropToAgent: Schema.boolean().default(true).description('文本/图片拖到桌宠后，确认即新建会话交给 Agent 解析并新建日程'),
})

export function apply(ctx, config) {
  attachBridge(ctx, config)
}
