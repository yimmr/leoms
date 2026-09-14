import { join } from "node:path";
import pc from "picocolors";
import {
  findWorkspaceRoot,
  getWorkspaceContext,
  getProjectFromCwd,
  resolveTargetProjects,
  getComposerEnv,
} from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { spawnCommand } from "../utils/exec.js";
import { isZh } from "../core/i18n.js";
import type { ProjectModel } from "../core/types.js";

export interface InstallCommandOptions {
  project?: string;
  php?: boolean;
  npm?: boolean;
}

export async function runInstall(
  targetQuery?: string,
  options: InstallCommandOptions = {}
): Promise<void> {
  const zh = isZh();
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(
      pc.red(
        zh
          ? "✖ 无法定位工作区根目录（向上未发现 pnpm-workspace.yaml 或 .leoms）。"
          : "✖ Cannot locate workspace root (no pnpm-workspace.yaml or .leoms found upwards)."
      )
    );
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const composerEnv = getComposerEnv(rootDir);

  const query = options.project || targetQuery;

  // Case 1: Target project explicitly specified (via argument or -p/--project)
  if (query) {
    const { targets } = resolveTargetProjects(projects, rootDir, query);
    if (targets.length === 0) {
      console.error(
        pc.red(zh ? `✖ 未找到匹配 "${query}" 的项目。` : `✖ No project found matching "${query}".`)
      );
      console.log(pc.dim(zh ? "运行 `leoms list` 可查看所有可用项目。" : "Run `leoms list` to view all available projects."));
      process.exit(1);
    }

    for (const proj of targets) {
      await installSingleProject(proj, options, composerEnv, rootDir, zh);
    }
    return;
  }

  // Case 2: No target specified - check if CWD is inside a subproject
  const cwdProj = getProjectFromCwd(projects, rootDir);
  if (cwdProj) {
    await installSingleProject(cwdProj, options, composerEnv, rootDir, zh);
    return;
  }

  // Case 3: Workspace root execution without target -> Install across entire workspace
  console.log(
    pc.bold(
      zh
        ? "\n🚀 正在为全工作区项目智能安装依赖...\n"
        : "\n🚀 Installing dependencies for the entire workspace...\n"
    )
  );

  let npmSuccess = true;
  let phpSuccess = true;

  // 1. Node / NPM monorepo install
  if (!options.php) {
    console.log(
      pc.cyan(
        zh
          ? "📦 [NPM] 正在执行工作区根目录 `pnpm install`..."
          : "📦 [NPM] Running root `pnpm install` for monorepo workspace..."
      )
    );
    try {
      const { exitCode } = await spawnCommand("pnpm", ["install"], {
        cwd: rootDir,
        stdio: "inherit",
      });
      if (exitCode !== 0) {
        npmSuccess = false;
        console.error(
          pc.red(
            zh ? `✖ 根目录 pnpm install 失败，退出码 ${exitCode}。` : `✖ Root pnpm install exited with code ${exitCode}.`
          )
        );
      } else {
        console.log(
          pc.green(
            zh
              ? "✔ [NPM] 工作区 Node 依赖包安装成功。\n"
              : "✔ [NPM] Monorepo workspace Node packages installed successfully.\n"
          )
        );
      }
    } catch (err: any) {
      npmSuccess = false;
      console.error(pc.red(zh ? `✖ 执行 pnpm 失败: ${err.message}` : `✖ Failed to run pnpm: ${err.message}`));
    }
  }

  // 2. PHP / Composer projects install
  if (!options.npm) {
    const phpProjects = projects.filter(
      (p) => p.packageManager === "composer" || p.packageManager === "hybrid"
    );

    if (phpProjects.length === 0) {
      console.log(
        pc.dim(zh ? "ℹ 未检测到需要安装依赖的 PHP / Composer 项目。" : "ℹ No PHP / Composer projects found to install.")
      );
    } else {
      console.log(
        pc.blue(
          zh
            ? `🐘 [Composer] 正在为 ${phpProjects.length} 个项目安装 PHP 依赖...`
            : `🐘 [Composer] Installing PHP dependencies for ${phpProjects.length} project(s)...`
        )
      );

      for (let i = 0; i < phpProjects.length; i++) {
        const proj = phpProjects[i];
        console.log(
          pc.bold(`\n[${i + 1}/${phpProjects.length}] 🐘 ${proj.name} ${pc.dim(`(${proj.relativeDir})`)}`)
        );

        try {
          const { exitCode } = await spawnCommand("composer", ["install"], {
            cwd: proj.path,
            env: composerEnv,
            stdio: "inherit",
          });
          if (exitCode !== 0) {
            phpSuccess = false;
            console.error(
              pc.red(
                zh
                  ? `✖ Composer 依赖安装失败: ${proj.name} (退出码 ${exitCode})。`
                  : `✖ Composer install failed for ${proj.name} (exit code ${exitCode}).`
              )
            );
          } else {
            console.log(pc.green(zh ? `✔ ${proj.name} 依赖安装完成。` : `✔ ${proj.name} dependencies installed.`));
          }
        } catch (err: any) {
          phpSuccess = false;
          if (err.code === "ENOENT") {
            console.error(
              pc.red(
                zh
                  ? "✖ PATH 中未检测到 Composer CLI，请先安装 Composer。"
                  : "✖ Composer CLI not found in PATH. Please install Composer."
              )
            );
            break;
          } else {
            console.error(
              pc.red(zh ? `✖ 执行 composer 失败: ${err.message}` : `✖ Failed to execute composer: ${err.message}`)
            );
          }
        }
      }
      console.log("");
    }
  }

  if (npmSuccess && phpSuccess) {
    console.log(
      pc.bold(
        pc.green(
          zh
            ? "✔ 全工作区所有依赖安装成功！🎉\n"
            : "✔ All workspace dependencies installed successfully! 🎉\n"
        )
      )
    );
  } else {
    console.log(
      pc.yellow(
        zh
          ? "⚠ 部分依赖安装发生错误，请查看上方执行日志排查。\n"
          : "⚠ Completed with some installation errors. Please check the logs above.\n"
      )
    );
    process.exit(1);
  }
}

