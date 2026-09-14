import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  openSync,
  statSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { findWorkspaceRoot } from "../core/workspace.js";
import { startServer } from "../server/index.js";
import { t } from "../core/i18n.js";

export interface UiCommandOptions {
  port?: string | number;
  host?: string;
  open?: boolean;
  daemon?: boolean;
  stop?: boolean;
  status?: boolean;
  internalDaemon?: boolean;
}

export interface UiDaemonMeta {
  pid: number;
  port: number;
  host: string;
  url: string;
  rootDir: string;
  startedAt: number;
}

function getPidPath(rootDir: string): string {
  const dir = join(rootDir, ".leoms");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "ui.pid");
}

function getMetaPath(rootDir: string): string {
  const dir = join(rootDir, ".leoms");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "ui.json");
}

function getLogPath(rootDir: string): string {
  const dir = join(rootDir, ".leoms");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "ui.log");
}

function readDaemonMeta(rootDir: string): UiDaemonMeta | null {
  const metaPath = getMetaPath(rootDir);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function rotateLogIfNeeded(rootDir: string): void {
  const logFile = getLogPath(rootDir);
  if (existsSync(logFile)) {
    try {
      const stats = statSync(logFile);
      if (stats.size > 5 * 1024 * 1024) {
        // > 5MB
        const oldFile = join(rootDir, ".leoms/ui.log.old");
        if (existsSync(oldFile)) {
          unlinkSync(oldFile);
        }
        renameSync(logFile, oldFile);
      }
    } catch {}
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

import { request as httpRequest } from "node:http";

function checkHealth(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const targetHost = host === "localhost" ? "127.0.0.1" : host;
    const req = httpRequest(
      {
        host: targetHost,
        port,
        path: "/api/health",
        method: "GET",
        timeout: 400,
      },
      (res) => {
        resolve(res.statusCode === 200);
        req.destroy();
      }
    );
    req.on("error", () => {
      req.destroy();
      resolve(false);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Open URL in user's default browser (supports WSL, Linux, macOS, Windows)
 */
function openBrowser(url: string): void {
  const isWSL = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);

  if (isWSL) {
    try {
      const ps = spawn("cmd.exe", ["/c", "start", url], {
        detached: true,
        stdio: "ignore",
      });
      ps.unref();
      return;
    } catch {
      // ignore and fallback
    }

    try {
      const wslview = spawn("wslview", [url], {
        detached: true,
        stdio: "ignore",
      });
      wslview.unref();
      return;
    } catch {
      // ignore
    }
  }

  const platform = process.platform;
  let cmd = "xdg-open";
  let args = [url];

  if (platform === "darwin") {
    cmd = "open";
  } else if (platform === "win32") {
    cmd = "cmd.exe";
    args = ["/c", "start", url];
  }

  try {
    const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
    p.unref();
  } catch {
    // Silent fail if browser launcher isn't installed
  }
}

export async function runUi(options: UiCommandOptions = {}, subcommand?: string): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red(t("runner.noRoot")));
    process.exit(1);
  }

  const pidPath = getPidPath(rootDir);
  const metaPath = getMetaPath(rootDir);
  const recordedMeta = readDaemonMeta(rootDir);

  const port = options.port
    ? parseInt(String(options.port), 10)
    : (recordedMeta?.port || 3200);
  const host = options.host || (recordedMeta?.host || "localhost");

  // 1. Handle "stop" action
  if (options.stop || subcommand === "stop") {
    if (existsSync(pidPath)) {
      try {
        const pid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
        if (isProcessAlive(pid)) {
          process.kill(pid, "SIGTERM");
          // Wait briefly
          await new Promise((r) => setTimeout(r, 400));
          if (isProcessAlive(pid)) {
            process.kill(pid, "SIGKILL");
          }
          console.log(pc.green(`✔ leoms workbench 后台服务已停止 (PID: ${pid})`));
        } else {
          console.log(pc.yellow(`leoms workbench 进程已不存在，已清理残留标记。`));
        }
        if (existsSync(pidPath)) unlinkSync(pidPath);
        if (existsSync(metaPath)) unlinkSync(metaPath);
      } catch (err: any) {
        console.error(pc.red(`停止服务失败: ${err.message}`));
      }
    } else {
      if (existsSync(metaPath)) {
        try { unlinkSync(metaPath); } catch {}
      }
      console.log(pc.gray("未检测到正在后台运行的 leoms workbench 守护进程。"));
    }
    process.exit(0);
  }

  // 2. Handle "status" action
  if (options.status || subcommand === "status") {
    let running = false;
    let pid: number | null = null;

    if (existsSync(pidPath)) {
      try {
        pid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
        running = isProcessAlive(pid);
        if (!running) {
          unlinkSync(pidPath);
          pid = null;
        }
      } catch {
        pid = null;
      }
    }

    const activePort = recordedMeta?.port || port;
    const activeHost = recordedMeta?.host || host;
    const healthy = await checkHealth(activeHost, activePort);

    if (running && healthy) {
      console.log(pc.green(`✔ leoms workbench 正在后台健康运行中 (PID: ${pid})`));
      console.log(pc.gray(`  服务地址: http://${activeHost}:${activePort}`));
      console.log(pc.gray(`  元数据:   .leoms/ui.json`));
      console.log(pc.gray(`  运行日志: .leoms/ui.log`));
      console.log(pc.gray(`  停止命令: leoms ui stop`));
    } else if (healthy) {
      console.log(pc.cyan(`ℹ 端口 ${activePort} 上有服务正在运行 (响应正常)，但不是作为后台守护进程启动。`));
      console.log(pc.gray(`  服务地址: http://${activeHost}:${activePort}`));
    } else {
      console.log(pc.gray(`leoms workbench 未运行。`));
      console.log(pc.gray(`使用 ${pc.cyan("leoms ui -d")} 可在后台静默启动。`));
    }
    process.exit(0);
  }

  // 3. Handle "daemon" start
  if (options.daemon) {
    if (existsSync(pidPath)) {
      try {
        const pid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
        if (isProcessAlive(pid)) {
          const healthy = await checkHealth(host, port);
          if (healthy) {
            console.log(pc.green(`🦁 leoms workbench 已在后台运行中 (PID: ${pid}, http://${host}:${port})`));
            process.exit(0);
          }
        }
        unlinkSync(pidPath);
      } catch {
        // clean up corrupted pid file
        try { unlinkSync(pidPath); } catch {}
      }
    }

    // Check if port is already active
    const portActive = await checkHealth(host, port);
    if (portActive) {
      console.log(pc.green(`🦁 leoms workbench 服务已在 http://${host}:${port} 正常响应。`));
      process.exit(0);
    }

    rotateLogIfNeeded(rootDir);
    const logFile = getLogPath(rootDir);
    const outFd = openSync(logFile, "a");

    const cliEntry = process.argv[1];
    const child = spawn(process.execPath, [
      cliEntry,
      "ui",
      "--no-open",
      "--internal-daemon",
      "-p",
      String(port),
      "-H",
      host,
    ], {
      detached: true,
      stdio: ["ignore", outFd, outFd],
      cwd: rootDir,
      env: { ...process.env, LEOMS_DAEMON: "1" },
    });

    writeFileSync(pidPath, String(child.pid), "utf8");
    child.unref();

    // Poll for health check up to 4s (using recordedMeta or port range)
    let started = false;
    let actualDetectedPort = port;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const freshMeta = readDaemonMeta(rootDir);
      const checkP = freshMeta?.port || port;
      if (await checkHealth(host, checkP)) {
        started = true;
        actualDetectedPort = checkP;
        break;
      }
    }

    if (started) {
      console.log(pc.green(`✔ leoms workbench 已在后台成功启动 (PID: ${child.pid})`));
      console.log(pc.gray(`  🌐 服务地址: http://${host}:${actualDetectedPort}`));
      console.log(pc.gray(`  📄 运行日志: .leoms/ui.log`));
      console.log(pc.gray(`  🛑 停止命令: leoms ui stop\n`));
    } else {
      console.log(pc.yellow(`leoms workbench 后台进程已创建 (PID: ${child.pid})，正在初始化，请查看 .leoms/ui.log`));
    }
    process.exit(0);
  }

  // 4. Foreground / Worker execution
  const shouldOpen = options.open !== false && !options.internalDaemon;

  // If this is an interactive CLI invocation (not internal daemon worker),
  // check if a daemon or server is already actively listening on this port.
  if (!options.internalDaemon) {
    const isAlreadyActive = await checkHealth(host, port);
    if (isAlreadyActive) {
      let pidStr = "";
      if (existsSync(pidPath)) {
        try {
          const recordedPid = readFileSync(pidPath, "utf8").trim();
          if (isProcessAlive(parseInt(recordedPid, 10))) {
            pidStr = ` (PID: ${recordedPid})`;
          }
        } catch {}
      }

      console.log(pc.green(`\n✔ leoms workbench 服务已在运行中${pidStr}: http://${host}:${port}`));
      console.log(pc.gray(`  该服务正在正常响应，无需在前台重复启动占用终端。`));
      console.log(pc.gray(`  - 查看状态: leoms ui status`));
      console.log(pc.gray(`  - 停止服务: leoms ui stop\n`));

      if (shouldOpen) {
        openBrowser(`http://${host}:${port}`);
      }
      process.exit(0);
    }
  }

  if (!options.internalDaemon) {
    console.log(pc.cyan("\n🦁 Starting leoms Visual Workbench..."));
  }

  try {
    const server = await startServer({
      rootDir,
      port,
      host,
    });

    const meta: UiDaemonMeta = {
      pid: process.pid,
      port: server.port,
      host: server.host,
      url: server.url,
      rootDir,
      startedAt: Date.now(),
    };
    try {
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    } catch {}

    if (options.internalDaemon) {
      // Record PID for daemon tracking
      writeFileSync(pidPath, String(process.pid), "utf8");
    } else {
      console.log();
      console.log(
        pc.bgCyan(pc.black("  LEOMS WORKBENCH READY  ")) +
          " " +
          pc.green(pc.bold(server.url))
      );
      console.log(pc.gray(`  Workspace: ${rootDir}`));
      console.log(pc.gray(`  Local API: ${server.url}/api/status`));
      console.log(pc.gray("  运行模式: 前台服务 (按 Ctrl+C 可停止)"));
      console.log(pc.cyan(`  💡 提示: 若希望在后台静默运行并释放终端，请使用: ${pc.bold("leoms ui -d")}\n`));

      if (shouldOpen) {
        openBrowser(server.url);
      }
    }

    // Keep process alive until terminated
    const handleExit = async () => {
      if (!options.internalDaemon) {
        console.log(pc.yellow("\nShutting down leoms workbench..."));
      }
      try {
        if (existsSync(pidPath)) {
          const recorded = readFileSync(pidPath, "utf8").trim();
          if (recorded === String(process.pid)) {
            unlinkSync(pidPath);
          }
        }
      } catch {}
      try {
        if (existsSync(metaPath)) {
          unlinkSync(metaPath);
        }
      } catch {}
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
  } catch (err: any) {
    console.error(pc.red(`\nFailed to start leoms workbench: ${err.message}`));
    process.exit(1);
  }
}
