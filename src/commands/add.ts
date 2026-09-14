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

export interface AddCommandOptions {
  project?: string;
  dev?: boolean;
  php?: boolean;
  npm?: boolean;
}

export async function runAdd(
  packages: string[],
  options: AddCommandOptions = {}
): Promise<void> {
  if (!packages || packages.length === 0) {
    console.error(pc.red("✖ Please specify at least one package to add."));
    console.log(pc.dim("Example: leoms add lodash"));
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
      // In root directory, interactively select project
      targetProj = await promptProjectSelection(
        projects,
        "Select target project to add dependencies to:"
      );
    }
  }

  // Step 2: Determine ecosystem (NPM vs Composer)
  let ecosystem: "npm" | "composer";

  if (targetProj.packageManager === "npm") {
    ecosystem = "npm";
  } else if (targetProj.packageManager === "composer") {
    ecosystem = "composer";
  } else {
    // Hybrid project: Check explicit flags or prompt
    if (options.npm) {
      ecosystem = "npm";
    } else if (options.php) {
      ecosystem = "composer";
    } else {
      ecosystem = await promptEcosystemChoice(targetProj.name, "target dependency manager");
    }
  }

  console.log(
    pc.bold(
      `\n➕ Adding dependencies to ${pc.cyan(targetProj.name)} ${pc.dim(
        `(${targetProj.relativeDir})`
      )} via ${ecosystem === "npm" ? pc.green("NPM (pnpm)") : pc.blue("Composer")}...\n`
    )
  );

  if (ecosystem === "npm") {
    await addNpmDependencies(targetProj, packages, options, projects, rootDir);
  } else {
    await addComposerDependencies(targetProj, packages, options, composerEnv, projects);
  }
}

async function addNpmDependencies(
  targetProj: ProjectModel,
  packages: string[],
  options: AddCommandOptions,
  workspaceProjects: ProjectModel[],
  rootDir: string
): Promise<void> {
  const internalNames = new Set(workspaceProjects.map((p) => p.name));

  // Parse package specs and apply smart defaults while preserving user-specified constraints
  const finalPkgs = packages.map((pkg) => {
    const { name, versionSpec } = parseNpmPackageSpec(pkg);
    if (internalNames.has(name)) {
      if (versionSpec) {
        // User explicitly specified constraint (e.g. pkg@workspace:*, pkg@^1.0.0, pkg@workspace:~)
        return `${name}@${versionSpec}`;
      }
      // Smart default for multi-repo workspace linking: workspace:^
      // This preserves caret range compatibility when packaged/published while linking locally
      return `${name}@workspace:^`;
    }
    return pkg;
  });

  const args = ["--filter", targetProj.name, "add", ...finalPkgs];
  if (options.dev) {
    args.push("-D");
  }

  console.log(pc.cyan(`➜ Running: pnpm ${args.join(" ")}\n`));
  try {
    const { exitCode } = await spawnCommand("pnpm", args, {
      cwd: rootDir,
      stdio: "inherit",
    });

    if (exitCode !== 0) {
      console.error(pc.red(`\n✖ Failed to add dependencies via pnpm (exit code ${exitCode}).`));
      process.exit(exitCode);
    }

    console.log(
      pc.green(`\n✔ Successfully added ${finalPkgs.map((p) => pc.bold(p)).join(", ")} to ${targetProj.name}!`)
    );
  } catch (err: any) {
    console.error(pc.red(`\n✖ Error executing pnpm: ${err.message}`));
    process.exit(1);
  }
}

async function addComposerDependencies(
  targetProj: ProjectModel,
  packages: string[],
  options: AddCommandOptions,
  composerEnv: NodeJS.ProcessEnv,
  workspaceProjects: ProjectModel[]
): Promise<void> {
  // Check if any package is an internal PHP project
  const internalPhpProjects = workspaceProjects.filter(
    (p) => p.packageManager === "composer" || p.packageManager === "hybrid"
  );
  const internalMap = new Map(internalPhpProjects.map((p) => [p.name, p]));

  // In multi-repo development, DO NOT inject path repositories into project's composer.json!
  // Project composer.json stays 100% clean with standard SemVer constraints.
  // Local resolution is entirely handled by COMPOSER_HOME (.leoms/composer/config.json).
  const finalPkgs = packages.map((pkg) => {
    const { name, versionSpec } = parseComposerPackageSpec(pkg);
    const internalDep = internalMap.get(name);

    if (internalDep) {
      if (versionSpec) {
        // Respect user's explicit version constraint
        return `${name}:${versionSpec}`;
      }
      if (internalDep.version) {
        // Smart default: standard SemVer caret range
        return `${name}:^${internalDep.version}`;
      }
      return `${name}:*@dev`;
    }
    if (versionSpec) {
      return `${name}:${versionSpec}`;
    }
    return name;
  });

  const args = ["require", ...finalPkgs];
  if (options.dev) {
    args.push("--dev");
  }

  console.log(pc.blue(`➜ Running: composer ${args.join(" ")} in ${targetProj.relativeDir}\n`));
  try {
    const { exitCode } = await spawnCommand("composer", args, {
      cwd: targetProj.path,
      env: composerEnv,
      stdio: "inherit",
    });

    if (exitCode !== 0) {
      console.error(pc.red(`\n✖ Failed to add dependencies via composer (exit code ${exitCode}).`));
      process.exit(exitCode);
    }

    console.log(
      pc.green(`\n✔ Successfully added ${finalPkgs.map((p) => pc.bold(p)).join(", ")} to ${targetProj.name}!`)
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

function parseNpmPackageSpec(input: string): { name: string; versionSpec?: string } {
  if (input.startsWith("@")) {
    const slash = input.indexOf("/");
    if (slash !== -1) {
      const atIndex = input.indexOf("@", slash + 1);
      if (atIndex !== -1) {
        return { name: input.slice(0, atIndex), versionSpec: input.slice(atIndex + 1) };
      }
    }
    return { name: input };
  }
  const atIndex = input.indexOf("@");
  if (atIndex !== -1) {
    return { name: input.slice(0, atIndex), versionSpec: input.slice(atIndex + 1) };
  }
  return { name: input };
}

function parseComposerPackageSpec(input: string): { name: string; versionSpec?: string } {
  let name = input;
  let versionSpec: string | undefined = undefined;

  const colonIndex = input.indexOf(":");
  if (colonIndex !== -1) {
    name = input.slice(0, colonIndex);
    versionSpec = input.slice(colonIndex + 1);
  } else {
    const atIndex = input.indexOf("@");
    if (atIndex !== -1) {
      name = input.slice(0, atIndex);
      versionSpec = input.slice(atIndex + 1);
    }
  }

  // Handle '@latest' or ':latest' gracefully for Composer -> Composer interprets '*' as latest stable
  if (versionSpec === "latest") {
    versionSpec = "*";
  }

  return { name, versionSpec };
}
