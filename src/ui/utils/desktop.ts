import { isTauri, getApiBase, setApiPort } from "../api/client.js";

export interface DesktopSettings {
  workspace_path?: string;
  port?: number;
  auto_start?: boolean;
  initialized?: boolean;
  theme?: string;
  language?: string;
}

export interface BackendInfo {
  is_alive: boolean;
  port: number;
  workspace_path?: string;
}

export const DEFAULT_WORKSPACE_PATH = "~/org";

function getTauriInvoke(): ((cmd: string, args?: Record<string, any>) => Promise<any>) | null {
  if (typeof window === "undefined") return null;
  const t = (window as any).__TAURI__;
  if (t?.core?.invoke) return t.core.invoke;
  const ti = (window as any).__TAURI_INTERNALS__;
  if (ti?.invoke) return ti.invoke;
  return null;
}

/**
  * 读取持久化配置（优先 Tauri IPC，次选 /api/desktop/config，最后保底 localStorage）
  */
export async function getDesktopSettings(): Promise<DesktopSettings> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const cfg = await invoke("get_desktop_config");
      if (cfg && typeof cfg === "object") {
        return cfg as DesktopSettings;
      }
    } catch (err) {
      console.warn("Tauri get_desktop_config error:", err);
    }
  }

  // 尝试通过 Node 伴生服务 API 读取
  try {
    const res = await fetch(`${getApiBase()}/desktop/config`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") {
        return data as DesktopSettings;
      }
    }
  } catch {}

  // LocalStorage 保底
  try {
    const stored = localStorage.getItem("leoms_desktop_settings");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}

  return {
    workspace_path: DEFAULT_WORKSPACE_PATH,
    port: 3200,
    auto_start: true,
    initialized: false,
  };
}

/**
  * 保存持久化配置
  */
export async function saveDesktopSettings(settings: DesktopSettings): Promise<DesktopSettings> {
  // 1. 同步内存与 localStorage 端口，即时生效
  if (settings.port) {
    setApiPort(settings.port);
  }
  try {
    localStorage.setItem("leoms_desktop_settings", JSON.stringify(settings));
    if (settings.port) {
      localStorage.setItem("leoms_api_port", String(settings.port));
    }
  } catch {}

  // 2. 如果在 Tauri 环境，调用 Rust 原生命令写入 ~/.config/leoms/desktop.json
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const res = await invoke("save_desktop_config_command", { config: settings });
      return res as DesktopSettings;
    } catch (err) {
      console.error("Tauri save_desktop_config_command failed:", err);
    }
  }

  // 3. 否则尝试请求后台 API 保存
  try {
    const res = await fetch(`${getApiBase()}/desktop/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const data = await res.json();
      return data.config || settings;
    }
  } catch {}

  return settings;
}

/**
  * 查询后台服务状态与监听端口
  */
export async function getBackendInfo(): Promise<BackendInfo | null> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke("get_backend_info");
    } catch (e) {
      console.warn("get_backend_info error:", e);
    }
  }
  return null;
}

/**
  * 重启伴生核心服务（仅 Tauri 原生桌面端支持）
  */
export async function restartBackendDaemon(): Promise<BackendInfo | null> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke("restart_backend");
    } catch (e) {
      console.error("restart_backend error:", e);
      throw e;
    }
  }
  return null;
}
