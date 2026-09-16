export interface WorkspaceStatusResponse {
  rootDir: string;
  hasPnpmWorkspace: boolean;
  hasComposerWorkspace: boolean;
  hasLeomsConfig: boolean;
  stats: {
    totalProjects: number;
    totalGitRepos: number;
    dirtyGitRepos: number;
    unreleasedRepos: number;
    ecosystemCounts: { npm: number; composer: number; hybrid: number };
    categoryCounts: Record<string, number>;
    warnings: Array<{
      projectName: string;
      reason: string;
      dependents: string[];
    }>;
  };
  categories: Record<string, ProjectModel[]>;
  categoryNames?: Record<string, string>;
}

export interface ProjectModel {
  id: string;
  name: string;
  category: "packages" | "libs" | "apps" | "other" | (string & {});
  path: string;
  relativeDir: string;
  packageManager: "npm" | "composer" | "hybrid" | "unknown";
  version?: string;
  private: boolean;
  git: {
    isGitRepo: boolean;
    isStandalone: boolean;
    branch?: string;
    isDirty: boolean;
    dirtyCount: number;
    latestTag?: string;
    commitsAhead: number;
    hasUnpublished: boolean;
  };
  needsBuild: boolean;
  hasBuildArtifact: boolean;
  workspaceDependencies: Array<{
    name: string;
    versionReq: string;
    ecosystem: "npm" | "composer";
    isDev: boolean;
    targetPath?: string;
  }>;
  dependents: string[];
}

export interface TopologyResponse {
  nodes: Array<{
    id: string;
    name: string;
    category: string;
    packageManager: string;
    version?: string;
    relativeDir: string;
    git: any;
    needsBuild: boolean;
    hasBuildArtifact: boolean;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    ecosystem: string;
    isDev: boolean;
    versionReq: string;
  }>;
  hasCycle: boolean;
  cycleNodes?: string[];
  topologicalOrder: string[];
}

export interface AffectedResponse {
  hasChanges: boolean;
  baseRef?: string;
  directProjects: Array<{
    project: ProjectModel;
    type: "direct";
    reasons: string[];
    changedFiles?: string[];
  }>;
  downstreamProjects: Array<{
    project: ProjectModel;
    type: "downstream";
    reasons: string[];
    depChain?: string[];
  }>;
  allAffected: Array<any>;
}

export interface CheckRuleItem {
  id: string;
  name: string;
  category: string;
  default: boolean;
  description: string;
}

export interface CheckRunResponse {
  passed: boolean;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
  issues: Array<{
    level: "error" | "warning";
    ruleId: string;
    ruleName: string;
    project: string;
    projectRelativeDir: string;
    message: string;
    filePath?: string;
    fileLine?: number;
    remedy?: string;
  }>;
  executedRules: CheckRuleItem[];
  targets: Array<{ name: string; relativeDir: string; category: string }>;
}

export interface TaskLogEntry {
  type: "stdout" | "stderr" | "system" | "done" | "error";
  text: string;
  timestamp: number;
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

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as any).__TAURI_INTERNALS__ !== "undefined" ||
    typeof (window as any).__TAURI__ !== "undefined" ||
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost" ||
    (window.location.hostname.endsWith(".localhost") && window.location.hostname !== "localhost")
  );
}

let activePortOverride: number | null = null;

export function setApiPort(port: number | null): void {
  activePortOverride = port;
  if (port && typeof window !== "undefined") {
    try {
      window.localStorage?.setItem("leoms_api_port", String(port));
    } catch {}
  }
}

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const override = activePortOverride;
    const storedPort = override ? String(override) : window.localStorage?.getItem("leoms_api_port");
    const port = storedPort ? parseInt(storedPort, 10) : 3200;

    // 1. 如果在 Tauri 桌面端运行（无论是 dev 预览还是安装包产物），直连本地后端
    if (isTauri()) {
      return `http://127.0.0.1:${port}/api`;
    }

    // 2. 如果在前端独立开发环境（如 Vite 5173 端口）
    if (window.location.port === "5173") {
      const host = window.location.hostname === "localhost" ? "127.0.0.1" : (window.location.hostname || "127.0.0.1");
      return `http://${host}:${port}/api`;
    }

    // 3. 如果是在纯 Web 模式下通过浏览器直接访问（如 http://localhost:3200 或局域网 IP）
    if (window.location.protocol.startsWith("http") && window.location.hostname !== "tauri.localhost") {
      return `${window.location.origin}/api`;
    }
  }
  return "http://127.0.0.1:3200/api";
}

// 动态兼容现有的字符串模板插值 `${API_BASE}/...`
export const API_BASE = {
  toString: () => getApiBase(),
  valueOf: () => getApiBase(),
  [Symbol.toPrimitive]: () => getApiBase(),
} as unknown as string;

export interface WorkspaceMetaResponse {
  rootDir: string;
  port: number;
  isWorkspace: boolean;
  hasComposer: boolean;
}

