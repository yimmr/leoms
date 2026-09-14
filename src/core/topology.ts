import type { ProjectModel, WorkspaceContext } from "./types.js";

export interface PublishStep {
  step: number;
  project: ProjectModel;
  action: "publish" | "build-and-tag" | "verify";
  reason: string;
  suggestedBump: "patch" | "minor" | "major";
  dependenciesToWait: string[];
}

export interface PublishPlan {
  hasChanges: boolean;
  affectedProjects: ProjectModel[];
  orderedSteps: PublishStep[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

/**
 * Perform Topological Sort and calculate the release plan
 */
export function calculatePublishPlan(
  projects: ProjectModel[],
  targetPattern?: string
): PublishPlan {
  const projectMap = new Map<string, ProjectModel>();
  for (const p of projects) {
    projectMap.set(p.name, p);
  }

  // 1. Identify directly changed packages
  let seedProjects: ProjectModel[] = [];
  if (targetPattern) {
    const q = targetPattern.toLowerCase();
    seedProjects = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.relativeDir.toLowerCase().includes(q)
    );
  } else {
    // Auto-detect changed projects (dirty or has unreleased commits)
    seedProjects = projects.filter((p) => p.git.hasUnpublished || p.git.isDirty);
  }

  // If no projects have unreleased git changes, fallback to all projects with dependents
  const affectedNames = new Set<string>();
  const queue: string[] = seedProjects.map((p) => p.name);

  for (const name of queue) {
    affectedNames.add(name);
  }

  // 2. Compute transitive dependents (who needs to be updated if this package is updated)
  let head = 0;
  while (head < queue.length) {
    const currentName = queue[head++];
    const currentProj = projectMap.get(currentName);
    if (!currentProj) continue;

    for (const depName of currentProj.dependents) {
      if (!affectedNames.has(depName)) {
        affectedNames.add(depName);
        queue.push(depName);
      }
    }
  }

  // Filter affected models
  const affectedProjects = projects.filter((p) => affectedNames.has(p.name));

  if (affectedProjects.length === 0) {
    return {
      hasChanges: false,
      affectedProjects: [],
      orderedSteps: [],
      hasCycle: false,
    };
  }

  // 3. Build in-degree map and adjacency graph for affected subset
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>(); // node -> list of packages that depend on it

  for (const p of affectedProjects) {
    inDegree.set(p.name, 0);
    adj.set(p.name, []);
  }

  for (const p of affectedProjects) {
    for (const dep of p.workspaceDependencies) {
      if (affectedNames.has(dep.name)) {
        // dep.name must be published BEFORE p.name
        // So dep.name -> p.name
        adj.get(dep.name)!.push(p.name);
        inDegree.set(p.name, (inDegree.get(p.name) || 0) + 1);
      }
    }
  }

  // 4. Kahn's Algorithm (Topological Sort)
  const zeroInDegreeQueue: string[] = [];
  for (const [name, deg] of inDegree.entries()) {
    if (deg === 0) {
      zeroInDegreeQueue.push(name);
    }
  }

  const sortedNames: string[] = [];
  while (zeroInDegreeQueue.length > 0) {
    // Sort zero-in-degree by name for deterministic order
    zeroInDegreeQueue.sort();
    const curr = zeroInDegreeQueue.shift()!;
    sortedNames.push(curr);

    for (const neighbor of adj.get(curr) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        zeroInDegreeQueue.push(neighbor);
      }
    }
  }

  // Check for circular dependency cycle
  if (sortedNames.length < affectedProjects.length) {
    const cycleNodes = affectedProjects
      .filter((p) => !sortedNames.includes(p.name))
      .map((p) => p.name);
    return {
      hasChanges: true,
      affectedProjects,
      orderedSteps: [],
      hasCycle: true,
      cycleNodes,
    };
  }

  // 5. Generate Ordered Steps
  const orderedSteps: PublishStep[] = sortedNames.map((name, index) => {
    const proj = projectMap.get(name)!;
    const internalDeps = proj.workspaceDependencies
      .filter((d) => affectedNames.has(d.name))
      .map((d) => d.name);

    let action: PublishStep["action"] = "publish";
    let reason = "Direct changes detected";

    if (proj.private || (proj.category !== "packages" && proj.category !== "libs")) {
      action = "build-and-tag";
      reason = internalDeps.length > 0 ? "Upstream internal dependencies updated" : "Application build & tag";
    } else if (internalDeps.length > 0 && !proj.git.hasUnpublished) {
      reason = "Cascading bump due to dependency updates";
    }

    return {
      step: index + 1,
      project: proj,
      action,
      reason,
      suggestedBump: "patch",
      dependenciesToWait: internalDeps,
    };
  });

  return {
    hasChanges: true,
    affectedProjects,
    orderedSteps,
    hasCycle: false,
  };
}

/**
 * Sort a collection of projects topologically based on internal workspace dependencies.
 * Upstream dependencies are ordered before downstream dependents.
 */
export function sortProjectsTopologically(projects: ProjectModel[]): ProjectModel[] {
  const projectMap = new Map<string, ProjectModel>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>(); // dep -> list of projects that depend on it

  for (const p of projects) {
    projectMap.set(p.name, p);
    inDegree.set(p.name, 0);
    adj.set(p.name, []);
  }

  for (const p of projects) {
    for (const dep of p.workspaceDependencies) {
      if (projectMap.has(dep.name)) {
        adj.get(dep.name)!.push(p.name);
        inDegree.set(p.name, (inDegree.get(p.name) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(name);
  }

  const sorted: ProjectModel[] = [];
  while (queue.length > 0) {
    queue.sort();
    const curr = queue.shift()!;
    sorted.push(projectMap.get(curr)!);

    for (const neighbor of adj.get(curr) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // If cycle or unvisited nodes exist, append remaining
  if (sorted.length < projects.length) {
    for (const p of projects) {
      if (!sorted.some((s) => s.name === p.name)) {
        sorted.push(p);
      }
    }
  }

  return sorted;
}

