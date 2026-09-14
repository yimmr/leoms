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
import { promptProjectSelection, promptEcosystemChoice } from "../utils/prompt.js";
import { spawnCommand } from "../utils/exec.js";
import type { ProjectModel } from "../core/types.js";

export interface RemoveCommandOptions {
  project?: string;
  php?: boolean;
  npm?: boolean;
}

export async function runRemove(
  packages: string[],
  options: RemoveCommandOptions = {}
): Promise<void> {
  if (!packages || packages.length === 0) {
    console.error(pc.red("✖ Please specify at least one package to remove."));
    console.log(pc.dim("Example: leoms remove lodash"));
    process.exit(1);
  }

  const rootDir = findWorkspaceRoot();
  if (!rootDir) {
    console.error(pc.red("✖ Cannot locate workspace root."));
    process.exit(1);
  }

  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const composerEnv = getComposerEnv(rootDir);

  // Step 1: Resolve target project
  let targetProj: ProjectModel;

  if (options.project) {
    const { targets } = resolveTargetProjects(projects, rootDir, options.project);
    if (targets.length === 0) {
      console.error(pc.red(`✖ No project found matching "${options.project}".`));
      process.exit(1);
    }
    targetProj = targets[0];
  } else {
    const cwdProj = getProjectFromCwd(projects, rootDir);
    if (cwdProj) {
      targetProj = cwdProj;
    } else {
      targetProj = await promptProjectSelection(
        projects,
        "Select target project to remove dependencies from:"
      );
    }
  }

  // Step 2: Determine ecosystem
  let ecosystem: "npm" | "composer";

  if (targetProj.packageManager === "npm") {
    ecosystem = "npm";
  } else if (targetProj.packageManager === "composer") {
    ecosystem = "composer";
  } else {
    // Hybrid project: Check explicit flags first
    if (options.npm) {
      ecosystem = "npm";
    } else if (options.php) {
      ecosystem = "composer";
    } else {
      // Inspect manifests to see where the packages are declared
      const existsInNpm = packagesInNpm(targetProj.path, packages);
      const existsInComposer = packagesInComposer(targetProj.path, packages);

      if (existsInNpm && !existsInComposer) {
        ecosystem = "npm";
      } else if (existsInComposer && !existsInNpm) {
        ecosystem = "composer";
      } else {
        ecosystem = await promptEcosystemChoice(
          targetProj.name,
          "package manager to remove dependencies from"
        );
      }
    }
  }

  console.log(
    pc.bold(
      `\n🗑️ Removing dependencies from ${pc.cyan(targetProj.name)} ${pc.dim(
        `(${targetProj.relativeDir})`
      )} via ${ecosystem === "npm" ? pc.green("NPM (pnpm)") : pc.blue("Composer")}...\n`
    )
  );

  if (ecosystem === "npm") {
    await removeNpmDependencies(targetProj, packages, rootDir);
  } else {
    await removeComposerDependencies(targetProj, packages, composerEnv);
  }
}

function packagesInNpm(projectPath: string, pkgs: string[]): boolean {
  const pkgJsonPath = join(projectPath, "package.json");
  if (!existsSync(pkgJsonPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    return pkgs.some((p) => Boolean(all[p]));
  } catch {
    return false;
  }
}

function packagesInComposer(projectPath: string, pkgs: string[]): boolean {
  const compJsonPath = join(projectPath, "composer.json");
  if (!existsSync(compJsonPath)) return false;
  try {
    const comp = JSON.parse(readFileSync(compJsonPath, "utf8"));
    const all = { ...comp.require, ...comp["require-dev"] };
    return pkgs.some((p) => Boolean(all[p]));
  } catch {
    return false;
  }
}

function cleanPackageName(spec: string): string {
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    if (slash !== -1) {
      const at = spec.indexOf("@", slash + 1);
      const colon = spec.indexOf(":", slash + 1);
      const cut = at !== -1 ? at : colon;
      return cut !== -1 ? spec.slice(0, cut) : spec;
    }
    return spec;
  }
  const at = spec.indexOf("@");
  const colon = spec.indexOf(":");
  let cut = -1;
  if (at !== -1 && colon !== -1) cut = Math.min(at, colon);
  else if (at !== -1) cut = at;
  else if (colon !== -1) cut = colon;
  return cut !== -1 ? spec.slice(0, cut) : spec;
}

async function removeNpmDependencies(
  targetProj: ProjectModel,
  packages: string[],
  rootDir: string
): Promise<void> {
  const cleanPkgs = packages.map(cleanPackageName);
  const args = ["--filter", targetProj.name, "remove", ...cleanPkgs];
  console.log(pc.cyan(`➜ Running: pnpm ${args.join(" ")}\n`));
  try {
    const { exitCode } = await spawnCommand("pnpm", args, {
      cwd: rootDir,
      stdio: "inherit",
    });

    if (exitCode !== 0) {
      console.error(pc.red(`\n✖ Failed to remove dependencies via pnpm (exit code ${exitCode}).`));
      process.exit(exitCode);
    }

    console.log(
      pc.green(`\n✔ Successfully removed ${cleanPkgs.map((p) => pc.bold(p)).join(", ")} from ${targetProj.name}!`)
    );
  } catch (err: any) {
    console.error(pc.red(`\n✖ Error executing pnpm: ${err.message}`));
    process.exit(1);
  }
}

async function removeComposerDependencies(
  targetProj: ProjectModel,
  packages: string[],
  composerEnv: NodeJS.ProcessEnv
): Promise<void> {
  const cleanPkgs = packages.map(cleanPackageName);
  const args = ["remove", ...cleanPkgs];
  console.log(pc.blue(`➜ Running: composer ${args.join(" ")} in ${targetProj.relativeDir}\n`));
  try {
    const { exitCode } = await spawnCommand("composer", args, {
      cwd: targetProj.path,
      env: composerEnv,
      stdio: "inherit",
    });

    if (exitCode !== 0) {
      console.error(pc.red(`\n✖ Failed to remove dependencies via composer (exit code ${exitCode}).`));
      process.exit(exitCode);
    }

    console.log(
      pc.green(`\n✔ Successfully removed ${cleanPkgs.map((p) => pc.bold(p)).join(", ")} from ${targetProj.name}!`)
    );
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.error(pc.red("\n✖ Composer CLI not found in PATH. Please install Composer."));
    } else {
      console.error(pc.red(`\n✖ Error executing composer: ${err.message}`));
    }
    process.exit(1);
  }
}
