# 00 · 架构与既定决策

> 本文是本项目的**架构基线**：代码地图、拍板决策、数据模型（条目字段/类别/导入导出/lock 的唯一权威见 §3）、平台契约陷阱。
> DSH 平台通用参考见 `01`–`06`；开发/验证流程见 `08`；来源适配器契约与北航细节见 `11`；二游前瞻见 `12`；桌宠桥见 `09`。
> 历史过程（迁移清单演化、旧实现逐条判定、验收时点日志）已由 git 留档，不再在文档中保留。

---

## 1. 当前形态与代码地图

四个 bundle，依赖方向是单向的：

- **日程核心** `dsh-plugin/dsh-schedule/`（包名 `@lidozs55/dsh-schedule`，row id
  `schedule-core`）——通用日程数据、服务、CLI、UI、提醒。不知道任何学校/导入来源。
- **北航来源适配器** `dsh-plugin/dsh-schedule-buaa/`（`@lidozs55/dsh-schedule-buaa`，
  row id `buaa-schedule`）——依赖核心注入的 `scheduleCore`，只拥有北航 SSO、
  教务同步与来源状态。
- **二游前瞻来源** `dsh-plugin/dsh-schedule-gacha/`（`@lidozs55/dsh-schedule-gacha`，
  row id `gacha-schedule`，见 `12`）——读取 gacha-calendar 服务的格式化结果，定时为六款游戏
  对账前瞻直播条目；版本更新只保留在来源卡。
- **桌宠桥** `dsh-plugin/dsh-schedule-bridge/`（`@lidozs55/dsh-schedule-bridge`，host-only，
  见 `09`）——只依赖核心的提醒派生集、任务完成写面（气泡上的「已完成」）与拖放待确认暂存队列
  （文本/图片拖给桌宠，确认后直接新建会话；不解析、不 OCR、不调 LLM）。

```
dsh-plugin/dsh-schedule/
├── package.json          # exports: "." / "./client"；dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 插入 row schedule-core
├── index.js              # Host 入口：inject 声明 + Config + 装配（见 §4.3）
├── bin/schedule.js       # Agent 调用的自包含 CLI 客户端（宿主复制到 $DSH_HOME）
├── host/
│   ├── domain.js         # storage domain spec（schedule_core，§3）
│   ├── semester.js       # 通用教学周/显示日换算
│   ├── migrate.js        # 启动时一次性存量转换，完成后只打开两表模型
│   ├── model.js          # 类别/类型/来源 ID 与时间格式常量
│   ├── conflicts.js      # 写入路径的重叠检测
│   ├── service.js        # 领域服务 scheduleCore（唯一业务实现 + sourceState）
│   ├── dropbox.js        # 桌宠拖放待确认暂存信箱（ephemeral，无存储/revision/事件；09 §2.3）
│   ├── command-registry.js  # 命令树/选项校验/catalog/guide，子插件命名空间扩展点
│   ├── commands.js       # 核心 entry/task 命令与 guide 正文
│   ├── cli-server.js     # 认证 loopback HTTP + discovery 文件 + CLI 安装
│   ├── api.js            # /api/schedule-core 客户端数据通道
│   ├── import.js         # 本插件 export 格式的回灌
│   ├── schedule-reminders.js  # 条目提醒时刻派生（纯函数，§4.4）
│   └── reminders.js      # 提醒派生（按 Config 提前量现算，§4.4）
├── client.js             # Client 入口：依赖序装载分块 + 槽位注册（§6.2）
└── client.*.js           # 分块：core/notify/gridmath/weekgrid/editors/tasks/calendar/clipboard/settings/style
```

