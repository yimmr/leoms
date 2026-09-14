# 🦁 leoms 贡献与二次开发指南 (Contributing & Development Guide)

感谢你对 `leoms` 的关注！无论是修复 Bug、新增检查规则、改进桌面端交互，还是完善文档，我们都热烈欢迎你的贡献。

本文档将帮助你快速搭建本地开发环境，理解核心架构，并完成代码的调试与提交。

---

## 🛠️ 一、 开发环境准备 (Prerequisites)

在开始前，请确保你的本地开发机具备以下基础环境：

- **Node.js**：`>= 20.0.0`（推荐使用 nvm 或 fnm 管理版本）
- **pnpm**：`>= 9.0.0`（核心包管理器）
- **PHP & Composer**（可选，若需本地测试 PHP 联动能力）：PHP `>= 8.1`，Composer `>= 2.2`
- **Rust & Cargo**（可选，若需调试或打包桌面端）：Rust `>= 1.77.2`

---

## 🚀 二、 本地源码运行与调试 (Quick Start)

### 1. 克隆与安装依赖

```bash
git clone https://github.com/yimmr/leoms.git
cd leoms
pnpm install
```

### 2. 全量开发调试脚本一览 (`package.json`)

`leoms` 采用单包内聚架构，所有开发、编译、测试与打包指令统一声明在根级 `package.json` 中：

| 分类 | 脚本命令 | 底层执行动作 | 适用场景与详细说明 |
| :--- | :--- | :--- | :--- |
| **🚀 运行与调试** | `pnpm dev [args...]` | `tsx src/index.ts` | **CLI 零编译实时调试**：直接读取 TS 源码执行，支持任意透传参数（如 `pnpm dev status`、`pnpm dev check -a`）。 |
| | `pnpm dev:ui` | `vite` | **前端独立 HMR 调试**：单独启动 Vite 开发服务器（`http://localhost:5173`），支持热重载，用于界面开发。 |
| | `pnpm dev:desktop` | `tauri dev` | **桌面端原生窗口调试**：自动拉起 Vite 前端并启动 Tauri 原生窗口，适合测试桌面端原生桥接能力。 |
| | `pnpm start [args...]` | `node ./bin/leoms.js` | **生产产物本地模拟**：以类似真实全局安装的方式执行 `dist/` 编译产物，测试发布前的运行表现。 |
| **📦 编译与打包** | `pnpm build:cli` | `tsup` | **单编 CLI / 服务端**：使用 tsup 极速编译 TypeScript 至 `dist/index.js`（耗时仅数十毫秒）。 |
| | `pnpm build:ui` | `tsc -p tsconfig.ui.json && vite build` | **单编前端静态产物**：先执行前端专属类型检查，再使用 Vite 打包 SPA 静态文件至 `dist/ui`。 |
| | `pnpm build` | `pnpm build:cli && pnpm build:ui` | **全量联合构建**：发布前或验证完整产物时执行，同时打包 CLI 与前端 UI。 |
| | `pnpm build:desktop` | `tauri build` | **打包桌面端分发安装包**：调用 Rust 编译器将前端与原生壳打包为 Windows 安装包（`.msi` / `.exe`）。 |
| **🛡️ 质检与工具** | `pnpm typecheck` | `tsc --noEmit && tsc -p tsconfig.ui.json` | **双层 TS 类型安全自检**：分别使用两种不同的 tsconfig 严格校验 CLI（NodeNext）与前端（DOM），防止类型混淆。 |
| | `pnpm tauri <args>` | `tauri` | **Tauri CLI 原生透传**：直接调用 Tauri 工具链（如 `pnpm tauri info` 检查环境、`pnpm tauri icon` 生成各尺寸图标）。 |

---

---

### 3. 按「目标端与宿主环境」分类速查 (推荐开发必读)

在 **WSL 存储源码 + Windows 桌面端混合开发** 模式下，明确指令应当在哪个系统终端运行至关重要：

```
                    ┌────────────────────────────────────────────────────────┐
                    │ 🐧 WSL / Linux 终端运行（底层逻辑、算法、Web UI 与编译）│
                    │ • CLI 调试：pnpm dev [args...]                         │
                    │ • Web 调试：pnpm dev:ui                                │
                    │ • 产物构建：pnpm build:cli / build:ui / build           │
                    │ • 质量检查：pnpm typecheck / start                     │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ 🪟 Windows 宿主终端运行（原生窗口交互、打包 Windows 安装包）│
                    │ • 桌面调试：pnpm dev:desktop                           │
                    │ • 桌面打包：pnpm build:desktop                         │
                    │ • 环境检查：pnpm tauri info                            │
                    └────────────────────────────────────────────────────────┘
```

