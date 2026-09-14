import type { ProjectCategory, ProjectModel, PackageManagerType, GitInfo } from "../core/types.js";
import type { CheckIssue, CheckRule } from "../core/checks/types.js";
import type { AffectedProjectItem } from "../core/affected.js";

export interface WorkspaceSummaryStats {
  totalProjects: number;
  totalGitRepos: number;
  dirtyGitRepos: number;
  unreleasedRepos: number;
  ecosystemCounts: {
    npm: number;
    composer: number;
    hybrid: number;
  };
  categoryCounts: Record<ProjectCategory, number>;
  warnings: Array<{
    projectName: string;
    reason: string;
    dependents: string[];
  }>;
}

export interface WorkspaceStatusResponse {
  rootDir: string;
  hasPnpmWorkspace: boolean;
  hasComposerWorkspace: boolean;
  hasLeomsConfig: boolean;
  stats: WorkspaceSummaryStats;
  categories: Record<string, ProjectModel[]>;
  categoryNames: Record<string, string>;
}

export interface TopologyNode {
  id: string;
  name: string;
  category: ProjectCategory;
  packageManager: PackageManagerType;
  version?: string;
  relativeDir: string;
  git: GitInfo;
  needsBuild: boolean;
  hasBuildArtifact: boolean;
  isAffected?: boolean;
  affectedType?: "direct" | "downstream";
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  ecosystem: "npm" | "composer";
  isDev: boolean;
  versionReq: string;
}

export interface TopologyResponse {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  hasCycle: boolean;
  cycleNodes?: string[];
  topologicalOrder: string[];
}

export interface AffectedResponse {
  hasChanges: boolean;
  baseRef?: string;
  directProjects: AffectedProjectItem[];
  downstreamProjects: AffectedProjectItem[];
  allAffected: AffectedProjectItem[];
}

export interface CheckRunRequest {
  ruleIds?: string[];
  skipRuleIds?: string[];
  all?: boolean;
  targets?: string[];
  targetPattern?: string;
  ecosystem?: "all" | "npm" | "composer";
}

export interface CheckRunResponse {
  passed: boolean;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
  issues: CheckIssue[];
  executedRules: Array<{
    id: string;
    name: string;
    category: string;
    default: boolean;
    description: string;
  }>;
  targets: Array<{
    name: string;
    relativeDir: string;
    category: ProjectCategory;
  }>;
}

export interface TaskRunRequest {
  action: "check" | "build" | "install" | "doctor" | "affected" | "status" | "release-dry-run" | "add" | "remove" | "rm" | string;
  target?: string;
  options?: Record<string, any>;
}

export interface TaskLogEntry {
  type: "stdout" | "stderr" | "system" | "done" | "error";
  text: string;
  timestamp: number;
}

export interface TaskStatus {
  id: string;
  action: string;
  target?: string;
  status: "running" | "success" | "failed";
  startTime: number;
  endTime?: number;
  durationMs?: number;
  exitCode?: number;
  logs: TaskLogEntry[];
}

export interface ComposerIsolationInfo {
  configFile?: string;
  exists: boolean;
  repositories: Array<{
    name: string;
    type: string;
    url: string;
    resolvedPath: string;
    isLinked: boolean;
  }>;
  symlinks: Array<{
    projectName: string;
    vendorDir: string;
    linkedPackages: string[];
  }>;
}

export interface ProjectDependencyEntry {
  name: string;
  version: string;
  category: "dependencies" | "devDependencies" | "peerDependencies" | "require" | "require-dev";
  ecosystem: "npm" | "composer";
  isWorkspace: boolean;
  targetPath?: string;
}

export interface ProjectDependenciesResponse {
  projectName: string;
  projectPath: string;
  packageManager: PackageManagerType;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  composerRequire: Record<string, string>;
  composerRequireDev: Record<string, string>;
  all: ProjectDependencyEntry[];
}
