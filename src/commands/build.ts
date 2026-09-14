import { existsSync, readFileSync } from "node:fs";
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
import { calculateAffectedProjects } from "../core/affected.js";
import { sortProjectsTopologically } from "../core/topology.js";
import { spawnCommand } from "../utils/exec.js";
import { isZh } from "../core/i18n.js";
import type { ProjectModel } from "../core/types.js";

export interface BuildCommandOptions {
  project?: string;
  all?: boolean;
  affected?: boolean;
  base?: string;
  deps?: boolean; // defaults to true
  php?: boolean;
  npm?: boolean;
}

export async function runBuild(
  targetQueries: string[] = [],
  options: BuildCommandOptions = {}
): Promise<void> {
  const zh = isZh();
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red(zh ? "✖ 无法定位工作区根目录。" : "✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const composerEnv = getComposerEnv(rootDir);

  let targetsToBuild: ProjectModel[] = [];

  const effectiveTargets = [...targetQueries];
  if (options.project && !effectiveTargets.includes(options.project)) {
    effectiveTargets.push(options.project);
  }

  // Case 1: Specific targets passed on command line
  if (effectiveTargets.length > 0) {
    const targetMap = new Map<string, ProjectModel>();

    for (const query of effectiveTargets) {
      const { targets } = resolveTargetProjects(projects, rootDir, query);
      if (targets.length === 0) {
        console.error(
          pc.red(zh ? `✖ 未找到匹配 "${query}" 的项目。` : `✖ No project found matching "${query}".`)
        );
        process.exit(1);
      }
      for (const t of targets) {
        targetMap.set(t.name, t);
      }
    }

    targetsToBuild = Array.from(targetMap.values());
  }
  // Case 2: Explicit --all flag
  else if (options.all) {
    targetsToBuild = projects;
  }
  // Case 3: Explicit --affected flag
  else if (options.affected) {
    const affected = await calculateAffectedProjects(projects, { baseRef: options.base });
    targetsToBuild = affected.allAffected.map((item) => item.project);
    if (targetsToBuild.length === 0) {
      console.log(
        pc.green(
          zh
            ? "✔ 未发现受 Git 变更影响的项目，无需构建。\n"
            : "✔ Clean working tree. No affected projects to build.\n"
        )
      );
      return;
    }
  }
  // Case 4: Zero-config infer from current working directory
  else {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      targetsToBuild = [cwdProj];
    } else {
      console.log(
        pc.yellow(
          zh
            ? "⚠ 未指定构建目标，默认构建全工作区有改动的项目（如需全量请使用 `leoms build --all`）。\n"
            : "⚠ No target specified and not inside a project dir. Run with `--all` to build everything, or specify projects.\n"
        )
      );
      const affected = await calculateAffectedProjects(projects, { baseRef: options.base });
      targetsToBuild = affected.allAffected.map((item) => item.project);
      if (targetsToBuild.length === 0) {
        console.log(
          pc.green(
            zh
              ? "✔ 当前工作区无受影响的项目需要构建。\n"
              : "✔ Clean working tree. No affected projects to build.\n"
          )
        );
        return;
      }
    }
  }

  // Filter by ecosystem if requested
  if (options.php) {
    targetsToBuild = targetsToBuild.filter(
      (p) => p.packageManager === "composer" || p.packageManager === "hybrid"
    );
  } else if (options.npm) {
    targetsToBuild = targetsToBuild.filter(
      (p) => p.packageManager === "npm" || p.packageManager === "hybrid"
    );
  }

  if (targetsToBuild.length === 0) {
    console.log(pc.yellow(zh ? "⚠ 过滤后无匹配的构建目标。" : "⚠ No matching projects to build."));
    return;
  }

  // Auto-include upstream dependencies unless --no-deps is passed
  const includeDeps = options.deps !== false;
  if (includeDeps) {
    const projectMap = new Map<string, ProjectModel>();
    for (const p of projects) {
      projectMap.set(p.name, p);
    }

    const expandedMap = new Map<string, ProjectModel>();
    const queue: ProjectModel[] = [...targetsToBuild];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!expandedMap.has(current.name)) {
        expandedMap.set(current.name, current);
        for (const dep of current.workspaceDependencies) {
          const upstream = projectMap.get(dep.name);
          if (upstream && !expandedMap.has(upstream.name)) {
            queue.push(upstream);
          }
        }
      }
    }

    targetsToBuild = Array.from(expandedMap.values());
  }

  // Sort topologically according to dependency DAG
  const sortedTargets = sortProjectsTopologically(targetsToBuild);

  console.log(
    pc.bold(
      zh
        ? `\n🏗️ 开始按依赖拓扑构建 ${pc.cyan(sortedTargets.length.toString())} 个项目...\n`
        : `\n🏗️ Starting build pipeline for ${pc.cyan(sortedTargets.length.toString())} project(s)...\n`
    )
  );

  let failedCount = 0;
  let builtCount = 0;

  for (let i = 0; i < sortedTargets.length; i++) {
    const proj = sortedTargets[i];
    let ecoBadge = "";
    if (proj.packageManager === "hybrid") ecoBadge = pc.magenta("[hybrid]");
    else if (proj.packageManager === "npm") ecoBadge = pc.green("[node]");
    else if (proj.packageManager === "composer") ecoBadge = pc.blue("[php]");

    console.log(
      pc.bold(
        `[${i + 1}/${sortedTargets.length}] ${ecoBadge} ${proj.name} ${pc.dim(
          `(${proj.relativeDir})`
        )}`
      )
    );

    const result = await buildSingleProject(proj, options, rootDir, composerEnv, zh);
    if (!result.success) {
      failedCount++;
      console.error(pc.red(zh ? `✖ 构建项目 ${proj.name} 失败。\n` : `✖ Failed building ${proj.name}.\n`));
      break;
    } else {
      builtCount++;
      console.log("");
    }
  }

  if (failedCount > 0) {
    console.error(pc.red(zh ? `✖ 构建流水线因发生错误而中止。\n` : `✖ Build pipeline halted with failures.\n`));
    process.exit(1);
  } else {
    console.log(
      pc.bold(
        pc.green(
          zh
            ? `✔ 构建流水线执行完毕，成功构建 ${builtCount} 个项目！🎉\n`
            : `✔ Build pipeline finished successfully for ${builtCount} project(s)! 🎉\n`
        )
      )
    );
  }
}

