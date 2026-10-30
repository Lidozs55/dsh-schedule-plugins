# 03 · Client 半：在宿主 Web UI 里做页面

> Client 半是一个**浏览器 JS 文件**：它向页面注册一个惰性 factory，factory 返回一个 Cordis 插件，插件把 React 组件注册进宿主的**槽位**。
> **关键结论先说**：日历页应该落在 **`main`（keyed，root scope）+ `sidebar.panellist`（list，root scope）** 这一对上；`main` 的非 `conversation` key **没有 Session 绑定**，正是我们要的"无会话整页"。宿主里已有一个一模一样的先例：`@deepseek-ai/dsh-client-ui-schedule`（Host 任务管理页 + Session 提醒目录）。

---

## 1. 清单与产物

```json
{
  "name": "@lidozs55/dsh-schedule",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": []
    }
  }
}
```

`dsh.client` 四个字段的**准确定义**（来自 `@deepseek-ai/dsh-util-package-manifest` 的类型声明）：

| 字段 | 定义 |
|---|---|
| `platform` | **必填**。client platform 标识；Web 消费方选字面量 `"web"` |
| `inject` | **只是信息性的包名依赖，不是 Cordis 服务注入**（Cordis 的 `inject` 是插件自己导出的数组） |
| `immediately` | 引导第一阶段的注册屏障；**缺省表示随共享应用批次**加载 |
| `external` | 除隐式 client 基线之外**精确请求的模块表条目**（含 `<pkg>/client` 这类子路径）；缺省 = 只用基线外部模块。类型专用 import 会被擦除，不产生模块请求 |

**两条硬约束**：

1. 浏览器半**只挂在说明符恰好是裸包名的那一行**上。把一个包拆成多行（`@pkg/x/subpath`）时，子路径行永远不带半侧，它注册的页面会随根行关闭而消失。需要独立生命周期就单独发包。
2. `client.js` 里 `window.__ModuleLoader__.load({ id })` 的 `id` **必须等于包名**。

---

## 2. 产物格式与模块表

```js
window.__ModuleLoader__.load({
  id: '@lidozs55/dsh-schedule',
  factory(require) {
    const React = require('react');            // React 来自浏览器模块表
    const h = React.createElement;

    function CalendarIcon({ size }) { return h('span', { style: { fontSize: size } }, '▦'); }
    function CalendarPage() { return h('div', null, '日程'); }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const el = document.createElement('style');
          el.dataset.plugin = '@lidozs55/dsh-schedule';
          el.textContent = '.schedule-calendar { color: var(--dsw-alias-label-primary); }';
          document.head.append(el);
          return () => el.remove();
        });
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: 'schedule-calendar' }, CalendarPage));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: 'schedule-calendar', order: 100, label: '智能日历' }, CalendarIcon));
      },
    };
  },
});
```

机制要点（`@deepseek-ai/dsh-client-modules` 的 `client/manifest.ts`）：

- `factory(require)` 在**首次 import/require 时**才执行（lazy CJS），结果**记忆化**。但同步 `require` 只解析模块表 seed 词、已记忆（物化）记录和注册依赖图里的行——**包内分块（`client.*.js`）不在图里**：一个分块的 factory 同步 require 另一个尚未 `require.async` 物化的分块会直接抛 `missed the module table`（M0 实测：入口先物化 core，calendar factory 同步 require 未装载的 weekgrid 即挂）。所以**入口 `apply` 必须按依赖序先 `require.async` 每个会被同步 require 的分块**（叶分块先于引用它们的分块），加载顺序需要外部编排。
- `factory` 必须返回 bundle 的 **exports 对象**；对 Cordis 插件来说就是那个插件值（对象形式 `{ inject, apply }`，或函数形式）。
- `require` 的解析顺序：模块表 seed 词 → 已记忆的记录 → 图里的行（注册依赖的 factory）→ 已注册的 factory → 否则**大声抛错**（`client-modules: require("…") missed the module table …`）。
- **`factory` 里不要做副作用**（不要发请求、不要在 factory 里往 `document.head` 塞东西）。样式、定时器、监听器都在 `apply` 里用 `ctx.effect` / `ctx.on` 注册并返回清理。
- **手写的 bundle 没有 CSS Modules、没有 CSS 打包**：样式用（a）`ctx.effect` 里创建 `<style>`（如上），（b）组件内渲染 `<style>` React 元素，或（c）如果当前形态提供 `styles.insert(css)`（见下文「dynamic half」）就用它。
- **不要** `require('@deepseek-ai/dsh-client-ui-primitives')` 或任何 `@deepseek-ai/dsh-client-*` 包：它们无预警变更，plain-JS 没有类型检查，组件一抛错整个槽位条目白屏（控制台 `slot entry crashed in '<slot>'`）。需要的控件照抄宿主原语的标记与行为，类名换成自己的前缀。
- **不要**替换应用根、**不要**向 `document.body` 追加第二个应用、**不要**读写别的插件的 DOM/样式、**不要**用 iframe（iframe 拿不到主题 token、明暗切换与 `ctx.locale`）。

