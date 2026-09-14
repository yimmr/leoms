import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import pc from "picocolors";
import { isWSL, toHostPath, resolveCacheDir, detectDesktopProject, checkHostToolchains } from "./detector.js";
import type { DesktopDevOptions, DesktopConfig } from "./types.js";

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: "127.0.0.1" }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(300, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function killPort(port: number): void {
  try {
    execSync(`lsof -ti :${port} 2>/dev/null | xargs -r kill -9`, { stdio: "ignore" });
  } catch {}
}

function waitForHttp(url: string, timeoutSec: number = 30): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (res.ok || res.status < 500) {
          clearInterval(interval);
          resolve(true);
        }
      } catch {}

      if (Date.now() - startTime > timeoutSec * 1000) {
        clearInterval(interval);
        resolve(false);
      }
    }, 500);
  });
}

export async function runDesktopDev(targetDir: string, options: DesktopDevOptions = {}, config: DesktopConfig = {}): Promise<void> {
  // 1. 前置工具链环境健康检查
  const toolchain = checkHostToolchains();
  if (!toolchain.ok) {
    console.error(pc.red(`\n✖ ${toolchain.error}`));
    if (toolchain.remedy) {
      console.log(pc.yellow(`💡 修复建议: ${toolchain.remedy}\n`));
    }
    process.exit(1);
  }

  // 2. 自动探查推导目标工程配置
  const project = detectDesktopProject(targetDir, config);
  const { projectDir, projectName, srcTauriDir, devScript, companion } = project;

  // 端口决策：CLI 参数 > 项目嗅探端口
  const devPort = Number(options.port || project.devPort);
  const cacheDir = options.targetDir || resolveCacheDir(config.cacheDir, projectName);

  console.log(pc.bold(pc.cyan("\n🚀 leoms Desktop 桌面端开发与热重载编排器\n")));
  console.log(`${pc.dim("  ● 目标工程:")} ${pc.bold(projectDir)}`);
  console.log(`${pc.dim("  ● 运行环境:")} ${isWSL() ? pc.green("WSL2 (Windows 宿主加速桥接)") : pc.blue("Native 本地模式")}`);
  console.log(`${pc.dim("  ● 前端调试:")} http://localhost:${devPort} (script: ${devScript})`);
  console.log(`${pc.dim("  ● 构建缓存:")} ${cacheDir}`);

  // 伴生服务状态判断：只有显式配置且未传 --no-companion 时才启用
  const shouldRunCompanion = Boolean(companion && !options.noCompanion);
  if (shouldRunCompanion && companion) {
    console.log(`${pc.dim("  ● 伴生服务:")} ${pc.magenta("已声明")} (cmd: ${companion.command}, port: :${companion.port || "自动"})`);
  } else {
    console.log(`${pc.dim("  ● 伴生服务:")} ${pc.dim("无 (纯前端/多端直连模式)")}`);
  }
  console.log("");

  // 3. 前端端口自愈与清理
  const isViteBusy = await checkPort(devPort);
  if (isViteBusy) {
    console.log(pc.yellow(`⚠ 前端端口 :${devPort} 被占用，正在自动释放...`));
    killPort(devPort);
    await new Promise((r) => setTimeout(r, 600));
  }

  let viteChild: ChildProcess | null = null;
  let companionChild: ChildProcess | null = null;
  let startedCompanion = false;
  let tempConfFile: string | null = null;

  const cleanup = () => {
    console.log(pc.cyan("\n[leoms] 正在清理后台子进程与资源..."));
    if (viteChild?.pid) {
      try {
        process.kill(-viteChild.pid, "SIGKILL");
      } catch {
        try {
          viteChild.kill("SIGKILL");
        } catch {}
      }
    }
    if (startedCompanion && companionChild?.pid) {
      try {
        process.kill(-companionChild.pid, "SIGKILL");
      } catch {
        try {
          companionChild.kill("SIGKILL");
        } catch {}
      }
    }
    killPort(devPort);

    // 清理临时生成的 override 配置文件
    if (tempConfFile && existsSync(tempConfFile)) {
      try {
        unlinkSync(tempConfFile);
      } catch {}
    }

    if (isWSL()) {
      try {
        spawnSync(
          "powershell.exe",
          ["-NoProfile", "-Command", `Stop-Process -Name '${projectName}' -ErrorAction SilentlyContinue`],
          { stdio: "ignore" }
        );
      } catch {}
    }

    console.log(pc.green("[leoms] 桌面端已安全退出。\n"));
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // 4. 按需拉起伴生本地服务 (如有声明)
  if (shouldRunCompanion && companion) {
    const compPort = companion.port;
    const isAlive = compPort ? await checkPort(compPort) : false;

    if (isAlive) {
      console.log(pc.green(`✔ 检测到已有伴生服务在运行 (:${compPort})`));
    } else {
      console.log(pc.cyan(`⚡ 正在启动伴生服务 (${companion.command})...`));
      const [cmd, ...args] = companion.command.split(" ");
      companionChild = spawn(cmd, args, {
        cwd: projectDir,
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      startedCompanion = true;

      if (companion.healthCheck) {
        const url = companion.healthCheck.startsWith("http")
          ? companion.healthCheck
          : `http://localhost:${compPort || 3200}${companion.healthCheck}`;
        const ready = await waitForHttp(url, 15);
        if (ready) {
          console.log(pc.green(`✔ 伴生服务健康就绪 (${url})`));
        } else {
          console.log(pc.yellow(`▲ 伴生服务在 15s 内未响应 health 检查，继续启动前端...`));
        }
      }
    }
  }

  // 5. 启动前端开发服务器 (Vite / Webpack 等)
  console.log(pc.cyan(`⚡ 启动前端开发服务器 (:${devPort})...`));
  viteChild = spawn(
    "pnpm",
    [devScript, "--", "--host", "0.0.0.0", "--port", String(devPort), "--strictPort"],
    {
      cwd: projectDir,
      detached: true,
      stdio: "inherit",
    }
  );

  const viteReady = await waitForHttp(`http://localhost:${devPort}`, 30);
  if (!viteReady) {
    console.error(pc.red(`✖ 前端开发服务在 30s 内未就绪，中止启动。`));
    cleanup();
    process.exit(1);
  }
  console.log(pc.green(`✔ 前端开发服务已就绪 (http://localhost:${devPort})`));

  // 6. 拉起桌面端开发窗口
  console.log(pc.bold(pc.green(`\n🖥  正在拉起桌面端原生开发窗口...\n`)));

  // 动态覆写 beforeDevCommand 为空（免去在源码仓库维护额外 json 文件的负担）
  const overrideConf = {
    $schema: "https://schema.tauri.app/config/2",
    build: {
      beforeDevCommand: "",
    },
  };
  const tempConfName = `.tauri.dev.override.json`;
  tempConfFile = join(srcTauriDir, tempConfName);
  writeFileSync(tempConfFile, JSON.stringify(overrideConf, null, 2), "utf8");

  if (isWSL()) {
    const hostTauriDir = toHostPath(srcTauriDir);

    // 确保 Windows 侧编译缓存目录存在
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `if (!(Test-Path '${cacheDir}')) { New-Item -ItemType Directory -Path '${cacheDir}' -Force | Out-Null }`,
      ],
      { stdio: "ignore" }
    );

    const psScript = `$env:CARGO_TARGET_DIR='${cacheDir}'; Set-Location '${hostTauriDir}'; cargo tauri dev --config ${tempConfName}`;
    try {
      spawnSync("powershell.exe", ["-NoProfile", "-Command", psScript], {
        stdio: "inherit",
      });
    } catch {
      // 捕获窗口关闭或 Ctrl+C
    }
  } else {
    // Native 本地环境 (Windows / macOS / Linux)
    const env = { ...process.env };
    if (process.platform === "linux") {
      env.WEBKIT_DISABLE_COMPOSITING_MODE = "1";
    }
    try {
      execSync(`cargo tauri dev --config ${tempConfName}`, {
        cwd: srcTauriDir,
        env,
        stdio: "inherit",
      });
    } catch {}
  }

  cleanup();
}
