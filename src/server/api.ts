import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync, readdirSync, lstatSync, statSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { findWorkspaceRoot, getWorkspaceContext, resolveTargetProjects, resolveUserPath } from "../core/workspace.js";
import { scanWorkspaceProjects } from "../core/scanner.js";
import { executeChecks } from "../core/checks/runner.js";
import { getAllRules, resolveRules } from "../core/checks/registry.js";
import { calculatePublishPlan, type PublishPlan } from "../core/topology.js";
import { calculateAffectedProjects } from "../core/affected.js";
import { runInit } from "../commands/init.js";
import type { ProjectCategory, ProjectModel, EcosystemFilter } from "../core/types.js";
import type {
  WorkspaceStatusResponse,
  WorkspaceSummaryStats,
  TopologyResponse,
  TopologyNode,
  TopologyEdge,
  AffectedResponse,
  CheckRunRequest,
  CheckRunResponse,
  TaskStatus,
  TaskLogEntry,
  ComposerIsolationInfo,
  ProjectDependencyEntry,
  ProjectDependenciesResponse,
} from "./types.js";

/**
 * In-memory task store and event broadcaster for real-time task streaming
 */
export class TaskManager extends EventEmitter {
  private tasks = new Map<string, TaskStatus>();
  private taskProcesses = new Map<string, ChildProcess>();
  private maxLogsPerTask = 2000;
  private activeFingerprints = new Map<string, string>();

  findRunningTaskByFingerprint(fingerprint: string): TaskStatus | undefined {
    const existingTaskId = this.activeFingerprints.get(fingerprint);
    if (!existingTaskId) return undefined;
    const task = this.tasks.get(existingTaskId);
    if (task && task.status === "running") {
      return task;
    }
    this.activeFingerprints.delete(fingerprint);
    return undefined;
  }

  registerFingerprint(fingerprint: string, taskId: string): void {
    this.activeFingerprints.set(fingerprint, taskId);
  }

  registerProcess(id: string, proc: ChildProcess): void {
    this.taskProcesses.set(id, proc);
  }

  abortTask(id: string): boolean {
    const proc = this.taskProcesses.get(id);
    const task = this.tasks.get(id);
    if (!task || task.status !== "running") return false;

    this.appendLog(id, "system", "\n⚠️ 任务已被用户主动终止 (SIGTERM)\n");
    if (proc && !proc.killed) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    this.taskProcesses.delete(id);
    this.finishTask(id, 130);
    return true;
  }

  createTask(action: string, target?: string): TaskStatus {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: TaskStatus = {
      id,
      action,
      target,
      status: "running",
      startTime: Date.now(),
      logs: [],
    };
    this.tasks.set(id, task);
    return task;
  }

  getTask(id: string): TaskStatus | undefined {
    return this.tasks.get(id);
  }

  appendLog(id: string, type: TaskLogEntry["type"], text: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    const entry: TaskLogEntry = {
      type,
      text,
      timestamp: Date.now(),
    };

    task.logs.push(entry);
    if (task.logs.length > this.maxLogsPerTask) {
      task.logs.shift();
    }

    this.emit(`log:${id}`, entry);
  }

  finishTask(id: string, exitCode: number): void {
    this.taskProcesses.delete(id);
    for (const [fp, tid] of this.activeFingerprints.entries()) {
      if (tid === id) {
        this.activeFingerprints.delete(fp);
      }
    }
    const task = this.tasks.get(id);
    if (!task || task.status !== "running") return;

    task.status = exitCode === 0 ? "success" : "failed";
    task.exitCode = exitCode;
    task.endTime = Date.now();
    task.durationMs = task.endTime - task.startTime;

    this.appendLog(
      id,
      exitCode === 0 ? "done" : "error",
      `\nTask finished with exit code ${exitCode} (${task.durationMs}ms)`
    );

    this.emit(`finish:${id}`, task);
  }
}

export const taskManager = new TaskManager();

/**
 * Retrieve complete workspace overview & statistics
 */