```
dsh-plugin/dsh-schedule-buaa/
├── package.json          # exports: "." / "./client"；dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 插入 row buaa-schedule
├── index.js              # inject: ['scheduleCore', 'connection', 'scheduleCommands', 'timer']；手动同步 + 30 分钟 SPOC 轮询
├── host/
│   ├── state.js          # sourceState.buaa 归一化（仅供显示；字段清单见 11）
│   ├── session.js        # SPOC/iclass 共用的"仅内存会话"工厂：single-flight 登录 + 会话代次守卫
│   ├── jw.js             # 北航 SSO + 两个整学期端点（课表 / 考试），登录 jar 仅当次
│   ├── spoc.js           # SPOC（智学北航）CAS 换 token、作业分页；会话仅存进程内存
│   ├── spoc-sync.js      # SPOC 未提交作业 → homework 任务对账
│   ├── signin.js         # iclass 远程签到（userId/sessionId 仅存进程内存）
│   ├── bykc.js           # 博雅已选课程读取（AES/RSA 请求协议；不建会话，随手动导入刷新）
│   ├── parse.js          # 整学期课表 → 按实际周次生成带日期的课程条目
│   ├── sync.js           # 一次同步：登录 → 课表/考试快照 → 博雅独立快照 → SPOC 任务对账
│   ├── commands.js       # schedule buaa sync + 导入 guide
│   ├── api.js            # /api/buaa-schedule（设置页与签到按钮通道）
│   └── time.js           # 来源侧学期码/教学周换算（不 import 核心内部模块）
└── client.js             # Client 入口：依赖序装载分块（先 client.api.js）
    client.api.js         # 设置卡与签到按钮共用的 /api/buaa-schedule 客户端
    client.settings.js    # 往核心的 schedule.settings.blocks 槽追加设置卡
    client.signin.js      # 往核心的 schedule.entry.actions 槽注册「远程签到」动作
```

```
dsh-plugin/dsh-schedule-gacha/
├── package.json          # exports: "." / "./client"；dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 插入 row gacha-schedule
├── index.js              # inject: ['scheduleCore', 'connection', 'scheduleCommands', 'timer']；6 小时刷新
├── host/
│   ├── games.js          # 六款游戏的 id/名称与条目归属标记（采集、规则与推算在服务端）
│   ├── calendarApi.js    # gacha-calendar 服务 HTTP 客户端（games / posts / overrides）
│   ├── bili.js           # B 站官方只读接口转发：账号映射、浏览器请求头、风控识别与兜底
│   ├── http.js           # 两个 HTTP 客户端共用的超时/中断/传输失败分类
│   ├── state.js          # sourceState.gacha
│   ├── service.js        # 服务视图映射、条目对账、官方覆盖转发、周检登记
│   ├── commands.js       # schedule gacha 命令树 + guide（子命令清单见 12）
│   └── api.js            # /api/gacha-schedule（设置页通道）
├── client.js / client.settings.js  # 六款游戏开关 + 刷新 + Agent 核对入口
└── test/                 # 服务映射、对账、周检与命令测试（node --test）
```

```
dsh-plugin/dsh-schedule-bridge/
├── package.json          # host-only：exports 只有 "."，无 client 半
├── cordis.patch.yml      # 插入 row schedule-bridge
├── index.js              # inject: ['scheduleCore', 'vivarium']；Config 三开关
└── bridge.js             # 提醒气泡、任务状态上报、拖放暂存确认与会话中继（契约见 09）
```

数据流铁律：**一个操作只有一个实现**（核心服务方法）。来源插件通过
`inject: ['scheduleCore']` 调同一套方法；UI 写路径（`/api` 路由）、Agent 的 `schedule` CLI 也调同一方法。
来源插件不得 import 核心包的内部文件，也不得直接打开核心的 storage domain。核心不 import
任何来源包。LLM 一律由 DSH 宿主/Agent 侧承担，插件内零 LLM 调用。

来源状态铁律：核心 domain 的 `global.sourceState` 是来源插件的扩展点——每个来源一个 key，
值是 JSON 字符串，核心不理解其内容。新增学校/导入格式不需要改核心 schema。

时间语义铁律：**显示日 = 04:00 → 次日 04:00**。客户端几何/分桶在
`client.gridmath.js`（唯一一份），宿主锚点/推导在 `host/semester.js`（唯一一份）；
"今天"的显示锚点在 04:00 前取昨天（`anchorToday`，双侧同规则）。

