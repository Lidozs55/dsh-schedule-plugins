# 01 · 插件解剖：bundle、清单、patch、安装与生命周期

> 本文档描述 DSH（DeepSeek Harness）的插件形态。DSH 的架构是 **everything is a plugin**：Harness 本体、Web UI、工具、界面槽位都是插件，由 Cordis Loader 按 profile 组合。
> **运行时才是权威**——任何签名/事件/槽位都可用 `cordis_inspect_query` 现场核对，查证方式与 DSH 版本事实见本目录 `README.md`。

---

## 1. 三个层次：package → bundle → plugin row

| 概念 | 是什么 | 载体 |
|---|---|---|
| **plugin** | 一个导出 Cordis 插件的 JS 模块（函数或 Service 类） | `index.js`（Host 半）/ `client.js`（Client 半） |
| **bundle** | 一个 npm 包，用 `package.json` 声明 `dsh.bundle.patch`，用 YAML patch 把若干 plugin row 插进 Loader 组合 | 包目录 |
| **profile** | 用户当前的插件组合（一组有序的 patch 层叠加在 bundle 的 row 列表上） | `$DSH_PROFILE_DIR` |

一个 bundle 可以只含一个 plugin row，也可以插入多行。**本项目（四个 bundle：核心/北航/二游/桥）的每个 bundle 均为单 row**。

---

## 2. 最小可用 bundle（Host-only）

目录（建议放在本仓库内，例如 `dsh-plugin/dsh-schedule/`）：

```
schedule-core/
├── package.json          # bundle 清单
├── cordis.patch.yml      # 把本包的 row 插入 profile
└── index.js              # Host 半：插件本体
```

`package.json`：

```json
{
  "name": "@lidozs55/dsh-schedule",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: schedule-core
      name: '@lidozs55/dsh-schedule'
      config: {}
```

`index.js`（函数形态）：

```js
export const inject = ['tools'];           // 可选：声明硬依赖
export function apply(ctx, config) {
  // 所有注册都通过 ctx.effect / ctx.on，返回值就是卸载时的清理函数
  ctx.effect(() => ctx.tools.register({ /* ... */ }));
}
```

要点：

- Host-only 的 bundle **不需要** dependencies、install 脚本或构建工具；`index.js` 就是源码。
- 包与 row 的 `id`、`name` 都要唯一。插入的相对路径以 patch 文件所在目录为锚点解析。
- 一个 Host-only bundle 也可以什么都不做（`export function apply() {}`），把渲染交给 Client 半——见 `03-client-ui.md`。

---

## 3. patch 方言（Loader YAML）

patch 是**有序的层**，逐层叠加在 bundle 的 row 列表上。一条 patch 是如下映射：

| 写法 | 语义 |
|---|---|
| `insert: [rows]` | 追加 row；若带 `id` 且该 id 指向一个 `group: true` 的 row，则插入那个 group 的 `config` 列表内部 |
| 带 `id`、不带 `insert` | 覆盖同 id 的既有 row。**提供的字段整体替换该字段**，`config` 是整体替换、绝不深合并——必须把所有需要的字段重新写全 |
| 带 `name`（真值） | 断言既有插件的名字，而不是改名 |
| 不带非空 `id` 且不是 insert | 会被警告并跳过；找不到目标 row 同样警告并跳过 |

row 的字段：

| 字段 | 含义 |
|---|---|
| `id` | row 标识（覆盖/插入的锚点） |
| `name` | 插件包名（npm 说明符） |
| `config` | 传给插件的配置对象（由插件的 `Config` 校验） |
| `disabled` | 布尔值、`null`，或 `!!js` 表达式；禁用行可以省略必需的 `config`（除非 `group: true` 强制激活） |
| `inject` / `intercept` / `isolate` | 依赖与作用域控制 |
| `group: true` + `name: cordis:group` | `config` 是嵌套 row 列表，允许其它 patch 按 id 插入其中 |
| `name: cordis:include` | 从 `config.path` 读入一个字面量 YAML/JSON row 列表 |

`!!js` 标量是 Loader 表达式（注意**不是** `!js`）。在 `config` 内部，它们在该 row 声明的依赖激活**之后**求值，作用于该插件的 context，因此 `!!js dshHomePath('sessions')`、`!!js "!ctx.get('profileContext')"` 都是合法的。row 的其它元数据保持字面量。

`isolate` 把服务名映射到 `true` 或一个 realm 标签；提供某服务的 preset 插件会把提供者与其消费者一起隔离。**scope** 控制贡献与事件可见性；**isolate** 控制服务实例。

---

## 4. Host 半的导出形态

`index.js` 只能选**一种**形态，不要混用：

1. `export function apply(ctx, config) {}`，可另带 `export const inject = [...]` 与 `export const Config`。
2. `export default` 一个 Service 类。

> 反面教材：如果写成 `export default` 的函数/类，`export const inject` 会被丢弃（DSH 有对应事故复盘 `docs/postmortem/0001-acp-default-export-drops-inject.md`）。需要 `inject` 就用 §4.1 的函数形态。