export async function getWorkspaceStatus(rootDir: string): Promise<WorkspaceStatusResponse> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  const defaultCategoryNames: Record<string, string> = {
    apps: "应用",
    packages: "公共包",
    libs: "私有库",
  };

  const userCategoryNames = ctx.config.categories || {};
  const categories: Record<string, ProjectModel[]> = {
    apps: [],
    packages: [],
    libs: [],
  };

  const catCounts: Record<string, number> = {
    apps: 0,
    packages: 0,
    libs: 0,
  };

  const projectMap = new Map<string, ProjectModel>();
  let totalGitRepos = 0;
  let dirtyGitRepos = 0;
  let unreleasedRepos = 0;

  const ecoCounts = { npm: 0, composer: 0, hybrid: 0 };

  for (const p of projects) {
    projectMap.set(p.name, p);
    if (!categories[p.category]) {
      categories[p.category] = [];
      catCounts[p.category] = 0;
    }
    categories[p.category].push(p);
    catCounts[p.category]++;

    if (p.packageManager === "npm") ecoCounts.npm++;
    else if (p.packageManager === "composer") ecoCounts.composer++;
    else if (p.packageManager === "hybrid") ecoCounts.hybrid++;

    if (p.git.isGitRepo) {
      totalGitRepos++;
      if (p.git.isDirty) dirtyGitRepos++;
      if (p.git.hasUnpublished) unreleasedRepos++;
    }
  }

  // Remove empty default categories if no projects exist in them
  for (const key of Object.keys(categories)) {
    if (categories[key].length === 0 && !userCategoryNames[key]) {
      delete categories[key];
      delete catCounts[key];
    }
  }

  // Calculate friendly display names for all active categories
  const categoryNames: Record<string, string> = {};
  for (const cat of Object.keys(categories)) {
    if (userCategoryNames[cat]) {
      categoryNames[cat] = userCategoryNames[cat];
    } else if (defaultCategoryNames[cat]) {
      categoryNames[cat] = defaultCategoryNames[cat];
    } else {
      // Extended category without explicit config: capitalize first letter of directory name
      categoryNames[cat] = cat.charAt(0).toUpperCase() + cat.slice(1);
    }
  }

  // Calculate dependency warnings (unreleased upstream packages depended on by others)
  const warnings: WorkspaceSummaryStats["warnings"] = [];
  for (const p of projects) {
    if ((p.git.hasUnpublished || p.git.isDirty) && p.dependents.length > 0) {
      warnings.push({
        projectName: p.name,
        reason: p.git.isDirty
          ? `${p.git.dirtyCount} uncommitted change(s)`
          : `${p.git.commitsAhead} unreleased commit(s)`,
        dependents: p.dependents,
      });
    }
  }

  const stats: WorkspaceSummaryStats = {
    totalProjects: projects.length,
    totalGitRepos,
    dirtyGitRepos,
    unreleasedRepos,
    ecosystemCounts: ecoCounts,
    categoryCounts: catCounts as any,
    warnings,
  };

  return {
    rootDir,
    hasPnpmWorkspace: Boolean(ctx.pnpmWorkspaceFile),
    hasComposerWorkspace: Boolean(ctx.composerConfigFile),
    hasLeomsConfig: Boolean(ctx.leomsConfigFile),
    stats,
    categories,
    categoryNames,
  };
}

/**
 * Retrieve scanned projects with optional ecosystem filter
 */
export async function getProjects(rootDir: string, ecosystem?: EcosystemFilter): Promise<ProjectModel[]> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  if (ecosystem === "npm") {
    return projects.filter((p) => p.packageManager === "npm" || p.packageManager === "hybrid");
  }
  if (ecosystem === "composer") {
    return projects.filter((p) => p.packageManager === "composer" || p.packageManager === "hybrid");
  }
  return projects;
}

/**
 * Compute DAG Topology (Nodes & Edges) for interactive graph visualization
 */