---

## 2. 既定决策（浓缩版，逐条仍有效）

| # | 决策 |
|---|---|
| R1 | UI 全面贴近 DSH：shell 样式只用 `--dsw-*` token；类别块允许使用用户配置的鲜明 `#RRGGBB` accent，其余颜色仍走 token（§3.3） |
| R2 | 提醒逻辑是核心插件内的**子系统**（`host/reminders.js` 派生 + `client.notify.js` 轮询通知），不是独立插件；桌宠联动经**桥插件** `@lidozs55/dsh-schedule-bridge`（已落地设计 v2，见 `09`）：策略/真相在核心，投递表面（页面通知/Web Notification + 桌宠气泡）可多个，均不经过 Agent 会话；文本/图片拖入走基座 §4d → 核心确认暂存 → 点「确认」直接新建会话交给 Agent（不再经剪贴板页） |
| R3 | 主面板 = 同一面板内 `日程 \| 任务 \| 剪贴板` 三 tab（窄幅侧栏设计），不搞左右分栏 |
| R4 | 插件内零 LLM：智能解析/修改 = 用户在 session 内让 Agent 调用 `schedule` CLI |
| R5 | 自动排期、休息条目、由任务生成条目：**不做**（原实现本就是坏的/恒空的） |
| R6/R7 | 确定性离线解析（ctx.llm seam）、语音、图片 OCR：**不做**（图片由 Agent 多模态输入读取，插件只转发附件） |
| R8 | 剪贴板队列保留在主面板第三个 tab；导入 = 队列文本与图片附件发送到新会话，Agent 用 CLI 批量创建落库。桌宠拖放不进入该队列：确认后直接新建会话 |
| R9 | 精力周期整个概念（数据/设置/逻辑）：**删除** |
| R10 | 大组件按职能拆分重写（单组件 ≤300 行），不整体搬运 Vue 代码 |
| R11 | 模型选择/key/限流均不进插件 |
| R12 | 考试提醒**有意单档**提前量（不做"提前 1 天 + 当天"两级），Config 可调；确需多档由 Config 配多个任务等价实现 |
| R13 | 任务模型只认截止时刻：考试 `endTime` 写进备注（`结束：15:20`）不进 `due`、不另造字段；任务占用时段不参与条目冲突检测（任务非日程块） |

**有意不迁移/已删除**（未来不要"顺手恢复"）：Electron 托盘/悬浮窗/窗口控制、cpolar 与手机端 SPA、Flask/JWT/静态托管、自有 LLM key 管理、`--primary-color` 主题体系、条目逐条任意 hex 颜色（类别配色不在此限制内）、`Task.urgency`、只物化未来 7 天的截断导入、SmartInput 前端 LLM 解析（Agent 会话 + 剪贴板队列替代）、旧实现"读接口删过期任务"的副作用（已知缺陷，不修）、导入条目独立编辑路径（与手建走同一 CRUD）、同步成功后的课表颜色联动（完成态只改渲染不改数据，§3.3）。旧 README 声称的四象限视图、专注模式、头像上传、Chart.js **代码里从未存在**，属新功能立项范畴；SPOC 同步已落地（见 `11`），不属于旧实现遗留。

---

## 3. 数据模型（domain `schedule_core`，version 1，zod）

时间统一为带偏移的 ISO 8601（如 `2026-10-19T08:00:00+08:00`）。当前业务表只有 `entries` 与 `tasks`：

```ts
entries: { id, title, description: string|null, location: string|null,
           lock: boolean /*创建默认 false，仅限制左键快捷移动/缩放*/,
           source?: string|null, sourceKey?: string|null,
           category /*§3.3*/, start, end, allDay?, taskId?,
           remindLead?: number|null /*0–10080 分钟；null/缺省跟随 Config 默认*/,
           updatedAt }
tasks: { id, title, description: string|null,
         taskType /*'homework'|'exam'|'lecture'|'other'*/, due,
         priority /*'high'|'medium'|'low'*/, completed, entryId: string|null,
         remindLead?: number|null, source, updatedAt }
global: { termStart: '' /*第一周周一 YYYY-MM-DD；空串表示未设*/,
          sourceState: {} /*来源 id → JSON 字符串*/,
          entryModelVersion: 2, categoryModelVersion: 1,
           categories: [{ id, name, color: '#RRGGBB' }] }
```

