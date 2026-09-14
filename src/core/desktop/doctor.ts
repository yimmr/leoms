import { execSync } from "node:child_process";
import { createConnection } from "node:net";
import pc from "picocolors";
import Table from "cli-table3";
import { isWSL, isWindows, isMacOS } from "./detector.js";
import type { DesktopDoctorItem } from "./types.js";

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: "127.0.0.1" }, () => {
      sock.destroy();
      resolve(true); // listening
    });
    sock.on("error", () => {
      resolve(false); // not listening
    });
    sock.setTimeout(300, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function runSilent(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

export async function runDesktopDiagnostics(targetDir?: string): Promise<DesktopDoctorItem[]> {
  const items: DesktopDoctorItem[] = [];

  // 1. Node & pnpm
  const nodeVer = process.version;
  items.push({
    name: "Node.js",
    status: "ok",
    message: `当前版本 ${nodeVer}`,
  });

  const pnpmVer = runSilent("pnpm -v");
  if (pnpmVer) {
    items.push({
      name: "pnpm",
      status: "ok",
      message: `当前版本 ${pnpmVer}`,
    });
  } else {
    items.push({
      name: "pnpm",
      status: "error",
      message: "未检测到 pnpm 工具",
      remedy: "请运行 npm install -g pnpm 安装",
    });
  }

  // 2. Host platform & bridge
  if (isWSL()) {
    items.push({
      name: "运行环境",
      status: "ok",
      message: "WSL2 (自动启用 Windows 宿主桥接模式)",
    });

    const psVer = runSilent("powershell.exe -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'");
    if (psVer) {
      items.push({
        name: "Windows PowerShell",
        status: "ok",
        message: `就绪 (${psVer})`,
      });
    } else {
      items.push({
        name: "Windows PowerShell",
        status: "error",
        message: "无法调用 powershell.exe",
        remedy: "请确认 WSL2 与 Windows 互操作模式开启 (interop)",
      });
    }

    const winCargoVer = runSilent("powershell.exe -NoProfile -Command \"cargo --version\"");
    if (winCargoVer) {
      items.push({
        name: "Windows Rust (Cargo)",
        status: "ok",
        message: `就绪 (${winCargoVer})`,
      });
    } else {
      items.push({
        name: "Windows Rust (Cargo)",
        status: "error",
        message: "Windows 侧未安装 Rust 编译器",
        remedy: "请在 Windows PowerShell 运行 winget install Rustlang.Rustup",
      });
    }

    const winTauriVer = runSilent("powershell.exe -NoProfile -Command \"cargo tauri --version\"");
    if (winTauriVer) {
      items.push({
        name: "Windows cargo-tauri",
        status: "ok",
        message: `就绪 (${winTauriVer})`,
      });
    } else {
      items.push({
        name: "Windows cargo-tauri",
        status: "error",
        message: "Windows 侧未安装 tauri-cli",
        remedy: "请在 Windows PowerShell 执行: cargo install tauri-cli --version '^2.0.0' --locked",
      });
    }
  } else if (isWindows()) {
    items.push({
      name: "运行环境",
      status: "ok",
      message: "Windows 原生环境",
    });

    const cargoVer = runSilent("cargo --version");
    if (cargoVer) {
      items.push({
        name: "Rust (Cargo)",
        status: "ok",
        message: `就绪 (${cargoVer})`,
      });
    } else {
      items.push({
        name: "Rust (Cargo)",
        status: "error",
        message: "未安装 Rust 编译器",
        remedy: "请运行 winget install Rustlang.Rustup",
      });
    }

    const tauriVer = runSilent("cargo tauri --version") || runSilent("tauri --version");
    if (tauriVer) {
      items.push({
        name: "tauri-cli",
        status: "ok",
        message: `就绪 (${tauriVer})`,
      });
    } else {
      items.push({
        name: "tauri-cli",
        status: "error",
        message: "未安装 tauri-cli",
        remedy: "请执行: cargo install tauri-cli --version '^2.0.0' --locked",
      });
    }
  } else {
    items.push({
      name: "运行环境",
      status: "ok",
      message: isMacOS() ? "macOS (Cocoa / WebKit)" : "Linux (GTK / WebKitGTK)",
    });

    const cargoVer = runSilent("cargo --version");
    items.push({
      name: "Rust (Cargo)",
      status: cargoVer ? "ok" : "error",
      message: cargoVer ? `就绪 (${cargoVer})` : "未检测到 Rust 编译器",
      remedy: cargoVer ? undefined : "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    });
  }

  // 3. Ports health & project context
  let targetDevPort = 5173;
  let companionPort: number | undefined;

  if (targetDir) {
    try {
      const { detectDesktopProject } = await import("./detector.js");
      const detected = detectDesktopProject(targetDir);
      targetDevPort = detected.devPort;
      companionPort = detected.companion?.port;
    } catch {}
  }

  const vitePortBusy = await checkPort(targetDevPort);
  items.push({
    name: `前端调试端口 (:${targetDevPort})`,
    status: vitePortBusy ? "warn" : "ok",
    message: vitePortBusy ? "当前已被占用 (启动时将自动检测并自愈)" : "空闲可用",
  });

  if (companionPort) {
    const apiPortBusy = await checkPort(companionPort);
    items.push({
      name: `伴生服务端口 (:${companionPort})`,
      status: "ok",
      message: apiPortBusy ? "已在运行中 (可直接复用)" : "未启动 (启动桌面端时将自动伴随守护启动)",
    });
  }

  return items;
}

export function printDoctorReport(items: DesktopDoctorItem[]): void {
  console.log(pc.bold(pc.cyan("\n🩺 leoms Desktop 跨平台桌面端环境体检报告\n")));

  const table = new Table({
    head: [pc.cyan("检查项"), pc.cyan("状态"), pc.cyan("诊断结果 / 修复建议")],
    colWidths: [24, 10, 56],
    wordWrap: true,
  });

  let hasError = false;

  for (const item of items) {
    let statusBadge = pc.green("✔ 正常");
    if (item.status === "warn") statusBadge = pc.yellow("▲ 提示");
    if (item.status === "error") {
      statusBadge = pc.red("✖ 异常");
      hasError = true;
    }

    let desc = item.message;
    if (item.remedy) {
      desc += `\n${pc.yellow("💡 修复指引:")} ${item.remedy}`;
    }

    table.push([item.name, statusBadge, desc]);
  }

  console.log(table.toString());

  if (hasError) {
    console.log(pc.red("\n✖ 检测到部分必备环境缺失，请参考上方修复指引安装后再启动桌面端。\n"));
  } else {
    console.log(pc.green("\n🎉 桌面端开发环境完好无损，可直接运行 ") + pc.bold("leoms desk dev") + pc.green(" 启动开发！\n"));
  }
}
