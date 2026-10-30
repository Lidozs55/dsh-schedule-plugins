# 06 · 工具与 Agent 交互规范

> 适用场景：把"来源导入、任务增删改查、日程生成、提醒设置"这类操作交给 Agent 调用。
> **本项目当前的 Agent 入口是 `schedule` CLI，不注册常驻 tool schema**；命令定义契约见 §1。
> 平台工具 API（`defineTool` / `ToolDefinition`）本项目已不使用，官方 cookbook 已覆盖
> （DSH 文档 `docs/cookbook/adding-a-tool.zh.md` 与 `docs/user/develop/basic/tool.zh.md`），
> 本文不再复述；§3、§5 仍保留与工具生态相关的两条平台参考（扩展点强弱、工具卡片槽位）。

---

## 0. 工作 Agent 的知识边界

本篇是**插件开发者参考**，不是日常日程 Agent 的操作手册。工作 Agent 只需 `schedule` CLI
的分层帮助/指南、主插件 skill 与已启用插件各自的提示；不应为了建日程加载架构、存储、路由或宿主开发资料。

| 入口 | 唯一职责 | 不应承载 |
|---|---|---|
| 核心 `systemPrompt` 段 | 当前教学周/学期起点、`schedule` CLI 入口、文件旁路与冲突确认底线 | 参数全集、类别预设清单、来源插件规则 |
| `schedule` CLI 命令树/分层帮助 | 当前可调用子命令、参数、必填/默认、查询语义和关键副作用 | 未暴露的 service/API 方法；把 UI 能力说成 CLI 能力 |
| `schedule guide <topic>` | 较长教程：工作流、时间/全天、批量、图片/剪贴板、冲突确认 | 学校登录、游戏推算、桥接展示、凭据与存储布局 |
| `.dsh/skills/schedule/SKILL.md` | 极简发现入口：先 `schedule --help`，再进命令帮助/guide；只保留跨命令行为底线 | 复制参数全集、回执/冲突重试细节、学校导入、游戏刷新、桥接规则 |
| 来源插件自身的 prompt + CLI 命名空间 | 该插件启用时才提供的命令、输入前提、快照/对账和特有回执语义 | 要求主 skill 兜底；假定其他插件或检索工具一定存在 |
| 剪贴板会话入口 | 说明待解析材料、引用主 skill，提醒缺项与部分失败 | 另写一套按标题关键词分流的操作规范 |
| 本目录开发文档 | 维护实现、诊断、能力契约与设计理由 | 让日常 Agent 走文件、HTTP 或配置旁路执行用户任务 |

边界按**CLI 命令树实际暴露面**，不是 `scheduleCore` service 的全集：核心仅提供
`schedule entry` 与 `schedule task`。类别/颜色、学期、提醒配置、备份与全量清除只有设置入口；
没有持续周期规则、任务批量写或条目批量更新/删除命令。工作 Agent 应解释限制并指向设置，
而非发明参数或调用内部 API。

主 skill 不提来源插件的名字、命令或业务规则；来源知识由所属 bundle 自己注入。只有通用条目
语义（例如 lock 仅防快捷拖动）留在核心，不讲其来源如何生成。移出的北航导入规则归北航
`index.js` 的提示与 `schedule buaa` 指南，二游刷新/官方校正规则归二游 `index.js` 的提示与
`schedule gacha` 指南，桌宠投递与来源身份字段只留开发文档；**无必须保留在主 skill 的子插件例外**。

验收需要两层：知识边界检查防止重新混入来源与内部资料；运行测试验证文案描述的查询、关联、
全天和批量恢复语义。文本检查不能证明模型一定遵循，也不能替代权限隔离或 CLI 回执测试。
主 skill 改动无需假定子插件也会提供完整条目 JSON；每个插件必须按自己的实际模型可见回执编写规则。

---

## 1. 本项目的 Agent 入口：`schedule` CLI

命令是**数据 + 一个 handler**，定义在 `host/command-registry.js` 的注册表中。同一份定义驱动
校验、分发、catalog、分层帮助与 `guide`，来源插件只贡献自己的根命名空间和教程。