- 所有日历块都是普通条目；导入与手建使用同一 CRUD、冲突检测、详情和提醒路径。
- `lock` 不限制编辑、删除、右键菜单、CLI 调用或其他行为；多选拖动排除锁定条目，多选删除仍包含它们。
- `source` / `sourceKey` 只记录归属与稳定身份，不派生另一种 UI 类型。完整来源快照的写法见 `11` §2。
- 新建 ID 通常由 `crypto.randomUUID()` 生成；来源更新按稳定键保留既有 ID。当前量级允许全表遍历。
- `sourceState` 是来源私有状态容器；核心只做 JSON 往返，不理解学号、公告或版本。
- 导出/导入主体为 `global`、`entries`、`tasks`，导出带完整 `global.categories`，导入接受 UI 的 `exportedAt` 元数据。类别列表完整往返：空白目标采用备份定义（含顺序与颜色）；已有数据目标保留本地定义，遇同 id 不同语义会新建 id 并重映射导入条目，同 id 同名同色直接复用，重试复用等价定义不重复增长；已有数据目标的 `other` 保留本地定义。导入后客户端重读 metadata。清空只删除两张业务表，保留学期起点与来源设置。
- 类别迁移独立使用 `categoryModelVersion: 1`（与 `entryModelVersion` 互不替代）：仅把旧 `source=buaa`、`sourceKey` 以 `teaching:` 开头且类别为 `study` 的教学条目改为 `course`；手建学习不变，旧规则直接物化为 `course`，已删除类别仍归 `other`。过渡 schema 保留类别列表与版本字段，迁移标记最后写入，重复启动不丢配置、不复活删除项。
- 存量周规则的启动迁移：一次性把旧周期规则按实际周次展开为带日期的条目，确定性 id 保证失败重试不重复；需要 `termStart`，缺失时明确拒绝、不猜日期、不删原始数据；保留改期，取消项不生成；无旧 API/旧 JSON 导入兼容。持久迁移独立于代码回退——迁移在重启/重载插件时执行，升级前应备份宿主业务存储，代码回退不应直接覆盖已迁移的存储。

### 3.3 动态类别与配色

`global.categories` 是有序的 `{ id, name, color: '#RRGGBB' }[]`；id 稳定且唯一，改名不改 id，新增 id 为 `custom-UUID`。缺少列表的旧数据才使用默认七项，已有列表不补回被删除的预设。

| 默认 id | 名称 | 颜色 |
|---|---|---|
| `course` | 课程 | `#3B82F6` |
| `homework` | 作业 | `#F59E0B` |
| `exam` | 考试 | `#EF4444` |
| `meeting` | 会议 | `#A855F7` |
| `study` | 学习 | `#06B6D4` |
| `sports` | 运动 | `#22C55E` |
| `other` | 其它 | `#64748B` |

`other` 必须保留、名称固定“其它”、颜色可调；其余预设与自定义类别均可改名、改色、删除。`setCategories(categories)` 专用全量入口会把被删类别的现有条目改归 `other`，其余字段保留。手工写未知 id 报错；来源快照未知 id 归 `other`，后续同步不会复活已删预设。`setMeta` 仅修改既有学期设置，不拥有类别列表。

客户端从 snapshot 的列表动态生成 grid/editor/batch 选项和颜色；设置页通过原生颜色选择器即时预览同款日历块，显式保存后生效。小日历色点也使用实际类别颜色。锁定控件为紧凑 switch，单一文案“锁定（不可拖动）”，语义仍仅限快捷拖动。

完成态（经 `task.completed` 关联）：次文字色 + 删除线 + 降透明度，**只改渲染不改数据**。

---

## 4. 架构决策记录（已定，勿重开）