#### ① 纯 CLI 终端开发 ── 🖥️ 【推荐在 WSL / Linux 下运行】
> 依赖 Linux 原生的文件系统与 Git 仓库，直接在 WSL 终端里调试 CLI，体验最快、无跨系统延迟。

| 脚本命令 | 核心用途 | 详细说明 |
| :--- | :--- | :--- |
| `pnpm dev [args...]` | **实时调试 CLI** | 基于 `tsx` 零编译实时执行 TS 源码，支持任意参数（如 `pnpm dev status`、`pnpm dev check -i git`）。 |
| `pnpm build:cli` | **单编 CLI 引擎** | 仅编译 CLI 与后端托管接口至 `dist/index.js`（耗时数十毫秒）。 |
| `pnpm start [args...]` | **生产模式模拟** | 以真实生产产物（`node ./bin/leoms.js`）运行 CLI，模拟用户安装后的行为。 |

#### ② 纯 Web UI 控制台开发 ── 🌐 【推荐在 WSL 运行，Windows 浏览器预览】
> 在 WSL 终端启动 Vite，利用 WSL2 自动端口转发，在 Windows 浏览器中享受极速 HMR 热更新。

| 脚本命令 | 核心用途 | 详细说明 |
| :--- | :--- | :--- |
| `pnpm dev:ui` | **前端 HMR 开发服务器** | 启动 Vite 开发服务（默认端口 5173），直接在 Windows 浏览器访问 `http://localhost:5173`。 |
| `pnpm build:ui` | **单编前端静态资源** | 先执行前端专属类型检查，再使用 Vite 将 React 19 SPA 编译打包至 `dist/ui`。 |

#### ③ 桌面端 Studio (Tauri v2) ── 🪟 【建议仅在 Windows 宿主终端运行】
> **⚠️ 为什么桌面端建议切到 Windows 终端运行？**  
> 虽然 WSL 也能安装 Linux GUI 依赖，但项目的最终交付形态是 **Windows 桌面原生应用**（类似 Docker Desktop，生成 `.msi` / `.exe`，调用 Windows 原生 Win32 与 WebView2 渲染）。  
> 从 Windows 终端（PowerShell 或 CMD）通过 `<path-to-workspace>` 打开目录并执行以下命令，能直接调用 Windows 侧的 Rust 编译原生窗口，体验最真实：

| 脚本命令 | 核心用途 | 详细说明 |
| :--- | :--- | :--- |
| `pnpm dev:desktop` | **启动 Windows 原生窗口调试** | 自动拉起 Vite 前端并呼出 Windows 原生 GUI 窗口，测试原生窗口拖拽与系统桥接。 |
| `pnpm build:desktop` | **打包 Windows 生产安装包** | 调用 Windows 侧 Rust 编译器打包生成 `.msi` 或 `.exe` 安装程序。 |
| `pnpm tauri <args>` | **Tauri 原生工具链调用** | 执行如 `pnpm tauri info` 检查 Windows 侧 Rust/WebView2 环境是否完整。 |

#### ④ 全量质量检查与集成构建 ── 🛡️ 【WSL / Windows 均可，推荐 WSL】

| 脚本命令 | 核心用途 | 详细说明 |
| :--- | :--- | :--- |
| `pnpm typecheck` | **双层 TS 类型自检** | 分别校验 CLI（NodeNext）与 UI（DOM），确保代码提交前 0 类型报错。 |
| `pnpm build` | **CLI + Web UI 联合构建** | 依序执行 `build:cli` 与 `build:ui`，生成可脱机运行的完整 Web/CLI 制品。 |

---

## 📂 三、 源码目录全景 (Codebase Tour)

