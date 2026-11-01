# 智能日程 · DSH 插件集

一个跑在 [DeepSeek Harness（DSH）](https://github.com/deepseek-harness/deepseek-harness)里的通用日程软件：周历拖拽排日程、任务按截止与优先级过滤、提醒走页面通知或桌宠气泡；会话里对 AI 说一句"下周三下午两点加个会"，它就会写进你的日历。软件本身不绑定任何学校或服务——北航教务、二游前瞻等数据来源都以适配器（子插件）形式接入，装哪个看需求。

## 亮点

- **便捷操作**：右键空白格直接新建（右键拖拽划时段）、左键拖拽移动与跨日排程（15 分钟吸附）、框选批量删除、`Ctrl+Z` 撤销重做、触屏长按编辑。
- **AI 辅助新建**：自然语言说需求，Agent 通过 `schedule` CLI 写入日历；不需要先翻文档学命令。
- **4:00 开始的一天**：显示日按凌晨 4:00 切分，0–4 点算前一天——熬夜排的事落在"今晚"，不用跟日期边界较劲。
- **剪贴板捕获**：复制的内容自动进入剪贴板队列，一键发给新会话，AI 把其中的安排与待办写进日程——看到什么随手存，不怕忘。
- **CLI 为主**：Agent 侧只暴露一个 `schedule` CLI，命令按需 `--help` 发现，不过多占用常态系统提示词；人在终端也能直接用。

## 插件组合

| 包 | 作用 | 建议 |
|---|---|---|
| [`@lidozs55/dsh-schedule`](https://www.npmjs.com/package/@lidozs55/dsh-schedule) | 日程核心：日历条目、任务、提醒、`schedule` CLI、面板 UI | 必装 |
| [`@lidozs55/dsh-schedule-buaa`](https://www.npmjs.com/package/@lidozs55/dsh-schedule-buaa) | 北航教务来源：整学期课表/考试导入、SPOC 作业待办、博雅课程 | 北航学生装 |
| [`@lidozs55/dsh-schedule-gacha`](https://www.npmjs.com/package/@lidozs55/dsh-schedule-gacha) | 二游前瞻：原神/崩铁/绝区零/鸣潮/终末地/异环的版本与前瞻直播写入日程 | 玩二游可选 |
| [`@lidozs55/dsh-schedule-bridge`](https://www.npmjs.com/package/@lidozs55/dsh-schedule-bridge) | 桌宠桥：提醒气泡、任务状态上桌宠，拖文字给桌宠收纳 | 用桌宠可选 |

只装核心就是一个完整的通用日程软件；北航学生加装 buaa 适配器导入课表，想追前瞻直播再加 gacha，桌宠用户再加 bridge。

## 安装

前提：已安装 DeepSeek Harness（DSH）宿主（developer preview）。

1. 打开宿主侧边栏 **Plugins** 页，从 npm 源依次安装下面的包名（先核心，后可选）：

   ```text
   @lidozs55/dsh-schedule          # 日程核心 · 必装
   @lidozs55/dsh-schedule-buaa     # 北航教务来源 · 北航学生装
   @lidozs55/dsh-schedule-gacha    # 二游前瞻 · 玩二游可选
   @lidozs55/dsh-schedule-bridge   # 桌宠桥 · 用桌宠可选
   ```

2. 开发安装（改源码即生效）：Plugins 页用 `link:<插件目录的绝对路径>` 安装，例如
   `link:~/code/dsh-schedule-plugins/dsh-plugin/dsh-schedule`。
3. 安装后侧边栏出现「日程」入口，设置里出现「日程设置」。

## 快速上手

**日程本身**

- **周历操作**：右键空白新建、拖拽移动、框选多选；触屏长按编辑；`Ctrl+Z` / `Ctrl+Y` 撤销重做。
- **让 AI 记日程**：会话里直接说就行。Agent 通过 `schedule` CLI 写入（首次自动执行 `schedule --help` 发现命令），终端里也能自己用，`schedule --help` 分层查看。
- **显示日**：按 04:00 切分，凌晨 0–4 点算前一天；导出/导入覆盖日历条目与任务，学期起点等设置保留。

**来源适配器（可选）**

- **学期起点**：日程设置里填本学期第一周周一的日期，周次换算都基于它。
- **导入课表**：北航卡片填学号与统一认证密码，点「导入课表、考试与 SPOC 作业」。每学期做一次；密码仅当次使用，不保存。
- **作业待办**：同一次导入会把 SPOC 未提交作业写成待办并持续刷新截止时间；已提交的不生成。宿主运行期间每 30 分钟自动刷新。
- **博雅课程**：已选博雅随导入写入日历，退选后下次导入自动移除。
- **二游前瞻**：打开对应游戏开关即可，每 6 小时自动更新；节奏不固定的可点「让 Agent 核对」。

## 为你的学校写适配器

核心与来源是解耦的：北航适配器只是一个范例。其他学校的教务/课程服务可以按 [docs/dsh-plugin/11-source-plugins.md](docs/dsh-plugin/11-source-plugins.md) 的契约写自己的来源插件，装进同一个日程面板。欢迎 issue 讨论，也欢迎 PR 把你的学校加进来。

## 开发文档

- 架构基线：[docs/dsh-plugin/00-architecture.md](docs/dsh-plugin/00-architecture.md)
- 来源适配器契约：[docs/dsh-plugin/11-source-plugins.md](docs/dsh-plugin/11-source-plugins.md)
- 二游前瞻：[docs/dsh-plugin/12-gacha-preview.md](docs/dsh-plugin/12-gacha-preview.md)
- 桌宠桥：[docs/dsh-plugin/09-vivarium-bridge.md](docs/dsh-plugin/09-vivarium-bridge.md)
- DSH 平台参考与开发流程：[docs/dsh-plugin/](docs/dsh-plugin/README.md)

各插件自带 `node --test` 测试（进各插件目录运行）。

## 参与贡献

Bug、功能建议、新学校适配、文档改进都欢迎提 [issue](../../issues) 或 [PR](../../pulls)；提 PR 前请先跑通对应插件的测试。

## 许可

[MIT](LICENSE)

## 特别鸣谢

- **[UBAA](https://github.com/BUAASubnet/UBAA)**（MIT © 2026，BUAASubnet）：北航教务课表/考试、SPOC 作业、博雅课程等数据通道的接口逆向成果，是北航适配器的直接参考。
- **[Vikunja](https://vikunja.io)**（AGPL-3.0；仅借鉴产品设计，未复用代码）：提醒提前量与移动端触屏适配的设计参考。
- **[gacha-calendar](https://gacha.modenc.top)**：二游前瞻插件的数据源服务。
