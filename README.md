# Shannon

基于 [Pi](https://github.com/earendil-works/pi) 构建的桌面端 GUI（Electron + React + TypeScript），对标最新 Claude Desktop 体验，同时支持自由接入任意模型 API 与本地模型。

## 核心特性

- **项目与会话管理**：按本地项目目录分组管理会话、支持 `Code` / `Archive` 双视图归档与恢复、全文检索（`⌘K`）、会话分支树浏览与非破坏性 Fork；会话与 `~/.pi/agent/` 完全互通，CLI 与桌面端无缝续聊。
- **精细化上下文占用明细**：按 `System Prompt`、`Project Instructions`（`AGENTS.md` / `CLAUDE.md`）、`Skills`、`Built-in / MCP / Extension Tools`、对话消息、Tool Results 与 `!bash` 输出分项剖析，显示 Top 5 占用项与一键 Compact。
- **对话框原生 `!bash` / `!!bash`**：输入 `!cmd` 实时流式展示终端输出并将结果注入下一轮对话上下文；输入 `!!cmd` 仅本地执行（0 tokens 占用）。
- **自由 API 与模型中心**：可视化管理 `~/.pi/agent/models.json` 与 `auth.json`，内置 Anthropic、OpenAI、Gemini、OpenRouter、DeepSeek、Ollama、LM Studio 及任意 OpenAI/Anthropic 兼容中转站模板，支持拉取 `/models` 与连通性测试。
- **完整 `/` 斜杠命令**：支持 `/new`、`/resume`、`/name`、`/context`、`/compact`、`/tree`、`/fork`、`/copy`、`/export`、`/model`、`/thinking`、`/settings`、`/resources`、`/reload`、`/archive` 以及 Pi 扩展/Prompt 模板/Skills 命令。

## 目录结构

```text
Shannon/
├── pi/               # Git submodule，指向 earendil-works/pi（只读上游，可随时切换为个人 fork）
├── desktop/          # Electron + React + TypeScript 桌面端应用
└── scripts/
    └── setup-pi.mjs  # 一键同步/打包 pi 并联调安装 desktop
```

## 快速开始

### 1. 首次拉取与构建

```bash
git clone --recursive <your-repo-url>
cd Shannon
npm run setup
```

> 要求 Node.js `>= 22.19.0`。

### 2. 日常开发与启动（在仓库根目录即可运行）

```bash
npm run dev        # 开发模式（热重载）
npm start          # 启动已构建的 Shannon 桌面端
npm run build      # 构建生产产物
npm run typecheck  # TypeScript 类型检查
npm test           # 运行 Vitest 单元测试
```

## 同步上游 Pi 或修改底层源码

- **同步上游 `pi` 最新更新**（不改 `pi/` 代码时）：
  ```bash
  npm run sync:pi
  ```
- **以后如果要修改 `pi/` 核心源码**：
  1. 在 GitHub 上 fork `earendil-works/pi` 为你自己的仓库。
  2. 将 submodule 指向你的 fork，并保留上游 `upstream` 方便合并：
     ```bash
     git submodule set-url pi https://github.com/<your-username>/pi.git
     git -C pi remote add upstream https://github.com/earendil-works/pi.git
     ```
  3. 修改 `pi/` 代码后，一键重新打包并更新 `desktop/` 依赖：
     ```bash
     npm run pack:pi
     ```

## 致谢

本项目底层 Agent 运行时、会话树存储与多模型适配完全基于 [Pi (`earendil-works/pi`)](https://github.com/earendil-works/pi)（MIT License）。
