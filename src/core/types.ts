export type PackageManagerType = "npm" | "composer" | "hybrid" | "unknown";

export type EcosystemFilter = "all" | "npm" | "composer";

export type ProjectCategory = "packages" | "libs" | "apps" | "other" | (string & {});

export interface WorkspaceContext {
  rootDir: string;
  pnpmWorkspaceFile?: string;
  pnpmPackages: string[];
  composerConfigFile?: string;
  composerRepositories: Array<{
    name: string;
    type: string;
    url: string;
  }>;
  leomsConfigFile?: string;
  config: LeomsConfig;
}

export interface LeomsConfig {
  locale?: "zh" | "en";
  deploy?: {
    env?: string;
    script?: string;
  };
  release?: {
    remotes?: string[];
    script?: string;
  };
  categories?: Record<string, string>;
}

export interface DoctorItem {
  category: string;
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  detail?: string;
}

export interface GitInfo {
  isGitRepo: boolean;
  isStandalone: boolean; // whether repo root is this project folder
  gitRoot?: string;
  branch?: string;
  isDirty: boolean;
  dirtyCount: number;
  latestTag?: string;
  commitsAhead: number;
  hasUnpublished: boolean;
}

export interface WorkspaceDependencyRef {
  name: string;
  versionReq: string;
  ecosystem: "npm" | "composer";
  isDev: boolean;
  targetPath?: string;
}

export interface ProjectModel {
  id: string; // e.g. "packages/demo-npm"
  name: string;
  category: ProjectCategory;
  path: string;
  relativeDir: string;
  packageManager: PackageManagerType;
  version?: string;
  private: boolean;
  git: GitInfo;
  needsBuild: boolean;
  hasBuildArtifact: boolean;
  workspaceDependencies: WorkspaceDependencyRef[];
  dependents: string[]; // names of other projects that depend on this
}
