# Paper Workbench

Paper Workbench 是 DSH 的论文写作与修订插件，在主对话与右侧工作台之间组织批注、修改候选、双语核读和独立审读。智能体根据用户反馈提出修改，用户通过实际差异决定接受或拒绝。

## 功能

- **反馈与修订**：对正文、译文和待定候选选择文字并添加批注，将多条意见一起提交给主对话中的智能体。
- **差异与决定**：展示程序计算的文字变化和修改理由，支持继续修订候选、按改动或依赖组接受与拒绝。
- **双语核读**：默认以英文正文配合中文译文，支持明确选择中文主语言；译文关联原文位置及版本，译文纠正和正文修改分别处理。
- **独立审读**：写作轮次完成后，由新会话读取基准正文、候选组合和用户要求，返回带位置的意见，供用户和写作者继续修订。
- **文档交接**：导入 DOCX 或 Markdown，导出清稿、修订稿和双语 DOCX/PDF，保留批注、决定与历史记录。

## 使用

在 DSH 的插件管理中安装插件包，然后在普通任务的主对话中上传文档、提供文件路径，或说明起草要求。打开右侧 Paper Workbench，阅读正文与译文、添加批注并提交。智能体生成候选后，可查看差异和审读意见，再决定如何修改。

安装环境、文件格式与具体操作见[安装与使用](docs/install.md)。

## 源码结构

| 路径 | 内容 |
| --- | --- |
| `src/host.ts`、`src/remote.ts` | DSH 工具、事件、存储与界面请求接入 |
| `src/model.ts`、`src/records.ts`、`src/contracts.ts` | 文档、反馈、候选、决定及参数约束 |
| `src/operations.ts` | 结构化编辑、选区映射及差异计算 |
| `src/reading.ts` | 独立审读材料、输出校验与适用性判断 |
| `src/client.tsx` | 批注、候选、双语阅读与历史界面 |
| `src/word.ts`、`src/delivery.ts`、`src/returns.ts` | Word 修订、交付记录与返稿比较 |
| `document-engine/` | 基于 Open XML SDK 的 DOCX 读写引擎 |
| `skills/` | 写作、局部修订、双语处理和审读的运行指引 |
| `tests/` | 文档操作、存储、格式与宿主集成测试 |

状态关系与模块协作见[技术说明](docs/reference/architecture.md)。

## 从源码构建

需要 macOS Apple silicon、Node.js 24.9 或更高版本及 .NET 10 SDK。插件面向 DSH `0.2.2-rc.1`。

```sh
npm ci
dotnet publish document-engine -c Release -r osx-arm64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o runtime/osx-arm64
npm run typecheck
npm test
npm run build
npm run package
```

打包文件生成于 `.local/packages/`。打包脚本会拒绝覆盖同版本的已有文件；构建新的分发包时，应先设置新的包版本。

## 许可

项目采用 [MIT License](LICENSE)。所使用的第三方组件及许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
