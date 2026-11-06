# Paper Workbench for DeepSeek Harness

面向科研论文的双语阅读、反馈定位、局部修订、独立审读和 Word 往返协作插件。

复用 DeepSeek Harness（DSH）的通用 Agent、工具、研究能力和插件运行时，在同一个
普通任务的原生对话中提供可持续迭代的论文侧栏。用户可以从材料开始写作，也可以上传已有论文，
通过逐段中英对照理解内容，在侧栏批注并逐处决定是否接受修改。

## 当前状态

A 批的有界代码切片已由 [PR #1](https://github.com/frokens/dsh-paper-workbench/pull/1)
合入；最终 Word 接受/拒绝、桌面接入及公开下载仍有未验项。当前实施 B 批的双语、反馈
和修订生命周期，见[本批状态](docs/reference/bilingual-lifecycle-status.md)。尚未发布完整产品。下列完整体验仍是实施
目标，不能视为已全部交付。当前职责、支持域和实际证据见
[原生切片状态](docs/reference/native-slice-status.md)及实现 PR。

## 目标体验

1. 在 DSH 中上传论文或从研究材料开始写作，自动打开论文侧栏。
2. 阅读绑定到同一正文版本的中英对照，选择内容并积累批注。
3. 将批注和聊天中的修改方向一起提交，Agent 调查资料后形成局部修改建议。
4. 独立会话审读候选稿；侧栏显示实际增删、修改理由、反馈对应和审读意见。
5. 逐处接受、拒绝或继续讨论，保留历史并恢复中断的工作。
6. 导出干净 Word、原生修订 Word、双语工作稿和 PDF；接收导师返稿后继续迭代。

安装后，DSH 原有对话界面和主 Agent 核心架构保持原样。插件侧栏对已有、新建、恢复
及非论文普通任务均可用，不设“创建论文 Agent”的单独入口，不要求切换角色、preset
或另开专用会话。普通聊天、项目调查、代码编写、文件操作、命令、检索、MCP 和原有
工具保持可用；未关联论文时不自动注入论文上下文。批注/修订控件归插件侧栏，不重造
DSH 对话区或主聊天输入框。

## 文档入口

| 文档 | 职责 |
| --- | --- |
| [产品设计](docs/reference/product-design.md) | 用户问题、使用流程、范围及不可破坏的产品行为 |
| [架构设计](docs/reference/architecture.md) | 文档模型、状态、修订、翻译、审读及格式适配 |
| [DSH 接入与分发](docs/reference/dsh-integration.md) | 已核源码扩展点、安装、发布包和真实运行要求 |
| [验收标准](docs/reference/acceptance.md) | 工程、真实 DSH、Word 往返及安装验收 |
| [实施规划](docs/plans/implementation-plan.md) | 依赖顺序、职责批次、出口和剩余目标 |
| [协作与审查](CONTRIBUTING.md) | 分支、Draft PR、独立审查、退修和合并 |
| [工作规则](AGENTS.md) | 人与 Agent 均需遵守的稳定约束 |

## 安装与开发

候选包包含已构建 Host/Client、文档运行时、Skill 和许可，通过 DSH 正式插件入口安装。
首个验证组合是 DSH `0.2.2-rc.1` Web、macOS Apple silicon；桌面插件安装与其余平台
尚未验收。候选安装方式与限制见[安装说明](docs/install.md)。当前公开 Release 仍待
独立审查；没有发布的包不能视为普通用户已可取得。

开发者使用 Node.js 24.9 或更高版本和 .NET SDK 10。依赖由 npm 与 NuGet 锁文件确定。
文档辅助程序使用 Open XML SDK，自带运行时；普通安装使用者无需 .NET SDK。

```sh
npm ci
dotnet publish document-engine -c Release -r osx-arm64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o runtime/osx-arm64
npm run typecheck
npm test
npm run build
npm run package
```

真实 Host 集成检查单独使用 `npm run test:host`，只连接 `DSH_TEST_URL` 指定的可丢弃
测试服务，创建合成会话并调用已安装插件，不发模型请求。不得将它指向正常用户环境。

## 贡献与许可

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。本仓库采用 [MIT License](LICENSE)。
不得向公共仓库上传私人稿件、导师返稿、聊天截图、凭据或真实 API 密钥；回归样例
使用合成文档或已核实可以再分发的材料，并保留第三方许可要求的署名。