export async function fetchWorkspaceMeta(): Promise<WorkspaceMetaResponse> {
  const res = await fetch(`${API_BASE}/workspace/meta`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function initWorkspace(options: {
  config?: boolean;
  setComposerHome?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/workspace/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchStatus(): Promise<WorkspaceStatusResponse> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchProjects(ecosystem?: string): Promise<{ projects: ProjectModel[] }> {
  const url = ecosystem ? `${API_BASE}/projects?ecosystem=${ecosystem}` : `${API_BASE}/projects`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchTopology(): Promise<TopologyResponse> {
  const res = await fetch(`${API_BASE}/topology`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchAffected(baseRef?: string): Promise<AffectedResponse> {
  const url = baseRef ? `${API_BASE}/affected?baseRef=${encodeURIComponent(baseRef)}` : `${API_BASE}/affected`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchCheckRules(): Promise<{ rules: CheckRuleItem[] }> {
  const res = await fetch(`${API_BASE}/checks/rules`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function runChecks(options: {
  ruleIds?: string[];
  skipRuleIds?: string[];
  all?: boolean;
  targetPattern?: string;
  ecosystem?: "all" | "npm" | "composer";
}): Promise<CheckRunResponse> {
  const res = await fetch(`${API_BASE}/checks/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function runTask(
  action: string,
  target?: string,
  options?: Record<string, any>
): Promise<{ task: { id: string; action: string; target?: string } }> {
  const res = await fetch(`${API_BASE}/tasks/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target, options }),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function abortTask(taskId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/abort`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export interface PublishStep {
  step: number;
  project: ProjectModel;
  action: "publish" | "build-and-tag" | "verify";
  reason: string;
  suggestedBump: "patch" | "minor" | "major";
  dependenciesToWait: string[];
}

export interface PublishPlanResponse {
  hasChanges: boolean;
  affectedProjects: ProjectModel[];
  orderedSteps: PublishStep[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

export async function fetchPublishPlan(target?: string): Promise<PublishPlanResponse> {
  const url = target ? `${API_BASE}/plan?target=${encodeURIComponent(target)}` : `${API_BASE}/plan`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export function streamTaskLogs(
  taskId: string,
  onLog: (log: TaskLogEntry) => void,
  onFinish: (result: { exitCode: number; durationMs: number }) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/tasks/${taskId}/stream`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onLog(data);
    } catch {
      // ignore
    }
  };

  eventSource.addEventListener("finish", (event: any) => {
    try {
      const data = JSON.parse(event.data);
      onFinish(data);
    } catch {
      onFinish({ exitCode: 0, durationMs: 0 });
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}

export async function fetchComposerIsolation(): Promise<ComposerIsolationInfo> {
  const res = await fetch(`${API_BASE}/composer`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
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
  packageManager: "npm" | "composer" | "hybrid" | "unknown";
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  composerRequire: Record<string, string>;
  composerRequireDev: Record<string, string>;
  all: ProjectDependencyEntry[];
}

export interface RegistrySearchResult {
  name: string;
  description: string;
  url: string;
  repository?: string;
  version: string;
  publisher?: string;
  downloads?: number;
  stars?: number;
  ecosystem: "npm" | "composer";
}

export async function fetchProjectDependencies(
  projectName: string,
  fallbackProject?: ProjectModel
): Promise<ProjectDependenciesResponse> {
  try {
    const res = await fetch(`${API_BASE}/projects/dependencies?project=${encodeURIComponent(projectName)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback to project metadata
  }

  // Graceful fallback from fallbackProject
  const all: ProjectDependencyEntry[] = [];
  if (fallbackProject) {
    for (const dep of fallbackProject.workspaceDependencies) {
      all.push({
        name: dep.name,
        version: dep.versionReq,
        category: dep.isDev
          ? fallbackProject.packageManager === "composer"
            ? "require-dev"
            : "devDependencies"
          : fallbackProject.packageManager === "composer"
          ? "require"
          : "dependencies",
        ecosystem: dep.ecosystem,
        isWorkspace: true,
        targetPath: dep.targetPath,
      });
    }
  }

  return {
    projectName,
    projectPath: fallbackProject?.relativeDir || "",
    packageManager: fallbackProject?.packageManager || "npm",
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    composerRequire: {},
    composerRequireDev: {},
    all,
  };
}

export async function modifyProjectDependency(payload: {
  projectName: string;
  name: string;
  action: "add" | "update" | "remove";
  version?: string;
  category?: string;
  ecosystem?: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/projects/dependencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

export async function fetchProjectOutdated(
  projectName: string
): Promise<Record<string, { current: string; latest: string; wanted?: string }>> {
  try {
    const res = await fetch(`${API_BASE}/projects/outdated?project=${encodeURIComponent(projectName)}`);
    if (res.ok) {
      const data = await res.json();
      return data.outdated || {};
    }
  } catch {
    // ignore
  }
  return {};
}

export async function searchCommunityRegistry(
  query: string,
  ecosystem: "npm" | "composer" = "npm"
): Promise<{ results: RegistrySearchResult[]; error?: string }> {
  if (!query || !query.trim()) return { results: [] };

  try {
    const res = await fetch(
      `${API_BASE}/registry/search?q=${encodeURIComponent(query.trim())}&ecosystem=${ecosystem}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results)) {
        return data;
      }
    }
  } catch {
    // direct fallback
  }

  // Client-side direct registry query fallback
  if (ecosystem === "composer") {
    try {
      const res = await fetch(
        `https://packagist.org/search.json?q=${encodeURIComponent(query.trim())}&per_page=20`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results: RegistrySearchResult[] = (data.results || []).map((r: any) => ({
        name: r.name,
        description: r.description || "",
        url: r.url || `https://packagist.org/packages/${r.name}`,
        repository: r.repository,
        version: "latest",
        publisher: r.repository?.split("/")[3] || "",
        downloads: r.downloads,
        stars: r.favers,
        ecosystem: "composer" as const,
      }));
      return { results };
    } catch (err: any) {
      return { results: [], error: err.message };
    }
  } else {
    try {
      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query.trim())}&size=20`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results: RegistrySearchResult[] = (data.objects || []).map((o: any) => ({
        name: o.package.name,
        description: o.package.description || "",
        url: o.package.links?.npm || `https://www.npmjs.com/package/${o.package.name}`,
        repository: o.package.links?.repository,
        version: o.package.version || "latest",
        publisher: o.package.publisher?.username || "",
        ecosystem: "npm" as const,
      }));
      return { results };
    } catch (err: any) {
      return { results: [], error: err.message };
    }
  }
}