### 4.1 资源注册与释放

**每一个**资源都必须在 `apply` 内通过 `ctx.effect` 或 `ctx.on` 注册，并让其清理函数成为返回值的一部分。插件卸载、agent 释放、槽位折叠、profile patch 变化都会撤掉注册在对应 context 上的东西——**context 决定生命周期**。

```js
export function apply(ctx, config) {
  ctx.effect(() => ctx.tools.register(definition));      // 卸载即反注册
  ctx.on('tools/change', () => { /* ... */ });            // 返回 disposer
}
```

如果注册挂到了**别的** context（例如 `agent.ctx`），那么它有两个所有者：既要把它登记进 `agent.ctx.effect()`，也要把该 disposer 放进本插件自己的 effect 里，这样任一侧卸载都能清理。

### 4.2 可选依赖不要写进硬依赖

放进 `inject` 的服务在本 profile 缺失时插件不会激活；可选能力应写成 `ctx.get('name')`（判空）或 `ctx.inject([...], ...)`，这样在没有该能力的 profile 里插件安静地处于非激活状态，而不是抛错。

---

## 5. Config：可调参数由用户 patch 提供

给插件加 `export const Config`（Standard Schema）后，Loader 在激活时用 row 的 `config` 校验；用户写在 `cordis.patch.yml` 里的值会覆盖默认值，并且**用户的 patch 层在升级后依然存活**。因此所有可调值（轮询间隔、提醒提前量、LLM 模型名……）都应进 `Config`，而不是写死在代码里。

```js
import Schema from '@deepseek-ai/schemastery'   // DSH 侧 schema 库

export const Config = Schema.object({
  syncIntervalMinutes: Schema.number().default(30),
})
```

精确写法、默认值、`volatile` 字段、`!!js` 计算值与"改配置会热替换插件"的语义见 `02` §4。

写 `config` 之前先查已安装插件的实际 schema：

```
cordis_inspect_query { platform: "host", provider: "Config",
  method: "listConfigs", input: { name: "@lidozs55/dsh-schedule" } }
```

目录页给出每个 entry 的 id 与 Config 状态；再用 `input: { entry: "<id>" }` 取该 entry 的投影 JSON Schema（注意跟随返回文档里的 `$defs` 引用）。

---

## 6. Client 半（在 Web UI 里渲染）

在清单里加 `dsh.client` 段（`platform: "web"`、可选 `immediately`、信息性的包名 `inject` 列表与 `external` 模块表）并导出 `./client`，浏览器半就会由 client module system 加载；`exports["./client"]` 指向的浏览器产物不需要构建，它就是一个调用 `window.__ModuleLoader__.load({ id, factory })` 的文件（`id` 必须等于包名）。

**关键限制**：client 半只挂在说明符恰好是**裸包名**的那一行上。若把一个包拆成多行（子路径导出），只有根行带半侧，页面会随根行关闭而消失；需要独立生命周期的页面要单独发包。

槽位体系、样式 token、locale 与 Client→Host 调用路径的唯一权威见 `03-client-ui.md`。

---

## 7. 安装、启用与生命周期（速记）

安装/启停一律走 `plugin_manager`（`install_bundle` / `list_plugins` / `set_plugin` / `list_bundles` / `set_bundle` / `remove_bundle`），**不要**手写 profile 的文件，也不要手动跑 pnpm。判断变更是否生效看返回值（`applied` / `warnings` / `failed` / `overridden` / `restart-required`），并记住三条 HMR 语义：新装 bundle 可能经 HMR 直接激活；**替换**已安装的包要重启才换新模块代；slot id 没变不能推断浏览器代码已更新。资源生命周期归 `ctx.effect` / `ctx.on`（§4.1）。

返回值语义、`pendingBuilds` 审批、验收清单、排查表与禁忌汇总的**唯一权威见 `08-workflow-and-verification.md`**。

---

## 8. 本仓库的落位

实际产物在 `dsh-plugin/` 下四个 bundle 目录（核心 `dsh-schedule/` = Host 入口 + `host/` 模块 + Client 入口 + `client.*.js` 分块；其余见 `00-architecture.md` §1 代码地图）。本仓库的约定：

- 文档放 `docs/dsh-plugin/`；旧实现（`electron/`、`backend/`、`frontend/`）已删除，仓库现在只有 `docs/`、`dsh-plugin/` 与仓库元信息（根 `README.md`、`package.json`）。
- bundle 目录名/包名/row id 一旦安装就与 profile 绑定，**改名 = 重新安装**；本仓库四包统一 `@lidozs55/` 前缀，均已定死。

---

## 9. 硬性禁止（速记）

踩了就坏的平台级红线——不手写 profile 文件、不在 `$DSH_HOME` 建包、不给 Session 日志追加新事件类型、不在 Client 半 `require` DSH Client 包、不用 iframe 承载页面、不轮询 `agent/status`/直接写 DOM、可调参数不写死进代码。

完整禁忌清单（逐条都是踩过的坑）与排查表的**唯一权威见 `08` §9**；Client 半专属规则见 `03`。
