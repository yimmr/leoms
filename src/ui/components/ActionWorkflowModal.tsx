import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Rocket,
  Send,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Package,
  Tag,
  GitCommit,
  GitBranch,
  X,
  RotateCcw,
  Loader2,
  Layers,
  Sparkles,
  Server,
  FileCode,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  runTask,
  streamTaskLogs,
  runChecks,
  type ProjectModel,
} from "../api/client.js";

export type WorkflowType = "deploy" | "release";

export type WorkflowStage =
  | "dry-run"    // Stage 1: Running automatic dry-run simulation
  | "review"     // Stage 2: Parameters review (only when dry-run passes)
  | "executing"  // Stage 3: Running actual deployment or release
  | "completed"  // Stage 4: Execution finished successfully
  | "failed";    // Stage: Actual execution encountered an error

export interface CheckIssueDetail {
  ruleId?: string;
  ruleName?: string;
  level?: "error" | "warning";
  message: string;
  remedy?: string;
  filePath?: string;
  fileLine?: number;
}

export interface SimulationCheckItem {
  id: string;
  title: string;
  status: "failed" | "warning" | "passed";
  summary: string;
  details: {
    description: string;
    issues?: CheckIssueDetail[];
    recommendation?: string;
    verifiedInfo?: string;
  };
}

export interface ActionWorkflowModalProps {
  isOpen: boolean;
  type: WorkflowType;
  project: ProjectModel;
  allProjects?: ProjectModel[];
  onClose: () => void;
  onSuccess?: () => void;
}