### 2.1 分块缓存：改了 client 代码为什么"看不到变化"

客户端分块由宿主静态服务下发，有三重缓存坑（实测，排查"改了没生效/半新半旧混渲染"先看这里）：

1. 分块 URL 的 `?rev=` 与文件内容**无关**——bump `package.json` 版本也不会变，rev 是宿主**启动时**算好的串；
2. 分块响应带 `cache-control: max-age=31536000, immutable`——rev 不变时浏览器**磁盘缓存**永不回源；
3. 宿主在**启动时快照** client 文件——不重启 host，原 rev URL 返回的是旧内容。

因此改 client 后必须：**重启宿主**，再对每个分块 `fetch(url, { cache: 'reload' })` 绕过 HTTP 缓存，然后 reload 页面。只做其中一步就会看到新旧代码混跑（例如浮层无样式平铺）。

### 2.2 另一种形态：dynamic Client half

除了 bundle 的 `client.js`，还有一种由 Agent 在运行时定义的"动态半侧"，它看到的是**另一套符号**（`cordis_inspect_query { platform: "client", provider: "Builtin", method: "listBuiltins" }`）：

| 符号 | 签名 | 说明 |
|---|---|---|
| `ctx` | `ctx.get(name)` / `ctx.on(name, listener)` / `ctx.provide(name, value)` / `ctx.effect(cb, label?)` | 受限的 Cordis Context |
| `React` | `React.createElement` / `React.useState` / `React.useEffect` | 未做 JSX 转换 |
| `host` | `host.call(method: string, args?: JsonValue): Promise<JsonValue>` | **本包私有的 Client → Host JSON RPC** |
| `styles` | `styles.insert(css: string): () => void` | 随 Client 运行清理的样式插入 |
| `console` | `console.log` / `console.error` | 带包标签的日志 |

⚠️ **两套面不通用**。`Builtin` 列的是**动态半侧**能用的符号；bundle 的 `client.js` 走的是 `require` 模块表（见 §6 的 `dsh.client.external`）。若你想在手写 bundle 里用 `host.call` 这类动态半侧能力，**先用 `Builtin` 与 `Slots`/`Service` 的现场查询确认它在你的形态里可用**，不要假设。

---

## 3. 槽位：先查，再选

### 3.1 注册 API

```js
ctx.slots.inject(ownerKey, () => ctx.slots.register(options, Component))
```

- `ctx.slots.inject(key, callback)`：**为槽位的每个声明生命周期安装一个 effect**。声明已存在时回调**同步**运行；否则在该声明 `register()` 提交后于其中运行。声明折叠时 effect 被释放，之后再声明会重新运行。回调的 effect 是同步 disposer；返回可迭代对象时会事务化安装、逆序释放。
- `ctx.slots.register(options, Component)`：普通注册 API。**必须**由调用者的 `ctx.effect` 拥有（fiber 卸载即级联清理）。
- `options`：`name`（槽位名）+ 该槽位 kind 要求的额外字段——**`list` 需要 `id`，`keyed` 需要 `key`**；可选 `order`（升序）、`label`（`string | (() => string)`）、`locale`（字典命名空间）。
- **不要传 `priority`**：浏览器半 facade 会自动赋一个**低于所有宿主条目**的优先级；在 single/keyed 单元里这等于"你的条目就是渲染出来的那个"。所以**只有在你确实想要遮蔽宿主 UI 时才复用它的 key**。
- 槽位只在**声明它的条目挂载期间**存在；向未声明的槽位注册会抛。注册失败会出现在浏览器半的加载报告里。

