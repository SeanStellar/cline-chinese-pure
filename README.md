# cline-chinese纯净版 · Cline 中文汉化版

![VS Code](https://img.shields.io/badge/VS%20Code-1.101%2B-007ACC?logo=visualstudiocode)
![License](https://img.shields.io/github/license/SeanStellar/cline-chinese-pure)

[GitHub 仓库](https://github.com/SeanStellar/cline-chinese-pure) · [下载 Release](https://github.com/SeanStellar/cline-chinese-pure/releases) · [报告问题](https://github.com/SeanStellar/cline-chinese-pure/issues)

## 这是什么

cline-chinese纯净版 是基于 [Cline](https://github.com/cline/cline) 与 Cline Chinese 社区汉化版的中文定制版本。保留 Cline 的编程 Agent 能力，移除了推广与账户入口，专注于中文界面和自带 API Key 的使用方式。

本项目不是 Cline 官方扩展，与上游项目没有隶属关系；代码遵循 Apache-2.0 许可证。

## 主要特性

- 完整中文界面、中文提示词与中文错误信息
- 面向 DeepSeek、Kimi、Qwen、GLM 等中文模型的 prompt 优化
- 支持自带 API Key：Anthropic、OpenAI、Gemini、OpenRouter、Ollama、LM Studio 及 OpenAI 兼容接口
- 模型配置弹层、供应商预设、参数编辑与导入导出（不含 API Key）
- 本地用量统计
- 思考强度滑块：蓝紫渐变、星粒随强度加速，最高档烟花爆发
- 检查点、上下文自动压缩、MCP、Skills / Plugins

## 安装

1. 从 [Releases](https://github.com/SeanStellar/cline-chinese-pure/releases/latest) 下载最新的 `.vsix` 安装包
2. 在 VS Code 中打开扩展视图 → 右上角 `...` → **从 VSIX 安装…**
3. 或使用命令行：

```bash
code --install-extension cline-chinese-pure-4.1.37.vsix
```

扩展 ID 为 `seanstellar.cline-chinese-pure`。如果之前装过 `hybridtalentcomputing.cline-chinese` 的旧版，VS Code 会把本版本视为另一个扩展，两者配置不共享；建议先卸载旧版再安装。要求 VS Code 1.101 或更高版本；Cursor、Windsurf 等 VS Code 兼容编辑器也可以直接安装 VSIX。

## 配置模型

1. 打开扩展设置，选择模型供应商
2. 填入自己的 API Key（保存在 VS Code `SecretStorage` 中）
3. 选择模型开始对话；也可以使用本地 Ollama / LM Studio，无需账号

本项目不绑定账号或网关，使用你自己选择的供应商和 API Key。

## 使用

- `@文件` / `@文件夹`：把文件或目录加入上下文
- `/`：快捷命令（如解释代码、生成测试）
- 终端命令：执行前会请求确认
- 检查点：一键对比与回滚
- 上下文压缩：超过模型窗口时自动压缩历史对话

## 从源码构建

```bash
bun install
cd apps/vscode
bun run package
bunx vsce package --no-dependencies
```

构建产物为 `apps/vscode/cline-chinese-pure-<version>.vsix`。

## 数据与隐私

- 提示词、上下文、文件内容、终端输出和工具结果会发送给你选择的模型供应商或自定义 endpoint。
- API Key 保存在本地 VS Code `SecretStorage`；任务历史主要保存在本地扩展存储。
- 部分内置功能可能访问 Cline 服务（如 `app.cline.bot`、`api.cline.bot`），是否使用取决于你的配置。
- 构建时启用遥测的情况下，可能通过 PostHog 或组织配置的 OTLP collector 发送使用与错误数据；可在设置中关闭可关闭的遥测。
- 使用本地 Ollama / LM Studio 可以减少数据离开本机，但本地模型仍可能调用你配置的 MCP 或其他服务。
- 可通过删除任务、清理扩展存储和撤销 API Key 来清理本地数据。

## 常见问题

**Q：和原版 Cline 同时安装会冲突吗？**

A：建议只装一个。两者是独立扩展，但同时运行容易混淆。

**Q：能装在 Cursor / Windsurf 等 VS Code 兼容编辑器里吗？**

A：可以，直接安装 VSIX 即可。

**Q：没有 API Key 能试用吗？**

A：可以配置本地 Ollama / LM Studio；使用云端模型则需要相应供应商的 API Key。

**Q：中文输入偶尔输出英文怎么办？**

A：在对话开头要求「请始终用中文回答」，或把这条要求写入自定义系统提示词。

**Q：任务历史会上传云端吗？**

A：任务历史主要保存在本地；发送给模型供应商的请求内容按其隐私政策处理。

**Q：能离线用吗？**

A：本地模型可以离线运行；Cline 服务、MCP 或远程供应商仍可能需要网络。

## 反馈

问题和建议请提交到 [GitHub Issues](https://github.com/SeanStellar/cline-chinese-pure/issues)。

## 免责声明

本项目是开源的 VS Code 扩展，按现状提供，不附带任何明示或暗示的担保。使用本插件产生的风险由使用者自行承担；请遵守当地法律法规，不要将本插件用于任何违法违规行为。

## 许可证

[Apache-2.0](https://github.com/SeanStellar/cline-chinese-pure/blob/master/LICENSE)

汉化部分与上游 Cline 遵循相同许可证。安全披露流程见 [SECURITY.md](https://github.com/SeanStellar/cline-chinese-pure/blob/master/SECURITY.md)。

## 致谢

- [Cline](https://github.com/cline/cline) 团队 —— 本项目的基础
- Cline Chinese 社区汉化版的作者与贡献者
- 所有 [贡献者](https://github.com/SeanStellar/cline-chinese-pure/graphs/contributors)

> 如果喜欢这个项目，欢迎给本项目 **和上游** [Cline](https://github.com/cline/cline) 一个 ⭐️。
