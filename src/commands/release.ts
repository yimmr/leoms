import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pc from "picocolors";
import Table from "cli-table3";
import {
  findWorkspaceRoot,
  getWorkspaceContext,
  getProjectFromCwd,
  resolveTargetProjects,
} from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { promptProjectSelection, promptVersionSelection, promptConfirm } from "../utils/prompt.js";
import { bumpVersion } from "../utils/semver.js";
import { execCommand, spawnCommand } from "../utils/exec.js";
import { executeChecks } from "../core/checks/index.js";
import { runPublish } from "./publish.js";
import { msg } from "../core/i18n.js";
import type { ProjectModel } from "../core/types.js";

export interface ReleaseCommandOptions {
  project?: string;
  patch?: boolean;
  minor?: boolean;
  major?: boolean;
  to?: string;
  publish?: boolean;
  push?: boolean;
  tag?: boolean;
  cascade?: boolean;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
  script?: string;
}

export async function runRelease(
  targetPattern?: string,
  options: ReleaseCommandOptions = {}
): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const isDryRun = Boolean(options.dryRun);
  const isPush = options.push !== false;
  const isTag = options.tag !== false;
  const isCascade = options.cascade !== false;

  console.log(
    pc.bold(
      msg(
        `\n🔖 多仓库发版生命周期管理器 (release) ${isDryRun ? pc.yellow("[模拟预览 DRY-RUN]") : ""}\n`,
        `\n🔖 Multi-Repo Release Lifecycle Manager ${isDryRun ? pc.yellow("[DRY-RUN SIMULATION]") : ""}\n`
      )
    )
  );

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  // 1. Resolve Target Project
  let targetProj: ProjectModel;

  const effectiveTarget = options.project || targetPattern;

  if (effectiveTarget) {
    const { targets } = resolveTargetProjects(projects, rootDir, effectiveTarget);
    if (targets.length === 0) {
      console.error(pc.red(msg(`✖ 未找到匹配 "${effectiveTarget}" 的项目。`, `✖ No project found matching "${effectiveTarget}".`)));
      process.exit(1);
    }
    targetProj = targets[0];
  } else {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      targetProj = cwdProj;
    } else {
      targetProj = await promptProjectSelection(projects, msg("请选择要发版的项目:", "Select project to release:"));
    }
  }

  console.log(
    `${pc.cyan(msg("● 目标项目:", "● Target Project:"))} ${pc.bold(targetProj.name)} ${pc.dim(
      `(${targetProj.relativeDir})`
    )} [${pc.magenta(targetProj.packageManager)}]\n`
  );

  // 2. Pre-flight Full Health & Standalone Safety Checks
  if (!options.force) {
    console.log(pc.cyan(msg("正在执行发版前全量健康与离仓自洽安全门禁...", "Running pre-release full health & standalone safety checks...")));
    const checkResult = await executeChecks({
      targets: [targetProj],
      all: true,
    });

    if (!checkResult.passed) {
      console.error(
        pc.red(
          msg(
            `\n✖ 发版已阻断：目标项目未通过发版前全量门禁检查。请先解决上述问题，或添加 '--force' 强制发版。\n`,
            `\n✖ Cannot release: Target project failed pre-release full gatekeeper checks. Resolve issues or pass '--force'.\n`
          )
        )
      );
      process.exit(1);
    }

    if (targetProj.git.isGitRepo && targetProj.git.isDirty && !isDryRun) {
      if (process.stdin.isTTY) {
        const proceed = await promptConfirm(
          msg("目标代码仓库存在未提交的代码变动，是否继续发版？", "Target repository has uncommitted changes. Proceed with release?"),
          false
        );
        if (!proceed) {
          console.log(pc.dim(msg("发版流程已取消。", "Release cancelled.")));
          process.exit(0);
        }
      }
    }
  }

  // 3. Determine New Version
  const currentVer = targetProj.version || "0.1.0";
  let newVer: string;

  if (options.to) {
    newVer = options.to;
  } else if (options.major) {
    newVer = bumpVersion(currentVer, "major");
  } else if (options.minor) {
    newVer = bumpVersion(currentVer, "minor");
  } else if (options.patch) {
    newVer = bumpVersion(currentVer, "patch");
  } else if (process.stdin.isTTY && !isDryRun) {
    newVer = await promptVersionSelection(targetProj.name, currentVer);
  } else {
    newVer = bumpVersion(currentVer, "patch");
  }

  console.log(
    pc.bold(
      `\n🚀 Releasing ${pc.cyan(targetProj.name)}: ${pc.dim(`v${currentVer}`)} ➜ ${pc.green(
        `v${newVer}`
      )}\n`
    )
  );

  // 4. Update Target Manifests
  const updatedFiles: string[] = [];

  if (!isDryRun) {
    // Update package.json
    const pkgJsonPath = join(targetProj.path, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const raw = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        raw.version = newVer;
        writeFileSync(pkgJsonPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
        updatedFiles.push(join(targetProj.relativeDir, "package.json"));
      } catch (err: any) {
        console.error(pc.red(`✖ Failed to update package.json: ${err.message}`));
        process.exit(1);
      }
    }

    // Update composer.json
    const compJsonPath = join(targetProj.path, "composer.json");
    if (existsSync(compJsonPath)) {
      try {
        const raw = JSON.parse(readFileSync(compJsonPath, "utf8"));
        raw.version = newVer;
        writeFileSync(compJsonPath, JSON.stringify(raw, null, 4) + "\n", "utf8");
        updatedFiles.push(join(targetProj.relativeDir, "composer.json"));
      } catch (err: any) {
        console.error(pc.red(`✖ Failed to update composer.json: ${err.message}`));
        process.exit(1);
      }
    }
  } else {
    updatedFiles.push(`${targetProj.relativeDir}/manifests (simulated)`);
  }

  // 5. Downstream Workspace Dependency Cascading
  const cascadedProjects: Array<{ name: string; file: string; newConstraint: string }> = [];

  if (isCascade) {
    const dependentNames = new Set(targetProj.dependents);
    for (const other of projects) {
      if (!dependentNames.has(other.name)) continue;

      // Check npm dependencies
      const otherPkgPath = join(other.path, "package.json");
      if (existsSync(otherPkgPath)) {
        try {
          const raw = JSON.parse(readFileSync(otherPkgPath, "utf8"));
          let modified = false;
          if (raw.dependencies && raw.dependencies[targetProj.name]) {
            raw.dependencies[targetProj.name] = `^${newVer}`;
            modified = true;
          }
          if (raw.devDependencies && raw.devDependencies[targetProj.name]) {
            raw.devDependencies[targetProj.name] = `^${newVer}`;
            modified = true;
          }
          if (modified) {
            if (!isDryRun) {
              writeFileSync(otherPkgPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
            }
            cascadedProjects.push({
              name: other.name,
              file: `${other.relativeDir}/package.json`,
              newConstraint: `^${newVer}`,
            });
          }
        } catch {}
      }

      // Check composer dependencies
      const otherCompPath = join(other.path, "composer.json");
      if (existsSync(otherCompPath)) {
        try {
          const raw = JSON.parse(readFileSync(otherCompPath, "utf8"));
          let modified = false;
          if (raw.require && raw.require[targetProj.name]) {
            raw.require[targetProj.name] = `^${newVer}`;
            modified = true;
          }
          if (raw["require-dev"] && raw["require-dev"][targetProj.name]) {
            raw["require-dev"][targetProj.name] = `^${newVer}`;
            modified = true;
          }
          if (modified) {
            if (!isDryRun) {
              writeFileSync(otherCompPath, JSON.stringify(raw, null, 4) + "\n", "utf8");
            }
            cascadedProjects.push({
              name: other.name,
              file: `${other.relativeDir}/composer.json`,
              newConstraint: `^${newVer}`,
            });
          }
        } catch {}
      }
    }
  }

  // 6. Git Operations (Commit, Tag, Push)
  let gitCommitted = false;
  let gitTagged = false;
  let gitPushed = false;
  const tagString = `v${newVer}`;
  const commitMsg = options.message || `chore(release): ${targetProj.name}@${tagString}`;

  if (targetProj.git.isGitRepo) {
    if (!isDryRun) {
      console.log(pc.cyan(`📦 Staging and committing release in ${targetProj.relativeDir}...`));
      await execCommand("git", ["-C", targetProj.path, "add", "-A"]);
      const commitRes = await execCommand("git", ["-C", targetProj.path, "commit", "-m", commitMsg]);
      gitCommitted = commitRes.exitCode === 0;

      if (isTag) {
        console.log(pc.cyan(`🏷 Creating Git tag ${tagString}...`));
        const tagRes = await execCommand("git", ["-C", targetProj.path, "tag", tagString]);
        gitTagged = tagRes.exitCode === 0;
      }

      if (isPush) {
        const branch = targetProj.git.branch || "main";
        const remotes = ctx.config.release?.remotes && ctx.config.release.remotes.length > 0
          ? ctx.config.release.remotes
          : ["origin"];

        let allPushed = true;
        for (const remote of remotes) {
          console.log(pc.cyan(`🚀 Pushing commits and tags to ${remote}/${branch}...`));
          const pushRes = await execCommand("git", [
            "-C",
            targetProj.path,
            "push",
            remote,
            branch,
            "--tags",
          ]);
          if (pushRes.exitCode !== 0) {
            allPushed = false;
            if (pushRes.stderr) {
              console.log(pc.yellow(`ℹ Push note (${remote}): ${pushRes.stderr.trim()}`));
            }
          }
        }
        gitPushed = allPushed;
      }
    } else {
      gitCommitted = true;
      gitTagged = isTag;
      gitPushed = isPush;
    }
  }

  // 6.5 Optional Custom Release Script Entry Point (essential args only: $1=project_path, $2=version)
  const activeReleaseScript = options.script || ctx.config.release?.script;
  let releaseScriptPath: string | null = null;

  if (activeReleaseScript) {
    const resolved = resolve(rootDir, activeReleaseScript);
    if (existsSync(resolved)) {
      releaseScriptPath = resolved;
    } else {
      console.error(pc.red(`✖ Specified release script not found: ${activeReleaseScript}`));
    }
  } else {
    // Project-level auto-discovery
    const projectReleaseScript = join(targetProj.path, "scripts", "release.sh");
    if (existsSync(projectReleaseScript)) {
      releaseScriptPath = projectReleaseScript;
    } else {
      // Workspace-level auto-discovery in root tools/
      const toolsReleaseScript = join(rootDir, "tools", "release.sh");
      if (existsSync(toolsReleaseScript)) {
        releaseScriptPath = toolsReleaseScript;
      }
    }
  }

  if (releaseScriptPath) {
    console.log(pc.cyan(`\n➜ Invoking custom release script: ${pc.bold(releaseScriptPath)}`));
    console.log(pc.dim(`  Args: [${targetProj.path}, ${newVer}]\n`));
    if (!isDryRun) {
      try {
        await spawnCommand("bash", [releaseScriptPath, targetProj.path, newVer], {
          cwd: targetProj.path,
          stdio: "inherit",
        });
      } catch (err: any) {
        console.error(pc.red(`✖ Release script error: ${err.message}`));
      }
    } else {
      console.log(pc.yellow("💡 DRY-RUN simulation: Release script will not be executed."));
    }
  }

  // 7. Render Execution Summary Table
  const table = new Table({
    head: [pc.cyan("Step"), pc.cyan("Action"), pc.cyan("Status / Result")],
    colWidths: [8, 28, 48],
    wordWrap: true,
  });

  table.push([
    pc.bold("#1"),
    "Version Bumping",
    `${pc.dim("v" + currentVer)} ➜ ${pc.bold(pc.green("v" + newVer))} (${updatedFiles.join(", ")})`,
  ]);

  table.push([
    pc.bold("#2"),
    "Downstream Cascades",
    cascadedProjects.length > 0
      ? cascadedProjects.map((c) => `${pc.bold(c.name)}: ${pc.cyan(c.newConstraint)}`).join("\n")
      : pc.dim("No dependents in workspace requiring update"),
  ]);

  if (targetProj.git.isGitRepo) {
    table.push([
      pc.bold("#3"),
      "Git Commit",
      gitCommitted
        ? pc.green(`✔ ${commitMsg}`)
        : isDryRun
        ? pc.yellow("simulated commit")
        : pc.red("✖ Commit failed or clean"),
    ]);

    if (isTag) {
      table.push([
        pc.bold("#4"),
        "Git Tag",
        gitTagged
          ? pc.green(`✔ Tag ${tagString} created`)
          : isDryRun
          ? pc.yellow(`simulated tag ${tagString}`)
          : pc.red("✖ Tag failed"),
      ]);
    }

    if (isPush) {
      table.push([
        pc.bold("#5"),
        "Git Remote Push",
        gitPushed
          ? pc.green(`✔ Pushed to GitHub/remote (${targetProj.git.branch || "main"} + tags)`)
          : isDryRun
          ? pc.yellow("simulated push")
          : pc.yellow("⚠ Push skipped or check remote credentials"),
      ]);
    }
  }

  console.log(table.toString());
  console.log("");

  if (targetProj.packageManager === "composer") {
    console.log(
      pc.green(
        `🎉 PHP Package ${pc.bold(targetProj.name)} release complete!\n` +
          `   Tag ${pc.bold(tagString)} is pushed to GitHub. Packagist webhook will auto-sync metadata.\n`
      )
    );
  } else {
    console.log(
      pc.green(`🎉 Release for ${pc.bold(targetProj.name)} (v${newVer}) completed successfully!\n`)
    );
  }

  // 8. Optional Publish Step (--publish or -p)
  if (options.publish) {
    console.log(pc.bold(pc.cyan(`\n📦 Auto-chaining into publish step for ${targetProj.name}...\n`)));
    await runPublish(targetProj.name, {
      dryRun: isDryRun,
    });
  }
}