### 3.2 本项目的落点（已确认机制）

| 槽位 | kind / scope | 用途 | 我们的用法 |
|---|---|---|---|
| **`main`** | keyed / **root** | 中央面板，"由 sidebar 条目 id 选中"。**保留 key `conversation` 承载会话；其它 key 没有 Session 绑定** | ★★★ 日历主页面：`{ key: 'schedule-calendar' }` |
| **`sidebar.panellist`** | list / **root** | 全局面板图标。**每个 list id 对应同名的 main 面板**；侧栏拥有按钮并从 list 元数据解析标签 | ★★★ 导航入口：`{ id: 'schedule-calendar', label, order }` |
| `settings.section` | list / root | 每个条目一个设置页（`id` 是 section key、`order` 位置、`label` 显示文本）。**条目可声明子槽位** | ★★★ 「日程设置」整页（核心），内部再开 `schedule.settings.blocks` |
| `schedule.settings.blocks` | list / root | **本项目自定义**：`settings.section` 条目 `children` 声明的子槽位，核心的设置页在自己两张卡之后 `renderSlot` 它 | ★★★ 北航适配器往里塞学号/同步两张卡 |
| `schedule.entry.actions` | list / root | **本项目自定义**：`main` 日历条目在 `children` 声明的子槽位，条目编辑器以 `{ entry }` 为 owner props `renderSlot` 它；只在编辑已有条目时渲染 | ★★ 北航来源注册「远程签到」按钮 |
| `settings.general.item` | list / root | General 里的**单个偏好行**（不投影 label，owner 不传 props，文案与写入都由你自己负责） | ★★ 单个开关 |
| `shell.overlay` | list / root | 全窗口浮层，在每列之上、滚动容器之外；**层本身点击穿透**，条目需自己 opt-in 指针事件 | ★★ 提醒 toast |
| `conversation.composer.dock` | list / session | 输入框卡片下方的环境条目（无 owner props） | ★ 会话内小挂件 |
| `conversation.input.dock` | list / session | 输入框卡片上方整宽条目（owner props = `InputZone`） | ★ |
| `tool.call.toolview` | keyed / session | 按线上工具名分派的工具卡片（见 `06` §5） | ★★ |
| `root` | single / root | **绝对不要注册**：single 槽位里第二个条目会**遮蔽**整帧（且自动优先级让你赢），页面会只剩你的组件，所有 seat 消失 | ✖ |

**id 的三重身份**（这就是 `sidebar.panellist` 与 `main` 的绑定方式）：

- `sidebar.panellist` 的注册 `id` = 该 list 的 cell key = `SidebarPanelMetadata.id` = `PanelInfo.activePanelId` = **`main` 的 `key`**；
- `label` 只做显示与可访问名（省略时用 id）；
- `order` 只决定行序；
- **图标就是那个注册的组件本身**。

**参照实现（强烈建议直接读源码）**：宿主自带的 `@deepseek-ai/dsh-client-ui-schedule` 就是"一个 main 面板 + 一个 sidebar 图标 + 用 Remote 读写 Host"的活样本，注册的正是 `main` 的 `key: 'schedules'` 与 `sidebar.panellist` 的 `id: 'schedules'`，客户端 `inject` 为：

```
'slots', 'locale', 'remote', 'remote.schedule', 'conversation', 'uiConversation', 'uiWorkspace', 'sessions'
```

