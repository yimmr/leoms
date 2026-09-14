import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import pc from "picocolors";
import { findWorkspaceRoot, getWorkspaceContext, resolveTargetProjects, getProjectFromCwd } from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import {
  runDesktopDev as executeDesktopDev,
  runDesktopBuild as executeDesktopBuild,
  runDesktopDiagnostics,
  printDoctorReport,
  type DesktopDevOptions,
  type DesktopBuildOptions,
} from "../core/desktop/index.js";

async function resolveDesktopProject(targetPattern?: string): Promise<{ projectDir: string; projectName: string }> {
  const rootDir = findWorkspaceRoot() || process.cwd();

  // 1. If cwd itself has src-tauri, prioritize cwd
  if (existsSync(join(process.cwd(), "src-tauri"))) {
    return {
      projectDir: process.cwd(),
      projectName: process.cwd().split(/[\\/]/).pop() || "desktop-app",
    };
  }

  // 2. Scan workspace projects
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  if (targetPattern) {
    const { targets } = resolveTargetProjects(projects, rootDir, targetPattern);
    if (targets.length > 0) {
      return {
        projectDir: targets[0].path,
        projectName: targets[0].name,
      };
    }
  }

  const cwdProj = getProjectFromCwd(projects, rootDir);
  if (cwdProj && existsSync(join(cwdProj.path, "src-tauri"))) {
    return {
      projectDir: cwdProj.path,
      projectName: cwdProj.name,
    };
  }

  // Find first project with src-tauri
  const tauriProject = projects.find((p) => existsSync(join(p.path, "src-tauri")));
  if (tauriProject) {
    return {
      projectDir: tauriProject.path,
      projectName: tauriProject.name,
    };
  }

  // Default to cwd
  return {
    projectDir: process.cwd(),
    projectName: "app",
  };
}

export async function runDesktopDev(targetPattern?: string, options: DesktopDevOptions = {}): Promise<void> {
  const rootDir = findWorkspaceRoot() || process.cwd();
  const ctx = getWorkspaceContext(rootDir);
  const target = options.project || targetPattern;
  const { projectDir } = await resolveDesktopProject(target);

  await executeDesktopDev(projectDir, options, ctx.config.desktop || {});
}

export async function runDesktopBuild(targetPattern?: string, options: DesktopBuildOptions = {}): Promise<void> {
  const rootDir = findWorkspaceRoot() || process.cwd();
  const ctx = getWorkspaceContext(rootDir);
  const target = options.project || targetPattern;
  const { projectDir } = await resolveDesktopProject(target);

  await executeDesktopBuild(projectDir, options, ctx.config.desktop || {});
}

export async function runDesktopDoctor(targetPattern?: string): Promise<void> {
  const { projectDir } = await resolveDesktopProject(targetPattern);
  const results = await runDesktopDiagnostics(projectDir);
  printDoctorReport(results);
}
