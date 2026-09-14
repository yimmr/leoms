import pc from "picocolors";
import {
  findWorkspaceRoot,
  getWorkspaceContext,
  getProjectFromCwd,
  resolveTargetProjects,
} from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { promptProjectSelection } from "../utils/prompt.js";
import { spawnCommand, execCommand } from "../utils/exec.js";
import type { ProjectModel } from "../core/types.js";

export interface PublishCommandOptions {
  project?: string;
  dryRun?: boolean;
  tag?: string;
  access?: "public" | "restricted";
  noBuild?: boolean;
  force?: boolean;
}

export async function runPublish(
  targetPattern?: string,
  options: PublishCommandOptions = {}
): Promise<void> {
  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const isDryRun = Boolean(options.dryRun);

  console.log(
    pc.bold(
      `\n🚀 Package Registry Distribution (publish) ${
        isDryRun ? pc.yellow("[DRY-RUN SIMULATION]") : ""
      }\n`
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
      console.error(pc.red(`✖ No project found matching "${effectiveTarget}".`));
      process.exit(1);
    }
    targetProj = targets[0];
  } else {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      targetProj = cwdProj;
    } else {
      // In root directory, interactively select target
      targetProj = await promptProjectSelection(
        projects,
        "Select target package to publish to registry:"
      );
    }
  }

  console.log(
    `${pc.cyan("● Target Package:")} ${pc.bold(targetProj.name)} ${pc.dim(
      `(${targetProj.relativeDir})`
    )} [${pc.magenta(targetProj.packageManager)}] (v${targetProj.version || "unknown"})\n`
  );

  // 2. Private Package Check
  if (targetProj.private && !options.force) {
    console.error(
      pc.red(
        `✖ Refusing to publish: "${targetProj.name}" is marked as private ("private": true).\n` +
          `  If you intend to publish this internal/private package, use '--force'.`
      )
    );
    process.exit(1);
  }

  // 3. Pre-Publish Build
  if (targetProj.needsBuild && !options.noBuild) {
    console.log(pc.cyan(`📦 Running pre-publish build for ${targetProj.name}...`));
    const buildRes = await spawnCommand("pnpm", ["--filter", targetProj.name, "build"], {
      cwd: rootDir,
      stdio: "inherit",
    });
    if (buildRes.exitCode !== 0) {
      console.error(pc.red(`✖ Pre-publish build failed with code ${buildRes.exitCode}.`));
      process.exit(buildRes.exitCode);
    }
    console.log(pc.green("✔ Pre-publish build succeeded!\n"));
  }

  // 4. Ecosystem-Specific Registry Publishing
  if (targetProj.packageManager === "npm" || targetProj.packageManager === "hybrid") {
    // Node / npm publishing via pnpm
    const pubArgs = ["--filter", targetProj.name, "publish", "--no-git-checks"];
    if (isDryRun) pubArgs.push("--dry-run");
    if (options.tag) pubArgs.push("--tag", options.tag);
    if (options.access) pubArgs.push("--access", options.access);

    console.log(pc.cyan(`➜ Running: pnpm ${pubArgs.join(" ")}`));
    console.log(
      pc.dim(
        `ℹ Note: pnpm publish automatically transforms "workspace:^" references into registry SemVer ranges.`
      )
    );
    console.log("");

    try {
      const { exitCode } = await spawnCommand("pnpm", pubArgs, {
        cwd: rootDir,
        stdio: "inherit",
      });

      if (exitCode !== 0) {
        console.error(pc.red(`\n✖ pnpm publish failed with exit code ${exitCode}.`));
        process.exit(exitCode);
      }

      console.log(
        pc.green(
          `\n🎉 Successfully published ${pc.bold(targetProj.name)}@${
            targetProj.version || "latest"
          } to npm registry!\n`
        )
      );
    } catch (err: any) {
      console.error(pc.red(`\n✖ Error executing pnpm publish: ${err.message}`));
      process.exit(1);
    }
  } else if (targetProj.packageManager === "composer") {
    // PHP / Composer publishing
    console.log(
      pc.blue(`ℹ PHP packages are decentralized and distributed via GitHub Git Tags.`)
    );

    const versionTag = `v${targetProj.version}`;
    let tagExists = false;

    if (targetProj.git.isGitRepo) {
      const tagCheck = await execCommand("git", ["-C", targetProj.path, "tag", "-l", versionTag]);
      tagExists = tagCheck.stdout.trim() === versionTag;
    }

    if (tagExists) {
      console.log(pc.green(`✔ Git tag ${pc.bold(versionTag)} is confirmed in local Git repository.`));
      console.log(
        pc.cyan(`ℹ Packagist Webhook automatically discovers new releases when tags are pushed to GitHub.`)
      );
      console.log(
        pc.dim(`  Package URL: https://packagist.org/packages/${targetProj.name}`)
      );
      console.log(
        pc.green(
          `\n🎉 PHP package distribution confirmed for ${pc.bold(targetProj.name)} (${versionTag})!\n`
        )
      );
    } else {
      console.log(
        pc.yellow(
          `⚠ Warning: Git tag ${pc.bold(versionTag)} not found for ${targetProj.name}.\n` +
            `  In PHP / Composer, packages must be tagged before Packagist can index them.\n` +
            `  Tip: Run \`leoms release ${targetProj.name}\` to create the tag and push to GitHub.\n`
        )
      );
    }
  }
}