用 `Config.listConfigs { name: "@deepseek-ai/dsh-client-ui-schedule" }` 拿到 `packageDir`，读它的 `lib/types/**/*.d.ts` 与实现。

### 3.3 组件 props = owner 份额 + key 份额 + inject 份额 + scope 标准套件

```
PropsRuntime<K> = OwnerOf<K> & KeyPropsOf<K> & SlotInjectFace<SlotInjectOf<K>> & ScopeStandardProps<ScopeOf<K>>
```

我们关心的两类：

**root scope 的标准套件**（`main` / `sidebar.panellist` / `settings.section` / `shell.overlay` 都会收到）：

```
useResource, useWorkspaces, usePanelInfo, useSessions, useSessionStatus, useSessionRetainInfo
```

- `sidebar.panellist` 的 owner 份额：`{ size: number; active: boolean }`（请求的方形边长 / 是否在中央列被选中）。
- `settings.section` 的 owner 份额：`{ close: () => void }`（关闭设置面板）。
- `shell.overlay` 与 `conversation.composer.dock`：**没有 owner 份额**（渲染点传 `{}`）。
- 注册里声明 `children` 的条目，props 会多出 `renderSlot('<child>', input)`。本项目用它在「日程设置」里开子槽位：
  核心的 `settings.section` 条目声明 `children: { 'schedule.settings.blocks': { kind: 'list', scope: 'root' } }`，
  页面里 `renderSlot` 它；北航适配器（或未来任何来源）用 `ctx.slots.inject('schedule.settings.blocks', …)`
  往里注册卡片——**一个设置页，多来源追加**，不需要各自占一节。
- `conversation.input.dock` 的 owner 份额：`InputZone = { session: SessionSnapshot; input: InputState }`。
- 声明了 `locale` 的注册会在 props 上多一个 `t`；声明了 `inject` 会多出对应份额。
- 选择器钩子要**传选择器**调用，例如 `useSessions(state => state.current)`。**订阅最小的那一片**。

**不要猜 props**：先 `Slots.listSubTree` 传 `root: "<槽位名>"`，返回的 `selected.catalog` 里有 `registration`（含每个字段的 `description`）、`ownerProps`、`ownerPropsReferences`、`standardProps`、`keyDomain`、`allowedKeys`、`hookContext`、`slotInject`、`replaceRisk`——那就是权威说明。

> 槽位目录是**已发布 Web 包的编译期契约**，不是某一页的快照：`occupants` 列的是**随包发布**的组合。现场占用者（含优先级与是否 active）要读 `selected`。
> Client inspect 查询可能超时（报 `Client inspect query … timed out after 10000ms`）：**先打开/重连 Harness 页面再重试**，不要据此推断"没有这个槽位"。

---

## 4. 样式：shell 主题 token 与配置类别配色

宿主负责主题：`@deepseek-ai/dsh-client-ui-theme` 拥有 `--dsw-*` 静态色阶、语义别名、排版、动效、阴影、滚动条与明暗偏好；`ui-layout` 把解析后的快照应用到文档。**插件必须用语义别名，不得另立全局主题**（`ctx.theme.register(definition)` 是"注册一套主题"，插件不该用）。

要点清单（完整规范以官方文档为准，见本节末尾）：

