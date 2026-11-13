# Cline Chinese 定制变更清单

基线：`cline-chinese` 4.1.33（上游 `cline/cline`，Apache-2.0）。
本文件用于上游升级时对照合并，避免逐文件猜改动。

## 1. 界面上移除的推广 / 账户 / Batch

| 文件 | 变更 |
|---|---|
| `webview-ui/src/components/settings/ShengSuanYunModelPicker.tsx` | 删除"体验/免费/前沿模型"标签页、硬编码推广卡片、`Lure` 注册引流、底部引流文案 |
| `webview-ui/src/components/settings/FeaturedModelCard.tsx` | 删除 `Lure` 组件及 `AccountServiceClient` 依赖 |
| `webview-ui/src/components/settings/providers/ShengSuanYunProvider.tsx` | 去掉注册链接（`signupUrl`），新增"退出胜算云登录" |
| `webview-ui/src/components/settings/common/ApiKeyField.tsx` | 注册链接仅在传入 `signupUrl` 时渲染 |
| `webview-ui/src/components/settings/ApiOptions.tsx` | 删除"胜算云强制置顶"排序；提供商名称本地化 |
| `webview-ui/src/components/promo/promoContent.ts` | 新用户 / 每日推广弹窗内容置空（关闭） |
| `webview-ui/src/components/onboarding/data-steps.ts` | 删除"免费开始（领体验 key）"选项并中和对应步骤文案 |
| `webview-ui/src/components/onboarding/OnboardingView.tsx` | 移除 `FreeCredit`、去掉注册来源追踪参数 |
| `webview-ui/src/components/onboarding/FreeCredit.tsx` | 已删除 |
| `webview-ui/src/components/settings/ShengSuanYunAccountInfoCard.tsx` | 已删除（无引用） |
| `webview-ui/src/App.tsx` | 移除 `AccountView` 路由；新增 `UsageView` 路由 |
| `webview-ui/src/components/menu/Navbar.tsx` | 移除"账户"入口；新增"统计"入口（独立版布局） |
| `webview-ui/src/components/chat/ChatTextArea.tsx` | 模式切换去掉 Batch，仅 Plan/Act |

Batch 后端（LoomLoom 服务、BatchConversation 等）保留但无 UI 入口；彻底移除是待办。

## 2. 交互布局调整

| 文件 | 变更 |
|---|---|
| `webview-ui/src/components/chat/ChatView.tsx` | "自动批准"从输入框上方移入输入区底栏 |
| `webview-ui/src/components/chat/auto-approve-menu/AutoApproveBar.tsx` | 新增 `compact` 紧凑样式（仅"自动批准 ▾"） |
| `webview-ui/src/components/chat/auto-approve-menu/AutoApproveModal.tsx` | 新增 `floating` 模式，Portal 定位避免被裁切 |
| `webview-ui/src/components/chat/chat-view/components/layout/InputSection.tsx` | 透传 `hideAutoApprove` |

## 3. 本地化

| 文件 | 变更 |
|---|---|
| `webview-ui/src/utils/modeLabels.ts` | 新增：Plan/Act 标签按首选语言（简/繁/英） |
| `webview-ui/src/utils/providerNames.ts` | 新增：提供商中文名映射（219 家中可读的子集） |
| `webview-ui/src/components/settings/utils/reasoningEffort.ts` | 导出 `REASONING_EFFORT_LABELS` |
| `webview-ui/src/components/settings/sections/ApiConfigurationSection.tsx` | "Plan/Act 模式"标签、勾选项与描述按首选语言 |
| `webview-ui/src/components/settings/sections/FeatureSettingsSection.tsx` | "网络搜索 / 云端"按首选语言 |

说明：本 fork 没有 i18n 框架，语言由 `preferredLanguage`（AI 回复语言）驱动。独立 UI locale 是待办。

## 4. 新增功能

