# 🦁 leoms (Lean Ecosystem Orchestrator & Multi-repo Suite)

> 专为 **多语言（Node.js / TypeScript + PHP）**、**多独立 Git 仓库（Multi-Repo Hub）** 混合工作区打造的新一代资产协同与质量门禁编排器。  
> *A next-generation workspace orchestrator and gatekeeper inspector for multi-language, multi-repo ecosystems.*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![PHP](https://img.shields.io/badge/PHP-8.1+-777bb4.svg)](https://www.php.net/)
[![pnpm](https://img.shields.io/badge/pnpm-9+-f69220.svg)](https://pnpm.io/)
[![Composer](https://img.shields.io/badge/Composer-2.2+-885630.svg)](https://getcomposer.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📖 目录 (Table of Contents)

- [✨ 为什么需要 leoms？（核心痛点）](#-为什么需要-leoms核心痛点)
- [🌟 核心特性与设计哲学](#-核心特性与设计哲学)
- [🚀 快速开始 (Quick Start)](#-快速开始-quick-start)
- [⚙️ 工作区配置 (leoms.yml)](#️-工作区配置-leomsyml)
- [📚 完整命令手册 (Command Reference)](#-完整命令手册-command-reference)
  - [1. 工作区初始化与环境诊断 (Diagnostics)](#1-工作区初始化与环境诊断-diagnostics)
  - [2. 资产透视与变更感知 (Insights)](#2-资产透视与变更感知-insights)
  - [3. 依赖包生命周期管理 (Dependencies)](#3-依赖包生命周期管理-dependencies)
  - [4. 构建与可插拔体检门禁 (Build & Gatekeeper)](#4-构建与可插拔体检门禁-build--gatekeeper)
  - [5. 发版与自动化部署 (Release & Deployment)](#5-发版与自动化部署-release--deployment)
  - [6. 可视化工作台与桌面 Studio (Visual Studio)](#6-可视化工作台与桌面-studio-visual-studio)
- [🛡️ 8 大体检门禁规则清单](#️-8-大体检门禁规则清单)
- [📁 推荐工作区目录架构](#-推荐工作区目录架构)
- [🌐 多语言支持 (i18n)](#-多语言支持-i18n)
- [🤝 贡献与二次开发 (Contributing)](#-贡献与二次开发-contributing)
- [📄 开源许可 (License)](#-开源许可-license)

---

## ✨ 为什么需要 leoms？（核心痛点）

在现代企业研发中，团队经常面对一种特殊的架构模式：**多语言混合（Node/TS 前端/微服务 + PHP 后台/核心业务），且每个子项目都是一个独立的 Git 仓库（Multi-Repo）**。

传统的解决方案往往存在严重痛点：
1. **传统 Monorepo 工具（Turborepo / Nx / Lerna）的局限**：
   - 绝大多数工具仅针对单一 Git 仓库（Single Mono-Repo），且几乎只原生支持 Node 生态，对 PHP / Composer 完全无法识别与联动。
2. **多独立仓库本地联调的“脏污染”外泄**：
   - 为了本地联调，开发者往往在项目级 `composer.json` 里手动添加 `"type": "path"`，或者在 `package.json` 里写 `file:` / `link:`。
   - **灾难后果**：这些本地绝对/相对路径一旦被 `git commit` 并推送到远端，会导致 CI/CD 构建直接崩溃，交付给客户时无法独立安装。
3. **环境与依赖管理的割裂**：
   - Node 依赖 `pnpm`，PHP 依赖 `composer`，每次拉取代码需要挨个进各个子目录执行安装；公共包版本号递增时，下游项目无法自动级联感知。

**`leoms` 正是为此而生**：它以**原生优先、极低侵入、资产纯推导、零本地污染外泄**为核心原则，为多语言、多 Git 仓库工作区提供统一的依赖协同、DAG 拓扑构建与质量门禁调度。

---

## 🌟 核心特性与设计哲学

- 🛡️ **100% 离仓独立性保障（零本地污染）**：
  - 严禁任何项目级 `composer.json` 写入本地 `path` 仓库，严禁 `package.json` 残留 `file:`/`link:` 协议。
  - 所有本地联动完全由工作区顶层（`pnpm-workspace.yaml` 与 `.leoms/composer/config.json`）动态承载。项目离开工作区推送到 GitHub 或交付客户时，**保证 100% 独立且纯净**。
- 🐘 **PHP Composer 工作区双层隔离机制**：
  - **第一层（工作区隔离）**：内置隔离的 `COMPOSER_HOME`，自动识别本地公共包软链，绝不污染宿主全局环境。
  - **第二层（终端透传兜底）**：提供 `leoms c` 透明代理，并支持一键持久化注入环境变量，原生敲 `composer` 同样享受本地联动。
- 📦 **智能依赖协议管理**：
  - Node 内部依赖默认规范化为 `@workspace:^`，发布时自动剥离为生产 SemVer。
  - PHP 内部依赖自动推导并写入规范语义化版本号，不修改项目 repositories 配置。
- 🔍 **可插拔微内核体检门禁 (Check Rules Engine)**：
  - 覆盖 **8 大质检维度**（软链满足度、清单卫生、产物就绪、Git 洁净度、上游状态、Lockfile 完整性、源码 AST 幽灵依赖、离仓独立性）。
  - 日常极速秒级体检；发版与部署自动触发 100% 阻断式全量强校验。
- ⚡ **DAG 拓扑构建与 Nx 风格差量波及分析**：
  - 跨 Node 与 PHP 双生态构建有向无环图，自动拓扑排序；`leoms affected` 差量推导受 Git 代码变动波及的下游项目。
- 🌐 **内建中英双语国际化 (i18n)**：
  - 基于现代命名空间字典契约与轻量引擎构建，默认输出纯正中文，支持 `--lang en` 自由切换。

---

## 🚀 快速开始 (Quick Start)

### 1. 全局安装

```bash
# 使用 pnpm 全局安装
pnpm add -g leoms

# 或使用 npm 全局安装
npm install -g leoms
```

### 2. 环境健康自检

```bash
leoms doctor
```
> 自动诊断当前系统的 Node.js、pnpm、PHP、Composer 以及 Git 工具链是否就绪，并检查工作区配置完整性。

### 3. 初始化工作区

在准备作为混合大工作区的根目录下执行：

```bash
# 交互式初始化
leoms init

# 快速采用默认配置，并生成配置文件
leoms init -y --config
```

### 4. 常用核心指令

```bash
# 查看全工作区跨仓库资产看板（Git状态、版本、依赖拓扑、风险）
leoms status

# 为工作区所有项目智能并行安装依赖（Node + PHP 双生态）
leoms install

# 日常极速健康门禁体检
leoms check

# 演练全量发版预检
leoms release @meocox/ui --dry-run
```

---

## ⚙️ 工作区配置 (leoms.yml)

`leoms` 遵从“约定优于配置”，在绝大部分情况下零配置即可运行。若需自定义特定流程，可在工作区根目录放置 `leoms.yml`：

```yaml
# leoms 工作区核心配置规范

# 默认界面与日志语言 (支持: zh, en)
locale: zh

# 部署指令约定
deploy:
  # 默认部署目标环境
  env: production
  # 自定义默认部署脚本路径 (可被项目专属 scripts/deploy.sh 覆盖)
  script: tools/deploy.sh

# 发版与 Git Tag 约定
release:
  # 执行发版并推送时同步推送的 Git Remote 列表
  remotes:
    - origin
```

---

## 📚 完整命令手册 (Command Reference)

`leoms` 命令划分为 5 大领域、共 16 项标准化核心命令（含现代化可视化交互工作台 `leoms ui`）：

> 💡 **项目定向执行准则**：所有支持针对具体项目的命令（`status`, `build`, `check`, `plan`, `release`, `publish`, `deploy`, `install`, `add`, `remove`）均全面支持三种触发方式：
> 1. **子目录免参直达**：`cd apps/foo && leoms check`（自动感知当前项目上下文）
> 2. **标准短参直达**：`leoms check -p apps/foo`（全局统一 `-p, --project <name>`）
> 3. **位置参数直达**：`leoms check apps/foo`

### 1. 工作区初始化与环境诊断 (Diagnostics)

#### `leoms init [directory]`
初始化或转换一个多语言、多独立 Git 仓库的协同工作区骨架。
- **选项**：
  - `-y, --yes`：跳过交互式提问，全部采用推荐默认值。
  - `--config`：在根目录生成默认 `leoms.yml` 配置文件。
  - `--set-composer-home`：持久化写入环境变量 `COMPOSER_HOME` 到用户 Shell 配置（如 `~/.bashrc`）。
  - `-f, --force`：强制覆盖已存在的工作区配置文件。
- **示例**：
  ```bash
  leoms init . -y --config
  ```

#### `leoms doctor`
深度体检本地开发环境。排查 Node、pnpm、PHP、Composer、Git 的版本健康度，以及工作区专有配置路径有效性。

---

### 2. 资产透视与变更感知 (Insights)

#### `leoms status [target]`
**跨仓库资产大盘看板**。支持**全局大盘**与**单项目详情卡片**双模式：
- **全局大盘**：在工作区根目录执行时，透视所有子项目的独立 Git 状态（当前分支、未提交文件数、领先提交数）、版本号、依赖与被依赖关系拓扑，以及未发版超前风险警告。
- **单项目卡片**：通过 `-p, --project <name>`、位置参数 `[target]` 或直接在子项目目录下执行时，聚焦呈现当前项目的绝对/相对路径、生态类别、Git 提交与 Tag 状态、上下游依赖引用关系及构建产物就绪度。
- **选项**：
  - `-p, --project <name>`：聚焦查看指定项目资产状态卡片。
  - `--all`：在子项目目录下时显式展示全局工作区大盘看板。
  - `--php`：仅筛选 PHP (Composer) 包与应用。
  - `--npm`：仅筛选 Node (npm) 包与应用。

#### `leoms list` (别名: `ls`)
扫描并分类展示工作区内检测到的所有项目与包。
- **选项**：
  - `--php`：仅列出 PHP 项目。
  - `--npm`：仅列出 Node 项目。

#### `leoms affected`
**Nx 风格的差量变更与影响面感知**。基于 Git diff 与依赖拓扑 DAG，自动推导直接发生改动的项目，以及间感受波及的下游项目。
- **选项**：
  - `-b, --base <ref>`：Git 对比基准分支或 commit（默认: `main`）。
  - `-p, --plain`：仅输出受影响的项目名称列表（适用于 CI/CD 自动化流水线脚本）。
  - `-t, --type <all|direct|downstream>`：过滤影响类型（默认: `all`）。
  - `--php` / `--npm`：生态过滤。
- **示例**：
  ```bash
  # CI 流水线中仅针对受改动影响的项目触发构建
  leoms affected -b origin/main --plain
  ```

#### `leoms ui`
**启动现代化可视化交互工作台 (Visual Workbench)**。采用 Apple macOS / visionOS 风格的拟真磨砂玻璃美学设计，内置深色/浅色/跟随系统三态切换，提供资产大盘、DAG 交互图谱、门禁体检中心、任务流控制台及 Composer 隔离透视。
- **选项**：
  - `-p, --port <number>`：指定服务监听端口（默认: `3200`，端口占用时自动递增）。
  - `-H, --host <host>`：指定服务监听主机（默认: `localhost`）。
  - `--no-open`：启动服务后不自动调起系统浏览器。
- **示例**：
  ```bash
  # 启动工作台并自动在浏览器中弹出控制大盘
  leoms ui
  ```

---

### 3. 依赖包生命周期管理 (Dependencies)

#### `leoms install [target]` (别名: `i`)
智能安装依赖。在子项目目录下执行时仅安装当前项目依赖；在根目录下执行时并行安装全工作区所有项目依赖。
- **选项**：
  - `-p, --project <name>`：显式指定目标项目名称或相对路径。
  - `--php`：仅执行 PHP (Composer) 依赖安装。
  - `--npm`：仅执行 Node (pnpm) 依赖安装。

#### `leoms add <packages...>`
向项目添加外部或内部依赖。在根目录下执行时提供**交互式目录分级下钻选择**；添加内部公共包时，Node 自动补全 `@workspace:^`，PHP 自动写入精确规范 SemVer。
- **选项**：
  - `-p, --project <name>`：目标项目。
  - `-D, --dev`：作为开发依赖（`devDependencies` / `require-dev`）安装。
  - `--php` / `--npm`：指定生态。

#### `leoms remove <packages...>` (别名: `rm`)
从项目中批量卸载指定依赖并自动同步清理清单文件。
- **选项**：
  - `-p, --project <name>`：目标项目。
  - `--php` / `--npm`：指定生态。

#### `leoms composer [args...]` (别名: `c`)
**透明 Composer 代理包装器**。完全原样透传所有 Composer 原生参数与标志（`-vvv`、`update`、`require` 等），底层自动注入工作区专属的隔离 `COMPOSER_HOME`。
- **示例**：
  ```bash
  leoms c dump-autoload -o
  ```

---

### 4. 构建与可插拔体检门禁 (Build & Gatekeeper)

#### `leoms build [targets...]`
多语言拓扑构建器。防止无脑全量滥建（必须显式指定目标，或传 `--all` / `--affected`）。构建内部包时，默认自动先按 DAG 构建其上游依赖包。PHP 项目自动执行 `composer dump-autoload -o` 生成高效类名哈希映射。支持子项目目录下免参智能构建。
- **选项**：
  - `-p, --project <name>`：指定构建目标项目名称或相对路径。
  - `--all`：显式全量构建工作区内的所有项目。
  - `--affected`：仅构建受 Git 代码变动波及的项目。
  - `-b, --base <ref>`：差量基准（默认: `main`）。
  - `--no-deps`：跳过上游内部依赖的构建，仅编译目标自身。
  - `--php` / `--npm`：生态过滤。

#### `leoms check [target]`
**微内核可插拔健康与质量门禁体检（Gatekeeper Check）**。支持在工作区根目录指定目标或子项目目录下免参执行。
- **运行模式**：
  - **默认模式**：秒级并发执行全部日常基础检查项（`linkage`, `manifest`, `dist`, `git`, `upstream`, `lockfile`）。
  - `-p, --project <name>`：指定待体检的目标项目名称或相对路径。
  - `-a, --all`：**全量深度体检**（包含源码 AST 幽灵依赖扫描与离仓独立自洽性校验）。
  - `-i, --only <rules...>`：**精准指定单项或多项规则**（如 `--only standalone` 或 `-i git,dist`）。
  - `--skip <rules...>`：跳过指定检查规则。
  - `--list-rules`：列出所有已注册规则清单及其说明。
  - `--plan`：计算并预览按拓扑依赖排序的发版预检计划。
  - `--php` / `--npm`：生态过滤。
- **示例**：
  ```bash
  # 日常快速体检（子目录下自动检查当前项目）
  leoms check

  # 根目录下定向检查某个应用
  leoms check -p apps/leoms

  # 深度全量排查（含 AST 源码幽灵依赖）
  leoms check --all

  # 专门检查离仓独立性
  leoms check --only standalone
  ```

#### `leoms plan [target]`
**DAG 发布拓扑排序执行计划器**。计算目标项目（或当前子项目）在工作区内的上下游依赖拓扑有向无环图，按层次输出自底向上的发版批次顺序。
- **选项**：
  - `-p, --project <name>`：指定规划的目标项目名称或相对路径。

---

### 5. 发版与自动化部署 (Release & Deployment)

> ⚠️ **核心准则**：`release`（发版打 Tag）与 `deploy`（上线部署）是生命周期最重要的关口。它们在执行任何操作前，**均强制自动触发 100% 全量门禁体检（Full Checks，涵盖健康、源码幽灵依赖与离仓自洽）**，体检全绿才放行，杜绝把缺陷带上线。

#### `leoms release [target]` (别名: `rel`)
多仓库一站式发版流水线：**全量门禁预检 -> 版本递增 -> 级联回写下游项目 -> 提交 Git Commit -> 创建 Git Tag -> 推送到多远端**。
- **选项**：
  - `-p, --project <name>`：目标发版项目名称或相对路径。
  - `--patch` / `--minor` / `--major`：升级版本（如 0.1.0 -> 0.1.1 / 0.2.0 / 1.0.0）。
  - `--to <version>`：显式指定目标发版版本号。
  - `--publish`：发版打 Tag 成功后，自动触发制品投递（注：原 `-p` 已统一分配给 `--project`）。
  - `--no-push`：仅在本地完成提交与打 Tag，不推送到远程 Git 仓库。
  - `--no-tag`：仅递增版本并提交代码，不打 Git Tag。
  - `--no-cascade`：不向工作区内依赖此包的下游项目级联回写更新版本。
  - `-s, --script <path>`：打 Tag 后执行的自定义后续脚本。
  - `-d, --dry-run`：发版预演演练，不修改文件或 Git。
  - `-f, --force`：忽略未提交变更警告强行发版。
  - `-m, --message <msg>`：自定义提交信息。

#### `leoms publish [target]` (别名: `pub`)
纯粹外部制品投递。Node 包通过 `pnpm publish` 自动剥离工作区协议发布到 npm 仓库；PHP 包触发 Packagist 同步。
- **选项**：
  - `-p, --project <name>`：目标发布项目名称或相对路径。
  - `-d, --dry-run`：模拟发布过程，不实际上传。
  - `--tag <tag>`：npm dist-tag 标签（默认: `latest`）。
  - `--access <public|restricted>`：包访问级别。
  - `--no-build`：跳过发布前的构建步骤。
  - `-f, --force`：强制发布。

#### `leoms deploy [target]`
业务应用一键安全部署：**离仓自洽与健康全量体检 -> 构建产物 -> 调用部署脚本**。
- **选项**：
  - `-p, --project <name>`：目标部署应用名称或相对路径。
  - `-e, --env <name>`：目标环境（默认: `production`）。
  - `--skip-check`：跳过部署前置门禁体检（危险）。
  - `--skip-build`：跳过部署前构建步骤。
  - `-s, --script <path>`：显式指定部署脚本路径（覆盖 `leoms.yml`）。
  - `-d, --dry-run`：模拟部署流程，不实际执行脚本。

### 6. 可视化工作台与桌面 Studio (Visual Studio)

#### `leoms ui [subcommand]`
启动基于 Web / Tauri 的图形化控制台，直观查看资产大盘、DAG 依赖拓扑图谱及交互式任务执行：
```bash
# 1. 启动前台服务并在默认浏览器打开（若后台已有服务，自动唤起浏览器并立即释放终端）
leoms ui

# 2. 后台静默守护进程启动（推荐日常免打扰使用，秒级释放命令行）
leoms ui -d

# 3. 查看后台服务运行状态与 PID
leoms ui status

# 4. 优雅终止后台守护进程
leoms ui stop
```
- **选项**：
  - `-d, --daemon`：在后台以守护进程模式运行（适合日常开发与桌面端）。
  - `--status`：查看后台服务运行健康度与 PID。
  - `--stop`：停止正在后台运行的 leoms workbench 服务。
  - `-p, --port <number>`：指定服务端口（默认: `3200`）。
  - `-H, --host <host>`：指定绑定主机（默认: `localhost`）。
  - `--no-open`：启动后不自动在浏览器中打开页面。

---

## 🛡️ 8 大体检门禁规则清单

| 规则 ID (`--only`) | 类别 | 规则名称 | 默认日常执行 | 校验内容与判定准则 |
| :--- | :--- | :--- | :--- | :--- |
| **`linkage`** | health | 依赖规范联动检查 | ✅ 是 (极速) | 检查内部公共依赖是否正确创建符号链接（`node_modules` / `vendor`），以及版本范围是否满足要求。 |
| **`manifest`** | hygiene | 清单文件规范性检查 | ✅ 是 (极速) | 验证清单文件合法性，严禁项目自身声明破坏独立性的本地 `path` 仓库或 `file:` 协议。 |
| **`dist`** | health | 构建产物就绪度检查 | ✅ 是 (极速) | 检查声明了构建任务的项目，其 `dist/` 或 `build/` 输出目录是否已编译就绪。 |
| **`git`** | git | Git 仓库洁净度检查 | ✅ 是 (极速) | 检查子仓库是否存在未提交的修改（dirty worktree）或未推送的提交，提前暴露代码遗漏。 |
| **`upstream`** | health | 上游依赖发版状态检查 | ✅ 是 (极速) | 检查被依赖的内部公共包是否有未发版的超前提交或未打 Tag 的改动，防止下游引用未发布代码。 |
| **`lockfile`** | hygiene | 依赖锁定文件检查 | ✅ 是 (极速) | 检查 `pnpm-lock.yaml` 或 `composer.lock` 的存在性与完整性。 |
| **`phantom`** | hygiene | 幽灵依赖深度静态扫描 | ⚠️ `--all` 包含 | **深度 AST 源码静态扫描**：遍历所有 JS/TS (`import`/`require`) 与 PHP (`use`) 源码，检测是否使用了未在清单声明的隐式幽灵依赖。 |
| **`standalone`** | standalone | 离仓独立自洽性检查 | ⚠️ 交付与发版强制 | **终审门禁**：确保项目离开当前工作区独立交付/部署时绝对自洽：无 `workspace:` 残留、无绝对路径硬编码、验证独立安装完整性。 |

---

## 📁 推荐工作区目录架构

`leoms` 采用约定式分类发现机制，推荐采用如下标准工程骨架：

```text
my-workspace/
├── apps/                 # 独立业务应用服务（Node / PHP Web 应用）
│   ├── web-portal/       # 前端应用 (独立 Git 仓库)
│   └── order-api/        # PHP 接口应用 (独立 Git 仓库)
├── packages/             # 跨项目公共 npm 包 (TypeScript / React / 工具库)
│   ├── ui-components/    # 公共 UI 组件库 (独立 Git 仓库)
│   └── utils/            # 核心通用工具库 (独立 Git 仓库)
├── libs/                 # 内部 PHP 公共类库 / Composer 包
│   └── sdk-core/         # 核心 SDK (独立 Git 仓库)
├── tools/                # 工作区辅助运维与自动化脚本（如 deploy.sh）
├── .leoms/               # leoms 工作区级运行时环境与 Composer 隔离仓
│   └── composer/
│       └── config.json   # 自动生成的顶级 path 映射，不侵入子项目
├── pnpm-workspace.yaml   # 工作区 Node 拓扑定义
└── leoms.yml             # leoms 全局配置（可选）
```

---

## 🌐 多语言支持 (i18n)

`leoms` 默认采用纯正中文呈现所有命令帮助、诊断表格与修复建议。

如果需要在英文环境下运行（例如海外团队、国际化 CI/CD 流水线）：

```bash
# 方式 1：通过全局命令行参数显式指定
leoms --lang en check
leoms --lang en -h

# 方式 2：在 leoms.yml 中持久化设置
locale: en
```

---

## 🤝 贡献与二次开发 (Contributing)

无论是修复 Bug、完善功能还是新增体检规则，我们都热烈欢迎社区贡献！

- 🛠️ **二次开发与贡献指南**：请查阅我们的 [CONTRIBUTING.md](CONTRIBUTING.md)，获取完整的本地环境搭建、源码目录导览、新增检查规则教程与 PR 规范。
- 🐛 **提交反馈**：欢迎通过 GitHub Issues 提交问题反馈或功能建议。

---

## 📄 开源许可 (License)

本项目基于 [MIT License](LICENSE) 协议开源。