| 问题 | 结论 |
|---|---|
| root-scope 页面的写路径 | `ctx.connection.fetch.register()` 在共享 `/api` 前缀上挂精确路由 `/api/schedule-core`（GET snapshot + POST op）。浏览器信任围栏 + cookie 鉴权先于插件 handler，与 Remote RPC 同级可信。裸 `ctx.webServer` 路由**无鉴权**，不承载业务写 |
| 剪贴板"发送到新会话" | 0.2.x 无 composer 预填面。用 `ctx.remote.session.create({})` → `ctx.remote.session.prompt({mode:'queue', content:[text, ...image]})` → `ctxWorkspace.openSession(id)`——队列文本直接成为新会话首条消息，图片以 `{type:'image', mediaType, data, name?}` 附件块随行（Host 侧再转持久附件） |
| 服务暴露形态 | `export function apply` + `ctx.effect(() => ctx.provide('scheduleCore', service))`；命令扩展点用同一个 `ctx.provide('scheduleCommands', registry)`；桥走 `inject: ['scheduleCore']` |
| Agent 传输 | 认证 loopback HTTP（随机端口 + bearer token + Host 校验），CLI 只转发注册命令树；不开放任意 service/route，也不让 CLI 直接打开数据库 |
| 提醒投递 | 提醒是**纯派生**：核心按 Config 提前量现算 `service.upcomingReminders()`，页面通知（`client.notify.js`）与桌宠桥气泡读**同一派生集**投递，均不经 Agent 会话；机制与投递面见 `05` §4 |
| 冲突校验 | `createEntry/updateEntry/moveEntry/batchCreateEntries` 全量内置重叠检测（所有普通条目统一参与）；默认拒绝并返回可行动原因，`allowConflicts=true`（CLI `--allow-conflicts` / UI 确认框）放行 |
| "24h 内到期"条 | 核心插件 `UpcomingStrip` 纯读展示 |

### 4.3 Host 的 inject 声明（重要权衡）

`index.js` 目前声明 **三个全部为必需**：

```js
export const inject = ['storageDomain', 'connection', 'systemPrompt']
```

- **为什么**：`ctx.get()` 是即时查找、无激活顺序保证——本包先于 `connection` 激活时 get 返回 undefined，静默降级导致 `/api` 路由从未注册（2026-10-17 实测 404 事故）。必需 inject 让 cordis park 到提供者激活为止，是唯一确定性契约。
- 代价（已知限制）：profile 里缺任一提供者时**整个核心插件不激活**。web/desktop 部署的
  base + web-app bundle 恒提供这三个，所以当前可接受。
- `ctx.timer` 在 Host 侧同样是**注入服务**：宿主插件要写 `ctx.timer` 就必须在 `inject` 里列
  `'timer'`，否则激活时报 `cannot get property "timer" without inject`（gacha 曾踩过，机制见 `05` §2）。
  核心 Host 不用 timer；客户端侧 `client.js` 已声明自己的 `timer`。
- CLI 传输层不消费任何宿主服务：`startScheduleCliServer` 只用 `ctx.logger`（可选）。

**来源适配器** `@lidozs55/dsh-schedule-buaa` 与 `@lidozs55/dsh-schedule-gacha` 声明
`inject = ['scheduleCore', 'connection', 'scheduleCommands', 'timer']`：`scheduleCore` 是硬依赖
（核心未激活则 cordis park 住来源插件）；`connection` 是设置页通道；`scheduleCommands`
是向 `schedule` CLI 注册自身命名空间的扩展点；`timer` 供 SPOC 30 分钟轮询 / 6 小时刷新。
`systemPrompt` 用 `ctx.get` 可选读取，缺失时只少对应表面，不影响同步与数据写入。
桌宠桥 `@lidozs55/dsh-schedule-bridge` 声明 `inject = ['scheduleCore', 'vivarium']`
（核心或 vivarium 缺席即 park）。

### 4.4 提醒子系统

