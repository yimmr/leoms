#!/usr/bin/env bash
# =============================================================================
# build-desktop.sh — 一键构建 Windows Tauri 原生桌面安装包 (.exe / .msi)
#
# 使用方式：
#   pnpm build:win        (通过 package.json script)
#   bash scripts/build-desktop.sh
#
# 原理：
#   1. 在 WSL 内部编译前端静态文件 (pnpm build:ui -> dist/ui)
#   2. 通过 powershell.exe 在 Windows 侧启动 cargo tauri build
#   3. 使用 tauri.build.conf.json 消除 Windows 侧执行 Node 命令的依赖
#   4. 将 Rust 缓存重定向至 Windows 本地盘，实现高速打包构建
# =============================================================================

set -euo pipefail

# 获取脚本所在的项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_DIR/src-tauri"

# ---- 颜色输出 ----
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "$CYAN[leoms-build]$NC $1"; }
ok()    { echo -e "$GREEN[leoms-build]$NC $1"; }
warn()  { echo -e "$YELLOW[leoms-build]$NC $1"; }
err()   { echo -e "$RED[leoms-build]$NC $1"; }

# ---- 前置检查 ----
if ! command -v powershell.exe &>/dev/null; then
  err "powershell.exe 不在 PATH 中，请确认当前环境为 WSL2"
  exit 1
fi

if ! powershell.exe -NoProfile -Command "cargo tauri --version" &>/dev/null; then
  err "Windows 宿主环境未检测到 cargo-tauri 工具链！"
  info "请先在 Windows 终端（PowerShell）中执行一次全局安装："
  echo "  cargo install tauri-cli --version '^2.0.0'"
  exit 1
fi

# ---- 路径转换 ----
WIN_TAURI_DIR="$(wslpath -m "$TAURI_DIR")"
CARGO_CACHE_DIR="C:/tauri-cache/leoms"

# 确保 Windows 侧缓存目录存在
powershell.exe -NoProfile -Command "if (!(Test-Path '$CARGO_CACHE_DIR')) { New-Item -ItemType Directory -Path '$CARGO_CACHE_DIR' -Force | Out-Null }"

cd "$PROJECT_DIR"

# ---- 步骤 1：在 WSL 里编译前端 UI ----
info "第 1/2 步：正在 WSL 内部编译前端静态资源 (pnpm build:ui)..."
pnpm build:ui
ok "前端静态资源编译完成 (已输出至 dist/ui)"

# ---- 步骤 2：在 Windows 侧打包 Tauri 原生应用 ----
info "第 2/2 步：正在调用 Windows 宿主 Rust 编译器打包 Windows 桌面应用..."
info "  源码路径: ${WIN_TAURI_DIR}"
info "  构建缓存: ${CARGO_CACHE_DIR}"
echo ""

BUILD_EXIT=0
powershell.exe -NoProfile -Command "\$env:CARGO_TARGET_DIR='${CARGO_CACHE_DIR}'; Set-Location '${WIN_TAURI_DIR}'; cargo tauri build --config tauri.build.conf.json" || BUILD_EXIT=$?

if [[ $BUILD_EXIT -ne 0 ]]; then
  echo ""
  err "Windows 桌面应用打包失败 (exit code: $BUILD_EXIT)"
  exit "$BUILD_EXIT"
fi

echo ""
ok "========================================================"
ok "🎉 leoms Studio Windows 桌面安装包构建成功！"
ok "========================================================"
info "安装包与免安装产物输出目录（Windows 路径）："
echo -e "  ${BOLD}C:\\tauri-cache\\leoms\\release\\bundle\\"
echo ""