```js
registry.register({
  name: 'entry',
  summary: '查询或修改占用时间的日历条目',
  usage: 'schedule entry <list|create|update|delete|batch-create> [选项]',
  commands: [
    {
      name: 'create',
      summary: '新建一个条目',
      options: {
        title: { type: 'string', required: true, description: '活动/事项标题' },
        start: { type: 'string', required: true, description: '带时区 ISO 8601' },
        'allow-conflicts': { type: 'boolean', description: '用户确认允许重叠后才用' },
      },
      examples: ['schedule entry create --title "编译原理" --start 2026-10-24T14:00:00+08:00'],
      notes: ['默认拒绝时间重叠；成功回执就是写入确认。'],
      async run(args) {
        return service.createEntry(/* … */)
      },
    },
  ],
}, { owner: 'core' })
```

约束：

- **唯一写入口**：handler 调 `scheduleCore` 的服务方法；CLI server 只做参数校验、命令分发和
  JSON envelope，不提供任意 service/route 透传。UI `/api` 与 CLI 走同一业务实现。
- **命名空间**：根命令 `^[a-z][a-z0-9-]*$`，重复注册直接失败。来源插件在 `apply` 里
  `ctx.scheduleCommands.register(...)` 并返回 disposer；核心卸载前它们随 `ctx.effect` 注销。
- **选项**：`string|boolean|number|integer|json|array`，可 `required`/`repeated`/`enum`/`default`/`hidden`。
  `hidden` 只用于密码这类由全局 flag 注入、不能作为普通参数出现的字段。
- **描述写法**（这些字是给模型看的）：summary/description 写清"做什么 + 什么时候用 +
  什么时候不要用"，不要只重复名字；枚举值用 `enum` 而不是让模型猜字符串；必填标
  `required`，可选参数说明省略时的行为；失败信息给**可据以行动的原因**（如"与条目
  「编译原理」周三 10:00–11:30 冲突"），不是 `Error: failed`。
- **分层帮助**：根帮助只列命令和指南；`schedule <命令> --help` 列子命令；叶子帮助列参数、示例、
  注意事项与通用选项。叶子命令必须提供 `run`；有子命令的组不能再提供 `run`。
- **长教程**：用 `registry.registerGuide({ name, title, summary, body })`，正文是 Markdown。
  `schedule guide` 只列主题，`schedule guide <topic>` 才输出全文，避免把知识塞进每轮上下文。
- **回执**：成功 `{ ok: true, command, value }`；失败 `{ ok: false, command, error: { code, message, details? } }`。
  退出码 0 成功、1 业务错误、2 用法/连接/认证错误。模型应读 JSON，不解析人类帮助文本当数据。
- **密码**：不能用普通命令行参数传递。CLI 支持 `--password-stdin` 与 `--password-env NAME`，
  服务端只把密码放进本次命令的 input，不落盘、不写日志。
- **批量输入**：`--input <file|->` 从文件或 stdin 读 JSON；根为数组且命令是
  `entry batch-create` 时自动作为 `entries`，避免在 argv 里拼长 JSON。
- **传输**：`127.0.0.1` 随机端口 + 256-bit bearer token，discovery 文件在
  `$DSH_HOME/schedule-cli`（`SCHEDULE_CLI_HOME` 覆盖）；Host 头校验、无 CORS、只暴露注册命令树。
  身份边界是能读到 0600 discovery 文件的同一 OS 用户；服务端不提供用户/角色切换。
  宿主把该目录前置到 `PATH`；多实例时 `--instance <id>` 选择；`current.json` 由最后启动的实例写入，
  dispose 时只删自己的。
- **超时**：命令可声明 `timeoutMs`（北航/二游 180 s），CLI 取 `--timeout` 或
  `max(30 s, 命令 timeoutMs)`；超时结果未知，先查询再决定是否重试。

来源插件示例见 `dsh-plugin/dsh-schedule-buaa/host/commands.js` 与
`dsh-plugin/dsh-schedule-gacha/host/commands.js`。

---

