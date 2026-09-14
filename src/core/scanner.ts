import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { getProjectGitInfo } from "./git.js";
import { resolveUserPath } from "./workspace.js";
import type {
  PackageManagerType,
  ProjectCategory,
  ProjectModel,
  WorkspaceContext,
  WorkspaceDependencyRef,
} from "./types.js";

interface RawProjectData {
  id: string;
  name: string;
  category: ProjectCategory;
  absPath: string;
  relativeDir: string;
  pm: PackageManagerType;
  version?: string;
  isPrivate: boolean;
  needsBuild: boolean;
  hasBuildArtifact: boolean;
  declaredNpmDeps: Record<string, string>;
  declaredNpmDevDeps: Record<string, string>;
  declaredCompDeps: Record<string, string>;
  declaredCompDevDeps: Record<string, string>;
}

export async function scanWorkspaceProjects(ctx: WorkspaceContext): Promise<ProjectModel[]> {
  const candidateGlobs = new Set<string>();

  for (const pkg of ctx.pnpmPackages) {
    if (pkg.endsWith("/*")) {
      candidateGlobs.add(pkg.slice(0, -2));
    }
  }

  for (const repo of ctx.composerRepositories) {
    const raw = repo.url;
    const resolved = resolveUserPath(raw, ctx.rootDir);
    const rel = relative(ctx.rootDir, resolved);
    if (rel.endsWith("/*")) {
      candidateGlobs.add(rel.slice(0, -2));
    }
  }

  if (ctx.config.categories) {
    Object.keys(ctx.config.categories).forEach((dir) => candidateGlobs.add(dir));
  }

  if (candidateGlobs.size === 0) {
    ["packages", "libs", "apps"].forEach((dir) => candidateGlobs.add(dir));
  }

  const rawProjects: RawProjectData[] = [];

  for (const groupDir of candidateGlobs) {
    const absGroupDir = join(ctx.rootDir, groupDir);
    if (!existsSync(absGroupDir)) continue;

    let entries: string[] = [];
    try {
      entries = readdirSync(absGroupDir);
    } catch {
      continue;
    }

    // Determine category
    let category: ProjectCategory = groupDir;
    if (groupDir.startsWith("packages")) category = "packages";
    else if (groupDir.startsWith("libs")) category = "libs";
    else if (groupDir.startsWith("apps")) category = "apps";

    for (const entry of entries) {
      const absPath = join(absGroupDir, entry);
      try {
        const stat = statSync(absPath);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      const pkgJsonPath = join(absPath, "package.json");
      const compJsonPath = join(absPath, "composer.json");
      const hasNpm = existsSync(pkgJsonPath);
      const hasComp = existsSync(compJsonPath);

      if (!hasNpm && !hasComp) continue;

      let name = entry;
      let version: string | undefined;
      let isPrivate = false;
      let needsBuild = false;
      const declaredNpmDeps: Record<string, string> = {};
      const declaredNpmDevDeps: Record<string, string> = {};
      const declaredCompDeps: Record<string, string> = {};
      const declaredCompDevDeps: Record<string, string> = {};

      if (hasNpm) {
        try {
          const pkgData = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          if (pkgData.name) name = pkgData.name;
          if (pkgData.version) version = pkgData.version;
          if (pkgData.private !== undefined) isPrivate = Boolean(pkgData.private);
          if (pkgData.scripts && pkgData.scripts.build) needsBuild = true;

          if (pkgData.dependencies) Object.assign(declaredNpmDeps, pkgData.dependencies);
          if (pkgData.devDependencies) Object.assign(declaredNpmDevDeps, pkgData.devDependencies);
        } catch {}
      }

      if (hasComp) {
        try {
          const compData = JSON.parse(readFileSync(compJsonPath, "utf8"));
          if (compData.name && (!name || name === entry)) name = compData.name;
          if (compData.version && !version) version = compData.version;

          if (compData.require) Object.assign(declaredCompDeps, compData.require);
          if (compData["require-dev"]) Object.assign(declaredCompDevDeps, compData["require-dev"]);
        } catch {}
      }

      let pm: PackageManagerType = "unknown";
      if (hasNpm && hasComp) pm = "hybrid";
      else if (hasNpm) pm = "npm";
      else if (hasComp) pm = "composer";

      const hasDist = existsSync(join(absPath, "dist")) || existsSync(join(absPath, "build"));
      const relativeDir = relative(ctx.rootDir, absPath);

      rawProjects.push({
        id: relativeDir,
        name,
        category,
        absPath,
        relativeDir,
        pm,
        version,
        isPrivate,
        needsBuild,
        hasBuildArtifact: hasDist,
        declaredNpmDeps,
        declaredNpmDevDeps,
        declaredCompDeps,
        declaredCompDevDeps,
      });
    }
  }

  // Create lookup maps by package name and by relative directory
  const projectByName = new Map<string, RawProjectData>();
  for (const p of rawProjects) {
    projectByName.set(p.name, p);
  }

  // Concurrently fetch git status for all projects
  const gitInfos = await Promise.all(rawProjects.map((p) => getProjectGitInfo(p.absPath)));

  // Build ProjectModel list with cross-project dependency wiring
  const models: ProjectModel[] = rawProjects.map((raw, idx) => {
    return {
      id: raw.id,
      name: raw.name,
      category: raw.category,
      path: raw.absPath,
      relativeDir: raw.relativeDir,
      packageManager: raw.pm,
      version: raw.version,
      private: raw.isPrivate,
      git: gitInfos[idx],
      needsBuild: raw.needsBuild,
      hasBuildArtifact: raw.hasBuildArtifact,
      workspaceDependencies: [],
      dependents: [],
    };
  });

  const modelMap = new Map<string, ProjectModel>();
  for (const m of models) {
    modelMap.set(m.name, m);
  }

  // Resolve dependencies
  for (let i = 0; i < rawProjects.length; i++) {
    const raw = rawProjects[i];
    const model = models[i];

    // NPM Deps
    for (const [depName, verReq] of Object.entries(raw.declaredNpmDeps)) {
      if (modelMap.has(depName)) {
        const target = modelMap.get(depName)!;
        model.workspaceDependencies.push({
          name: depName,
          versionReq: verReq,
          ecosystem: "npm",
          isDev: false,
          targetPath: target.relativeDir,
        });
        if (!target.dependents.includes(model.name)) {
          target.dependents.push(model.name);
        }
      }
    }

    // NPM Dev Deps
    for (const [depName, verReq] of Object.entries(raw.declaredNpmDevDeps)) {
      if (modelMap.has(depName)) {
        const target = modelMap.get(depName)!;
        model.workspaceDependencies.push({
          name: depName,
          versionReq: verReq,
          ecosystem: "npm",
          isDev: true,
          targetPath: target.relativeDir,
        });
        if (!target.dependents.includes(model.name)) {
          target.dependents.push(model.name);
        }
      }
    }

    // Composer Deps
    for (const [depName, verReq] of Object.entries(raw.declaredCompDeps)) {
      if (modelMap.has(depName)) {
        const target = modelMap.get(depName)!;
        model.workspaceDependencies.push({
          name: depName,
          versionReq: verReq,
          ecosystem: "composer",
          isDev: false,
          targetPath: target.relativeDir,
        });
        if (!target.dependents.includes(model.name)) {
          target.dependents.push(model.name);
        }
      }
    }

    // Composer Dev Deps
    for (const [depName, verReq] of Object.entries(raw.declaredCompDevDeps)) {
      if (modelMap.has(depName)) {
        const target = modelMap.get(depName)!;
        model.workspaceDependencies.push({
          name: depName,
          versionReq: verReq,
          ecosystem: "composer",
          isDev: true,
          targetPath: target.relativeDir,
        });
        if (!target.dependents.includes(model.name)) {
          target.dependents.push(model.name);
        }
      }
    }
  }

  // Sort by category order (packages -> libs -> apps -> extended categories -> other)
  const defaultCategoryOrder: Record<string, number> = {
    packages: 1,
    libs: 2,
    apps: 3,
    other: 99,
  };

  return models.sort((a, b) => {
    const orderA = defaultCategoryOrder[a.category] ?? 50;
    const orderB = defaultCategoryOrder[b.category] ?? 50;
    const orderDiff = orderA - orderB;
    if (orderDiff !== 0) return orderDiff;
    return a.relativeDir.localeCompare(b.relativeDir);
  });
}
