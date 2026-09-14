import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bumpVersion } from "../utils/semver.js";
import { execCommand } from "../utils/exec.js";
import type { ProjectModel, WorkspaceContext } from "./types.js";
import type { PublishPlan, PublishStep } from "./topology.js";

export interface PublishOptions {
  dryRun?: boolean;
  noPush?: boolean;
  bump?: "patch" | "minor" | "major";
  targetVersion?: string;
  skipBuild?: boolean;
}

export interface StepExecutionResult {
  step: PublishStep;
  oldVersion: string;
  newVersion: string;
  bumpedFiles: string[];
  built: boolean;
  gitCommitted: boolean;
  gitTagged: boolean;
  pushed: boolean;
  registryPublished: boolean;
  logs: string[];
}

export interface PublishExecutionReport {
  dryRun: boolean;
  success: boolean;
  results: StepExecutionResult[];
  errorMessage?: string;
}

/**
 * Update version field in package.json
 */
function updateNpmVersion(pkgJsonPath: string, newVersion: string): boolean {
  if (!existsSync(pkgJsonPath)) return false;
  try {
    const raw = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    raw.version = newVersion;
    writeFileSync(pkgJsonPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Update version field in composer.json
 */
function updateComposerVersion(compJsonPath: string, newVersion: string): boolean {
  if (!existsSync(compJsonPath)) return false;
  try {
    const raw = JSON.parse(readFileSync(compJsonPath, "utf8"));
    raw.version = newVersion;
    writeFileSync(compJsonPath, JSON.stringify(raw, null, 4) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Cascade dependency version update in an upstream dependent project
 */
function cascadeDependencyVersion(
  dependentProject: ProjectModel,
  targetPkgName: string,
  newVersion: string,
  ecosystem: "npm" | "composer"
): boolean {
  if (ecosystem === "npm") {
    const pkgJsonPath = join(dependentProject.path, "package.json");
    if (!existsSync(pkgJsonPath)) return false;
    try {
      const raw = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      let changed = false;

      if (raw.dependencies && raw.dependencies[targetPkgName]) {
        raw.dependencies[targetPkgName] = `^${newVersion}`;
        changed = true;
      }
      if (raw.devDependencies && raw.devDependencies[targetPkgName]) {
        raw.devDependencies[targetPkgName] = `^${newVersion}`;
        changed = true;
      }
      if (changed) {
        writeFileSync(pkgJsonPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
        return true;
      }
    } catch {
      return false;
    }
  } else {
    const compJsonPath = join(dependentProject.path, "composer.json");
    if (!existsSync(compJsonPath)) return false;
    try {
      const raw = JSON.parse(readFileSync(compJsonPath, "utf8"));
      let changed = false;

      if (raw.require && raw.require[targetPkgName]) {
        raw.require[targetPkgName] = `^${newVersion}`;
        changed = true;
      }
      if (raw["require-dev"] && raw["require-dev"][targetPkgName]) {
        raw["require-dev"][targetPkgName] = `^${newVersion}`;
        changed = true;
      }
      if (changed) {
        writeFileSync(compJsonPath, JSON.stringify(raw, null, 4) + "\n", "utf8");
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function executePublishPlan(
  plan: PublishPlan,
  allProjects: ProjectModel[],
  ctx: WorkspaceContext,
  options: PublishOptions = {}
): Promise<PublishExecutionReport> {
  const isDryRun = Boolean(options.dryRun);
  const isNoPush = Boolean(options.noPush);
  const bumpType = options.bump || "patch";

  const projectMap = new Map<string, ProjectModel>();
  for (const p of allProjects) {
    projectMap.set(p.name, p);
  }

  const results: StepExecutionResult[] = [];
  // Keep track of newly assigned versions during this publish run
  const newVersionMap = new Map<string, string>();

  for (const step of plan.orderedSteps) {
    const proj = step.project;
    const oldVer = proj.version || "0.0.0";
    const newVer = options.targetVersion || bumpVersion(oldVer, bumpType);
    newVersionMap.set(proj.name, newVer);

    const stepResult: StepExecutionResult = {
      step,
      oldVersion: oldVer,
      newVersion: newVer,
      bumpedFiles: [],
      built: false,
      gitCommitted: false,
      gitTagged: false,
      pushed: false,
      registryPublished: false,
      logs: [],
    };

    stepResult.logs.push(`Assigning version v${newVer} (was v${oldVer})`);

    // 1. Update version in this package's manifests
    if (!isDryRun) {
      if (proj.packageManager === "npm" || proj.packageManager === "hybrid") {
        const pkgJson = join(proj.path, "package.json");
        if (updateNpmVersion(pkgJson, newVer)) {
          stepResult.bumpedFiles.push("package.json");
        }
      }
      if (proj.packageManager === "composer" || proj.packageManager === "hybrid") {
        const compJson = join(proj.path, "composer.json");
        if (updateComposerVersion(compJson, newVer)) {
          stepResult.bumpedFiles.push("composer.json");
        }
      }
    } else {
      stepResult.bumpedFiles.push("manifests (simulated)");
    }

    // 2. Cascade version update to dependents within the workspace
    for (const depName of proj.dependents) {
      const dependentProj = projectMap.get(depName);
      if (dependentProj) {
        stepResult.logs.push(`Cascading version to dependent ${dependentProj.name}`);
        if (!isDryRun) {
          const eco = proj.packageManager === "composer" ? "composer" : "npm";
          cascadeDependencyVersion(dependentProj, proj.name, newVer, eco);
        }
      }
    }

    // 3. Pre-release build if required
    if (proj.needsBuild && !options.skipBuild) {
      stepResult.logs.push(`Executing build: pnpm --filter ${proj.name} build`);
      if (!isDryRun) {
        const buildExec = await execCommand("pnpm", ["--filter", proj.name, "build"], {
          cwd: ctx.rootDir,
        });
        if (buildExec.exitCode === 0) {
          stepResult.built = true;
        } else {
          stepResult.logs.push(`Build warning: ${buildExec.stderr || buildExec.stdout}`);
        }
      } else {
        stepResult.built = true;
      }
    }

    // 4. Git Operations (Commit & Tag)
    if (proj.git.isGitRepo) {
      const tagString = `v${newVer}`;
      const commitMsg = `chore(release): ${proj.name}@${tagString}`;

      stepResult.logs.push(`Git commit & tag in ${proj.relativeDir} (${tagString})`);

      if (!isDryRun) {
        // Stage modified manifests
        await execCommand("git", ["-C", proj.path, "add", "-A"]);
        const commitExec = await execCommand("git", ["-C", proj.path, "commit", "-m", commitMsg]);
        if (commitExec.exitCode === 0) {
          stepResult.gitCommitted = true;
        }

        // Tag
        const tagExec = await execCommand("git", ["-C", proj.path, "tag", tagString]);
        if (tagExec.exitCode === 0) {
          stepResult.gitTagged = true;
        }

        // Push if enabled
        if (!isNoPush) {
          const branch = proj.git.branch || "main";
          stepResult.logs.push(`Pushing to git origin ${branch} --tags`);
          const pushExec = await execCommand("git", [
            "-C",
            proj.path,
            "push",
            "origin",
            branch,
            "--tags",
          ]);
          if (pushExec.exitCode === 0) {
            stepResult.pushed = true;
          } else {
            stepResult.logs.push(`Git push note: ${pushExec.stderr || "remote push skipped/failed"}`);
          }
        }
      } else {
        stepResult.gitCommitted = true;
        stepResult.gitTagged = true;
        if (!isNoPush) stepResult.pushed = true;
      }
    }

    // 5. Package Registry Distribution
    if (proj.packageManager === "npm" && !proj.private && step.action === "publish") {
      stepResult.logs.push(`Publishing to npm registry`);
      if (!isDryRun && !isNoPush) {
        const pubArgs = ["--filter", proj.name, "publish", "--no-git-checks"];
        const pubExec = await execCommand("pnpm", pubArgs, { cwd: ctx.rootDir });
        if (pubExec.exitCode === 0) {
          stepResult.registryPublished = true;
        } else {
          stepResult.logs.push(`npm publish output: ${pubExec.stderr || pubExec.stdout}`);
        }
      } else {
        stepResult.registryPublished = true;
      }
    } else if (proj.packageManager === "composer") {
      stepResult.logs.push(`Composer package release: Tag pushed to trigger Packagist webhook`);
      stepResult.registryPublished = true;
    }

    results.push(stepResult);
  }

  return {
    dryRun: isDryRun,
    success: true,
    results,
  };
}
