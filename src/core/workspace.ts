import { existsSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { parse } from "yaml";
import { loadLeomsConfig } from "./config.js";
import type { WorkspaceContext } from "./types.js";

/**
 * Get workspace .leoms log directory: rootDir/.leoms/logs
 */
export function getWorkspaceLogDir(rootDir: string): string {
  const dir = join(rootDir, ".leoms", "logs");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Find workspace root by looking upwards for pnpm-workspace.yaml or .leoms
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);

  while (true) {
    const hasPnpmWorkspace = existsSync(join(current, "pnpm-workspace.yaml"));
    const hasLeomsDir = existsSync(join(current, ".leoms"));

    if (hasPnpmWorkspace || hasLeomsDir) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Resolve path that might start with ~/
 */
export function resolveUserPath(p: string, rootDir: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  if (p.startsWith("./") || !p.startsWith("/")) {
    return resolve(rootDir, p);
  }
  return p;
}

/**
 * Load complete workspace context
 */
export function getWorkspaceContext(rootDir: string): WorkspaceContext {
  let pnpmWorkspaceFile: string | undefined;
  let pnpmPackages: string[] = [];

  const pnpmFile = join(rootDir, "pnpm-workspace.yaml");
  if (existsSync(pnpmFile)) {
    pnpmWorkspaceFile = pnpmFile;
    try {
      const parsed = parse(readFileSync(pnpmFile, "utf8"));
      if (parsed && Array.isArray(parsed.packages)) {
        pnpmPackages = parsed.packages;
      }
    } catch {
      // ignore
    }
  }

  let composerConfigFile: string | undefined;
  const composerRepos: Array<{ name: string; type: string; url: string }> = [];

  const compFile = join(rootDir, ".leoms/composer/config.json");
  if (existsSync(compFile)) {
    composerConfigFile = compFile;
    try {
      const parsed = JSON.parse(readFileSync(compFile, "utf8"));
      if (parsed && parsed.repositories) {
        for (const [name, repo] of Object.entries<any>(parsed.repositories)) {
          if (repo && repo.type === "path" && repo.url) {
            composerRepos.push({
              name,
              type: repo.type,
              url: repo.url,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const { config, configFile } = loadLeomsConfig(rootDir);

  return {
    rootDir,
    pnpmWorkspaceFile,
    pnpmPackages,
    composerConfigFile,
    composerRepositories: composerRepos,
    leomsConfigFile: configFile,
    config,
  };
}

/**
 * Helper to construct an ad-hoc ProjectModel for a non-independent subproject directory
 */
function createSubprojectModel(candPath: string, rootDir: string): import("./types.js").ProjectModel | null {
  if (!existsSync(candPath)) return null;
  try {
    const stat = statSync(candPath);
    if (!stat.isDirectory()) return null;
    const pkgPath = join(candPath, "package.json");
    const compPath = join(candPath, "composer.json");
    const hasPkg = existsSync(pkgPath);
    const hasComp = existsSync(compPath);
    if (!hasPkg && !hasComp) return null;

    let name = relative(rootDir, candPath);
    let version: string | undefined;
    let isPrivate = false;

    if (hasPkg) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name) name = pkg.name;
        version = pkg.version;
        isPrivate = Boolean(pkg.private);
      } catch {}
    }
    if (hasComp) {
      try {
        const comp = JSON.parse(readFileSync(compPath, "utf8"));
        if (comp.name) name = comp.name;
        version = comp.version || version;
      } catch {}
    }

    return {
      id: relative(rootDir, candPath),
      name,
      category: "other",
      path: candPath,
      relativeDir: relative(rootDir, candPath),
      packageManager: hasPkg && hasComp ? "hybrid" : hasComp ? "composer" : "npm",
      version,
      private: isPrivate,
      git: {
        isGitRepo: false,
        isStandalone: false,
        isDirty: false,
        dirtyCount: 0,
        commitsAhead: 0,
        hasUnpublished: false,
      },
      needsBuild: true,
      hasBuildArtifact: false,
      workspaceDependencies: [],
      dependents: [],
    };
  } catch {
    return null;
  }
}

/**
 * Detect project from current working directory
 */
export function getProjectFromCwd(projects: import("./types.js").ProjectModel[], rootDir: string): import("./types.js").ProjectModel | null {
  const cwd = process.cwd();
  if (cwd === rootDir) return null;

  const exactMatch = projects.find((p) => p.path === cwd);
  if (exactMatch) return exactMatch;

  // Check if cwd is a subproject folder with its own manifest (e.g. apps/leoms/ui)
  const hasPkg = existsSync(join(cwd, "package.json"));
  const hasComp = existsSync(join(cwd, "composer.json"));
  if (hasPkg || hasComp) {
    const sub = createSubprojectModel(cwd, rootDir);
    if (sub) return sub;
  }

  return projects.find((p) => cwd.startsWith(p.path + "/")) || null;
}

/**
 * Resolve target projects based on query (name, relative path, fuzzy) or CWD
 */
export function resolveTargetProjects(
  projects: import("./types.js").ProjectModel[],
  rootDir: string,
  targetPattern?: string,
  ecosystem?: "all" | "npm" | "composer"
): { targets: import("./types.js").ProjectModel[]; isCwdTarget: boolean; matchedName?: string } {
  let pool = projects;
  if (ecosystem === "composer") {
    pool = projects.filter((p) => p.packageManager === "composer" || p.packageManager === "hybrid");
  } else if (ecosystem === "npm") {
    pool = projects.filter((p) => p.packageManager === "npm" || p.packageManager === "hybrid");
  }

  if (targetPattern) {
    const q = targetPattern.trim().toLowerCase();
    // 1. Exact name match
    const exactName = pool.filter((p) => p.name.toLowerCase() === q);
    if (exactName.length > 0) {
      return { targets: exactName, isCwdTarget: false, matchedName: exactName[0].name };
    }

    // 2. Exact relativeDir match
    const exactDir = pool.filter((p) => p.relativeDir.toLowerCase() === q);
    if (exactDir.length > 0) {
      return { targets: exactDir, isCwdTarget: false, matchedName: exactDir[0].name };
    }

    // 3. Substring / fuzzy match
    const fuzzy = pool.filter(
      (p) => p.name.toLowerCase().includes(q) || p.relativeDir.toLowerCase().includes(q)
    );
    if (fuzzy.length > 0) {
      return { targets: fuzzy, isCwdTarget: false, matchedName: fuzzy[0]?.name };
    }

    // 4. Subproject directory match (non-independent subpath with its own manifest, e.g. apps/leoms/ui or leoms/ui)
    const candidates = [
      resolve(rootDir, targetPattern),
      resolve(process.cwd(), targetPattern),
    ];
    for (const p of pool) {
      if (q.startsWith(p.name.toLowerCase() + "/")) {
        candidates.push(join(p.path, targetPattern.slice(p.name.length + 1)));
      }
      if (q.startsWith(p.relativeDir.toLowerCase() + "/")) {
        candidates.push(join(p.path, targetPattern.slice(p.relativeDir.length + 1)));
      }
    }

    for (const cand of candidates) {
      const sub = createSubprojectModel(cand, rootDir);
      if (sub) {
        return { targets: [sub], isCwdTarget: false, matchedName: sub.name };
      }
    }
  }

  // If no target pattern, check if CWD is inside a project
  const cwdProj = getProjectFromCwd(pool, rootDir);
  if (cwdProj) {
    return { targets: [cwdProj], isCwdTarget: true, matchedName: cwdProj.name };
  }

  return { targets: pool, isCwdTarget: false };
}

/**
 * Obtain environment variables for running Composer.
 * Prioritizes workspace-scoped .leoms/composer/config.json if it exists;
 * falls back to process.env without forcing COMPOSER_HOME if not present.
 */
export function getComposerEnv(rootDir: string): NodeJS.ProcessEnv {
  const workspaceComposerConfig = join(rootDir, ".leoms/composer/config.json");
  if (existsSync(workspaceComposerConfig)) {
    return {
      ...process.env,
      COMPOSER_HOME: join(rootDir, ".leoms/composer"),
    };
  }
  return { ...process.env };
}