提醒是**纯派生**：核心 `host/reminders.js` 按 Config 提前量现算 `service.upcomingReminders()`
（条目/任务的非空 `remindLead` 优先），页面通知（`client.notify.js` 轮询）与桌宠桥气泡读同一派生集。
机制、Config 项与投递面的唯一权威见 `05` §4。

---

## 5. 接口面（速查）

**领域服务 `scheduleCore`**（核心）：条目 `listEntries/createEntry/updateEntry/moveEntry/deleteEntry/batchCreateEntries`；完整来源快照 `replaceSourceEntries(source, inputs)`；任务 `listTasks({scope, includeCompleted})/createTask/updateTask/setTaskCompleted/deleteTask`；元数据 `getMeta/setMeta/setCategories/snapshot/getSourceState/setSourceState`；维护 `clearAllData()`（清空条目/任务，设置保留）；`subscribe(listener)`；`upcomingReminders()`。

`replaceSourceEntries` 先校验整份输入与唯一 `sourceKey`，再增改并删除本来源缺席条目；稳定键保留既有 ID，不触碰其他来源。详细约束见 `11` §2。

**核心 Agent 入口：`schedule` CLI**（不再注册常驻 tool schema）。`index.js` 提供
`scheduleCommands` 命令注册表并启动认证 loopback HTTP 服务；CLI 是自包含的薄客户端，
只解析 argv、渲染分层帮助、把一次命令转发为 JSON 请求。命令树、选项校验、帮助、guide 与
分发共用 `host/command-registry.js` 的一份结构化定义，来源插件通过 `scheduleCommands`
注入自己的命名空间。

- 传输：`127.0.0.1` 随机端口 + 256-bit bearer token，discovery 文件默认
  `$DSH_HOME/schedule-cli`（`SCHEDULE_CLI_HOME` 可覆盖）；校验 Host、无 CORS、只暴露注册命令树。
- 身份与权限：discovery 目录 0700、文件 0600（Windows 依赖用户目录 ACL），能读到 token 的
  同一 OS 用户即可调用；服务端只记录 `source: 'cli'` 与可选 `sessionId`，不提供用户/角色切换，
  可用命令严格受注册命令树限制。
- 发现：宿主把 `bin/schedule.js` 与 `schedule` / `schedule.cmd` 启动器复制到该目录，并把该目录前置到
  `PATH`（只影响宿主进程与其子 shell）；Agent 无需包路径或全局安装。PATH 被宿主清理时，
  skill 中的绝对启动器路径是兜底。
- 分层帮助：`schedule --help` → `schedule entry --help` → `schedule entry create --help`；
  较长教程用 `schedule guide <topic>` 按需读取。知识放帮助/指南，不塞进系统提示。
- 回执：成功 `{ ok: true, command, value }`，失败 `{ ok: false, command, error: { code, message, details? } }`；
  退出码 0 成功、1 业务错误、2 用法/连接/认证错误。

**核心 CLI 命令**：`entry`（`list/create/update/delete/batch-create`）与 `task`
（`list/create/update/complete/delete`）。entry 的 `category` 为动态字符串 id；`list` 返回
`{count, entries, categories, termStart}`，空列表同样返回当前类别。create/update 回显已持久化
完整条目；batch-create 的成功项含 `entry`，失败项保留 `conflicts`，只重试失败项。条目回执附
响应专用 `week: number | null`、`dayOfWeek: 1..7`，按 start 自带时区的日期和学期起点计算，
不写入存储或外推缺课。未知起点或学期前日期的 week 为 null。所有写入仍走 `scheduleCore`，
CLI server 只做参数校验与分发，不提供任意 service/route 透传；冲突默认拒绝，用户确认后才用
`--allow-conflicts`。读路径只暴露条目与公开元数据，不返回来源配置或凭据。

**核心客户端通道**：`GET /api/schedule-core?weekStart=YYYY-MM-DD`（snapshot：revision/global/weekStart/termWeek/today/entries/tasks）+ `POST`（op 分发，同服务方法；含 `op=setCategories`（参数 `categories`，返回更新后的 getMeta）及本格式 export/import）。插件数据无推送通道，客户端靠 20 s revision 轮询；面板外的批量写入面（设置卡导入、来源适配器）在完成后派发同窗 `schedule:data-changed` window 事件（契约归 `client.core.js`），挂载中的日程视图立即重拉，未挂载的靠挂载时取数。

