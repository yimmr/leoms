import { execCommand } from "../utils/exec.js";
import type { ProjectModel } from "./types.js";

export interface AffectedProjectItem {
  project: ProjectModel;
  type: "direct" | "downstream";
  reasons: string[];
  changedFiles?: string[];
  depChain?: string[];
}

export interface AffectedAnalysisResult {
  hasChanges: boolean;
  baseRef?: string;
  directProjects: AffectedProjectItem[];
  downstreamProjects: AffectedProjectItem[];
  allAffected: AffectedProjectItem[];
}

/**
 * Detect directly modified files in a project against a git base ref or working tree
 */
async function getProjectDiffFiles(project: ProjectModel, baseRef?: string): Promise<string[]> {
  if (!project.git.isGitRepo) {
    return [];
  }

  const files = new Set<string>();

  // 1. Uncommitted working directory changes
  const uncommittedRes = await execCommand("git", [
    "-C",
    project.path,
    "status",
    "--porcelain",
    project.git.isStandalone ? "" : ".",
  ].filter(Boolean));

  if (uncommittedRes.exitCode === 0 && uncommittedRes.stdout) {
    for (const line of uncommittedRes.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Porcelain status format: XY filename
      const filePath = trimmed.slice(3).trim();
      if (filePath) files.add(filePath);
    }
  }

  // 2. Base reference comparison if provided
  if (baseRef) {
    // Check if baseRef exists in this repo
    const verifyRef = await execCommand("git", ["-C", project.path, "rev-parse", "--verify", baseRef]);
    if (verifyRef.exitCode === 0) {
      const diffRes = await execCommand("git", [
        "-C",
        project.path,
        "diff",
        "--name-only",
        `${baseRef}...HEAD`,
      ]);
      if (diffRes.exitCode === 0 && diffRes.stdout) {
        for (const line of diffRes.stdout.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) files.add(trimmed);
        }
      }
    }
  }

  return Array.from(files);
}

/**
 * Calculate affected projects in workspace based on git changes and DAG topology
 */
export async function calculateAffectedProjects(
  projects: ProjectModel[],
  options: { baseRef?: string } = {}
): Promise<AffectedAnalysisResult> {
  const projectMap = new Map<string, ProjectModel>();
  for (const p of projects) {
    projectMap.set(p.name, p);
  }

  const directMap = new Map<string, AffectedProjectItem>();

  // 1. Identify directly changed projects
  for (const project of projects) {
    const reasons: string[] = [];
    let changedFiles: string[] = [];

    if (project.git.isDirty) {
      reasons.push(`${project.git.dirtyCount} uncommitted file(s)`);
    }

    if (project.git.commitsAhead > 0) {
      reasons.push(`${project.git.commitsAhead} commit(s) ahead of ${project.git.latestTag || "init"}`);
    }

    if (options.baseRef) {
      changedFiles = await getProjectDiffFiles(project, options.baseRef);
      if (changedFiles.length > 0 && reasons.length === 0) {
        reasons.push(`${changedFiles.length} file(s) changed against ${options.baseRef}`);
      }
    } else if (project.git.isDirty) {
      changedFiles = await getProjectDiffFiles(project);
    }

    if (reasons.length > 0 || changedFiles.length > 0) {
      directMap.set(project.name, {
        project,
        type: "direct",
        reasons: reasons.length > 0 ? reasons : ["Files modified"],
        changedFiles,
      });
    }
  }

  // 2. Trace downstream affected dependents via DAG
  const downstreamMap = new Map<string, AffectedProjectItem>();
  const queue: { name: string; chain: string[] }[] = Array.from(directMap.values()).map((item) => ({
    name: item.project.name,
    chain: [item.project.name],
  }));

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const currentProj = projectMap.get(current.name);
    if (!currentProj) continue;

    for (const depName of currentProj.dependents) {
      const depProj = projectMap.get(depName);
      if (!depProj) continue;

      if (!directMap.has(depName) && !downstreamMap.has(depName)) {
        const chain = [...current.chain, depName];
        downstreamMap.set(depName, {
          project: depProj,
          type: "downstream",
          reasons: [`Impacted by upstream ${current.name}`],
          depChain: chain,
        });
        queue.push({ name: depName, chain });
      }
    }
  }

  const directProjects = Array.from(directMap.values());
  const downstreamProjects = Array.from(downstreamMap.values());
  const allAffected = [...directProjects, ...downstreamProjects];

  return {
    hasChanges: allAffected.length > 0,
    baseRef: options.baseRef,
    directProjects,
    downstreamProjects,
    allAffected,
  };
}
