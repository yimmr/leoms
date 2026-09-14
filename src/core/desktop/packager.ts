import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve, extname, basename } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import pc from "picocolors";
import Table from "cli-table3";
import { isWSL, toHostPath, fromHostPath, resolveCacheDir, detectDesktopProject, checkHostToolchains } from "./detector.js";
import type { DesktopBuildOptions, DesktopConfig } from "./types.js";

function getSha256(filePath: string): string {
  try {
    const data = readFileSync(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return "N/A";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function findArtifacts(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;

  const validExts = new Set([".msi", ".exe", ".dmg", ".deb", ".appimage", ".tar.gz", ".zip"]);

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        // Exclude intermediate pdb/d files
        if (validExts.has(ext) && !entry.name.endsWith(".d") && !entry.name.endsWith(".pdb")) {
          result.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return result;
}

export async function runDesktopBuild(targetDir: string, options: DesktopBuildOptions = {}, config: DesktopConfig = {}): Promise<void> {
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
  const { projectDir, projectName, srcTauriDir, buildScript } = project;

  const cacheDir = resolveCacheDir(config.cacheDir, projectName);
  const outDir = resolve(projectDir, options.outDir || config.outDir || "./dist/desktop");

  console.log(pc.bold(pc.cyan("\n📦 leoms Desktop 桌面端原生安装包打包流水线\n")));
  console.log(`${pc.dim("  ● 目标工程:")} ${pc.bold(projectDir)}`);
  console.log(`${pc.dim("  ● 归集目录:")} ${pc.bold(outDir)}`);
  console.log(`${pc.dim("  ● 构建环境:")} ${isWSL() ? pc.green("WSL2 + Windows 宿主工具链") : pc.blue("Native 本地模式")}`);
  console.log(`${pc.dim("  ● 编译缓存:")} ${cacheDir}\n`);

  // 1. Build frontend assets
  if (!options.skipUi) {
    console.log(pc.cyan(`⚡ [1/2] 正在编译前端静态资源 (${buildScript})...`));
    execSync(`pnpm ${buildScript}`, {
      cwd: projectDir,
      stdio: "inherit",
    });
    console.log(pc.green(`✔ 前端静态资源编译完成。\n`));
  } else {
    console.log(pc.yellow(`▲ 跳过前端构建步骤。`));
  }

  // 2. Build Tauri desktop package
  console.log(pc.cyan(`⚡ [2/2] 正在调用 Rust 编译器与打包器生成原生安装包...`));

  // 动态覆写 beforeBuildCommand 为空
  const overrideConf = {
    $schema: "https://schema.tauri.app/config/2",
    build: {
      beforeBuildCommand: "",
    },
  };
  const tempConfName = `.tauri.build.override.json`;
  const tempConfFile = join(srcTauriDir, tempConfName);
  writeFileSync(tempConfFile, JSON.stringify(overrideConf, null, 2), "utf8");

  let bundleSourceDir = "";

  try {
    if (isWSL()) {
      const hostTauriDir = toHostPath(srcTauriDir);
      // Ensure cache directory exists on Windows
      spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `if (!(Test-Path '${cacheDir}')) { New-Item -ItemType Directory -Path '${cacheDir}' -Force | Out-Null }`,
        ],
        { stdio: "ignore" }
      );

      const psCommand = `$env:CARGO_TARGET_DIR='${cacheDir}'; Set-Location '${hostTauriDir}'; cargo tauri build --config ${tempConfName}`;
      spawnSync("powershell.exe", ["-NoProfile", "-Command", psCommand], {
        stdio: "inherit",
      });

      bundleSourceDir = fromHostPath(`${cacheDir}/release/bundle`);
    } else {
      // Native build
      execSync(`cargo tauri build --config ${tempConfName}`, {
        cwd: srcTauriDir,
        stdio: "inherit",
      });
      bundleSourceDir = join(srcTauriDir, "target/release/bundle");
    }
  } finally {
    if (existsSync(tempConfFile)) {
      try {
        unlinkSync(tempConfFile);
      } catch {}
    }
  }

  // 3. Harvest Artifacts into outDir
  console.log(pc.cyan(`\n🚚 正在归集安装包产物到: ${pc.bold(outDir)}...`));
  mkdirSync(outDir, { recursive: true });

  const foundArtifacts = findArtifacts(bundleSourceDir);
  const harvested: Array<{ filename: string; size: string; sha256: string; path: string }> = [];

  for (const file of foundArtifacts) {
    const fname = basename(file);
    const dest = join(outDir, fname);
    copyFileSync(file, dest);
    const size = statSync(dest).size;
    const sha = getSha256(dest);
    harvested.push({
      filename: fname,
      size: formatBytes(size),
      sha256: sha.slice(0, 16) + "...",
      path: dest,
    });
  }

  if (harvested.length > 0) {
    const table = new Table({
      head: [pc.cyan("产物文件"), pc.cyan("大小"), pc.cyan("SHA-256 (前16位)"), pc.cyan("本地归集路径")],
      colWidths: [32, 12, 22, 40],
      wordWrap: true,
    });

    for (const h of harvested) {
      table.push([pc.bold(pc.green(h.filename)), h.size, pc.dim(h.sha256), pc.dim(h.path)]);
    }

    console.log(table.toString());
    console.log(pc.bold(pc.green(`\n🎉 桌面端安装包已全部打包归集完成！共生成 ${harvested.length} 个发布文件。\n`)));
  } else {
    console.log(pc.yellow(`▲ 未在 ${bundleSourceDir} 中检测到归集产物，请检查构建日志。`));
  }
}