- **token 族**：语义别名涵盖底色/抬升面/浮层（`--dsw-alias-bg-*`）、边框（`--dsw-alias-border-l1…l4`）、品牌（`--dsw-alias-brand-primary`）、文字（`--dsw-alias-label-primary/secondary`）、四态（`--dsw-alias-state-{error,success,warn,idle}-primary`）、侧栏（`--dsw-specific-sidebar-fill`）、链接（`--dsw-alias-link`）；另有圆角刻度 `--dsw-radius-xs/sm/md/lg/xl/panel` 与阴影 `--dsw-elevation-{soft,panel,prominent}`。内建 token 目录可用 `Theme.listTokens` 现场查询，但那只是检查用子集——样式表里还有更多别名族（settings 卡、menu surface 等），用前先查或照抄同类宿主页面。
- **颜色**：shell 颜色、排版、层级、动效一律走 `--dsw-*` token；禁止复制静态 shell 色板，功能组件 CSS 禁止主题选择器。**不得**引入组件库或 Tailwind（手写 bundle 没有 CSS Modules，用 §2 的样式注入方式，类名带自己的前缀）。**唯一颜色字面量例外**是 `global.categories` 的用户配置 `#RRGGBB` accent：通过 `--bsch-block-color` 用于日历块与预览，小日历色点使用同一类别颜色（规则见 `00` §3.3）。
- **圆角**：按控件尺寸选 6 档 token（键帽 `<H20`→xs … 主容器→panel），**不要**新增 10/14/18/24 这类局部数值；普通圆角面用主题的 `superellipse(1.5)` 曲线；同心内缩 R = `max(0, 外层 R − 内缩距离)`；标准菜单外层 R16 + 4px 内边距 + R12 菜单项；每个正圆（`50%`/胶囊）必须配 `corner-shape: round`。
- **边框与阴影**：中性 `--dsw-alias-border-*` 的平面边框/分割线一律 **0.5px**（虚线记号与状态色边框保持 1px）；高浮起面 `border: 0` + `box-shadow: var(--dsw-elevation-*)`，**不得**把中性 border 与 elevation 阴影配对。
- **其他**：字号必须与行高成对；源码/终端/diff 文本不换行；滚动条用共享样式，不自定义组件专用滚动条选择器；呈现规则写进 CSS，React 内联样式只传局部自定义属性值、不得编码主题分支；菜单用宿主 `Menu`/`MenuSurface` 语义，模态框保留黑色半透明遮罩，链接 `--dsw-alias-link` + `font-weight: 500` + 3px offset 点状下划线；设置卡片材质用 `--dsw-alias-settings-card-stroke/fill`，不要再叠中性边框。
- **间距没有官方尺度**：官方样式文档只有具体数值。做法是**照抄同类宿主页面**——管理类列表以 Plugin Manager 页面为参照。

**官方文档**：Web UI 样式参考 `docs/web-styling.zh.md`、统一圆角规范 `docs/ui-radius.zh.md`（DSH checkout 内，或在线站点 <https://deepseek-harness.github.io/deepseek-harness/>）；本节是执行摘要，冲突时以官方文档为准。

---

## 5. 从 Client 调 Host：三条路径

Client 半**不能** import Host 代码。通路有三条：

### 5.1 复用宿主**已有**的 Remote 命名空间（第一版用这个）

```js
export const inject = ['remote', 'remote.schedule']   // 同时声明 remote 与 remote.<ns>

const result = await ctx.remote.schedule.list({ sessionId });
if (!result.ok) {
  if (result.error.code === 'schedule_not_found') return [];
  throw result.error;                                  // 它是真的 Error
}
use(result.value);
```

- `ctx.remote.<namespace>.<exportName>(...)`：Host 侧 `class X extends TypertRemoteService`（`super(ctx, '<serviceKey>', { namespace: '<ns>' })`）+ `@Remote('export')` 标注就生成这个名字空间；`Remote` 只接受 `string`（导出名）或 `{ mode: 'stream' }`。
- 调用点直写 `ctx.remote.<ns>.<method>(...)`；**不要** `Pick<ClientRemote, …>` 窄化、不要手写签名、不要自造 wire 中转对象。
- 结果是 `RemoteResult<T>`：`{ ok: true, value } | { ok: false, error: { code, message, details? } }`。**判 `code` 而不是 `instanceof`**（判 code 会自动窄化 `details`）。
- 异常流的站点写 `throw result.error`；上层用 `isRemoteFailure` 区分 Remote 失败与本地缺陷。**不要写防御性 catch**——Remote 调用不 reject，装配错误就该炸。
- 流式：Host 用 `@Remote({ mode: 'stream' })` 返回 `AsyncIterable<T>`；客户端消费生成的名字空间成员或 `ctx.remote.$stream`。
- Host 固定事实：`ctx.remote.$host` = `{ home: string | undefined; isLoopback: boolean }`。
- 重连后刷新走 `ctx.on('connection/reset')`。