## 2. 一个操作，两个调用者

用户既会点 UI，也会让 Agent 干活。**同一件事只实现一次**：

1. 在 **Host service** 上实现一次操作，返回结果或明确的失败状态与原因。
2. UI 通过客户端可调用的 Host 入口（例如一条 Session 命令，客户端用 `ctx.remote.commands.execute()` 执行）调用它，并把失败显示出来。
3. 用**参数与语义一致**的 Agent 入口（本项目的 `schedule` CLI 命令）暴露同一个操作；命令调用同一个方法并把结果作为 JSON 回执返回。

授权类动作 —— 批准工具调用、回答 Agent 提出的问题、放宽权限 —— **只属于用户**，不要给 Agent 开一个能自动批准自己的入口。UI 与 CLI 路径也不允许各写一套业务逻辑。

验收方式：对两个调用者都开放的操作，**只用 CLI**执行一次，比对状态变化、返回值与失败信息是否与 UI 动作一致；纯用户动作则验证 Agent 无法执行或授权。

---

## 3. 扩展点的强弱顺序（用最弱的那个）

由弱到强：

1. `ctx.tools.restrict(filter)` —— 只能**移除**工具（对调用方 agent 的 scope 生效；`allow`/`deny` 求交集）。
2. `ctx.tools.guard(execution => string | undefined)` —— 只能**拒绝**（同步；返回字符串即拒绝）。需要"无论顺序如何都必须拒绝"时用它。
3. 瀑布（waterfall）监听者 —— 能改写决策，但**依赖注册顺序**；不拥有该决策的监听者必须 `return next()`。需要 `await`（例如问用户）的决策点用 `tools/pre-execute` 返回 `ask`。
4. `system-prompt/assemble` —— 替换整个组装结果，最强，**不要**用它增删工具或文字。

对应到本项目的常见需求：

| 需求 | 正确做法 |
|---|---|
| 给模型加一段领域说明（"本周为北航第 N 教学周"） | `ctx.systemPrompt.section()` |
| 给**某一个** agent 注入临时上下文 | `agent.inject()`（记为 `agent/inbox/spliced`，进入下一个被接纳的 step）；它**不会唤醒** agent |
| 让 agent 因为定时器/提醒而主动干活 | 定时器里调用 `agent.followup()`（会唤醒），不要用 `inject()` 等它自己醒 |
| 观察工具最终结果 | 监听 `tools/result` |
| 只要变换工具结果 | `tools/post-execute`（不要在这里做授权判断） |

**不要**为了加/删工具而监听 `system-prompt/assemble`；**不要**用 `session/event` + 全量重扫来实现派生状态（用 `ctx.sessionProjections`）。

---

## 4. 会话日志铁律

**Session 日志是唯一真相**：模型看到的一切都必须能从已提交的会话事件重建（fork / resume / replay 都从日志派生）。插件内存只是派生缓存。

因此：

- 不要给日志追加**新的** `type`（`Session.append()` 无法设置 `ignorable: true`，Session 会拒绝重开）。
- 插件自己拥有的数据放到能通过 inspect 找到的存储服务里（见 `04-data-and-state.md`）。
- 面向某个 Session 的派生值，声明为 Host projection 上的 `wire.view`，让值在到达 Client 前就算好；Client 不要自己折叠会话事件。

---

## 5. 反模式清单

- ❌ 为日程操作重新注册 `sched_*` 常驻工具 schema，而不是扩展 `schedule` CLI 命令树。
- ❌ CLI server 提供通用 service/route 透传，或让 CLI 直接打开同一份数据库。
- ❌ 把密码写成 `--password ***` 普通参数（会进入 shell 历史/进程列表）。
- ❌ 把长教程塞进顶层 `--help` 或系统提示，而不是 `schedule guide` 按需加载。
- ❌ 命令回执只给人类摘要，不返回模型下一步需要的完整 JSON（id、冲突、逐项结果）。

（defineTool / 工具卡片渲染等平台工具 API 的规范见 DSH 官方 cookbook `docs/cookbook/adding-a-tool.zh.md`。）
