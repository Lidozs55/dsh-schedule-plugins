# 14 · 借鉴决策记录与多端访问（remote-web-ui）

> 本文是 ADR 式决策存档，两部分：(a) 借鉴 Vikunja 的采纳/不采纳决策（`remindLead`、触屏
> 手势与热区、窄屏日视图的来由）；(b) remote-web-ui（手机浏览器远程使用本机 Web GUI）的
> 兼容结论与安全须知。研究过程（2026-10-21 三路调研：本仓现状 / Vikunja 官方文档与源码 /
> dsh-web `packages/dsh-remote-web-ui` 源码）与逐 commit 落地记录已由 git 留档。

---

## 1. 借鉴决策（对照 Vikunja）

**背景**（几行）：Vikunja（github.com/go-vikunja/vikunja）是自托管 Go 待办服务，对象模型为
`User ─ Team → Project（可嵌套）→ Task`，Task 周边有子任务、Label、多 Reminder、时间记录等；
每个 Project 可建多个视图（List/Table/Kanban/Gantt），Quick Add Magic 语法纯前端解析自然语言；
**没有 Calendar 视图**（日历走 CalDAV 外接）。它的多端优势完全来自「常驻中心服务端 + 瘦客户端
实时拉取」（web/desktop/移动端客户端无本地数据库、基本无离线）。研究时点（2026-10-21）本仓
现状：任务是纯截止待办（无开始时间/重复），提醒只有全局四档固定提前量，任务页固定分组，
只有周网格一种视图。

**关键判断**：DSH 宿主本身就是常驻服务端——不需要自建任何同步层，让手机连上宿主即可，
这正是 remote-web-ui 干的事（见 §2）。

**采纳**（按性价比排序，2026-10-22 落地）：

1. **按条目/任务定制提醒提前量**（Vikunja 相对提醒思想的单值子集）：`remindLead` 可空分钟数，
   `null` = 跟随全局四档默认，`0` = 准时；schema / 派生 / 编辑器 / CLI 全链路。理由：全局四档
   无法表达「这门课提前一天、那条待办提前十分钟」；只取单值避免引入完整相对提醒语法。
2. **触屏四件套**（remote-web-ui 适配）：长按替代右键 + 全手势 `pointercancel` 清理 +
   coarse-pointer 触控热区（44px 目标 / 16px 间距）+ 窄屏日视图（WeekGrid `dayCount` + 日/周切换）。
   理由：手机浏览器是实际使用场景，右键/双击/hover 在触屏上不存在。

**不采纳 / 延后**：

- 重复任务**原地重算下一实例并重开**的语义（适合「每周作业」类）：延后，等 `remindLead`
  验证后再议。
- Quick Add 子集语法：**不做**。「自然语言建日程 = Agent 调 `schedule` CLI」已是 quick add 的
  LLM 增强版（剪贴板队列 → 发新会话，即 Inbox 思路变体），UI 内再放一套正则语法收益有限。
- 保存筛选器/视图抽象/软删除/稳定引用：延后。
- 团队/链接分享、@提及订阅、webhook、API token、OAuth、CalDAV 服务端、邮件通知：**不学**
  （天然依赖服务端的多人能力，我们的形态已免掉）。

参考：vikunja.io/help/{quick-add-magic, dates-and-reminders, views, filters}；源码
`pkg/models/{tasks.go, task_reminder.go}`。

---

## 2. remote-web-ui 适配结论（已核对它的源码）

remote-web-ui（github.com/zhu1090093659/dsh-web `packages/dsh-remote-web-ui`）是跑在 dsh web
宿主进程内的 Cordis 插件：手机扫码配对（限时 QR + 一次性 grant + 365 天设备 cookie），浏览器里
加载的就是官方原版 Web GUI，插件只做配对门控的 HTTP/WS 回环反代 + 防火墙管理 + 可选
cloudflared/relay 隧道。配对设备是宿主的完整客户端，宿主数据是唯一权威，双端同时在线是常态。

对本插件的兼容性核对：

| 项目 | 结论 |
| --- | --- |
| `/api/schedule-core` 通道 | ✅ 在它的 `/api/*` 代理白名单内，client 用 `fetch`（会被重写），零改动 |
| 提醒轮询 | ✅ 纯 HTTP 轮询照常工作；LAN 直连非安全上下文时 Web Notification 不可用，落进现成 in-page toast 退路（走 HTTPS 隧道则可用） |
| 面板注册（main/panellist/settings） | ✅ 不在它的移动端隐藏名单里，正常渲染到手机中列 |
| 右键建幽灵块/右键开编辑、双击、hover | 原生触屏不可用 → 已由长按替代（§1-2） |
| 拖拽/缩放 | Pointer Events 可用；`pointercancel` 清理与触控热区已补（§1-2） |
| 固定 7 列网格 | 手机竖屏过挤 → 已有窄屏日视图（§1-2） |
| 剪贴板队列 | ⚠️ 远程端读到手机自己的剪贴板（iOS Safari 基本不可用）；现容错会优雅退化 |
| 提醒去重 | 双端 origin 不同，去重各自独立——双端同时在线各弹一次，属预期语义 |

**安全须知**：配对设备 = **完全控制凭据**（能访问宿主全部 API，含会话/设置/凭据），不是
「只读日程」；默认开启的 relay 固定子域流量过作者的 Cloudflare Worker，介意课表等个人数据
过第三方的话优先 LAN 直连或自建命名隧道。

**替代路线**：同仓库 `dsh-remote-bridge`（`/ios/v1` WebSocket，面向原生客户端）+
`dsh-task-board-remote`（参考实现：`registerMethods` + `broadcast('board.changed', {revision})`）——
将来要做原生手机小组件/锁屏提醒时是现成协议缝；「手机浏览器能操作日程」走 remote-web-ui
即可，不必碰 bridge。

**待真机验证**：remote-web-ui 扫码后周/日网格实际渲染、Android 长按行为、LAN 直连下通知落
toast 的表现。