async function buildSingleProject(
  proj: ProjectModel,
  options: BuildCommandOptions,
  rootDir: string,
  composerEnv: NodeJS.ProcessEnv,
  zh: boolean
): Promise<{ success: boolean; actionsExecuted: string[] }> {
  const actions: string[] = [];
  let success = true;

  const isHybrid = proj.packageManager === "hybrid";
  const hasNpm = proj.packageManager === "npm" || isHybrid;
  const hasPhp = proj.packageManager === "composer" || isHybrid;

  // 1. Node / TS Build
  if (hasNpm && !options.php) {
    const pkgJsonPath = join(proj.path, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        if (pkg.scripts && pkg.scripts.build) {
          console.log(
            pc.cyan(
              zh
                ? `  ➜ [Node] 正在执行 \`pnpm --dir ${proj.relativeDir} run build\`...`
                : `  ➜ [Node] Running \`pnpm --dir ${proj.relativeDir} run build\`...`
            )
          );
          const { exitCode } = await spawnCommand(
            "pnpm",
            ["--dir", proj.path, "run", "build"],
            {
              cwd: rootDir,
              stdio: "inherit",
            }
          );
          if (exitCode !== 0) {
            success = false;
            console.error(
              pc.red(
                zh
                  ? `  ✖ Node 构建失败: ${proj.name} (退出码 ${exitCode})。`
                  : `  ✖ Node build failed for ${proj.name} (code ${exitCode}).`
              )
            );
          } else {
            actions.push("pnpm run build");
          }
        }
      } catch (err: any) {
        success = false;
        console.error(
          pc.red(
            zh
              ? `  ✖ 读取 ${proj.name} 的 package.json 发生错误: ${err.message}`
              : `  ✖ Error reading package.json for ${proj.name}: ${err.message}`
          )
        );
      }
    }
  }

  // 2. PHP Build / Autoload Optimization
  if (hasPhp && !options.npm && success) {
    const compJsonPath = join(proj.path, "composer.json");
    if (existsSync(compJsonPath)) {
      try {
        const comp = JSON.parse(readFileSync(compJsonPath, "utf8"));
        // A: Check if custom build or compile script exists
        if (comp.scripts && (comp.scripts.build || comp.scripts.compile)) {
          const scriptName = comp.scripts.build ? "build" : "compile";
          console.log(
            pc.blue(
              zh
                ? `  ➜ [Composer] 正在执行自定义构建脚本 \`composer run ${scriptName}\` (${proj.relativeDir})...`
                : `  ➜ [Composer] Running custom script \`composer run ${scriptName}\` in ${proj.relativeDir}...`
            )
          );
          const { exitCode } = await spawnCommand("composer", ["run", scriptName], {
            cwd: proj.path,
            env: composerEnv,
            stdio: "inherit",
          });
          if (exitCode !== 0) {
            success = false;
            console.error(
              pc.red(
                zh
                  ? `  ✖ Composer ${scriptName} 脚本执行失败: ${proj.name}。`
                  : `  ✖ Composer ${scriptName} failed for ${proj.name}.`
              )
            );
          } else {
            actions.push(`composer run ${scriptName}`);
          }
        }
        // B: Autoload classmap compilation & optimization
        else {
          const vendorDir = join(proj.path, "vendor");
          if (existsSync(vendorDir)) {
            console.log(
              pc.blue(
                zh
                  ? `  ➜ [Composer] 正在编译优化类映射 (\`composer dump-autoload -o\`) (${proj.relativeDir})...`
                  : `  ➜ [Composer] Compiling classmap autoloader (\`composer dump-autoload -o\`) in ${proj.relativeDir}...`
              )
            );
            const { exitCode } = await spawnCommand("composer", ["dump-autoload", "-o"], {
              cwd: proj.path,
              env: composerEnv,
              stdio: "inherit",
            });
            if (exitCode !== 0) {
              success = false;
              console.error(
                pc.red(
                  zh
                    ? `  ✖ composer dump-autoload 优化失败: ${proj.name}。`
                    : `  ✖ composer dump-autoload failed for ${proj.name}.`
                )
              );
            } else {
              actions.push("composer dump-autoload -o");
            }
          } else {
            console.log(
              pc.yellow(
                zh
                  ? `  ⚠ [Composer] ${proj.relativeDir} 缺少 vendor 目录，跳过类映射优化（请先运行 \`leoms i\` 安装依赖）。`
                  : `  ⚠ [Composer] vendor directory missing in ${proj.relativeDir}, skipping autoload optimization (run \`leoms i\` first).`
              )
            );
          }
        }
      } catch (err: any) {
        success = false;
        console.error(
          pc.red(
            zh
              ? `  ✖ 读取 ${proj.name} 的 composer.json 发生错误: ${err.message}`
              : `  ✖ Error reading composer.json for ${proj.name}: ${err.message}`
          )
        );
      }
    }
  }

  if (actions.length === 0 && success) {
    console.log(
      pc.dim(
        zh
          ? `  ℹ ${proj.name} 未声明构建任务脚本或自动加载优化。`
          : `  ℹ No build scripts or autoload optimization needed for ${proj.name}.`
      )
    );
  }

  return { success, actionsExecuted: actions };
}