| 文件 | 变更 |
|---|---|
| `webview-ui/src/components/chat/model-profiles/storage.ts` | 新增：配置解析/序列化、模式字段重映射 |
| `webview-ui/src/components/chat/model-profiles/ModelProfileMenu.tsx` | 新增：模型配置弹层（保存/切换/删除、推理强度、Portal 定位） |
| `webview-ui/src/components/chat/ChatTextArea.tsx` | 模型卡片 UI（仅模型名 + 推理强度 + 下拉），点击打开配置弹层 |
| `webview-ui/src/components/usage/UsageView.tsx` | 新增：本地使用统计（汇总卡、热力图、7/30 日趋势、模型环形图） |
| `webview-ui/src/context/ExtensionStateContext.tsx` | 新增 `showUsage / navigateToUsage / hideUsage`；原账户按钮事件改为打开统计 |

## 5. 持久化与扩展侧

| 文件 | 变更 |
|---|---|
| `proto/cline/state.proto` | `UpdateSettingsRequest` 增加 `model_profiles = 52` |
| `src/shared/storage/state-keys.ts` | 全局状态键 `modelProfiles`（默认 `"[]"`） |
| `src/core/controller/state/updateSettings.ts` | 持久化 `modelProfiles` 到 globalState |
| `src/core/controller/state/getStateToPostToWebview.ts` | 向 Webview 下发 `modelProfiles` |
| `src/shared/ExtensionMessage.ts` | 状态类型增加 `modelProfiles` |
| `src/registry.ts` + `src/extension.ts` + `package.json` | 命令 `usageButtonClicked`（原 `accountButtonClicked`），`$(graph)` 图标，打开统计页 |

模型配置不再存 Webview localStorage；配置快照会剔除以 `SecretKey` 定义的字段（各类 API Key 留在 SecretStorage），切换配置时使用各提供商已保存的密钥。

## 6. 体验优化（第二批）

| 文件 | 变更 |
|---|---|
| `usage/UsageView.tsx` | 缓存 Token / 累计费用指标、工作区筛选、CSV 导出、折线图悬停提示、Token/费用指标切换、按模型费用、任务明细表 |
| `state/getStateToPostToWebview.ts` | 任务历史上限 100 → 500；过滤 Batch 结果条目 |
| `model-profiles/ModelProfileMenu.tsx` | 配置重命名、上移/下移、导出/导入（剪贴板 JSON）、当前配置高亮改为校验 provider + model；显示模式/推理强度/上下文/温度；**配置不再保存 API Key**（Key 留在 SecretStorage） |
| `model-profiles/storage.ts` | `stripSecrets()`：保存/解析配置时剔除所有 SecretKey 字段 |
| `settings/ApiOptions.tsx` | 提供商收藏（星标）与最近使用排序（本地存储）；名称本地化 |
| `usage/UsageView.tsx` | 新增缓存 Token / 累计费用指标、工作区筛选、CSV 导出（复制到剪贴板）、折线图数据点悬停提示、Token/费用指标切换、按模型费用汇总、任务明细表 |
| `auto-approve-menu/AutoApproveModal.tsx` | 浮层高度按可用空间自适应 |
| `.vscode/launch.json` | 新增 "Run Extension (Fast, prebuilt)"，跳过 preLaunchTask，直接用已构建产物启动 |
| `chat/ChatView.tsx` | 移除 BatchConversation 懒加载与 Batch 结果面板，Webview 不再打包 Batch 界面 |
| `chat/ChatTextArea.tsx` | 模型卡片 tooltip 显示 provider:model，避免同名模型歧义 |

## 7. 待办 / 已知限制

- 使用统计仍只覆盖扩展下发的最近 500 条任务；口径为 `tokensIn + tokensOut`（缓存与费用单独展示）。
- i18n 仍为硬编码 + 映射，独立 UI 语言包是下一阶段工作。
- Batch 后端（LoomLoom 服务/RPC）未裁撤；界面入口、结果入口与 Webview 打包已移除。
- Remote-SSH 下模型配置随扩展宿主走，但"当前选中"标记仍存在本地 localStorage。
- 升级上游时的重点冲突文件：`ChatTextArea.tsx`、`ChatView.tsx`、`ExtensionStateContext.tsx`、`App.tsx`、`ApiOptions.tsx`、`state.proto`、`updateSettings.ts`。
