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
| | `pnpm dev:ui` | `vite` | **前端独立 HMR 调试**：单独启动 Vite 开发服务器（`http://localhost:5173`），支持热重载，用于纯 Web 界面开发。 |
| | `pnpm dev:desktop` | `leoms desk dev` | **桌面端原生窗口调试**：在 WSL 中直接执行，自动调度 Windows 宿主 Rust 并拉起原生轻量窗口，支持热更新与伴生服务守护。 |
| | `pnpm start [args...]` | `node ./bin/leoms.js` | **生产产物本地模拟**：以类似真实全局安装的方式执行 `dist/` 编译产物，测试发布前的运行表现。 |
| **📦 编译与打包** | `pnpm build:cli` | `tsup` | **单编 CLI / 服务端**：使用 tsup 极速编译 TypeScript 至 `dist/index.js`（耗时仅数十毫秒）。 |
| | `pnpm build:ui` | `tsc -p tsconfig.ui.json && vite build` | **单编前端静态产物**：先执行前端专属类型检查，再使用 Vite 打包 SPA 静态文件至 `dist/ui`。 |
| | `pnpm build` | `pnpm build:cli && pnpm build:ui` | **全量联合构建**：发布前或验证完整产物时执行，同时打包 CLI 与前端 UI。 |
| | `pnpm build:desktop` | `leoms desk build` | **打包 Windows 桌面分发包**：WSL 构建前端 + 调度 Windows 侧 Rust 打包，产物自动归集至 `dist/desktop/`。 |
| **🛡️ 质检与工具** | `pnpm typecheck` | `tsc --noEmit && tsc -p tsconfig.ui.json` | **双层 TS 类型安全自检**：分别使用两种不同的 tsconfig 严格校验 CLI（NodeNext）与前端（DOM），防止类型混淆。 |
| | `pnpm desk:doctor` | `leoms desk doctor` | **跨平台桌面工具链体检**：诊断 Node、pnpm、WSL 桥接、Windows PowerShell、Rust 及端口就绪状态。 |
| | `pnpm tauri <args>` | `tauri` | **Tauri CLI 原生透传**：直接调用 Tauri 工具链（如 `pnpm tauri info` 检查环境、`pnpm tauri icon` 生成图标）。 |

---

### 3. WSL + Windows 原生桌面跨平台协同架构 (推荐工作流)

在 **WSL 存储源码 + Windows 桌面端原生窗口** 混合模式下，传统方案需要在两个系统终端来回切换，且极易导致 Linux ELF 与 Windows PE 的 `node_modules` 发生踩踏损坏。

`leoms` 独创了 **以 WSL 为中心的无缝桥接架构**，开发者 **无需在 Windows 终端中做任何切换**：

```
                    ┌────────────────────────────────────────────────────────┐
                    │ 🐧 开发者在 WSL / Linux 终端工作（单一终端，无需切换） │
                    │                                                        │
                    │ • 执行 pnpm dev:desktop (或 leoms desk dev)             │
                    │   ├── ① 启动 WSL 本地 Vite 前端 HMR (端口 5173)        │
                    │   ├── ② 启动 WSL 本地伴生服务 (若 package.json 有声明) │
                    │   └── ③ 跨进程调度 Windows 宿主 powershell.exe:        │
                    │         └─ cargo tauri dev (Windows Rust 编译原生窗口) │
                    └──────────────────────────┬─────────────────────────────┘
                                               │ (Windows 原生窗口即刻弹出)
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ 🪟 Windows 宿主（仅提供原生窗口渲染与 Rust 编译）      │
                    │ • 原生 Win32 + WebView2 渲染容器                       │
                    │ • Rust 编译缓存自动重定向到 Windows SSD 本地缓存目录   │
                    │ • 零 Windows node_modules 污染，完全杜绝符号链接损坏   │
                    └────────────────────────────────────────────────────────┘
```

#### ① 日常调试：
在 WSL 终端中直接运行：
```bash
pnpm dev:desktop
# 或
leoms desk dev
```
会自动检测开发环境、确认前端与伴生服务端口就绪，并在 Windows 桌面呼出原生窗口。按下 `Ctrl+C` 时，WSL 编排器会通过进程树守护一并优雅释放 Windows 侧的 Rust 进程。

#### ② 生产打包：
在 WSL 终端中直接运行：
```bash
pnpm build:desktop
# 或
leoms desk build
```
自动在 WSL 内打包前端产物，再由 Windows 宿主编译出原生 `.exe` / `.msi` 安装包，最后统一将构建产物、体积与 SHA256 校验码归集至 `dist/desktop/`。

#### ③ 环境自检：
在遇到环境疑问时执行：
```bash
pnpm desk:doctor
# 或
leoms desk doctor
```
一键自检 WSL 与宿主双端工具链。

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