**北航来源插件**：CLI 命名空间 `schedule buaa sync`；客户端通道 `GET/POST /api/buaa-schedule`。
一次手动同步完成：教务整学期课表/考试快照（`replaceSourceEntries`）→ 博雅已选课程独立快照 →
SPOC 作业对账 + iclass 签到会话建立。`sourceState.buaa` 字段清单、各端同步机制、学期码推导、
密码输入与内存会话约束的唯一权威见 [11 · 来源适配器契约](11-source-plugins.md)。

**二游前瞻来源插件**：客户端通道 `GET/POST /api/gacha-schedule`；CLI 命名空间、子命令清单、
对账与锁定规则、`sourceState.gacha` 的唯一权威见 [12 · 二游前瞻来源](12-gacha-preview.md)。

**Agent 知识入口分层**：核心 `systemPrompt` 只保留当前教学周/起点、`schedule` CLI 入口与安全底线，
来源知识由各来源 bundle 在自身启用时注入自己的 prompt 与 CLI 命名空间。
分层边界与"不应承载"清单的唯一权威见 [06 §0 · 工作 Agent 的知识边界](06-tool-and-agent.md#0-工作-agent-的知识边界)。

---

## 6. 平台契约与陷阱（本项目实测，写代码前过一遍）

### 6.1 依赖声明

- **宿主共享包只能走 `peerDependencies`**（`@deepseek-ai/*`、`zod`）：树外 `link:` 安装的 bundle 由 `routeLinked` 按 peer 名拦截映射到宿主实例；写进 `dependencies` 激活即 `ERR_MODULE_NOT_FOUND`。
- **client 半**：apply 里读到的每个 `ctx.*` 服务必须出现在 client 导出的 `inject` 数组——runner 守卫直接拒绝未声明访问（`cannot get property "X" without inject`）。当前声明：核心 `slots/locale/remote/remote.session/uiWorkspace/timer`，来源插件另加 `scheduleShared`（核心共享注入的 `/api` 客户端与可释放 timer，见 `client.js`）。
- **host 半**：见 §4.3。
- **跨 bundle**：来源插件只通过 `inject` 拿到 `scheduleCore` / `scheduleCommands`，不 import
  核心包的内部文件；核心也不 import 来源包。共享的时间/日期纯函数在两侧各自持有（来源侧
  `host/time.js`），避免把实现细节变成隐式契约。

### 6.2 分块加载顺序

`require.async('./client.<name>.js')` 是 `CLIENT_CHUNK` 协议；**同步 require 不会按需物化包内分块**（不在注册依赖图里，未物化即抛 `missed the module table`）。入口 `client.js` 的 `require.async` 顺序就是依赖序：core 先物化，叶分块先于引用它们的分块。新增分块遵守 `client.<name>.js` 命名并在入口登记。用户侧更新后的分块缓存坑（须重启宿主并强刷页面）见 `03`。

### 6.3 槽位注册

- `sidebar.panellist` 的 `id` 必须与对应 `main` 的 `key` 完全一致。
- **组件要用 `env`（api/timer/session 助手）的注册必须带 `inject: share`**——漏了则 `props.env` 为 undefined，组件抛错白屏（2026-10-18 设置页空白事故）。
- 注册带 `locale: NS` 才有 `props.t`；样式注入走 `ctx.effect` 返回清理。

### 6.4 其他

- 无参命令**整个省略 `input`**（`input: { hint: '' }` 抛 "input hint must not be empty"）。
- API 查询参数做 nullish 与格式校验（双端），防止 `"undefined"` 字符串污染快照字段（2026-10-18 aN-NaN 事故链）。
- CSS shell 使用 `--dsw-*` token；唯一业务配色例外为配置类别的 `#RRGGBB` accent；圆角/阴影走 token 刻度；locale zh/en 双语强制。