**已确认可用的命名空间举例**（客户端 `inject` 里出现的字面量）：`remote.commands`、`remote.schedule`、`remote.session`、`remote.workspace`、`remote.goals`、`remote.userQuestions`。完整名单用 `Service.listService`（带 `@Remote` 的方法就是）。

### 5.2 用人类命令承载"UI 动作"

Host 侧 `ctx.commands.register({ name, description, input, handler })`（见 `05` §5），Client 侧 `ctx.remote.commands.execute(agent, line, submittedAttachments, signal)`。

优点：不用自造 Remote 端点，且有真实日志（`command/run` / `command/done`）。
限制：`execute` 需要一个 `Agent`——**只有 session 作用域的槽位才拿得到**；根作用域的 `main` / `sidebar.panellist` / `settings.section` 拿不到。所以这条只适合会话内的 UI 动作。

### 5.3 自造 Remote 端点（重量级）

官方五步：声明方法（`TypertRemoteService` + `@Remote`，`Agent`/`Session` 之类的 lookup 参数只能占顶层参数位，`signal: AbortSignal` 放最后）→ 声明失败（统一 `RemoteError(code, message, details)`，域码用 declaration merging 进 `RemoteErrorDetailsMap`，命名 `<域>/<理由>`）→ 在包上注册（补 `./typert` 与 `./remote` 两个导出 + `@deepseek-ai/dsh-typert-protocol` 的 peer 依赖）→ Client 消费 → 写测试。**改签名/码表/namespace/导出名之后必须重跑 `pnpm run build:lib`**，Client 才拿得到新的声明与 codec（只改实现体不需要重新生成）。

⚠️ 这条链路依赖 DSH 仓库里的生成链。**本仓库手写的 plain-JS bundle 没有这条链**，第一版不要规划自造 Remote 端点；若确实需要，先决定是否把 bundle 改成带构建的包（并用 `Config.listConfigs` 拿到的 dsh `packageDir` 对齐版本），或改用下面这条。

### 5.4 本插件的写路径：`connection.fetch` 精确路由

root-scope 页面（`main` 非 conversation key）的完整读写通道是 `ctx.connection.fetch.register()` 在共享 `/api` 前缀上的精确路由（本插件为 `/api/schedule-core`，host 侧实现见 `host/api.js`）：浏览器信任围栏 + 签名 cookie 鉴权**先于**插件 handler，与 Remote RPC 同级可信，手写 bundle 不需要 §5.3 的生成链。决策依据见 `00` 的架构决策记录；`ctx.webServer` 路由**无鉴权**（`02` §2.9），不要承载业务写。

---

## 6. 文案（Client locale）

```js
export const inject = ['slots', 'locale']

ctx.effect(() => ctx.locale.register('scheduleCore', {
  zh: { title: '智能日历', sync: '导入日程' },
  en: { title: 'Smart Calendar', sync: 'Import entries' },
}), 'schedule: dictionaries')

// 注册时声明 locale，组件 props 就会多出 t
ctx.slots.register({ name: 'main', key: 'schedule-calendar', locale: 'scheduleCore' }, Page)
// Page({ t }) { return t('title') }
```

契约要点：

- `register(ns, dicts)`：**声明式命名空间**的形式，`dicts` 必须给**每个内置 locale**（双语平衡在注册时强制），每个字典会被检查覆盖该命名空间的 key 全集；重复 `(ns, locale)` 抛错。
- `register(ns, locale, dict)`：单语言非类型化形式（语言包、合并表之外的命名空间）。字典是**扁平 `Record<string, string>`**，键是点分字符串（如 `'copy.optionsHint'`），支持 `{placeholder}` 插值。
- `bind(ns)`：绑定到某个命名空间的 translate 函数（同一命名空间重复 bind 返回同一函数，可以放进 inject 面而不破坏记忆化），在**调用时**读当前 locale。
- `getLocale()` / `getSnapshot()`（带 `revision`，引用稳定，uSES 安全）/ `subscribe(fn)` / `setLocale(id)` / `addLanguage({ id, label, fallback })`。
- 查找顺序：按活动语言声明的 fallback 链在该命名空间里查，然后在共享 `common` 命名空间里重来一遍，最后显示 key 本身。
- 要让自己包的命名空间有类型，用 declaration merging 扩 `LocaleNamespaceMap`。
- Client 事件只有四个：`connection/reset()`、`locale/change(snapshot)`、`slots/changed(key)`、`theme/change(snapshot)`（都是 `emit`）。注意 `locale/change` **不会**在字典注册时发出——渲染刷新走 LocaleFace 的 `revision`。

