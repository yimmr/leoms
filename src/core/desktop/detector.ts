import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let _isWslCache: boolean | null = null;

export function isWSL(): boolean {
  if (_isWslCache !== null) return _isWslCache;

  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    _isWslCache = true;
    return true;
  }

  if (process.platform === "linux" && existsSync("/proc/version")) {
    try {
      const ver = readFileSync("/proc/version", "utf8").toLowerCase();
      _isWslCache = ver.includes("microsoft") || ver.includes("wsl");
      return _isWslCache;
    } catch {
      _isWslCache = false;
      return false;
    }
  }

  _isWslCache = false;
  return false;
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function isLinuxDesktop(): boolean {
  return process.platform === "linux" && !isWSL();
}

/**
 * Converts a Linux/WSL path to Windows host path format with forward slashes (e.g. //wsl.localhost/Ubuntu/...)
 */
export function toHostPath(path: string): string {
  if (!isWSL()) return path;
  try {
    const out = execSync(`wslpath -m "${path}"`, { encoding: "utf8" }).trim();
    return out;
  } catch {
    return path;
  }
}

/**
 * Converts a Windows host path (e.g. C:/tauri-cache) to WSL linux path (/mnt/c/tauri-cache)
 */
export function fromHostPath(path: string): string {
  if (!isWSL()) return path;
  try {
    const out = execSync(`wslpath -u "${path}"`, { encoding: "utf8" }).trim();
    return out;
  } catch {
    // Fallback: simple C:/ -> /mnt/c/
    const match = path.match(/^([a-zA-Z]):[\\/](.*)/);
    if (match) {
      return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
    }
    return path;
  }
}

/**
 * Resolves cache template with project name (e.g. "C:/tauri-cache/{name}")
 */
export function resolveCacheDir(template: string | undefined, projectName: string): string {
  const tpl = template || "C:/tauri-cache/{name}";
  return tpl.replace(/\{name\}|\{project\.name\}/g, projectName);
}

/**
 * Checks if host toolchains are available (powershell and cargo-tauri for WSL)
 */
export function checkHostToolchains(): { ok: boolean; error?: string; remedy?: string } {
  if (isWSL()) {
    try {
      execSync("command -v powershell.exe", { stdio: "ignore" });
    } catch {
      return {
        ok: false,
        error: "未在 PATH 中找到 powershell.exe",
        remedy: "请确认当前运行于 WSL2 环境且开启了 Windows 互操作特性 (interop)",
      };
    }

    try {
      execSync("powershell.exe -NoProfile -Command \"cargo tauri --version\"", { stdio: "ignore" });
    } catch {
      return {
        ok: false,
        error: "Windows 宿主环境未检测到 cargo-tauri 工具链",
        remedy: "请在 Windows PowerShell 执行安装: cargo install tauri-cli --version '^2.0.0' --locked",
      };
    }
  }
  return { ok: true };
}

import { join, resolve, basename } from "node:path";
import type { DesktopConfig, DetectedDesktopProject, CompanionServiceConfig } from "./types.js";

/**
 * Detects Tauri configuration, scripts, devUrl, port and companion services for a project
 */
export function detectDesktopProject(targetDir: string, config: DesktopConfig = {}): DetectedDesktopProject {
  const projectDir = resolve(targetDir);
  const srcTauriDir = join(projectDir, config.srcDir || "src-tauri");

  if (!existsSync(srcTauriDir)) {
    throw new Error(`目标目录下未找到 Tauri 源码目录: ${srcTauriDir}`);
  }

  const tauriConfPath = join(srcTauriDir, "tauri.conf.json");
  let devUrl = "http://localhost:5173";
  let devPort = 5173;

  if (existsSync(tauriConfPath)) {
    try {
      const conf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
      if (conf.build?.devUrl) {
        devUrl = conf.build.devUrl;
        const portMatch = devUrl.match(/:(\d+)/);
        if (portMatch) {
          devPort = parseInt(portMatch[1], 10);
        }
      }
    } catch {}
  }

  // Detect scripts & companion from package.json
  const pkgJsonPath = join(projectDir, "package.json");
  let devScript = "dev";
  let buildScript = "build";
  let detectedCompanion: CompanionServiceConfig | undefined = config.companion;

  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      if (pkg.scripts) {
        if (pkg.scripts["dev:ui"]) devScript = "dev:ui";
        else if (pkg.scripts["dev"]) devScript = "dev";

        if (pkg.scripts["build:ui"]) buildScript = "build:ui";
        else if (pkg.scripts["build"]) buildScript = "build";
      }

      if (pkg.leoms?.desktop?.companion) {
        detectedCompanion = {
          ...detectedCompanion,
          ...pkg.leoms.desktop.companion,
        };
      }
    } catch {}
  }

  if (config.frontendDevScript) devScript = config.frontendDevScript;
  if (config.frontendBuildScript) buildScript = config.frontendBuildScript;
  if (config.port) devPort = config.port;

  const projectName = basename(projectDir) || "app";

  return {
    projectDir,
    projectName,
    srcTauriDir,
    devUrl,
    devPort,
    devScript,
    buildScript,
    companion: detectedCompanion,
  };
}
