#!/usr/bin/env bash
# =============================================================================
# dev-desktop.sh — 一键启动 WSL Vite + Windows Tauri 桌面端开发预览
#
# 使用方式：
#   pnpm dev:win          (通过 package.json script)
#   bash scripts/dev-desktop.sh
#
# 原理：
#   1. 在 WSL 里启动 Vite dev server (:5173, host=0.0.0.0, strictPort)
#   2. 通过 powershell.exe 在 Windows 侧启动 cargo tauri dev
#   3. Tauri 加载 WSL Vite 的页面，实现实时热更新预览
#   4. Ctrl+C 或关闭窗口退出时自动清理 Vite 及其派生子进程
# =============================================================================

set -euo pipefail

# ---- 配置 ----
VITE_PORT=5173
API_PORT=3200
VITE_READY_TIMEOUT=30       # 等待 Vite 就绪的最大秒数

# 获取脚本所在的项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_DIR/src-tauri"

# ---- 颜色输出 ----
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[leoms]${NC} $1"; }
ok()    { echo -e "${GREEN}[leoms]${NC} $1"; }
warn()  { echo -e "${YELLOW}[leoms]${NC} $1"; }
err()   { echo -e "${RED}[leoms]${NC} $1"; }

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

# ---- 路径转换（使用 wslpath -m 转换为 Windows 正斜杠格式，避免转义符破坏）----
WIN_TAURI_DIR="$(wslpath -m "$TAURI_DIR")"
# Rust 构建缓存目录（使用正斜杠避免 PowerShell 转义问题）
CARGO_CACHE_DIR="C:/tauri-cache/leoms"

# 确保 Windows 侧缓存目录存在
powershell.exe -NoProfile -Command "if (!(Test-Path '${CARGO_CACHE_DIR}')) { New-Item -ItemType Directory -Path '${CARGO_CACHE_DIR}' -Force | Out-Null }"

# ---- 清理函数 ----
VITE_PID=""
API_PID=""
STARTED_API=0

cleanup() {
  echo ""
  info "正在清理进程与资源..."
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    pkill -P "$VITE_PID" 2>/dev/null || true
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
    ok "Vite dev server 已停止"
  fi
  if [[ "$STARTED_API" -eq 1 && -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    pkill -P "$API_PID" 2>/dev/null || true
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
    ok "leoms API server 已停止"
  fi
  # 双重保障：确保端口彻底释放
  if command -v lsof &>/dev/null; then
    REMAINING_VITE=$(lsof -ti :"$VITE_PORT" 2>/dev/null || true)
    if [[ -n "$REMAINING_VITE" ]]; then
      kill -9 "$REMAINING_VITE" 2>/dev/null || true
    fi
    if [[ "$STARTED_API" -eq 1 ]]; then
      REMAINING_API=$(lsof -ti :"$API_PORT" 2>/dev/null || true)
      if [[ -n "$REMAINING_API" ]]; then
        kill -9 "$REMAINING_API" 2>/dev/null || true
      fi
    fi
  fi
  # 确保 Windows 侧桌面窗口也安全退出
  powershell.exe -NoProfile -Command "Stop-Process -Name 'leoms-studio' -ErrorAction SilentlyContinue" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---- 前置端口自愈检查 ----
if command -v lsof &>/dev/null; then
  OLD_PID=$(lsof -ti :"$VITE_PORT" 2>/dev/null || true)
  if [[ -n "$OLD_PID" ]]; then
    warn "检测到前端端口 :$VITE_PORT 已被进程 $OLD_PID 占用，正在预先清理..."
    kill -9 "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

cd "$PROJECT_DIR"

# ---- 步骤 1：启动/复用 leoms API server (:3200) ----
if curl -s "http://localhost:$API_PORT/api/health" >/dev/null 2>&1; then
  ok "检测到已有 leoms API 服务在运行 (:$API_PORT)"
else
  info "启动 leoms 本地 API 服务 (:$API_PORT)..."
  pnpm dev ui -p "$API_PORT" --no-open >/dev/null 2>&1 &
  API_PID=$!
  STARTED_API=1

  API_ELAPSED=0
  while ! curl -s "http://localhost:$API_PORT/api/health" >/dev/null 2>&1; do
    if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" 2>/dev/null; then
      err "leoms API 服务启动失败"
      exit 1
    fi
    if (( API_ELAPSED >= 15 )); then
      warn "leoms API 服务在 15s 内未响应 health 检查，继续尝试启动前端..."
      break
    fi
    sleep 0.5
    API_ELAPSED=$((API_ELAPSED + 1))
  done
  if (( API_ELAPSED < 15 )); then
    ok "leoms API 服务就绪 (:$API_PORT)"
  fi
fi

# ---- 步骤 2：启动 Vite dev server (:5173) ----
# --host 0.0.0.0 确保 Windows 侧 WebView2 可跨 WSL2 网络边界访问
# --strictPort 确保端口被抢时报错而不是静默切换，避免 Tauri 连错旧端口
info "启动 Vite dev server (:$VITE_PORT, host=0.0.0.0)..."
pnpm dev:ui -- --host 0.0.0.0 --port "$VITE_PORT" --strictPort &
VITE_PID=$!

# 等待 Vite 就绪
info "等待 Vite 就绪..."
ELAPSED=0
while ! curl -s "http://localhost:$VITE_PORT" >/dev/null 2>&1; do
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    err "Vite dev server 启动失败"
    exit 1
  fi
  if (( ELAPSED >= VITE_READY_TIMEOUT )); then
    err "Vite dev server 在 ${VITE_READY_TIMEOUT}s 内未就绪"
    exit 1
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done
ok "Vite dev server 就绪 (${ELAPSED}s)"

# ---- 步骤 3：通过 powershell.exe 在 Windows 侧启动 Tauri ----
info "在 Windows 侧启动 Tauri dev 窗口..."
info "  项目路径: ${WIN_TAURI_DIR}"
info "  构建缓存: ${CARGO_CACHE_DIR}"
echo ""

# 使用 tauri.dev.conf.json 覆盖 beforeDevCommand（Vite 已在 WSL 运行）
# 捕获退出码，避免窗口关闭或 Ctrl+C 被 set -e 识别为异常崩溃
TAURI_EXIT=0
powershell.exe -NoProfile -Command "\$env:CARGO_TARGET_DIR='${CARGO_CACHE_DIR}'; Set-Location '${WIN_TAURI_DIR}'; cargo tauri dev --config tauri.dev.conf.json" || TAURI_EXIT=$?

if [[ $TAURI_EXIT -ne 0 && $TAURI_EXIT -ne 130 && $TAURI_EXIT -ne 1 ]]; then
  warn "Tauri dev 进程异常退出 (code: $TAURI_EXIT)"
  exit "$TAURI_EXIT"
else
  ok "Tauri 桌面端已安全退出"
fi