---

## 7. 生命周期与释放

- 注册都是 effect：`ctx.effect(cb, label?)`、`ctx.on(...)` 随插件卸载自动移除。
- 组件卸载时，它渲染的局部样式元素和自建监听必须消失。定时器用 `ctx.timer`（随 fiber 释放），不要裸 `setInterval`。
- 插件 UI 是**宿主 UI 的一部分**：用户看到的是**一个**应用，所以必须用宿主的主题、locale 与布局惯例，并与同类宿主页面保持一致。
- **不要改宿主 DOM**（标题等由自己的组件渲染）；拖拽/撤销等**交互状态放组件本地**，写操作一律走 Host 服务方法（UI 与 CLI 没有各写一套）。
- 被释放后再调用生命周期相关的 effect 会抛 `CordisError('INACTIVE_EFFECT')`；结构非法抛 `TypeError`。**不要**自己调用属于生命周期的 disposer。

交付前自查以 `08` 的验收清单为准（本篇不再维护独立清单）。

---

## 8. 交互契约（周网格与编辑器）

本节是日历 UI 的交互权威：§8.1 记录**交互设计意图**的逐条清单（源自已删除的旧 Vue 实现，过程考古走 git 历史；"有意不迁移"清单见 `00` §2），§8.2 是**当前交互契约**（Windows 风格交互模型），§8.3 是类别配置 UI 的行为。

### 8.1 交互设计意图（逐条清单）

| # | 意图 | 现状/决策 |
|---|---|---|
| 1 | 拖选新建 + 单击 1h 幽灵块 + 点幽灵开编辑 + 点外部销毁 | 已实现，后按 Windows 习惯演进为**右键**建幽灵（§8.2） |
| 2 | 4:00–28:00 时间轴、23:00 日界粗线、24:00 标签隐藏、<4 点归前一天 | 已实现（`gridDay` 分桶；时间语义铁律见 `00` §1） |
| 3 | today 锚点 7 天窗口、回今天、±7 天平移、标题日期范围 | 已实现（锚点在 04:00 前取昨天；星期按实际日期计算） |
| 4 | 当前时间线 nowIndicator | 已实现（只画在当天列内，窗口锚点不在今天时不绘制） |
| 5 | 限制部分条目的快捷移动/缩放 | 统一为条目 `lock`：仅禁止左键快捷移动/缩放；分类不决定能否拖动；显式编辑、删除、右键菜单仍可用（语义见 `00` §3） |
| 6 | undo/redo 双栈各 5 步 + 键盘 + 撤销删除重建 | 已实现（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y；撤销删除走重建，id 会换新——有意接受） |
| 7 | 点条目开编辑弹窗 | 已实现（现为双击编辑） |
| 8 | 标题截断（中文 2 单位、20 单位封顶）+ 小字号 + 时长自适应 padding | CSS ellipsis 方案等价，保留现状（有意偏差，不照抄 padding 逻辑） |
| 9 | 周末列浅色底 | 已实现（is-weekend + token） |
| 10 | 快速跳转月历 + 重要度色点 | 已实现（`client.calendar.js`：MiniCalendar 月网格、日/任三档色点、+3 条升档、点日期跳锚点） |
| 11 | 批量添加（BatchAddModal） | 已实现（`client.editors.js` BatchEditor，走 host `batchCreateEntries`；周重复按 dayOfWeek 过滤；整批一个 undo 步；`allowConflicts: true` 沿袭静默越过冲突） |
| 12 | 任务状态筛选 + 截止排序 + 统计 + 即将到期 | 已实现（状态下拉 + 优先级下拉 + 组内截止升序 + 统计；**分组结构保留**——窄面板下分组优于原版平铺，有意偏差） |
| 13 | 编辑器字段（标题/类型/起止/备注；颜色按类别 token） | 已实现（颜色走类别配置 accent，见 §4；不回退到自由选色） |
| 14 | 视图变化重拉数据 + 20s 轮询 | 已实现 |
| 15 | 加载角标 spinner | 以 loading/error 态等价实现，不照抄 |
| 16 | 全天槽隐藏 / LLM 条目注入 / AbortController 竞态处理 | 不适用或已由宿主/tooling 覆盖，跳过 |

