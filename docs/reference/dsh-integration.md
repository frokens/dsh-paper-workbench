# DSH 接入、安装与分发

## 1. 当前证据

本次静态调查基于官方仓库提交
`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`，根包 `0.2.2-rc.1`。
它是设计依据，不是本插件已安装、宿主全部行为已实测或未来版本兼容的证据。
实施前记录实际安装的 DSH 发行版和相关包版本，核需要的导出与运行时 API。

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
- Client 使用宿主提供的 React/模块身份、主题和国际化接入；按实际构建合同声明非
  基础依赖。注册/effect/事件/监听/定时器随插件卸载退出，不遗留页面或后台任务。
- 工作台标签页使用自己的类型和正文，不接管所有文件的默认打开行为。
- 共享应用操作在 Host 唯一定义；UI 与 Agent 工具只是调用入口。确认用户接收等授权
  动作的交互与工具边界，不能让 Agent 代用户点击接收自己提出的修改。
- 读论文、查批注、提修改、请求审读和导出等工具提供可理解描述、精确类型、限制和
  失败信息；不人工叠版本常量，不要求用户计算位置哈希。
- 论文没有激活或用户在做其他任务时，普通对话与工具仍正常。按需材料避免给每个
  模型请求注入整篇论文、所有技能和全部历史。

## 3. 安装产品目标

普通用户从公开 Release 取得经过验证的已构建 bundle，通过宿主正式安装入口启用。
如果 npm 包发布已获授权且凭据具备，可增加注册表安装；不能把 npm 凭据当作 GitHub
分发的前置，也不能在未发布时写可用的 npm 安装命令。

精确包名、命令与安装界面步骤在实测后写入 README 和安装指南。当前不提供未经测试
的命令供用户尝试。Git URL 的源码安装路径只能作为开发方案，不能替代已构建用户包。

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

本地开发只使用一份产品 checkout。为安装验收创建干净的可丢弃 DSH 测试 profile，
隔离测试状态且保留用户正常 profile；该 profile 仅为安装环境，不复制产品源码。

## 5. 真实使用出口

1. 用实际待发包安装到此前未安装本插件的测试 profile，记录包文件和真实入口。
2. 观察 DSH 内的工作台、原生工具及 skill 可见性和实际调用，不只观察安装返回。
3. 完成合成 DOCX 导入、双语、批注、写作建议、新会话审读、逐项决定及导出。
4. 完成从材料开始写作的同链路入口；普通聊天、读写文件、命令、研究和既有 MCP
   在其已配置且获授权的条件下继续可用，不要求为测试新接入外部服务。
5. 重启宿主恢复论文和反馈；升级后保留数据；卸载退出注册和资源且不删除论文。
6. 使用公开安装说明由独立审查者复现；不需要开发者机器路径、源码编译或私人 registry。

## 6. 发布限制

未经用户明确授权不改变其全局配置、公开凭据或扩大外部模型权限。真实模型调用使用
用户已配置服务与预算；没有明确额度时说明必要最小试验及预期成本，再按授权推进。
缺平台、Word 客户端或外部权限时准确报告未验项目，不降低既定产品目标。
