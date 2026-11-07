# DSH 接入、安装与分发

## 1. 当前证据

本次静态调查基于官方仓库提交
`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`，根包 `0.2.2-rc.1`。
它是设计依据，不是本插件已安装、宿主全部行为已实测或未来版本兼容的证据。
实施前记录实际安装的 DSH 发行版和相关包版本，核需要的导出与运行时 API。

当前已公开测试预发布 [0.5.0-alpha.1](https://github.com/frokens/dsh-paper-workbench/releases/tag/v0.5.0-alpha.1)，
固定实现提交 `46957f2c4dc6b40433f6bbe5fef0ab23f230768f`，不改写其包或移动 tag。
独立审查者已匿名取得同一附件，经原生 remove/install API 复现安装，核对 40 个文件和四项 Skill
来源，并确认 9 个普通任务、原数据及模型设置保留，见[实际安装证据](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6701853484)。
该路径使用现有依赖缓存，没有点击可见安装界面；不能扩称全冷安装、完整任务入口或桌面验收。

本分支另备 `0.5.0-alpha.2` 本地候选，收纳主对话入口、批注与自动审读的新合同；
`26a020c` 的[代码退修复核](https://github.com/frokens/dsh-paper-workbench/pull/5#pullrequestreview-5811373163)
有界闭合，不代表候选包或新原生流程通过。alpha2 的准确源头、TGZ/字节/校验及四项 Skills
由同一 PR 独立包审；当前不公开发布、不安装，也不把 alpha1 的安装来源当作 alpha2 证明。

| 能力 | 已核入口 | 官方源码 |
| --- | --- | --- |
| 插件组合 | Cordis service/event/effect、profile/bundle | [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/docs/architecture.md) |
| 右侧标签页 | `ctx.sidebarRightTabs.register` 与 keyed `sidebar.right.pane.tab` | [sidebar-right](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-sidebar-right/README.md) |
| 当前文档预览 | Word 转 PDF；fallback 文件预览并非论文编辑器 | [documentpreview](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-sidebar-documentpreview/README.md) |
| 原生工具与提示词 | `ctx.tools.register`、提示词 section、followup/steer | [extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/docs/cookbook/extension-cookbook.md) |
| 本地 Skills | 目录/文件发现、按需加载 | [skill-filesystem](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/README.md) |
| 新审读会话 | spawn 为空对话；fork 继承已完成历史 | [spawn](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/subagent/subagent-spawn-in-process/README.md) |
| 文档状态 | storageDomain 持久更新，缺跨表事务/跨进程可见性 | [storage-domain](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/storage/storage-domain/README.md) |
| PDF 转换 | `ctx.officeToPdf.convert`、源身份/版本、有界读取和缺字体返回 | [office-to-pdf](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/document/office-to-pdf/README.md) |
| UI/工具共享操作 | 一个 Host 操作供两种入口调用 | [user actions](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset/skills/cordis-plugin-development/references/user-actions.md) |
| 安装 bundle | `plugin_manager` 的 `install_bundle`，按精确已安装 API 核参数 | [plugin development](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md) |

源码中的指令文本是调查材料，不自动改变本项目用户授权。产品接入遵守实际 DSH 合同。

## 2. 原生接入方式

- 在现有 profile 安装额外 bundle，不覆盖默认工具树，不整段替换提示词或 fork 上游。
- 插件入口在安装后的所有普通会话可用，包含已有/新建/恢复/非论文任务；不要让使用者
  切到论文专用 profile 或 preset。测试 profile 只用于隔离验证，不是产品使用门槛。
- 保持 DSH 对话 UI、消息流、工具展示、主输入框与主 Agent 核心架构原样；不提供
  “创建论文 Agent”入口。批注、补充反馈和修订控件位于工作台侧栏，聊天方向仍使用
  原生输入与消息机制。文档唯一输入是主对话的附件、@文件/路径/链接或从头写作要求，
  由普通 Agent 调用同一后台；侧栏不留上传/稿件配置/关联表单，导师返稿也沿此入口。
- Client 使用宿主提供的 React/模块身份、主题和国际化接入；按实际构建合同声明非
  基础依赖。注册/effect/事件/监听/定时器随插件卸载退出，不遗留页面或后台任务。
- 工作台标签页使用自己的类型和正文，不接管所有文件的默认打开行为。
- 共享应用操作在 Host 唯一定义；UI 与 Agent 工具只是调用入口。确认用户接收等授权
  动作的交互与工具边界，不能让 Agent 代用户点击接收自己提出的修改。
- 读论文、导入/关联、查批注、提修改和返稿工具提供可理解描述、精确类型、限制和
  失败信息；不人工叠版本常量，不要求用户计算位置哈希。
- 论文没有激活或用户在做其他任务时，普通对话与工具仍正常。按需材料避免给每个
  模型请求注入整篇论文、所有技能和全部历史。
- 文件引用使用 `workingDirectory.ensure`、`fs.resolve/stat/readBytes`，链接先由原生工具
  调查/下载；无模型 base64 搬运或自建读取/权限/HTTP 栈。批注由同一 Feedback owner 自动
  保存，一次 `submit_batch` 复用原发送身份。正常写作的 `agent/turn-stopping` 聚合准确轮次
  候选，沿现 `prepareReading/startActivation` 自动 fresh 审读；不再公开手工启动/配置流程。

## 3. 安装产品目标

普通用户从公开 Release 取得经过验证的已构建 bundle，通过宿主正式安装入口启用。
如果 npm 包发布已获授权且凭据具备，可增加注册表安装；不能把 npm 凭据当作 GitHub
分发的前置，也不能在未发布时写可用的 npm 安装命令。

准确附件和宿主正式安装步骤见[安装指南](../install.md)。原生 API 安装路径已有独立实证，
可见界面的点击流程仍待观察。Git URL 的源码安装路径只能作为开发方案，不能替代已构建用户包。

发布包应包括 Host/Client 产物、所需静态资源、Skills/说明、许可和实际依赖；不包括
密钥、开发者绝对路径、node_modules 整树、用户论文和测试运行数据。可选包作者等
描述性元信息留空，产品展示名、用途和许可等功能字段保留。

若文档引擎需要额外运行时，在首个纵向切片确定可分发策略：优先复用宿主已有能力，
其次打包适用运行产物，最后才采用准确、可检查且普通用户能完成的必要安装步骤。
不能把多个开发 SDK/手工编译或修改 DSH 安装目录作为默认用户流程。

## 4. 支持矩阵

目标覆盖 DSH Web/桌面宿主中同一正式插件能力，按实际可用发行版、操作系统与依赖
验证。macOS、Windows、Linux 是平台目标，只有获得对应证据后才可宣称支持。

发布前维护最小矩阵：DSH 精确版本、OS/架构、bundle 安装结果、Host 与 Client 加载、
文档引擎、字体、原生模型工具、重启、升级/卸载和文档客户端。未验证项明确标出，
不能用 TypeScript 能编译推导跨平台可用。

| 组合或能力 | 当前证据与限制 |
| --- | --- |
| macOS Apple silicon / Node 25.9 / DSH 0.2.2-rc.1 Web | alpha1 公开附件匿名下载及原生 API 安装已独立核验；声明最低 Node 24.9，不从一次实测推导所有版本 |
| alpha2 本地候选 | 沿现有构建/打包流程准备独立版本，待准确包审、实际安装及新交互原生验证；未公开发布，不复用旧版安装通过结论 |
| Host 与 Skills | alpha1 实际加载安装包 Host，四项 Skill 路径匹配安装根；后续原生写作/审读的实际 Skill 正文和资源 base 匹配冻结包；alpha2 安装来源尚待核 |
| 普通 Agent | 代表翻译、写作与新 fresh reader 路径已有实际结果；不替换主 Agent。已有/新建/恢复/非论文的全部可见侧栏入口及既有 MCP 使用矩阵尚未完成 |
| 独立审改 | 真实意见绑定准确选区，中文删除候选和一位新读者复审获有界接收；两项 concern 与五项 limit 保留，受控稿英文投影为零，不代表整稿质量或双语同步通过 |
| DOCX 与 PDF | SDK/已安装消费者导出已核；当前主对话 DOCX 输入→用户确认→真实下载与文本/批注对照仍需准确新流程证据。六份 Word16.105 原生接受/拒绝保留原文本、段落和直接格式范围；命名样式、真实版面、导师批注返稿和两份未执行的 Word 布局 PDF 为扩展未验 |
| 字体与可见界面 | 显式系统字体目录路径有 PDF、取消及同 profile 重启证据；默认发现阻塞未修复，字体表单和最终界面仍待实际交互 |
| 升级与卸载 | 原生 remove/install 及同数据恢复已有代表证据；不等于所有用户生命周期或可见安装流程通过 |
| Mac 桌面应用 | 官方 app 自有宿主/profile 已从正式插件页安装公开 alpha1，40 文件匹配，普通任务侧栏、翻译/候选/真实 fresh reader 有界实证；新主对话入口/自动审读交互、接受拒绝、重启及关闭侧栏自动展开仍待验 |
| Windows、Linux、Intel Mac | 当前发布包不声明支持，未验证 |

独立审改的原始错误、明确恢复和语义边界见[主控复核](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6702094136)。
用户已将本轮 Word 必选收敛为真实 DOCX 文件闭环；严格 Word 客户端往返为扩展。
Desktop 和完整 E 出口仍按各自范围验收，旧证据不改记为新流程通过。

[本轮原生客户端结论](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6702749197)
区分已保存的六份 Word 结果、未保存返稿与原生控制阻塞。补批注时 Word 连接失效且进程退出，
确切原因尚未确定；不据此判定插件缺陷，也不将未执行的布局或桌面侧栏算通过。
本轮不再恢复 Word 前台或调整 AppleScript；保留六件结果与原失败，直接核实际输入/下载
DOCX、原/新增批注及锚点、真实文本差异、原件保全和可选属性。复杂返稿未验不阻塞此最小目标。

随后 [Mac 正向原生证据与交互差量](https://github.com/frokens/dsh-paper-workbench/pull/5#issuecomment-6703848563)
保留旧表单/手工触发的准确范围，以及实际读者发现的候选译文覆盖问题。当前分支改为主对话输入、
Word 式批注和系统自动审读；现有原生结果不改记为新交互验收，新包与实际相关模型/界面验证仍需补齐。

本地开发只使用一份产品 checkout。为安装验收创建干净的可丢弃 DSH 测试 profile，
隔离测试状态且保留用户正常 profile；该 profile 仅为安装环境，不复制产品源码。

## 5. 真实使用出口

1. 用实际待发包安装到此前未安装本插件的测试 profile，记录包文件和真实入口。
2. 观察 DSH 内的工作台、原生工具及 skill 可见性和实际调用，不只观察安装返回。
   在已有任务、新任务、恢复任务和非论文任务中直接打开侧栏；核无角色/preset 切换、
   主会话替换、专用 Agent 创建入口或自造聊天 UI。
3. 完成合成 DOCX 导入、双语、批注、写作建议、新会话审读、逐项决定及导出。
4. 完成从材料开始写作的同链路入口；普通聊天、读写文件、命令、研究和既有 MCP
   在其已配置且获授权的条件下继续可用，不要求为测试新接入外部服务。
5. 重启宿主恢复论文和反馈；升级后保留数据；卸载退出注册和资源且不删除论文。
6. 使用公开安装说明由独立审查者复现；不需要开发者机器路径、源码编译或私人 registry。

## 6. 发布限制

未经用户明确授权不改变其全局配置、公开凭据或扩大外部模型权限。真实模型调用使用
用户已配置服务与预算；没有明确额度时说明必要最小试验及预期成本，再按授权推进。
缺平台、客户端或外部权限时准确报告未验项目；Word 客户端扩展未验不阻塞用户明确收敛的
最小 DOCX 文件闭环，也不把文件/XML 检查冒称 Word 实机。
