# Agent RP Runtime — SillyTavern Extension

## 当前阶段：I4 — Runtime dry-run

本扩展当前处于 **Phase I4**，包含以下能力：

- [x] manifest.json — 扩展清单
- [x] index.js — 入口脚本（注册设置面板、加载/保存设置、绑定只读刷新和 dry-run 按钮）
- [x] settings.html — 设置面板（启用/dry-run/scenarioId/debug/只读调试/ dry-run 调试）
- [x] style.css — 基本样式
- [x] readonly-reader.js — 只读读取 SillyTavern 数据（聊天摘要、角色、Persona、世界书、bridge preview）
- [x] dry-run.js — Dry-run UI 钩子和结果显示格式化
- [x] README.md — 本文档

## 作为 SillyTavern 第三方扩展安装

### 方法 1：通过 GitHub URL 安装（推荐）

在 SillyTavern 的 **扩展管理** 页面（Extensions → Install Extension），粘贴以下 GitHub 仓库地址：

```
https://github.com/<your-username>/st-agent-rp-runtime-extension
```

点击安装后，启用 "Agent RP Runtime" 即可。

### 方法 2：手动复制

将扩展目录复制到 SillyTavern 的 `extensions/third-party/` 目录下：

```bash
cp -r agent-rp-runtime-extension /path/to/SillyTavern/public/scripts/extensions/third-party/agent-rp-runtime
```

## 当前不会做的

- ✅ **不拦截 CHAT_COMPLETION_PROMPT_READY** — 不接管生成流程
- ✅ **不监听 GENERATION_ENDED** — 不处理生成完成事件
- ✅ **不调用 Runtime Core** — 不启动 pipeline（当前阶段）
- ✅ **不调用模型 API** — 不发任何 API 请求
- ✅ **不写回聊天消息** — 不修改 `lastMsg.mes`
- ✅ **不收集 API key** — 不请求任何凭据

## 后续阶段

| 阶段 | 内容 |
|------|------|
| I4.5 | 当前阶段 — 发布 GitHub 扩展仓库安装 |
| I5 | 写回消息前的安全设计 |
| I6 | 真实状态持久化 |
| I7 | Windows ST 部署与 GUI 验证 |

## 风险和限制

| 风险 | 说明 |
|------|------|
| SillyTavern 版本兼容 | 使用 `ctx.renderExtensionTemplateAsync()` 和 `ctx.extensionSettings`，不同 ST 版本接口可能不同 |
| jQuery 依赖 | 使用 SillyTavern 内置的 jQuery，版本绑定 ST 版本 |
| `SillyTavern.getContext()` | 假设 ST 提供全局 `SillyTavern` 对象，若不存在则扩展不起作用 |
| 扩展 ID 冲突 | `agent-rp-runtime` 应唯一，不与已安装扩展冲突 |