async function installSingleProject(
  proj: ProjectModel,
  options: InstallCommandOptions,
  composerEnv: NodeJS.ProcessEnv,
  rootDir: string,
  zh: boolean
): Promise<void> {
  console.log(
    pc.bold(
      zh
        ? `\n📦 正在为指定项目安装依赖: ${proj.name} (${proj.relativeDir})...\n`
        : `\n📦 Installing dependencies for project: ${proj.name} (${proj.relativeDir})...\n`
    )
  );

  const isHybrid = proj.packageManager === "hybrid";
  const hasNpm = proj.packageManager === "npm" || isHybrid;
  const hasPhp = proj.packageManager === "composer" || isHybrid;

  // 1. Install Node dependencies
  if (hasNpm && !options.php) {
    console.log(pc.cyan(`  ➜ [NPM] Running \`pnpm --dir ${proj.relativeDir} install\`...`));
    const { exitCode } = await spawnCommand("pnpm", ["--dir", proj.path, "install"], {
      cwd: rootDir,
      stdio: "inherit",
    });
    if (exitCode !== 0) {
      console.error(pc.red(zh ? `  ✖ pnpm install 失败 (退出码 ${exitCode})。` : `  ✖ pnpm install failed with exit code ${exitCode}.`));
      process.exit(1);
    }
  }

  // 2. Install PHP dependencies
  if (hasPhp && !options.npm) {
    console.log(pc.blue(`  ➜ [Composer] Running \`composer install\` in ${proj.relativeDir}...`));
    const { exitCode } = await spawnCommand("composer", ["install"], {
      cwd: proj.path,
      env: composerEnv,
      stdio: "inherit",
    });
    if (exitCode !== 0) {
      console.error(pc.red(zh ? `  ✖ composer install 失败 (退出码 ${exitCode})。` : `  ✖ composer install failed with exit code ${exitCode}.`));
      process.exit(1);
    }
  }

  console.log(
    pc.bold(
      pc.green(
        zh
          ? `✔ 项目 ${proj.name} 依赖安装成功！\n`
          : `✔ Project ${proj.name} dependencies installed successfully!\n`
      )
    )
  );
}