### 8.2 Windows 风格交互模型（当前契约）

周网格（`client.weekgrid.js`）的指针与键盘语义，按 Windows 桌面习惯设计：

- **左键**：单击已有条目 = **选中**（空白 = 清空选中）；**双击 = 编辑**；长按拖动 = 移动**所有选中项**（按-拖-抬解耦：点击永不误触拖动、拖动永不误触点击）；空白长按 = **框选**（橡皮筋矩形，与块矩形求交）。
- **右键**：空白**单击 = 1h 幽灵 / 拖拽 = 带状幽灵**，右键手势必先清场所有幽灵；右键已有条目（选中并）打开编辑页；右键幽灵 = 打开幽灵编辑页；网格内原生右键菜单一律 `preventDefault`。
- **幽灵生命周期**：与幽灵无关的操作一律销毁；**单击幽灵不立即销毁**——350ms 内无第二次按下（双击）才销毁；双击幽灵 = 编辑页。
- **键盘**：`Delete` 删除全部选中（整批一个 undo 步，撤销 = 整行重建）；`Escape` 清幽灵 + 选中；Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 撤销重做。
- **多选规则**：拖未选中块 = 只拖它；拖已选中块 = 移动选中项中的**未锁定**行；锁定项仍可选中、编辑与删除（混合选择移动只带未锁定行，删除仍作用于全部选中项，见 `00` §3）。Shift/Ctrl 点选按用户许可暂缓。
- **move/delete 多态契约**：`service.moveEntry(moves)` / `deleteEntry(ids)` 单个走旧契约（返回行/抛错）、数组走批契约（逐条 `{ok, id, conflicts?}`、不抛）；client 只剩 `applyMoves` / `deleteEntries` 两条路径，resize 与拖拽共用前者，冲突只剩一个裁决弹窗。
- **实现备注**（历史真 bug 教训）：`ghost.day` 存列下标，回 `onCreateAt` 必须转 `days[i]`（直接传下标会在 `zonedAt` 里崩）；框选命中测试必须**全程视口坐标**（网格本地坐标与 `getBoundingClientRect` 混用会 0 命中）；React 双击事件名是 `onDoubleClick`（写 `onDblClick` 不挂）。另：`dispatchEvent` 合成事件绕过浏览器 hit-testing，不能作为命中验收的证据。

### 8.3 类别配置 UI 行为

类别模型与规则（有序定义、`other` 兜底、删除预设不复活）的权威在 `00` §3.3；这里只记录 UI 行为：

- 类别 UI 读取 `snapshot.global.categories` 有序定义；设置页原生颜色选择器即时预览同款日历块，增改删后显式 `setCategories` 保存；删除确认说明已有条目改归 `other`。
- 未保存草稿与普通 metadata 独立：错误、来源刷新、学期保存不覆盖草稿；导入后重读 metadata。
- 编辑器、批量编辑器、周网格及小日历使用动态类别选项/名称/颜色；已打开编辑器和撤销恢复遇已删除类别时归 `other`，恢复失败展示可重试错误。
- 单个与批量编辑器共用紧凑 `role="switch"` 锁定控件，单一标签「锁定（不可拖动）」，支持键盘；`lock` 语义见 `00` §3。