export async function getTopology(rootDir: string): Promise<TopologyResponse> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const plan = calculatePublishPlan(projects);

  const nodes: TopologyNode[] = projects.map((p) => ({
    id: p.name,
    name: p.name,
    category: p.category,
    packageManager: p.packageManager,
    version: p.version,
    relativeDir: p.relativeDir,
    git: p.git,
    needsBuild: p.needsBuild,
    hasBuildArtifact: p.hasBuildArtifact,
  }));

  const edges: TopologyEdge[] = [];
  const edgeSet = new Set<string>();

  for (const p of projects) {
    for (const dep of p.workspaceDependencies) {
      const edgeId = `${p.name}->${dep.name}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: p.name, // p depends on dep.name
          target: dep.name,
          ecosystem: dep.ecosystem,
          isDev: dep.isDev,
          versionReq: dep.versionReq,
        });
      }
    }
  }

  // Compute topological order from orderedSteps or fallback
  const topologicalOrder = plan.orderedSteps.map((s) => s.project.name);

  return {
    nodes,
    edges,
    hasCycle: plan.hasCycle,
    cycleNodes: plan.cycleNodes,
    topologicalOrder,
  };
}

/**
 * Calculate affected projects against baseRef
 */
export async function getAffected(rootDir: string, baseRef?: string): Promise<AffectedResponse> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  return calculateAffectedProjects(projects, { baseRef });
}

/**
 * List all available gatekeeper rules
 */
export function getCheckRules() {
  return getAllRules().map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    default: r.default,
    description: r.description,
  }));
}

/**
 * Run quality gatekeeper checks programmatically
 */
export async function runChecks(rootDir: string, req: CheckRunRequest = {}): Promise<CheckRunResponse> {
  const startTime = Date.now();

  const res = await executeChecks({
    rootDir,
    ruleIds: req.ruleIds,
    skipRuleIds: req.skipRuleIds,
    all: req.all,
    targetPattern: req.targetPattern,
    ecosystemFilter: req.ecosystem || "all",
    silent: true,
  });

  const durationMs = Date.now() - startTime;

  return {
    passed: res.passed,
    totalErrors: res.totalErrors,
    totalWarnings: res.totalWarnings,
    durationMs,
    issues: res.issues,
    executedRules: res.executedRules.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      default: r.default,
      description: r.description,
    })),
    targets: res.targets.map((t) => ({
      name: t.name,
      relativeDir: t.relativeDir,
      category: t.category,
    })),
  };
}

/**
 * Inspect Composer isolation configuration and symlinks
 */
export async function getComposerIsolation(rootDir: string): Promise<ComposerIsolationInfo> {
  const compFile = join(rootDir, ".leoms/composer/config.json");
  const exists = existsSync(compFile);

  const repos: ComposerIsolationInfo["repositories"] = [];
  const symlinks: ComposerIsolationInfo["symlinks"] = [];

  if (exists) {
    try {
      const data = JSON.parse(readFileSync(compFile, "utf8"));
      if (data && data.repositories) {
        for (const [name, repo] of Object.entries<any>(data.repositories)) {
          if (repo && repo.type === "path" && repo.url) {
            const resolved = resolveUserPath(repo.url, rootDir);
            let isLinked = false;
            if (resolved.includes("*")) {
              const baseDir = resolved.replace(/\/?\*.*$/, "");
              try {
                isLinked = existsSync(baseDir) && statSync(baseDir).isDirectory();
              } catch {
                isLinked = false;
              }
            } else {
              isLinked = existsSync(resolved);
            }

            repos.push({
              name,
              type: repo.type,
              url: repo.url,
              resolvedPath: resolved,
              isLinked,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Scan projects for vendor symlinks
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);

  for (const p of projects) {
    if (p.packageManager === "composer" || p.packageManager === "hybrid") {
      const vendorDir = join(p.path, "vendor");
      if (existsSync(vendorDir)) {
        const linked: string[] = [];
        try {
          const vendors = readdirSync(vendorDir);
          for (const v of vendors) {
            const orgDir = join(vendorDir, v);
            if (lstatSync(orgDir).isDirectory()) {
              const subEntries = readdirSync(orgDir);
              for (const sub of subEntries) {
                const subPath = join(orgDir, sub);
                try {
                  const s = lstatSync(subPath);
                  if (s.isSymbolicLink()) {
                    linked.push(`${v}/${sub}`);
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        } catch {
          // ignore
        }

        if (linked.length > 0) {
          symlinks.push({
            projectName: p.name,
            vendorDir: relative(rootDir, vendorDir),
            linkedPackages: linked,
          });
        }
      }
    }
  }

  return {
    configFile: exists ? compFile : undefined,
    exists,
    repositories: repos,
    symlinks,
  };
}

/**
 * Build precise, canonical CLI arguments matching apps/leoms/src/index.ts definitions
 */
export function buildLeomsCliArgs(
  action: string,
  target?: string,
  options: Record<string, any> = {}
): string[] {
  const args: string[] = [];
  const tgt = target?.trim();
  const eco = options.ecosystem;

  switch (action) {
    case "add": {
      args.push("add");
      if (tgt) args.push("-p", tgt);
      if (options.dev) args.push("-D");
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");

      const rawPkgs = options.packages || (options.package ? [options.package] : []);
      const pkgs = Array.isArray(rawPkgs) ? rawPkgs : [rawPkgs];
      if (pkgs.length > 0) {
        args.push(...pkgs);
      }
      break;
    }

    case "remove":
    case "rm": {
      args.push("remove");
      if (tgt) args.push("-p", tgt);
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");

      const rawPkgs = options.packages || (options.package ? [options.package] : []);
      const pkgs = Array.isArray(rawPkgs) ? rawPkgs : [rawPkgs];
      if (pkgs.length > 0) {
        args.push(...pkgs);
      }
      break;
    }

    case "install":
    case "i": {
      args.push("install");
      if (tgt) args.push("-p", tgt);
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");
      break;
    }

    case "build": {
      args.push("build");
      if (tgt) {
        args.push(tgt);
      } else {
        args.push("--all");
      }
      if (options.affected) args.push("--affected");
      if (options.noDeps) args.push("--no-deps");
      if (options.base) args.push("-b", String(options.base));
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");
      break;
    }

    case "check": {
      args.push("check");
      if (tgt) {
        args.push(tgt);
      } else {
        args.push("--all");
      }
      if (options.plan) args.push("--plan");
      if (options.listRules) args.push("--list-rules");
      if (options.only) {
        const rules = Array.isArray(options.only) ? options.only : [options.only];
        args.push("-i", ...rules);
      }
      if (options.skip) {
        const rules = Array.isArray(options.skip) ? options.skip : [options.skip];
        args.push("--skip", ...rules);
      }
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");
      break;
    }

    case "release-dry-run": {
      args.push("release");
      if (tgt) args.push(tgt);
      args.push("--dry-run");
      break;
    }

    case "release":
    case "rel": {
      args.push("release");
      if (tgt) args.push(tgt);
      if (options.dryRun) args.push("--dry-run");
      if (options.patch) args.push("--patch");
      if (options.minor) args.push("--minor");
      if (options.major) args.push("--major");
      if (options.to) args.push("--to", String(options.to));
      if (options.publish) args.push("--publish");
      if (options.noPush) args.push("--no-push");
      if (options.noTag) args.push("--no-tag");
      if (options.noCascade) args.push("--no-cascade");
      if (options.force) args.push("--force");
      if (options.message) args.push("-m", String(options.message));
      if (options.script) args.push("-s", String(options.script));
      break;
    }

    case "plan": {
      args.push("plan");
      if (tgt) args.push(tgt);
      break;
    }

    case "deploy": {
      args.push("deploy");
      if (tgt) args.push(tgt);
      if (options.dryRun) args.push("--dry-run");
      if (options.env) args.push("-e", String(options.env));
      if (options.skipCheck) args.push("--skip-check");
      if (options.skipBuild) args.push("--skip-build");
      if (options.script) args.push("-s", String(options.script));
      break;
    }

    case "doctor": {
      args.push("doctor");
      break;
    }

    case "affected": {
      args.push("affected");
      if (options.base) args.push("-b", String(options.base));
      if (options.plain) args.push("-p");
      if (options.type) args.push("-t", String(options.type));
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");
      break;
    }

    case "status": {
      args.push("status");
      if (tgt) args.push(tgt);
      if (eco === "npm" || options.npm) args.push("--npm");
      else if (eco === "composer" || eco === "php" || options.php) args.push("--php");
      break;
    }

    case "publish":
    case "pub": {
      args.push("publish");
      if (tgt) args.push(tgt);
      if (options.dryRun) args.push("-d");
      if (options.tag) args.push("--tag", String(options.tag));
      if (options.access) args.push("--access", String(options.access));
      if (options.noBuild) args.push("--no-build");
      if (options.force) args.push("-f");
      break;
    }

    default: {
      args.push(action);
      if (tgt) args.push(tgt);
      break;
    }
  }

  return args;
}

/**
 * Execute real CLI tasks asynchronously and stream logs into taskManager
 */
export function executeTaskAsync(
  rootDir: string,
  action: string,
  target?: string,
  optionsOrExtraArgs: Record<string, any> | string[] = {},
  extraArgsList: string[] = []
): TaskStatus {
  let options: Record<string, any> = {};
  let extraArgs: string[] = [];

  if (Array.isArray(optionsOrExtraArgs)) {
    extraArgs = optionsOrExtraArgs;
  } else {
    options = optionsOrExtraArgs || {};
    extraArgs = extraArgsList;
  }

  // Check if an identical task is already running (prevent twin child processes from duplicate dispatch)
  const sortedOptions = Object.keys(options)
    .sort()
    .reduce<Record<string, any>>((acc, k) => {
      acc[k] = options[k];
      return acc;
    }, {});
  const taskFingerprint = `${action}::${target || ""}::${JSON.stringify(sortedOptions)}::${extraArgs.join(",")}`;

  const runningTask = taskManager.findRunningTaskByFingerprint(taskFingerprint);
  if (runningTask) {
    return runningTask;
  }

  const task = taskManager.createTask(action, target);
  taskManager.registerFingerprint(taskFingerprint, task.id);

  // Determine working directory
  let workingDir = rootDir;
  if (options.cwd) {
    workingDir = isAbsolute(options.cwd) ? options.cwd : resolve(rootDir, options.cwd);
  }

  const cliBin = join(rootDir, "apps/leoms/bin/leoms.js");
  const rawCommand = options.rawCommand || options.command;

  let spawnCmd: string;
  let spawnArgs: string[];

  if (action === "raw" || action === "shell" || action === "exec" || rawCommand) {
    const cmdToRun = String(rawCommand || (target ? `${action} ${target}` : action)).trim();
    // Export leoms function so leoms CLI commands work seamlessly inside bash
    const bashScript = `leoms() { node "${cliBin}" "$@"; }; export -f leoms 2>/dev/null || true; ${cmdToRun}`;
    spawnCmd = "bash";
    spawnArgs = ["-c", bashScript];

    taskManager.appendLog(
      task.id,
      "system",
      `🚀 $ ${cmdToRun}\n📁 目录: ${workingDir}\n\n`
    );
  } else {
    const args = buildLeomsCliArgs(action, target, options);
    if (extraArgs.length > 0) {
      args.push(...extraArgs.filter((a) => !args.includes(a)));
    }
    spawnCmd = "node";
    spawnArgs = [cliBin, ...args];

    taskManager.appendLog(
      task.id,
      "system",
      `🚀 正在执行: leoms ${args.join(" ")}\n📁 目录: ${workingDir}\n\n`
    );
  }

  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");

  const proc = spawn(spawnCmd, spawnArgs, {
    cwd: workingDir,
    env: {
      ...process.env,
      LEOMS_DEV: "1",
      LANG: process.env.LANG || "C.UTF-8",
      LC_ALL: process.env.LC_ALL || "C.UTF-8",
      FORCE_COLOR: "1",
    },
  });

  taskManager.registerProcess(task.id, proc);

  proc.stdout.on("data", (data: Buffer) => {
    const chunk = stdoutDecoder.write(data);
    if (chunk) {
      taskManager.appendLog(task.id, "stdout", chunk);
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    const chunk = stderrDecoder.write(data);
    if (chunk) {
      taskManager.appendLog(task.id, "stderr", chunk);
    }
  });

  proc.on("close", (code: number | null) => {
    const remainingOut = stdoutDecoder.end();
    if (remainingOut) taskManager.appendLog(task.id, "stdout", remainingOut);
    const remainingErr = stderrDecoder.end();
    if (remainingErr) taskManager.appendLog(task.id, "stderr", remainingErr);
    taskManager.finishTask(task.id, code ?? 0);
  });

  proc.on("error", (err: Error) => {
    taskManager.appendLog(task.id, "error", `\nFailed to start process: ${err.message}\n`);
    taskManager.finishTask(task.id, 1);
  });

  return task;
}

/**
 * Retrieve all dependencies (npm + composer) for a specific project
 */
export async function getProjectDependencies(
  rootDir: string,
  projectName: string
): Promise<ProjectDependenciesResponse> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const { targets } = resolveTargetProjects(projects, rootDir, projectName);
  const proj = targets[0] || projects.find((p) => p.name === projectName || p.id === projectName);
  if (!proj) {
    throw new Error(`Project "${projectName}" not found`);
  }

  const pkgJsonPath = join(proj.path, "package.json");
  const compJsonPath = join(proj.path, "composer.json");

  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const peerDependencies: Record<string, string> = {};
  const composerRequire: Record<string, string> = {};
  const composerRequireDev: Record<string, string> = {};

  if (existsSync(pkgJsonPath)) {
    try {
      const data = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      if (data.dependencies) Object.assign(dependencies, data.dependencies);
      if (data.devDependencies) Object.assign(devDependencies, data.devDependencies);
      if (data.peerDependencies) Object.assign(peerDependencies, data.peerDependencies);
    } catch {}
  }

  if (existsSync(compJsonPath)) {
    try {
      const data = JSON.parse(readFileSync(compJsonPath, "utf8"));
      if (data.require) Object.assign(composerRequire, data.require);
      if (data["require-dev"]) Object.assign(composerRequireDev, data["require-dev"]);
    } catch {}
  }

  const workspaceMap = new Map(projects.map((p) => [p.name, p]));
  const all: ProjectDependencyEntry[] = [];

  for (const [name, version] of Object.entries(dependencies)) {
    const ws = workspaceMap.get(name);
    all.push({
      name,
      version,
      category: "dependencies",
      ecosystem: "npm",
      isWorkspace: Boolean(ws),
      targetPath: ws?.relativeDir,
    });
  }

  for (const [name, version] of Object.entries(devDependencies)) {
    const ws = workspaceMap.get(name);
    all.push({
      name,
      version,
      category: "devDependencies",
      ecosystem: "npm",
      isWorkspace: Boolean(ws),
      targetPath: ws?.relativeDir,
    });
  }

  for (const [name, version] of Object.entries(peerDependencies)) {
    const ws = workspaceMap.get(name);
    all.push({
      name,
      version,
      category: "peerDependencies",
      ecosystem: "npm",
      isWorkspace: Boolean(ws),
      targetPath: ws?.relativeDir,
    });
  }

  for (const [name, version] of Object.entries(composerRequire)) {
    const ws = workspaceMap.get(name);
    all.push({
      name,
      version,
      category: "require",
      ecosystem: "composer",
      isWorkspace: Boolean(ws),
      targetPath: ws?.relativeDir,
    });
  }

  for (const [name, version] of Object.entries(composerRequireDev)) {
    const ws = workspaceMap.get(name);
    all.push({
      name,
      version,
      category: "require-dev",
      ecosystem: "composer",
      isWorkspace: Boolean(ws),
      targetPath: ws?.relativeDir,
    });
  }

  return {
    projectName: proj.name,
    projectPath: proj.relativeDir,
    packageManager: proj.packageManager,
    dependencies,
    devDependencies,
    peerDependencies,
    composerRequire,
    composerRequireDev,
    all,
  };
}

/**
 * Modify (add, update, remove) a dependency directly in package.json or composer.json
 */
export async function modifyProjectDependency(
  rootDir: string,
  projectName: string,
  payload: {
    action: "add" | "update" | "remove";
    name: string;
    version?: string;
    category?: "dependencies" | "devDependencies" | "peerDependencies" | "require" | "require-dev";
    ecosystem?: "npm" | "composer";
  }
): Promise<{ success: boolean; message: string }> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const { targets } = resolveTargetProjects(projects, rootDir, projectName);
  const proj = targets[0] || projects.find((p) => p.name === projectName || p.id === projectName);
  if (!proj) {
    throw new Error(`Project "${projectName}" not found`);
  }

  const { action, name, version = "latest", category, ecosystem } = payload;
  const isComposer = ecosystem === "composer" || category === "require" || category === "require-dev";

  if (isComposer) {
    const compPath = join(proj.path, "composer.json");
    if (!existsSync(compPath)) throw new Error("composer.json does not exist");
    const raw = readFileSync(compPath, "utf8");
    const compData = JSON.parse(raw);
    const cat = category || "require";
    if (!compData[cat]) compData[cat] = {};

    if (action === "add" || action === "update") {
      compData[cat][name] = version;
    } else if (action === "remove") {
      if (compData[cat]) delete compData[cat][name];
      if (compData.require) delete compData.require[name];
      if (compData["require-dev"]) delete compData["require-dev"][name];
    }
    writeFileSync(compPath, JSON.stringify(compData, null, 4) + "\n", "utf8");
    return { success: true, message: `已成功在 composer.json 中${action === "remove" ? "移除" : "更新"} ${name}` };
  } else {
    const pkgPath = join(proj.path, "package.json");
    if (!existsSync(pkgPath)) throw new Error("package.json does not exist");
    const raw = readFileSync(pkgPath, "utf8");
    const pkgData = JSON.parse(raw);
    const cat = category || "dependencies";
    if (!pkgData[cat]) pkgData[cat] = {};

    if (action === "add" || action === "update") {
      pkgData[cat][name] = version;
    } else if (action === "remove") {
      if (pkgData[cat]) delete pkgData[cat][name];
      if (pkgData.dependencies) delete pkgData.dependencies[name];
      if (pkgData.devDependencies) delete pkgData.devDependencies[name];
      if (pkgData.peerDependencies) delete pkgData.peerDependencies[name];
    }
    writeFileSync(pkgPath, JSON.stringify(pkgData, null, 2) + "\n", "utf8");
    return { success: true, message: `已成功在 package.json 中${action === "remove" ? "移除" : "更新"} ${name}` };
  }
}

/**
 * Search community package registries (NPM or Packagist)
 */
export async function searchRegistry(
  query: string,
  ecosystem: "npm" | "composer" = "npm"
): Promise<{ results: any[]; error?: string }> {
  if (!query || !query.trim()) return { results: [] };
  const q = query.trim();

  if (ecosystem === "composer") {
    try {
      const url = `https://packagist.org/search.json?q=${encodeURIComponent(q)}&per_page=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`Packagist returned HTTP ${res.status}`);
      const data: any = await res.json();
      const results = (data.results || []).map((r: any) => ({
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
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`NPM registry returned HTTP ${res.status}`);
      const data: any = await res.json();
      const results = (data.objects || []).map((o: any) => ({
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

/**
 * Calculate Release & Publish DAG Plan
 */
export async function getPublishPlan(rootDir: string, target?: string): Promise<PublishPlan> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  return calculatePublishPlan(projects, target);
}

/**
 * Initialize workspace structure and files
 */
export async function initWorkspace(
  rootDir: string,
  options: {
    config?: boolean;
    setComposerHome?: boolean;
  } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    await runInit(rootDir, {
      yes: true,
      force: false,
      config: Boolean(options.config),
      setComposerHome: Boolean(options.setComposerHome),
    });
    return { success: true, message: "工作区已成功初始化" };
  } catch (err: any) {
    return { success: false, message: err.message || "初始化工作区失败" };
  }
}

/**
 * Check for outdated dependencies in a project via pnpm or composer
 */
export async function getProjectOutdated(
  rootDir: string,
  projectName: string
): Promise<Record<string, { current: string; latest: string; wanted?: string }>> {
  const ctx = getWorkspaceContext(rootDir);
  const projects = await scanWorkspaceProjects(ctx);
  const { targets } = resolveTargetProjects(projects, rootDir, projectName);
  const proj = targets[0] || projects.find((p) => p.name === projectName || p.id === projectName);
  if (!proj) return {};

  const outdatedMap: Record<string, { current: string; latest: string; wanted?: string }> = {};

  if (proj.packageManager === "npm" || proj.packageManager === "hybrid") {
    try {
      const stdout = await new Promise<string>((resolve) => {
        const proc = spawn("pnpm", ["--filter", proj.name, "outdated", "--format", "json"], {
          cwd: rootDir,
          env: { ...process.env, LANG: "C.UTF-8" },
        });
        let output = "";
        proc.stdout.on("data", (d) => (output += d.toString("utf8")));
        proc.on("close", () => resolve(output.trim()));
        proc.on("error", () => resolve(""));
      });

      if (stdout) {
        const jsonStart = stdout.indexOf("{");
        const jsonEnd = stdout.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
          for (const [name, info] of Object.entries<any>(parsed)) {
            if (info && info.latest) {
              outdatedMap[name.toLowerCase()] = {
                current: info.current || "",
                latest: info.latest,
                wanted: info.wanted,
              };
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (proj.packageManager === "composer" || proj.packageManager === "hybrid") {
    try {
      const stdout = await new Promise<string>((resolve) => {
        const proc = spawn("composer", ["outdated", "-D", "--format=json"], {
          cwd: proj.path,
          env: { ...process.env, LANG: "C.UTF-8" },
        });
        let output = "";
        proc.stdout.on("data", (d) => (output += d.toString("utf8")));
        proc.on("close", () => resolve(output.trim()));
        proc.on("error", () => resolve(""));
      });

      if (stdout) {
        const jsonStart = stdout.indexOf("{");
        const jsonEnd = stdout.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
          const list = parsed.installed || [];
          for (const item of list) {
            if (item && item.name && item.latest) {
              outdatedMap[item.name.toLowerCase()] = {
                current: item.version || "",
                latest: item.latest,
              };
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return outdatedMap;
}
