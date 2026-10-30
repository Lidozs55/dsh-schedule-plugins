# BUAAer 智能日程 · DSH 插件集

为北航学生做的 [DeepSeek Harness（DSH）](https://github.com/deepseek-harness/deepseek-harness)日程插件：一次登录导入整学期课表与考试，SPOC 作业自动变待办，博雅课程进日历，上课前能远程签到；日程、待办、提醒与 AI 助手在同一个宿主里闭环。

装好后侧边栏多一个「日程」面板：周历拖拽排日程、任务按截止与优先级过滤、提醒走页面通知或桌宠气泡；会话里对 AI 说一句"下周三下午两点加个会"，它就会写进你的日历。

## 插件组合

| 包 | 作用 | 建议 |
|---|---|---|
| `@lidozs55/dsh-schedule` | 日程核心：日历条目、任务、提醒、`schedule` CLI、面板 UI | 必装 |
| `@buaaer/dsh-schedule-buaa` | 北航教务来源：整学期课表/考试导入、SPOC 作业待办、博雅课程、iclass 远程签到 | 北航学生装 |
| `@lidozs55/dsh-schedule-gacha` | 二游前瞻：原神/崩铁/绝区零/鸣潮/终末地/异环的版本与前瞻直播写入日程 | 玩二游可选 |
| `@lidozs55/dsh-schedule-bridge` | 桌宠桥：提醒气泡、任务状态上桌宠，拖文字给桌宠收纳 | 用桌宠可选 |

推荐组合：北航学生装前两个；想追前瞻直播再加 gacha；桌宠用户再加 bridge。非北航用户也可以只用核心当通用日程用。

## 安装

前提：已安装 DSH 宿主（developer preview）。

1. 打开宿主侧边栏 **Plugins** 页，安装上面的包名（npm 源）；先装核心，再装其他。
2. 开发安装（改源码即生效）：Plugins 页用 `link:<本仓库对应插件目录的绝对路径>` 安装。
3. 安装后侧边栏出现「日程」入口，设置里出现「日程设置」。

## 快速上手

- **学期起点**：日程设置里填本学期第一周周一的日期，周次换算都基于它。
- **导入课表**：北航卡片填学号与统一认证密码，点「导入课表、考试与 SPOC 作业」。每学期做一次；密码仅当次使用，不保存。
- **作业待办**：同一次导入会把 SPOC 未提交作业写成待办并持续刷新截止时间；已提交的不生成。宿主运行期间每 30 分钟自动刷新。
- **博雅课程**：已选博雅随导入写入日历，退选后下次导入自动移除。
- **远程签到**：手动同步后，当天北航课程的编辑器里有「远程签到」按钮（iclass）。
- **二游前瞻**：打开对应游戏开关即可，每 6 小时自动更新；节奏不固定的可点「让 Agent 核对」。
- **让 AI 记日程**：会话里直接说就行。Agent 通过 `schedule` CLI 写入（首次自动执行 `schedule --help` 发现命令），也可以在终端自己用，`schedule --help` 分层查看。
- 显示日按 04:00 切分（凌晨 0–4 点算前一天）；导出/导入覆盖日历条目与任务，学期起点等设置保留。

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

- **[UBAA](https://github.com/BUAASubnet/UBAA)**（MIT © 2026，BUAASubnet）：北航教务课表/考试、iclass 签到、SPOC 作业、博雅课程四个数据通道的接口逆向成果，是北航适配器的直接参考。
- **[Vikunja](https://vikunja.io)**（AGPL-3.0；仅借鉴产品设计，未复用代码）：提醒提前量与移动端触屏适配的设计参考。
- **[gacha-calendar](https://gacha.modenc.top)**：二游前瞻插件的数据源服务。