```text
leoms/
├── package.json              # 统一项目清单与依赖
├── vite.config.ts            # 前端 Vite 构建配置（root: "src/ui", outDir: "dist/ui"）
├── tsconfig.json             # CLI/后端 TypeScript 配置（排除 src/ui）
├── tsconfig.ui.json          # 前端 TypeScript 配置（负责 React 19 DOM 类型）
├── bin/
│   └── leoms.js              # 终端可执行文件（根据源码 mtime 智能分流 tsx 或 dist/index.js）
│
├── src/
│   ├── index.ts              # CLI 路由入口（基于 Commander，包含国际化语言配置）
│   │
│   ├── commands/             # 业务子命令胶水层
│   │   ├── doctor.ts         # 环境健康诊断
│   │   ├── status.ts         # 跨仓库资产大盘
│   │   ├── check.ts          # 规则引擎体检门禁
│   │   ├── build.ts          # 多语言拓扑依赖构建
│   │   ├── release.ts        # 多仓库发版与级联回写
│   │   ├── ui.ts             # 守护进程管理（daemon / stop / status）
│   │   └── ...
│   │
│   ├── core/                 # 核心推导与领域引擎
│   │   ├── scanner.ts        # 资产纯推导扫描器（扫描多 Git 仓库与清单）
│   │   ├── topology.ts       # 有向无环图（DAG）构建与拓扑排序
│   │   ├── git.ts            # 跨独立 Git 仓库状态感知与命令编排
│   │   └── checks/           # 【微内核规则引擎】
│   │       ├── types.ts      # CheckRule 接口定义
│   │       ├── runner.ts     # 规则调度主函数 executeChecks()
│   │       ├── registry.ts   # 规则集中注册表
│   │       └── rules/        # 8 大原子规则实现文件
│   │
│   ├── server/               # 本地 HTTP + SSE 轻量服务托管层
│   │   ├── index.ts          # Fastify / 原生 HTTP 服务
│   │   └── api.ts            # 工作区 RESTful 接口封装
│   │
│   └── ui/                   # 前端 React 19 SPA 源码
│       ├── main.tsx          # 前端入口
│       ├── App.tsx           # 主布局
│       └── components/       # TaskTerminal 终端弹窗、DAG 拓扑图、状态大盘
│
└── src-tauri/                # Tauri v2 (Rust) 原生桌面端外壳
    ├── Cargo.toml            # Rust 依赖配置
    ├── tauri.conf.json       # Tauri 窗口与构建路径声明
    └── src/
        ├── main.rs           # 桌面端主入口
        └── lib.rs            # Rust 跨平台静默拉起与健康检查自启逻辑
```

---

## 🧩 四、 实战：如何新增一项自定义检查规则？

`leoms check` 采用微内核插件化设计，扩展一项新规则仅需两步：

### 第一步：在 `src/core/checks/rules/` 下创建规则文件

```typescript
// src/core/checks/rules/example.ts
import type { CheckRule, CheckContext, CheckResult } from "../types.js";

export const exampleRule: CheckRule = {
  id: "example",
  name: "自定义示例规则",
  category: "hygiene",       // 可选: health | hygiene | git | standalone
  defaultEnabled: true,      // 是否在 leoms check 默认执行（耗时项建议设为 false）
  description: "检查项目是否符合自定义规范要求",

  async run(context: CheckContext): Promise<CheckResult> {
    const issues = [];

    // context.projects 包含扫描出的所有项目画像
    for (const project of context.projects) {
      if (project.name === "illegal-name") {
        issues.push({
          level: "error",
          message: `项目名称 ${project.name} 不合规`,
          projectName: project.name,
          fixSuggestion: "请修改 package.json 中的 name 字段",
        });
      }
    }

    return {
      ruleId: "example",
      passed: issues.length === 0,
      issues,
    };
  },
};
```

### 第二步：在 `src/core/checks/registry.ts` 注册

```typescript
import { exampleRule } from "./rules/example.js";

// 追加到 ALL_RULES 数组中即可：
export const ALL_RULES: CheckRule[] = [
  // ... 其他已有规则
  exampleRule,
];
```

注册完成后，新规则将**自动生效**：
- CLI 支持：`leoms check -i example` 或 `leoms check --list-rules`
- 可视化支持：桌面端/Web 控制台的规则列表与体检中心将自动展示该规则。

---

## 💻 五、 跨平台桌面端开发须知 (Tauri v2)

如果你要修改桌面端（`src-tauri/`）：

1. **Docker Desktop 协同模式**：
   - Windows 桌面端启动时，通过 Rust 内部的 `CREATE_NO_WINDOW = 0x08000000` 标记静默拉起 WSL 中的 `leoms ui --daemon`；
   - 相关调度逻辑位于 `src-tauri/src/lib.rs` 中。
2. **在 Windows 侧构建与调试**：
   - 源码留在 WSL（如 `\\wsl.localhost\Ubuntu\...`）；
   - 从 Windows 终端进入 `apps/leoms` 执行 `pnpm run dev:desktop` 或 `pnpm run build:desktop` 即可打包生成 Windows 安装包（`.msi` / `.exe`）。

---

## 🤝 六、 Pull Request 提交规范

1. **分支策略**：
   - 请基于 `main` 分支切出 feature 或 fix 分支（如 `feature/custom-rule` 或 `fix/daemon-pid`）。
2. **提交自检清单**：
   - [ ] 运行 `pnpm typecheck`，确保 TypeScript 检查 0 错误；
   - [ ] 运行 `pnpm build`，确保 CLI 与 UI 均能正常打包构建；
   - [ ] 如涉及 Rust 代码，在 `src-tauri` 下执行 `cargo check` 确保无报错；
   - [ ] 提交信息遵循 Angular / Conventional Commits 规范（如 `feat: add new check rule`）。