// Simple semver bump helper
function bumpVersion(
  currentVer: string = "0.0.0",
  type: "patch" | "minor" | "major" = "patch"
): string {
  const cleaned = currentVer.trim().replace(/^v/, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  let [major, minor, patch] = match
    ? [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]
    : [0, 1, 0];

  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

export const ActionWorkflowModal: React.FC<ActionWorkflowModalProps> = ({
  isOpen,
  type,
  project,
  allProjects = [],
  onClose,
  onSuccess,
}) => {
  const isDeploy = type === "deploy";
  const currentVersion = project.version || "0.1.0";

  // Workflow stages
  const [stage, setStage] = useState<WorkflowStage>("dry-run");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Simulation (Dry-Run) Outcomes
  const [dryRunPassed, setDryRunPassed] = useState<boolean>(true);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [checkItems, setCheckItems] = useState<SimulationCheckItem[]>([]);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  // Deploy configuration state
  const [deployEnv, setDeployEnv] = useState<string>("production");
  const [lastTestedEnv, setLastTestedEnv] = useState<string>("production");
  const [skipCheck, setSkipCheck] = useState<boolean>(false);
  const [skipBuild, setSkipBuild] = useState<boolean>(false);

  // Release configuration state
  const [releaseBump, setReleaseBump] = useState<"patch" | "minor" | "major" | "custom">("patch");
  const [customVersion, setCustomVersion] = useState<string>("");
  const [isCascade, setIsCascade] = useState<boolean>(true);
  const [isPublish, setIsPublish] = useState<boolean>(true);

  // Target version calculation
  const targetVersion = useMemo(() => {
    if (releaseBump === "custom") {
      return customVersion.trim() || currentVersion;
    }
    return bumpVersion(currentVersion, releaseBump);
  }, [currentVersion, releaseBump, customVersion]);

  // Downstream dependent projects that will be affected by release cascading
  const cascadedDependents = useMemo(() => {
    if (!project.dependents || project.dependents.length === 0) return [];
    return allProjects.filter((p) => project.dependents.includes(p.name));
  }, [project.dependents, allProjects]);

  // Task streaming control refs
  const closeStreamRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // Reset and start automatic dry-run every time modal opens or project changes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      startDryRun();
    } else {
      document.body.style.overflow = "";
      cleanupStream();
    }

    return () => {
      document.body.style.overflow = "";
      cleanupStream();
    };
  }, [isOpen, project.name, type]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const cleanupStream = () => {
    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Toggle item expansion
  const toggleExpand = (id: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 1. Kick off simulation (Dry-Run). Can be run automatically on open or explicitly via bottom button.
  const startDryRun = async (overrideEnv?: string) => {
    cleanupStream();
    setStage("dry-run");
    setErrorMessage(null);
    setElapsedMs(0);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    const activeEnv = overrideEnv || deployEnv;

    try {
      // 1) Trigger detailed gatekeeper check query in parallel to extract rich structured issues
      const checkPromise = runChecks({
        all: true,
        targetPattern: project.name,
      }).catch((err) => {
        console.warn("Direct checks query failed, falling back to log parsing:", err);
        return null;
      });

      // 2) Trigger CLI task dry-run
      const options: Record<string, any> = {
        dryRun: true,
      };

      if (isDeploy) {
        options.env = activeEnv;
        if (skipCheck) options.skipCheck = true;
        if (skipBuild) options.skipBuild = true;
      } else {
        if (releaseBump === "patch") options.patch = true;
        else if (releaseBump === "minor") options.minor = true;
        else if (releaseBump === "major") options.major = true;
        else if (releaseBump === "custom" && customVersion) options.to = customVersion.trim();
        if (!isCascade) options.noCascade = true;
        if (isPublish) options.publish = true;
      }

      const res = await runTask(type, project.name, options);
      const taskId = res.task.id;

      let detectedScriptPath: string | null = null;
      let gatekeeperOk = true;
      let buildOk = true;
      let gitCleanOk = !project.git.isDirty;
      let capturedError = "";

      closeStreamRef.current = streamTaskLogs(
        taskId,
        (log) => {
          const text = log.text || "";

          // Parse script paths
          if (text.includes("deploy.sh") || text.includes("scripts/deploy.sh")) {
            const m = text.match(/([a-zA-Z0-9_\-\.\/]+deploy\.sh)/);
            if (m) detectedScriptPath = m[1];
          }

          // Parse gatekeeper blocks
          if (
            text.includes("未通过全量门禁检查") ||
            text.includes("failed pre-release") ||
            text.includes("failed full gatekeeper") ||
            text.includes("门禁检查未通过")
          ) {
            gatekeeperOk = false;
            capturedError = "门禁安全体检未通过，存在违规阻断规则";
          }

          // Parse dirty git repo
          if (text.includes("未提交的代码变动") || text.includes("uncommitted changes")) {
            gitCleanOk = false;
            if (!capturedError) capturedError = "目标仓库存在未提交的代码修改";
          }

          // Parse build failure
          if (text.includes("构建产物就绪") || text.includes("Build artifacts ready")) {
            buildOk = true;
          } else if (text.includes("构建失败") || text.includes("Build failed")) {
            buildOk = false;
            if (!capturedError) capturedError = "项目依赖或产物构建失败";
          }
        },
        async (finish) => {
          cleanupStream();
          const taskPassed = finish.exitCode === 0;

          // Await structured checks response
          const checksResponse = await checkPromise;
          const errorsCount = checksResponse ? checksResponse.totalErrors : gatekeeperOk ? 0 : 1;
          const warningsCount = checksResponse ? checksResponse.totalWarnings : 0;
          const checkIssues = checksResponse?.issues || [];

          const finalGatekeeperPassed = errorsCount === 0 && (skipCheck ? true : gatekeeperOk);
          const finalGitClean = gitCleanOk;
          const overallPassed = taskPassed && finalGatekeeperPassed;

          setDryRunPassed(overallPassed);
          setLastTestedEnv(activeEnv);

          if (!overallPassed) {
            setDryRunError(
              capturedError ||
                (isDeploy
                  ? "部署演练体检未通过，存在阻断规则或未就绪项"
                  : "发版演练未通过，存在阻断规则或未提交代码")
            );
          } else {
            setDryRunError(null);
          }

          // Build concrete structured checklist items
          const items: SimulationCheckItem[] = [];

          if (isDeploy) {
            // 1. Gatekeeper Item
            const gkStatus = finalGatekeeperPassed
              ? warningsCount > 0
                ? "warning"
                : "passed"
              : "failed";
            items.push({
              id: "gatekeeper",
              title: "门禁安全体检 (Gatekeeper Security)",
              status: gkStatus,
              summary:
                gkStatus === "failed"
                  ? `未通过全量门禁检查 (${errorsCount} 项违规阻断)`
                  : gkStatus === "warning"
                  ? `门禁通过 (存在 ${warningsCount} 项提示警告)`
                  : "全量安全与离仓自洽门禁全绿通过 (0 违规)",
              details: {
                description:
                  "执行全量自洽隔离检查、依赖合规性、版本规范与工作区安全防线。",
                issues: checkIssues.map((issue) => ({
                  ruleId: issue.ruleId,
                  ruleName: issue.ruleName,
                  level: issue.level,
                  message: issue.message,
                  remedy: issue.remedy,
                  filePath: issue.filePath,
                  fileLine: issue.fileLine,
                })),
                recommendation:
                  gkStatus === "failed"
                    ? skipCheck
                      ? "当前已勾选「跳过门禁」，正式执行时将强制旁路。"
                      : "建议根据违规指引修复代码规范，或在下方勾选「跳过门禁」后重新演练。"
                    : undefined,
                verifiedInfo:
                  gkStatus === "passed"
                    ? "已验证项目自洽隔离、依赖环路、包管理器规范与门禁规则，未发现违规。"
                    : undefined,
              },
            });

            // 2. Build Artifacts Item
            const buildStatus = !buildOk
              ? "failed"
              : project.needsBuild || !project.hasBuildArtifact
              ? "warning"
              : "passed";
            items.push({
              id: "build",
              title: "构建产物校验 (Build Artifacts)",
              status: buildStatus,
              summary:
                buildStatus === "failed"
                  ? "构建产物校验失败"
                  : buildStatus === "warning"
                  ? "检测到源码变动，构建产物建议更新"
                  : "应用构建产物就绪且校验一致",
              details: {
                description: "检验项目的构建输出目录与构建产物新鲜度。",
                recommendation:
                  buildStatus === "warning"
                    ? "建议确保产物已构建完成，部署流水线默认亦会自动构建。"
                    : undefined,
                verifiedInfo:
                  buildStatus === "passed"
                    ? "已确认产物输出目录存在，产物新鲜度符合交付标准。"
                    : undefined,
              },
            });

            // 3. Pipeline Script Item
            items.push({
              id: "script",
              title: "部署流水线入口 (Pipeline Script)",
              status: detectedScriptPath ? "passed" : "passed",
              summary: detectedScriptPath
                ? `已探测到专属交付脚本 (${detectedScriptPath.split("/").slice(-2).join("/")})`
                : "采用内置标准流水线调度部署",
              details: {
                description:
                  "探测项目专属 scripts/deploy.sh 或工作区全局 tools/deploy.sh 脚本入口。",
                verifiedInfo: detectedScriptPath
                  ? `脚本探测成功，完整路径: ${detectedScriptPath}`
                  : "未配置专属 deploy.sh，系统将采用默认交付流程。",
              },
            });

            // 4. Git Working Tree Item
            const gitStatus = project.git.isDirty ? "warning" : "passed";
            items.push({
              id: "git",
              title: "Git 代码仓库状态 (Working Tree)",
              status: gitStatus,
              summary:
                gitStatus === "warning"
                  ? `存在 ${project.git.dirtyCount || 1} 处未提交变动 (部署建议洁净)`
                  : "代码仓库工作区洁净",
              details: {
                description: "检测本地仓库是否存在未提交的修改或未追踪文件。",
                recommendation:
                  gitStatus === "warning"
                    ? "部署时建议提交当前修改，以便精准追踪线上交付版本对应的 commit。"
                    : undefined,
                verifiedInfo:
                  gitStatus === "passed"
                    ? `当前分支: ${project.git.branch || "main"}，工作区已完全提交。`
                    : undefined,
              },
            });

            // 5. Target Environment Item
            items.push({
              id: "env",
              title: "目标环境配置 (Target Cluster)",
              status: "passed",
              summary: `已选定交付目标: ${activeEnv} 集群`,
              details: {
                description: "部署指令将携带目标集群参数执行交付调度。",
                verifiedInfo: `目标环境: ${activeEnv}，目标项目路径: ${project.relativeDir}`,
              },
            });
          } else {
            // RELEASE CHECK ITEMS
            // 1. Gatekeeper Item
            const gkStatus = finalGatekeeperPassed
              ? warningsCount > 0
                ? "warning"
                : "passed"
              : "failed";
            items.push({
              id: "gatekeeper",
              title: "发版前安全门禁 (Pre-flight Gatekeeper)",
              status: gkStatus,
              summary:
                gkStatus === "failed"
                  ? `发版门禁未通过 (${errorsCount} 项违规阻断)`
                  : gkStatus === "warning"
                  ? `发版门禁通过 (存在 ${warningsCount} 项警告)`
                  : "发版前全量门禁检查全绿通过",
              details: {
                description: "确保发版代码自洽隔离，无下游循环依赖与规范阻断。",
                issues: checkIssues.map((issue) => ({
                  ruleId: issue.ruleId,
                  ruleName: issue.ruleName,
                  level: issue.level,
                  message: issue.message,
                  remedy: issue.remedy,
                  filePath: issue.filePath,
                  fileLine: issue.fileLine,
                })),
                recommendation:
                  gkStatus === "failed"
                    ? "发版要求门禁全绿通过，请先修复上述规则问题或加 --force 强制发版。"
                    : undefined,
                verifiedInfo:
                  gkStatus === "passed"
                    ? "架构规范与离仓门禁均无违规，允许生成正式版本。"
                    : undefined,
              },
            });

            // 2. Git Working Tree for Release
            const gitStatus = project.git.isDirty ? "failed" : "passed";
            items.push({
              id: "git",
              title: "Git 代码仓库洁净状态 (Git Clean)",
              status: gitStatus,
              summary:
                gitStatus === "failed"
                  ? "工作区存在未提交代码变动，发版已阻断"
                  : "Git 工作区洁净已提交，符合发版要求",
              details: {
                description:
                  "发版流程将自动创建发布 Commit 与 Git Tag，必须确保无未提交变动。",
                recommendation:
                  gitStatus === "failed"
                    ? "请先执行 git commit 提交代码或 git stash 暂存修改后再重新演练。"
                    : undefined,
                verifiedInfo:
                  gitStatus === "passed"
                    ? `工作区完全洁净，分支 ${project.git.branch || "main"} 就绪。`
                    : undefined,
              },
            });

            // 3. Semver Evolution
            items.push({
              id: "semver",
              title: "版本演进规则 (Semantic Versioning)",
              status: "passed",
              summary: `版本将从 v${currentVersion} 升级至 v${targetVersion} (${releaseBump})`,
              details: {
                description:
                  "自动修改项目配置文件 package.json / composer.json 中的版本号。",
                verifiedInfo: `基线版本: v${currentVersion} ➜ 目标版本: v${targetVersion}`,
              },
            });

            // 4. Downstream Cascading
            items.push({
              id: "cascading",
              title: "下游依赖级联 (Workspace Cascading)",
              status: "passed",
              summary:
                cascadedDependents.length > 0
                  ? `将自动级联升级 ${cascadedDependents.length} 个下游引用模块`
                  : "当前项目无下游引用依赖，无需级联",
              details: {
                description:
                  "若下游项目引用了此模块，自动将其约束升级为最新版本。",
                verifiedInfo:
                  cascadedDependents.length > 0
                    ? `将级联更新项目: ${cascadedDependents.map((d) => d.name).join(", ")}`
                    : "当前项目为叶子节点应用，无下游依赖级联需要。",
              },
            });

            // 5. Git Tag & Distribution
            items.push({
              id: "tag",
              title: "Git Tag 与生态分发 (Distribution)",
              status: "passed",
              summary: `将生成标签 v${targetVersion} 并同步至 ${project.packageManager === "composer" ? "Packagist" : "NPM"}`,
              details: {
                description: "创建 Git 标签并在生态中广播发布。",
                verifiedInfo: `发布标签: v${targetVersion}，提交消息: chore(release): release ${project.name}@v${targetVersion}`,
              },
            });
          }

          if (!overallPassed && !items.some((i) => i.status === "failed")) {
            items.unshift({
              id: "pipeline_error",
              title: isDeploy ? "部署前置检测中断" : "发版前置检测中断",
              status: "failed",
              summary: capturedError || "演练进程异常退出，未通过前置安全或环境检查",
              details: {
                description: "在模拟执行任务流程时捕获到底层异常或前置校验未通过。",
                recommendation: capturedError || "请检查项目配置、依赖环境与脚本权限后重新演练。",
              },
            });
          }

          setCheckItems(items);

          // Auto-expand any failed or warning items so the user immediately sees details
          const autoExpand = new Set<string>();
          items.forEach((item) => {
            if (item.status === "failed" || item.status === "warning") {
              autoExpand.add(item.id);
            }
          });
          setExpandedItemIds(autoExpand);

          // IMPORTANT: If dry run passed, advance to review stage. If NOT passed, stay on dry-run results screen!
          if (overallPassed) {
            setStage("review");
          } else {
            // Stay on dry-run simulation screen (do NOT advance to next confirmation phase)
            setStage("dry-run");
          }
        }
      );
    } catch (err: any) {
      cleanupStream();
      setDryRunPassed(false);
      setDryRunError(err.message || "演练进程启动失败");
      setStage("dry-run");
    }
  };

  // 2. Execute actual deployment / release
  const handleExecuteActual = async () => {
    cleanupStream();
    setStage("executing");
    setErrorMessage(null);
    setElapsedMs(0);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    try {
      const options: Record<string, any> = {
        dryRun: false,
      };

      if (isDeploy) {
        options.env = deployEnv;
        if (skipCheck) options.skipCheck = true;
        if (skipBuild) options.skipBuild = true;
      } else {
        if (releaseBump === "patch") options.patch = true;
        else if (releaseBump === "minor") options.minor = true;
        else if (releaseBump === "major") options.major = true;
        else if (releaseBump === "custom" && customVersion) options.to = customVersion.trim();
        if (!isCascade) options.noCascade = true;
        if (isPublish) options.publish = true;
      }

      const res = await runTask(type, project.name, options);
      const taskId = res.task.id;

      closeStreamRef.current = streamTaskLogs(
        taskId,
        () => {
          // Streaming active
        },
        (finish) => {
          cleanupStream();
          if (finish.exitCode === 0) {
            setStage("completed");
            onSuccess?.();
          } else {
            setStage("failed");
            setErrorMessage(
              isDeploy
                ? `部署流水线执行中断 (退出码: ${finish.exitCode})，请排查脚本与环境。`
                : `发版流程执行中断 (退出码: ${finish.exitCode})，请排查仓库权限与配置。`
            );
          }
        }
      );
    } catch (err: any) {
      cleanupStream();
      setStage("failed");
      setErrorMessage(err.message || "执行进程启动失败");
    }
  };

  // Cancel handler
  const handleCancel = () => {
    cleanupStream();
    onClose();
  };

  if (!isOpen) return null;

  // Prioritize failed and warning check items first!
  const sortedCheckItems = useMemo(() => {
    return [...checkItems].sort((a, b) => {
      const score = (status: "failed" | "warning" | "passed") => {
        if (status === "failed") return 0;
        if (status === "warning") return 1;
        return 2;
      };
      return score(a.status) - score(b.status);
    });
  }, [checkItems]);

  const failedCount = checkItems.filter((i) => i.status === "failed").length;
  const warningCount = checkItems.filter((i) => i.status === "warning").length;
  const passedCount = checkItems.filter((i) => i.status === "passed").length;

  const isSimulationInProgress = stage === "dry-run" && checkItems.length === 0;
  const isSimulationFinishedBlocked = stage === "dry-run" && checkItems.length > 0 && !dryRunPassed;
  const hasEnvChangedSinceDryRun = isDeploy && deployEnv !== lastTestedEnv;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-dialog-title"
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 apple-modal-backdrop"
    >
      {/* Backdrop */}
      <div
        onClick={stage === "executing" ? undefined : handleCancel}
        className="absolute inset-0 cursor-pointer"
        aria-label="点击背景取消"
      />

      {/* Main Glass Workflow Window */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="apple-modal-window relative z-10 w-full max-w-2xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header with Title and Cancel/Close */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-sm ${
                isDeploy
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
              }`}
            >
              {isDeploy ? <Send size={20} /> : <Rocket size={20} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="workflow-dialog-title" className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-mono">
                  {isDeploy ? "自动化部署流水线" : "多模块发版管理器"}
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold font-mono">
                  {project.name}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                {isDeploy
                  ? "模拟演练预检、安全门禁扫描、产物就绪校验与自动化交付"
                  : "语义化版本演进、安全体检演练、下游依赖级联与 Git 发版"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            title="随时取消并退出"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper Indicator (Reflects true progression: blocked dry run does NOT advance to step 2!) */}
        <div className="px-6 py-3 border-b border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-[#0f172a] shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-muted)]">
            {/* Step 1: 模拟演练 */}
            <div className={`flex items-center gap-1.5 ${
              stage === "dry-run"
                ? dryRunPassed
                  ? "text-sky-600 dark:text-sky-400"
                  : "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono font-bold ${
                  stage === "dry-run"
                    ? isSimulationInProgress
                      ? "bg-sky-500 text-white animate-pulse"
                      : dryRunPassed
                      ? "bg-sky-500 text-white"
                      : "bg-rose-500 text-white"
                    : "bg-emerald-500 text-white"
                }`}
              >
                {stage === "dry-run" ? (isSimulationInProgress ? "1" : dryRunPassed ? "1" : "!") : "✓"}
              </div>
              <span>{isSimulationFinishedBlocked ? "演练未通过" : "模拟演练"}</span>
            </div>
            <div
              className={`h-0.5 flex-1 mx-2 ${
                stage === "review" || stage === "executing" || stage === "completed"
                  ? "bg-emerald-500"
                  : "bg-slate-200 dark:bg-slate-800"
              }`}
            />

            {/* Step 2: 结果与参数确认 (Only reached when dry run passes!) */}
            <div className={`flex items-center gap-1.5 ${
              stage === "review"
                ? "text-sky-600 dark:text-sky-400 font-bold"
                : stage === "executing" || stage === "completed"
                ? "text-emerald-600 dark:text-emerald-400"
                : "opacity-60"
            }`}>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono ${
                  stage === "review"
                    ? "bg-sky-500 text-white"
                    : stage === "executing" || stage === "completed"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 dark:bg-slate-800"
                }`}
              >
                {stage === "executing" || stage === "completed" ? "✓" : "2"}
              </div>
              <span>结果确认</span>
            </div>
            <div
              className={`h-0.5 flex-1 mx-2 ${
                stage === "executing" || stage === "completed" ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
              }`}
            />

            {/* Step 3: 正式执行 */}
            <div className={`flex items-center gap-1.5 ${
              stage === "executing"
                ? "text-sky-600 dark:text-sky-400 font-bold"
                : stage === "completed"
                ? "text-emerald-600 dark:text-emerald-400"
                : "opacity-60"
            }`}>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono ${
                  stage === "executing"
                    ? "bg-sky-500 text-white animate-pulse"
                    : stage === "completed"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 dark:bg-slate-800"
                }`}
              >
                {stage === "completed" ? "✓" : "3"}
              </div>
              <span>正式执行</span>
            </div>
            <div
              className={`h-0.5 flex-1 mx-2 ${
                stage === "completed" ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
              }`}
            />

            {/* Step 4: 完成 */}
            <div className={`flex items-center gap-1.5 ${stage === "completed" ? "text-emerald-600 dark:text-emerald-400 font-bold" : "opacity-60"}`}>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono ${
                  stage === "completed" ? "bg-emerald-500 text-white font-bold" : "bg-slate-200 dark:bg-slate-800"
                }`}
              >
                4
              </div>
              <span>完成</span>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-[320px] space-y-5 bg-slate-50/40 dark:bg-slate-950/20">
          {/* ================= 1. INITIAL DRY-RUN IN PROGRESS ================= */}
          {isSimulationInProgress && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-500 animate-pulse">
                  {isDeploy ? <Send size={30} /> : <Rocket size={30} />}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shadow">
                  <Loader2 size={14} className="animate-spin" />
                </div>
              </div>

              <div className="space-y-1 max-w-md">
                <h4 className="text-base font-bold text-[var(--text-primary)]">
                  正在自动执行{isDeploy ? "部署" : "发版"}模拟演练...
                </h4>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  系统正在为您进行门禁安全体检、检测构建产物、分析下游级联依赖并排查交付路径。整个过程为只读仿真，不修改任何文件。
                </p>
              </div>

              <div className="text-[11px] text-[var(--text-muted)] font-mono pt-2">
                演练已耗时: {(elapsedMs / 1000).toFixed(1)}s
              </div>
            </div>
          )}

          {/* ================= 2. SIMULATION RESULTS & CHECKLIST (Shown for BOTH blocked and passed) ================= */}
          {(stage === "review" || isSimulationFinishedBlocked) && (
            <div className="space-y-4 animate-fadeIn">
              {/* Banner: Passed vs Blocked */}
              {dryRunPassed ? (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                    <span>模拟演练全量通过！各项前置安全指标均已就绪，可确认交付。</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                    DRY-RUN PASSED
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-start justify-between gap-3 shadow-sm">
                  <div className="flex items-start gap-2.5 text-xs sm:text-sm">
                    <AlertTriangle size={18} className="shrink-0 text-rose-500 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold">演练未通过：{dryRunError || "检测到前置检查未满足"}</span>
                      <p className="text-[11px] text-rose-500/85 dark:text-rose-400/85 leading-relaxed">
                        当前尚未进入确认阶段。未通过项已在下方置顶标红展示，点击可展开排查细节。调整参数后请点击底部「重新演练」。
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold shrink-0">
                    BLOCKED ({failedCount})
                  </span>
                </div>
              )}

              {/* Environment Notice if cluster was changed after dry run */}
              {hasEnvChangedSinceDryRun && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>已切换至「{deployEnv}」集群，可点击底部「重新演练」进行针对性测试。</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => startDryRun()}
                    className="text-[11px] underline font-semibold cursor-pointer hover:opacity-80"
                  >
                    立即重新演练
                  </button>
                </div>
              )}

              {/* ================= COMPREHENSIVE CHECKLIST (PRIORITIZING FAILED ITEMS!) ================= */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-sky-500" />
                    <span>全流程演练体检明细 ({checkItems.length} 项)</span>
                  </span>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                    {failedCount > 0 && <span className="text-rose-500 font-bold">✖ {failedCount} 未通过</span>}
                    {warningCount > 0 && <span className="text-amber-500 font-bold">⚠ {warningCount} 警告</span>}
                    <span className="text-emerald-500 font-bold">✔ {passedCount} 已通过</span>
                  </div>
                </div>

                {/* Checklist Cards Container: Sorted with FAILED FIRST */}
                <div className="space-y-2">
                  {sortedCheckItems.map((item) => {
                    const isExpanded = expandedItemIds.has(item.id);
                    const isFailed = item.status === "failed";
                    const isWarning = item.status === "warning";
                    const isPassed = item.status === "passed";

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border transition-all overflow-hidden ${
                          isFailed
                            ? "bg-rose-500/[0.04] dark:bg-rose-500/[0.08] border-rose-500/30 hover:border-rose-500/50"
                            : isWarning
                            ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.08] border-amber-500/30 hover:border-amber-500/50"
                            : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        {/* Clickable Card Header */}
                        <div
                          onClick={() => toggleExpand(item.id)}
                          className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Status Icon */}
                            <div className="shrink-0">
                              {isFailed ? (
                                <AlertCircle size={17} className="text-rose-500" />
                              ) : isWarning ? (
                                <AlertTriangle size={17} className="text-amber-500" />
                              ) : (
                                <CheckCircle2 size={17} className="text-emerald-500" />
                              )}
                            </div>

                            {/* Title & Summary */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-bold ${
                                  isFailed
                                    ? "text-rose-600 dark:text-rose-400"
                                    : isWarning
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-[var(--text-primary)]"
                                }`}>
                                  {item.title}
                                </span>
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                    isFailed
                                      ? "bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30"
                                      : isWarning
                                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30"
                                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                                  }`}
                                >
                                  {isFailed ? "未通过" : isWarning ? "警告项" : "已通过"}
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                                {item.summary}
                              </p>
                            </div>
                          </div>

                          {/* Expand / Collapse Indicator */}
                          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] shrink-0">
                            <span className="text-[11px] hidden sm:inline opacity-75">
                              {isExpanded ? "收起" : "查看详情"}
                            </span>
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        </div>

                        {/* Detailed Diagnostic Body (Expanded on Click) */}
                        {isExpanded && (
                          <div className="px-3 sm:px-4 pb-3.5 pt-1 border-t border-slate-200/60 dark:border-slate-800/80 text-xs space-y-2.5 animate-fadeIn">
                            <p className="text-[11px] text-[var(--text-secondary)]">
                              {item.details.description}
                            </p>

                            {/* Issues List if present */}
                            {item.details.issues && item.details.issues.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {item.details.issues.map((iss, idx) => (
                                  <div
                                    key={idx}
                                    className="p-2.5 rounded-lg bg-rose-500/[0.08] dark:bg-rose-500/[0.12] border border-rose-500/25 text-rose-700 dark:text-rose-300 space-y-1"
                                  >
                                    <div className="flex items-center justify-between font-mono text-[11px]">
                                      <span className="font-bold">{iss.ruleId || "安全门禁规则"}</span>
                                      {iss.filePath && (
                                        <span className="text-rose-500/80 truncate max-w-[200px]" title={iss.filePath}>
                                          {iss.filePath.split("/").slice(-2).join("/")}
                                          {iss.fileLine ? `:${iss.fileLine}` : ""}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs font-sans">{iss.message}</p>
                                    {iss.remedy && (
                                      <p className="text-[11px] text-[var(--text-muted)] pt-0.5">
                                        💡 建议修复：{iss.remedy}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Recommendation Note */}
                            {item.details.recommendation && (
                              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed">
                                {item.details.recommendation}
                              </div>
                            )}

                            {/* Verified Info (for passed items) */}
                            {item.details.verifiedInfo && (
                              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                                ✔ {item.details.verifiedInfo}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ================= CONFIGURATION & PARAMETERS CARDS ================= */}
              {isDeploy ? (
                /* DEPLOY CONFIGURATION */
                <div className="space-y-3 pt-2">
                  {/* Environment / Cluster Selector (Click ONLY updates selection, does NOT immediately re-run!) */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Server size={14} className="text-emerald-500" />
                        <span>目标部署环境</span>
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">点击切换（需重测请点击底部按钮）</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { key: "production", label: "生产环境 (Production)", badge: "PROD" },
                        { key: "staging", label: "预发布环境 (Staging)", badge: "STAGE" },
                        { key: "test", label: "测试环境 (Testing)", badge: "TEST" },
                      ].map((env) => {
                        const active = deployEnv === env.key;
                        const wasTested = lastTestedEnv === env.key;
                        return (
                          <button
                            key={env.key}
                            type="button"
                            onClick={() => setDeployEnv(env.key)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              active
                                ? "bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12] border-emerald-500/50 shadow-sm"
                                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[var(--text-primary)]">{env.badge}</span>
                              {active && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] mt-1 truncate">{env.label}</div>
                            {active && !wasTested && (
                              <span className="inline-block text-[10px] text-amber-500 dark:text-amber-400 mt-1 font-medium">
                                待重新演练
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Advanced Safety Toggles */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] font-medium">高级安全选项</span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={skipCheck}
                          onChange={(e) => setSkipCheck(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-[var(--text-muted)]">跳过门禁 (--skip-check)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={skipBuild}
                          onChange={(e) => setSkipBuild(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-[var(--text-muted)]">跳过构建 (--skip-build)</span>
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                /* RELEASE CONFIGURATION */
                <div className="space-y-3 pt-2">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Tag size={14} className="text-purple-500" />
                        <span>版本演进规则 (Semver)</span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">当前基线: v{currentVersion}</span>
                    </div>

                    {/* Version Selector Buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { key: "patch", label: "补丁 (Patch)", target: bumpVersion(currentVersion, "patch") },
                        { key: "minor", label: "次版本 (Minor)", target: bumpVersion(currentVersion, "minor") },
                        { key: "major", label: "主版本 (Major)", target: bumpVersion(currentVersion, "major") },
                        { key: "custom", label: "自定义版本", target: "手动指定" },
                      ].map((item) => {
                        const active = releaseBump === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setReleaseBump(item.key as any)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                              active
                                ? "bg-purple-500/[0.08] dark:bg-purple-500/[0.15] border-purple-500/50 shadow-sm"
                                : "bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300"
                            }`}
                          >
                            <div className="text-xs font-bold text-[var(--text-primary)]">{item.label}</div>
                            <div className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                              {item.key === "custom" ? (customVersion ? `v${customVersion}` : "手动输入") : `v${item.target}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Version Input */}
                    {releaseBump === "custom" && (
                      <div className="flex items-center gap-2 pt-1 animate-fadeIn">
                        <span className="text-xs font-mono text-[var(--text-muted)]">v</span>
                        <input
                          type="text"
                          value={customVersion}
                          onChange={(e) => setCustomVersion(e.target.value)}
                          placeholder="例如 1.2.0-beta.1"
                          className="apple-glass-input text-xs py-1.5 px-3 rounded-lg flex-1 font-mono"
                        />
                      </div>
                    )}

                    {/* Version Evolution Display Banner */}
                    <div className="p-3.5 rounded-xl bg-purple-500/[0.06] dark:bg-purple-500/[0.1] border border-purple-500/25 flex items-center justify-center gap-4 text-center">
                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">发版前版本</span>
                        <span className="font-mono font-bold text-sm text-[var(--text-secondary)]">v{currentVersion}</span>
                      </div>
                      <ArrowRight size={18} className="text-purple-500" />
                      <div>
                        <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold block">发版后新版本</span>
                        <span className="font-mono font-extrabold text-base text-purple-600 dark:text-purple-300">
                          v{targetVersion}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= STAGE 3: EXECUTING ================= */}
          {stage === "executing" && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-fadeIn">
              <div className="relative">
                <div
                  className={`w-20 h-20 rounded-3xl border flex items-center justify-center animate-pulse shadow-lg ${
                    isDeploy
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shadow-emerald-500/10"
                      : "bg-purple-500/10 text-purple-500 border-purple-500/30 shadow-purple-500/10"
                  }`}
                >
                  {isDeploy ? <Send size={36} /> : <Rocket size={36} />}
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-sky-500 text-white flex items-center justify-center shadow">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-md">
                <h4 className="text-lg font-bold text-[var(--text-primary)]">
                  {isDeploy ? `正在部署至 ${deployEnv} 环境...` : `正在发布 v${targetVersion}...`}
                </h4>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {isDeploy
                    ? "正在调度部署流水线并执行环境交付，请稍候..."
                    : "正在更新项目清单配置文件、级联下游依赖、生成 Git 提交与发布标签..."}
                </p>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-mono text-[var(--text-muted)] shadow-inner">
                <Loader2 size={12} className="animate-spin text-sky-500" />
                <span>运行耗时: {(elapsedMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}

          {/* ================= STAGE 4: COMPLETED ================= */}
          {stage === "completed" && (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-md">
                <CheckCircle2 size={34} />
              </div>

              <div className="space-y-1.5 max-w-md">
                <h4 className="text-lg font-bold text-[var(--text-primary)]">
                  {isDeploy ? "🎉 部署已圆满成功！" : "🎉 发版流程圆满完成！"}
                </h4>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {isDeploy
                    ? `项目 ${project.name} 已顺利交付至 ${deployEnv} 环境。`
                    : `项目 ${project.name} 已成功升版至 v${targetVersion}，相关配置文件与下游依赖已全部同步。`}
                </p>
              </div>

              <div className="w-full max-w-md p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">操作目标</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{project.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">{isDeploy ? "部署环境" : "发版版本"}</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {isDeploy ? deployEnv : `v${targetVersion}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">总耗时</span>
                  <span className="font-mono text-[var(--text-secondary)]">{(elapsedMs / 1000).toFixed(1)}s</span>
                </div>
              </div>
            </div>
          )}

          {/* ================= STAGE: FAILED (Live Execution Failure) ================= */}
          {stage === "failed" && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
                <AlertCircle size={32} />
              </div>

              <div className="space-y-1.5 max-w-md">
                <h4 className="text-base font-bold text-[var(--text-primary)]">
                  {isDeploy ? "实际部署执行中断" : "实际发版执行中断"}
                </h4>
                <p className="text-xs text-rose-500 leading-relaxed">
                  {errorMessage || "执行过程中捕获到异常退出码，请排查相关依赖或权限。"}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStage("review")}
                  className="apple-glass-button text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RotateCcw size={13} />
                  <span>返回参数界面</span>
                </button>
                <button
                  type="button"
                  onClick={() => startDryRun()}
                  className="apple-glass-button primary text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>重新执行演练</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          {/* Left: Cancel Button */}
          <div>
            {stage !== "completed" ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              >
                取消
              </button>
            ) : (
              <span className="text-xs text-[var(--text-muted)] font-mono">交付已达成</span>
            )}
          </div>

          {/* Right: Stage-driven Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* If Dry-run was blocked, DO NOT enter next confirmation stage; show Re-run Dry-run button */}
            {isSimulationFinishedBlocked && (
              <button
                type="button"
                onClick={() => startDryRun()}
                className="px-5 py-2 text-xs sm:text-sm font-bold rounded-xl text-white bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 shadow-lg shadow-amber-600/25 transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <RotateCcw size={14} />
                <span>重新演练测试</span>
              </button>
            )}

            {/* If Dry-run is currently running */}
            {isSimulationInProgress && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-medium">
                <Loader2 size={14} className="animate-spin text-sky-500" />
                <span>演练测试中...</span>
              </div>
            )}

            {/* Review Stage (Dry-run passed!) */}
            {stage === "review" && (
              <>
                <button
                  type="button"
                  onClick={() => startDryRun()}
                  className={`apple-glass-button text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    hasEnvChangedSinceDryRun
                      ? "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10 font-bold"
                      : ""
                  }`}
                  title="重新进行安全模拟演练"
                >
                  <RotateCcw size={13} />
                  <span>重新演练</span>
                  {hasEnvChangedSinceDryRun && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />}
                </button>

                <button
                  type="button"
                  onClick={handleExecuteActual}
                  className={`px-5 py-2 text-xs sm:text-sm font-bold rounded-xl text-white shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98] ${
                    isDeploy
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/25"
                      : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-600/25"
                  }`}
                >
                  {isDeploy ? <Send size={14} /> : <Rocket size={14} />}
                  <span>{isDeploy ? "确认执行部署" : `确认发版 (v${targetVersion})`}</span>
                </button>
              </>
            )}

            {/* Executing Stage */}
            {stage === "executing" && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer"
              >
                中止执行
              </button>
            )}

            {/* Completed Stage */}
            {stage === "completed" && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
              >
                完成并关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
