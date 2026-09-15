import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Package,
  Layers,
  GitBranch,
  AlertCircle,
  Search,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Hammer,
  Rocket,
  Send,
  MoreHorizontal,
  Share2,
  Table as TableIcon,
  LayoutGrid,
  X,
  ChevronRight,
  Folder,
  Stethoscope,
  PackageCheck,
  Info,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  Terminal,
  PackagePlus,
} from "lucide-react";
import type { WorkspaceStatusResponse, ProjectModel } from "../api/client.js";
import { DependencyManager } from "./DependencyManager.js";
import { TaskTerminal, type TaskTarget } from "./TaskTerminal.js";
import { ActionWorkflowModal } from "./ActionWorkflowModal.js";

interface DashboardViewProps {
  status: WorkspaceStatusResponse | null;
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
  onSelectProjectForTopology?: (projectName: string) => void;
  onRunProjectTask?: (action: string, projectName: string) => void;
  onRunCheckOnProject?: (projectName: string) => void;
  activeStatus?: string;
  onStatusChange?: (status: string) => void;
  activeStandalone?: string;
  onStandaloneChange?: (standalone: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  status,
  error,
  loading,
  onRetry,
  onSelectProjectForTopology,
  onRunProjectTask,
  onRunCheckOnProject,
  activeStatus: propActiveStatus,
  onStatusChange,
  activeStandalone: propActiveStandalone,
  onStandaloneChange,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeEcosystem, setActiveEcosystem] = useState<string>("all");
  const [internalStandalone, setInternalStandalone] = useState<string>("all");
  const [internalStatus, setInternalStatus] = useState<string>("all");

  const activeStatus = propActiveStatus !== undefined ? propActiveStatus : internalStatus;
  const setActiveStatus = (val: string | ((prev: string) => string)) => {
    const nextVal = typeof val === "function" ? val(activeStatus) : val;
    if (onStatusChange) onStatusChange(nextVal);
    else setInternalStatus(nextVal);
  };

  const activeStandalone = propActiveStandalone !== undefined ? propActiveStandalone : internalStandalone;
  const setActiveStandalone = (val: string | ((prev: string) => string)) => {
    const nextVal = typeof val === "function" ? val(activeStandalone) : val;
    if (onStandaloneChange) onStandaloneChange(nextVal);
    else setInternalStandalone(nextVal);
  };

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [inspectedProject, setInspectedProject] = useState<ProjectModel | null>(null);
  const [modalTab, setModalTab] = useState<"overview" | "installed" | "search">("overview");
  const [listModalTask, setListModalTask] = useState<TaskTarget | null>(null);
  const [embeddedModalTask, setEmbeddedModalTask] = useState<TaskTarget | null>(null);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState<boolean>(false);
  const [terminalRunning, setTerminalRunning] = useState<boolean>(false);
  const [terminalExitCode, setTerminalExitCode] = useState<number | null>(null);
  const [dependencyRefreshKey, setDependencyRefreshKey] = useState<number>(0);
  const autoCollapseTimerRef = useRef<any>(null);
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Interactive Action Workflow Modal for Deploy & Release
  const [workflowModal, setWorkflowModal] = useState<{
    type: "deploy" | "release";
    project: ProjectModel;
  } | null>(null);

  const handleOpenProjectModal = (project: ProjectModel) => {
    setInspectedProject(project);
    setModalTab("overview");
    setEmbeddedModalTask(null);
    setIsTerminalExpanded(false);
    setTerminalRunning(false);
    setTerminalExitCode(null);
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
  };

  const handleRunListTask = (action: string, projectName: string, title?: string) => {
    setListModalTask({
      action,
      target: projectName,
      title: title || `${action === "build" ? "构建" : action === "release-dry-run" ? "发版演练" : action === "deploy" ? "部署" : action} - ${projectName}`,
    });
  };

  const handleRunEmbeddedTask = (taskOrAction: TaskTarget | string) => {
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }

    const targetTask: TaskTarget =
      typeof taskOrAction === "string"
        ? {
            action: taskOrAction,
            target: inspectedProject?.name,
            title: `${taskOrAction === "build" ? "构建" : taskOrAction === "install" ? "同步依赖" : taskOrAction === "release-dry-run" ? "发版演练" : taskOrAction === "deploy" ? "部署" : taskOrAction} - ${inspectedProject?.name}`,
          }
        : taskOrAction;

    setEmbeddedModalTask(targetTask);
    setIsTerminalExpanded(true);
  };

  // Keyboard shortcut: Cmd+K / Ctrl+K or '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close floating popover when clicking anywhere outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuProjectId(null);
    if (activeMenuProjectId) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [activeMenuProjectId]);

  // Close modal when pressing Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspectedProject(null);
    };
    if (inspectedProject) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [inspectedProject]);

  // Flatten all projects safely
  const allProjects: ProjectModel[] = useMemo(() => {
    if (!status?.categories) return [];
    return Object.values(status.categories).flat();
  }, [status]);

  // Reset filters handler
  const handleResetFilters = () => {
    setActiveCategory("all");
    setActiveEcosystem("all");
    setActiveStandalone("all");
    setActiveStatus("all");
    setSearchQuery("");
  };

  // Active granular filter labels for button display & badge status
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (activeEcosystem === "npm") labels.push("Node");
    else if (activeEcosystem === "composer") labels.push("PHP");
    else if (activeEcosystem === "hybrid") labels.push("双生态");

    if (activeStandalone === "standalone") labels.push("独立仓库");
    else if (activeStandalone === "monorepo") labels.push("子模块");

    if (activeStatus === "dirty") labels.push("未提交");
    else if (activeStatus === "needs_build") labels.push("待构建");
    else if (activeStatus === "unreleased") labels.push("未发布");
    else if (activeStatus === "clean") labels.push("洁净");

    return labels;
  }, [activeEcosystem, activeStandalone, activeStatus]);

  const isGranularFilterActive = activeFilterLabels.length > 0;

  // Granular-only reset handler (keeps category & search intact)
  const handleResetGranularFilters = () => {
    setActiveEcosystem("all");
    setActiveStandalone("all");
    setActiveStatus("all");
  };

  const isAnyFilterActive =
    activeCategory !== "all" ||
    activeEcosystem !== "all" ||
    activeStandalone !== "all" ||
    activeStatus !== "all" ||
    Boolean(searchQuery.trim());

  // Dynamic counts for all granular filter pills
  const counts = useMemo(() => {
    return {
      all: allProjects.length,
      // Ecosystem
      ecoNpm: allProjects.filter((p) => p.packageManager === "npm" || p.packageManager === "hybrid").length,
      ecoComposer: allProjects.filter((p) => p.packageManager === "composer" || p.packageManager === "hybrid").length,
      ecoHybrid: allProjects.filter((p) => p.packageManager === "hybrid").length,
      // Git Structure
      standalone: allProjects.filter((p) => p.git.isStandalone).length,
      nonStandalone: allProjects.filter((p) => !p.git.isStandalone).length,
      // Status
      dirty: allProjects.filter((p) => p.git.isDirty).length,
      clean: allProjects.filter((p) => !p.git.isDirty).length,
      needsBuild: allProjects.filter((p) => p.needsBuild || !p.hasBuildArtifact).length,
      unreleased: allProjects.filter((p) => p.git.hasUnpublished || p.git.commitsAhead > 0).length,
    };
  }, [allProjects]);

  // Granular Filter projects
  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      // 1. Category
      if (activeCategory !== "all" && p.category !== activeCategory) {
        return false;
      }

      // 2. Ecosystem
      if (activeEcosystem !== "all") {
        if (activeEcosystem === "npm" && p.packageManager !== "npm" && p.packageManager !== "hybrid") return false;
        if (activeEcosystem === "composer" && p.packageManager !== "composer" && p.packageManager !== "hybrid") return false;
        if (activeEcosystem === "hybrid" && p.packageManager !== "hybrid") return false;
      }

      // 3. Standalone vs Non-standalone
      if (activeStandalone === "standalone" && !p.git.isStandalone) {
        return false;
      }
      if (activeStandalone === "monorepo" && p.git.isStandalone) {
        return false;
      }

      // 4. Status
      if (activeStatus === "dirty" && !p.git.isDirty) {
        return false;
      }
      if (activeStatus === "clean" && p.git.isDirty) {
        return false;
      }
      if (activeStatus === "needs_build" && (!p.needsBuild && p.hasBuildArtifact)) {
        return false;
      }
      if (activeStatus === "unreleased" && (!p.git.hasUnpublished && p.git.commitsAhead <= 0)) {
        return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.relativeDir.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.git.branch && p.git.branch.toLowerCase().includes(q)) ||
          (p.version && p.version.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [allProjects, activeCategory, activeEcosystem, activeStandalone, activeStatus, searchQuery]);

  if (!status) {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-lg mx-auto">
          <div className="apple-glass-card p-8 w-full space-y-4 border-amber-500/30">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <AlertCircle size={28} />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              未能连接到 leoms 核心服务
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              当前页面未能连接到后台 API（<code className="text-sky-400 font-mono">http://localhost:3200</code>）。
            </p>
            <div className="p-3 rounded-xl bg-black/25 text-left text-xs font-mono text-[var(--text-muted)] space-y-1">
              <div className="text-slate-300 font-bold">请在终端启动一体化工作台：</div>
              <div className="text-emerald-400">$ node apps/leoms/bin/leoms.js ui</div>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="apple-glass-button primary w-full justify-center py-2 text-xs"
              >
                重试连接
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 mb-3 animate-spin">
          <Layers size={20} />
        </div>
        <p className="text-xs text-[var(--text-secondary)] font-medium">正在扫描工作区资产...</p>
      </div>
    );
  }

  // 1. Default standard category names mapping (libs is private libraries, apps is applications, packages is public packages)
  const defaultCategoryNames: Record<string, string> = {
    apps: "应用",
    packages: "公共包",
    libs: "私有库",
  };

  // 2. Category badge color styling
  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "apps":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
      case "packages":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "libs":
        return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
      default:
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    }
  };

  // 3. Helper to resolve friendly category label:
  // - If user configured in leoms.yml (via status.categoryNames), use that custom name
  // - Else if standard category (apps, packages, libs), use default ("应用", "公共包", "私有库")
  // - Else for extended category without config, capitalize directory name (e.g. "Services")
  const getCategoryLabel = (category: string): string => {
    if (status.categoryNames?.[category]) {
      return status.categoryNames[category];
    }
    if (defaultCategoryNames[category]) {
      return defaultCategoryNames[category];
    }
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  // 4. Dynamic category tabs from all present categories in workspace
  const discoveredCategories = Array.from(
    new Set([
      ...Object.keys(status.categories),
      ...allProjects.map((p) => p.category),
    ])
  ).filter((cat) => {
    const count =
      status.stats.categoryCounts[cat] ??
      (status.categories[cat] ? status.categories[cat].length : 0);
    return count > 0 || Boolean(status.categoryNames?.[cat]);
  });

  // Preferred tab display order: apps, packages, libs, others...
  const preferredOrder = ["apps", "packages", "libs"];
  discoveredCategories.sort((a, b) => {
    const idxA = preferredOrder.indexOf(a);
    const idxB = preferredOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const categories = [
    { key: "all", label: "全部", count: allProjects.length },
    ...discoveredCategories.map((catKey) => ({
      key: catKey,
      label: getCategoryLabel(catKey),
      count:
        status.stats.categoryCounts[catKey] ??
        allProjects.filter((p) => p.category === catKey).length,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* 1. Executive Summary Cards (Apple Vision Frosted Glass) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4.5">
        {/* Card 1: Workspace Assets (No interaction) */}
        <div className="apple-glass-card p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 group">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-sky-400/25 flex items-center justify-center text-sky-500 dark:text-sky-400 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <Package size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase whitespace-nowrap">
              工作区资产
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] font-mono leading-none whitespace-nowrap my-1 flex items-baseline gap-1.5">
              <span>{status.stats.totalProjects}</span>
              <span className="text-xs font-medium text-[var(--text-muted)] font-sans">个模块</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] truncate">
              {discoveredCategories
                .slice(0, 3)
                .map(
                  (c) =>
                    `${
                      status.stats.categoryCounts[c] ??
                      allProjects.filter((p) => p.category === c).length
                    } ${getCategoryLabel(c)}`
                )
                .join(" · ")}
            </div>
          </div>
        </div>

        {/* Card 2: Git Repositories (Click to filter standalone, click status to filter dirty) */}
        <div
          onClick={() => {
            setActiveStandalone((prev) => (prev === "standalone" ? "all" : "standalone"));
          }}
          className="apple-glass-card p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 group cursor-pointer select-none"
        >
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/25 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <GitBranch size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase whitespace-nowrap">
              独立 Git 仓库
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] font-mono leading-none whitespace-nowrap my-1 flex items-baseline gap-1.5">
              <span>{status.stats.totalGitRepos}</span>
              <span className="text-xs font-medium text-[var(--text-muted)] font-sans">个仓库</span>
            </div>
            <div className="text-xs flex items-center gap-1.5 truncate">
              {status.stats.dirtyGitRepos > 0 ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStatus((prev) => (prev === "dirty" ? "all" : "dirty"));
                  }}
                  className="text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap flex items-center gap-1 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  {status.stats.dirtyGitRepos} 个待提交变更
                </span>
              ) : (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveStatus((prev) => (prev === "clean" ? "all" : "clean"));
                  }}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap flex items-center gap-1 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  全部分支洁净
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Unreleased Commits */}
        <div
          onClick={() => {
            setActiveStatus((prev) => (prev === "unreleased" ? "all" : "unreleased"));
          }}
          className="apple-glass-card p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 group cursor-pointer select-none"
        >
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-purple-400/20 to-pink-500/20 border border-purple-400/25 flex items-center justify-center text-purple-500 dark:text-purple-400 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <ArrowUpRight size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase whitespace-nowrap">
              待发版提交 (Ahead)
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] font-mono leading-none whitespace-nowrap my-1 flex items-baseline gap-1.5">
              <span>{status.stats.unreleasedRepos}</span>
              <span className="text-xs font-medium text-[var(--text-muted)] font-sans">次领先</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] truncate">
              {status.stats.warnings.length > 0 ? (
                <span className="text-purple-600 dark:text-purple-400 font-medium">有上游超前引用</span>
              ) : (
                "上游状态与主干同步"
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Architecture Hygiene (No interaction) */}
        <div className="apple-glass-card p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 group">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-400/25 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase whitespace-nowrap">
              离仓独立性合规
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] font-mono leading-none whitespace-nowrap my-1 flex items-baseline gap-1.5">
              <span>100%</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-sans">达标</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] truncate">
              Dual-Layer 隔离与软链合规
            </div>
          </div>
        </div>
      </div>

      {/* 2. Upstream Warning Banner (Quiet & Elegant Apple Callout) */}
      {status.stats.warnings.length > 0 && (
        <div className="apple-glass p-3.5 sm:p-4 px-5 rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent text-sm flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3.5 text-[var(--text-primary)] min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertCircle size={20} />
            </div>
            <div className="text-xs sm:text-sm">
              <span className="font-bold text-amber-600 dark:text-amber-400 mr-2 whitespace-nowrap">上游超前提交预警:</span>
              <span className="text-[var(--text-secondary)]">
                检测到 <span className="font-mono font-semibold text-[var(--text-primary)] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{status.stats.warnings.map((w) => w.projectName).join(", ")}</span> 包含尚未发布的超前提交，已被下游模块引用。
              </span>
            </div>
          </div>
          <button
            onClick={() => onSelectProjectForTopology?.(status.stats.warnings[0].projectName)}
            className="flex items-center gap-1.5 text-xs sm:text-sm py-2 px-4 rounded-xl font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/40 shadow-xs shrink-0 whitespace-nowrap transition-all"
          >
            <span>在 DAG 中查看链路</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* 3. Integrated Table Toolbar (Modern Apple Frosted Glass Filter System) */}
      <div className="apple-glass p-4 sm:p-5 rounded-2xl border border-[var(--border-glass)] shadow-sm space-y-3.5">
        {/* Row 1: Primary Category Tabs & Search Bar & View Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Category Segmented Control & Filter Drawer Trigger Button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="apple-segmented-control overflow-x-auto max-w-full">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={`apple-segmented-item cursor-pointer ${activeCategory === cat.key ? "active" : ""}`}
                >
                  <span className="whitespace-nowrap">{cat.label}</span>
                  <span className="text-xs opacity-75 font-mono ml-1 whitespace-nowrap">
                    ({cat.count})
                  </span>
                </button>
              ))}
            </div>

            {/* 筛选抽屉式触发按钮 (放到左边，tab右侧) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen((prev) => !prev)}
                className={`apple-glass-button text-xs py-1.5 px-3 flex items-center gap-1.5 transition-all cursor-pointer ${
                  isGranularFilterActive
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-600 dark:text-sky-300 font-semibold shadow-xs"
                    : isFilterDrawerOpen
                    ? "bg-black/10 dark:bg-white/10 border-[var(--border-glass)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                title={
                  isGranularFilterActive
                    ? `已匹配 ${filteredProjects.length} 个项目 · 当前生效筛选: ${activeFilterLabels.join(" · ")}`
                    : "展开/收起细分筛选"
                }
              >
                <SlidersHorizontal
                  size={13}
                  className={isGranularFilterActive ? "text-sky-500 shrink-0" : "text-[var(--text-muted)] shrink-0"}
                />
                <span>筛选</span>
                {isGranularFilterActive ? (
                  <span className="font-mono text-xs ml-0.5">
                    (
                    <span className="font-bold text-sky-500 dark:text-sky-400">
                      {filteredProjects.length}
                    </span>
                    )
                  </span>
                ) : isFilterDrawerOpen ? (
                  <span className="font-mono text-xs ml-0.5 text-[var(--text-muted)]">
                    ({filteredProjects.length})
                  </span>
                ) : null}
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 shrink-0 ${
                    isFilterDrawerOpen ? "rotate-180 text-sky-500" : isGranularFilterActive ? "text-sky-500" : "text-[var(--text-muted)]"
                  }`}
                />
              </button>

              {/* 重置按钮统一在筛选按钮右侧图标按钮 */}
              {isGranularFilterActive && (
                <button
                  type="button"
                  onClick={handleResetGranularFilters}
                  className="w-7 h-7 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-rose-500/15 text-[var(--text-muted)] hover:text-rose-500 border border-[var(--border-glass-subtle)] hover:border-rose-500/30 transition-all cursor-pointer shadow-2xs"
                  title="重置细分筛选"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Right: Search & View Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-3 grow sm:grow-0 justify-end flex-wrap">
            <div className="relative w-64 sm:w-72 lg:w-80">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索项目、路径或分支... (按 ⌘K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="apple-glass-input pl-9 pr-14 py-2 text-xs sm:text-sm w-full transition-all focus:border-sky-500/50"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-[var(--text-muted)] flex items-center justify-center text-xs transition-colors cursor-pointer"
                  title="清空搜索"
                >
                  ✕
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-black/5 dark:bg-white/10 text-[var(--text-muted)] border border-[var(--border-glass)] pointer-events-none">
                  ⌘K
                </kbd>
              )}
            </div>

            {/* Table / Grid Mode Toggle */}
            <div className="apple-segmented-control">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`apple-segmented-item py-1.5 px-3 text-xs sm:text-sm cursor-pointer ${
                  viewMode === "table" ? "active" : ""
                }`}
                title="表格视图"
              >
                <TableIcon size={14} />
                <span className="hidden md:inline whitespace-nowrap">表格</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`apple-segmented-item py-1.5 px-3 text-xs sm:text-sm cursor-pointer ${
                  viewMode === "grid" ? "active" : ""
                }`}
                title="卡片视图"
              >
                <LayoutGrid size={14} />
                <span className="hidden md:inline whitespace-nowrap">卡片</span>
              </button>
            </div>
          </div>
        </div>

        {/* 抽屉式细分筛选面板 (一行一个筛选类目，精简文案) */}
        {isFilterDrawerOpen && (
          <div className="pt-3.5 border-t border-[var(--border-glass-subtle)] space-y-2.5 animate-fadeIn">
            {/* 1. 生态 (Row 1) */}
            <div className="flex items-center gap-3 text-xs">
              <span className="w-10 text-[var(--text-muted)] font-semibold shrink-0 text-right pr-1">
                生态
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "all", label: "全部", count: counts.all },
                  { key: "npm", label: "Node", count: counts.ecoNpm },
                  { key: "composer", label: "PHP", count: counts.ecoComposer },
                  { key: "hybrid", label: "双生态", count: counts.ecoHybrid },
                ].map((item) => {
                  const active = activeEcosystem === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveEcosystem(item.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                        active
                          ? "bg-sky-500/15 border border-sky-500/40 text-sky-600 dark:text-sky-300 shadow-2xs"
                          : "bg-black/5 dark:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">({item.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. 仓库 (Row 2) */}
            <div className="flex items-center gap-3 text-xs">
              <span className="w-10 text-[var(--text-muted)] font-semibold shrink-0 text-right pr-1">
                仓库
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "all", label: "全部", count: counts.all },
                  { key: "standalone", label: "独立仓库", count: counts.standalone },
                  { key: "monorepo", label: "子模块", count: counts.nonStandalone },
                ].map((item) => {
                  const active = activeStandalone === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveStandalone(item.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                        active
                          ? "bg-indigo-500/15 border border-indigo-500/40 text-indigo-600 dark:text-indigo-300 shadow-2xs"
                          : "bg-black/5 dark:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">({item.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 状态 (Row 3) */}
            <div className="flex items-center gap-3 text-xs">
              <span className="w-10 text-[var(--text-muted)] font-semibold shrink-0 text-right pr-1">
                状态
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "all", label: "全部", count: counts.all },
                  { key: "dirty", label: "未提交", count: counts.dirty, dot: "bg-amber-500" },
                  { key: "needs_build", label: "待构建", count: counts.needsBuild, dot: "bg-sky-500" },
                  { key: "unreleased", label: "未发布", count: counts.unreleased, dot: "bg-purple-500" },
                  { key: "clean", label: "洁净", count: counts.clean, dot: "bg-emerald-500" },
                ].map((item) => {
                  const active = activeStatus === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveStatus(item.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                        active
                          ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-300 shadow-2xs"
                          : "bg-black/5 dark:bg-white/5 border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10"
                      }`}
                    >
                      {item.dot && (
                        <span className={`w-1.5 h-1.5 rounded-full ${item.dot} inline-block`}></span>
                      )}
                      <span>{item.label}</span>
                      <span className="text-[10px] opacity-75 font-mono">({item.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Main Projects View (Clean Table View or Refined Cards) */}
      {viewMode === "table" ? (
        <div className="apple-glass-panel p-0 overflow-hidden border border-[var(--border-glass)] shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="apple-table-header backdrop-blur-sm text-xs font-bold whitespace-nowrap tracking-wider">
                  <th className="py-3.5 px-5 min-w-[240px] w-[26%]">项目名称</th>
                  <th className="py-3.5 px-4 min-w-[180px] w-[20%]">相对路径</th>
                  <th className="py-3.5 px-3 w-[90px] text-center">生态</th>
                  <th className="py-3.5 px-3 w-[100px] text-center">版本</th>
                  <th className="py-3.5 px-4 min-w-[160px] w-[18%]">Git 状态</th>
                  <th className="py-3.5 px-4 min-w-[150px] w-[16%]">依赖拓扑</th>
                  <th className="py-3.5 px-5 w-[160px] text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass-subtle)] font-mono">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-sm text-[var(--text-muted)] font-sans">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <Folder size={32} className="opacity-30 text-sky-400" />
                        <span className="font-semibold text-[var(--text-primary)]">
                          没有找到匹配的项目
                        </span>
                        <p className="text-xs text-[var(--text-muted)]">
                          未检索到符合当前分类、生态、仓库类型或状态筛选条件的资产模块
                        </p>
                        {isAnyFilterActive && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="apple-glass-button primary text-xs py-1.5 px-3.5 mt-2 gap-1.5 cursor-pointer shadow-sm"
                          >
                            <RotateCcw size={12} />
                            <span>重置所有筛选</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((project) => {
                    const ecoText =
                      project.packageManager === "composer"
                        ? "PHP"
                        : project.packageManager === "hybrid"
                        ? "Node+PHP"
                        : "Node";

                    const ecoClass =
                      project.packageManager === "composer"
                        ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                        : project.packageManager === "hybrid"
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                        : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";

                    const categoryLabel = getCategoryLabel(project.category);
                    const categoryBadgeClass = getCategoryBadgeClass(project.category);

                    return (
                      <tr
                        key={project.id}
                        onClick={() => handleOpenProjectModal(project)}
                        className="apple-table-row cursor-pointer"
                      >
                        {/* Name + Category Badge */}
                        <td className="py-3 px-5 font-sans whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-sm sm:text-base text-[var(--text-primary)]">
                              {project.name}
                            </span>
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold whitespace-nowrap ${categoryBadgeClass}`}
                            >
                              {categoryLabel}
                            </span>
                            {project.private && (
                              <span className="text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[var(--text-muted)] font-mono border border-[var(--border-glass-subtle)] whitespace-nowrap">
                                private
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Relative Path */}
                        <td className="py-3 px-4 text-[var(--text-secondary)] font-mono text-xs sm:text-sm whitespace-nowrap">
                          <div className="flex items-center gap-2 truncate">
                            <Folder size={14} className="text-[var(--text-muted)] shrink-0" />
                            <span className="truncate">{project.relativeDir}</span>
                          </div>
                        </td>

                        {/* Ecosystem Badge - Centered */}
                        <td className="py-3 px-3 font-sans whitespace-nowrap text-center">
                          <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full border font-semibold ${ecoClass}`}>
                            {ecoText}
                          </span>
                        </td>

                        {/* Version - Centered */}
                        <td className="py-3 px-3 text-[var(--text-secondary)] font-mono text-xs sm:text-sm font-medium whitespace-nowrap text-center">
                          {project.version ? (
                            <span className="text-[var(--text-primary)] font-semibold">v{project.version}</span>
                          ) : (
                            <span className="opacity-40 text-[var(--text-muted)]">—</span>
                          )}
                        </td>

                        {/* Git Status */}
                        <td className="py-3 px-4 font-sans whitespace-nowrap">
                          {project.git.isGitRepo ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1.5 text-xs sm:text-sm text-[var(--text-secondary)] whitespace-nowrap">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    project.git.isDirty ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]" : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                                  }`}
                                ></span>
                                <span className="font-mono text-xs sm:text-sm font-medium">{project.git.branch || "main"}</span>
                              </span>

                              {project.git.dirtyCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-xs font-mono font-semibold whitespace-nowrap">
                                  +{project.git.dirtyCount}
                                </span>
                              )}

                              {project.git.commitsAhead > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 text-xs font-mono font-semibold whitespace-nowrap">
                                  ⬆{project.git.commitsAhead}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] opacity-40 font-mono whitespace-nowrap">—</span>
                          )}
                        </td>

                        {/* Dependency Topology */}
                        <td className="py-3 px-4 font-sans whitespace-nowrap">
                          {project.workspaceDependencies.length > 0 || project.dependents.length > 0 ? (
                            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium whitespace-nowrap">
                              <span className="text-[var(--text-secondary)]">
                                {project.workspaceDependencies.length} 依赖
                              </span>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="text-sky-500 font-semibold">
                                {project.dependents.length} 下游
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600/80 dark:text-emerald-400/80 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 whitespace-nowrap">
                              独立解耦
                            </span>
                          )}
                        </td>

                        {/* Actions (All icon buttons with hover tooltip, 3 most frequent + more popover menu) */}
                        <td className="py-3 px-5 text-right font-sans whitespace-nowrap">
                          <div
                            className="flex items-center justify-end gap-2 relative"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* 1. 构建 (Build) */}
                            <button
                              onClick={() => handleRunListTask("build", project.name)}
                              className="apple-action-icon-btn text-sky-500 dark:text-sky-400"
                              title={`构建项目 (leoms build ${project.name})`}
                            >
                              <Hammer size={14} />
                            </button>

                            {/* 2. 部署 (Deploy) */}
                            <button
                              onClick={() => setWorkflowModal({ type: "deploy", project })}
                              className="apple-action-icon-btn text-emerald-500 dark:text-emerald-400"
                              title={`部署流程 (模拟演练并一键部署 - ${project.name})`}
                            >
                              <Send size={14} />
                            </button>

                            {/* 3. 发布 (Release) */}
                            <button
                              onClick={() => setWorkflowModal({ type: "release", project })}
                              className="apple-action-icon-btn text-purple-500 dark:text-purple-400"
                              title={`多模块发版 (模拟演练与版本管理 - ${project.name})`}
                            >
                              <Rocket size={14} />
                            </button>

                            {/* 4. 更多操作下拉收纳 (···) */}
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setActiveMenuProjectId(
                                    activeMenuProjectId === project.id ? null : project.id
                                  )
                                }
                                className={`apple-action-icon-btn ${
                                  activeMenuProjectId === project.id
                                    ? "bg-[var(--bg-surface-active)] border-sky-500/50 text-sky-500"
                                    : ""
                                }`}
                                title="更多项目操作"
                              >
                                <MoreHorizontal size={15} />
                              </button>

                              {/* Floating Apple Popover Menu */}
                              {activeMenuProjectId === project.id && (
                                <div className="apple-popover-menu absolute right-0 top-full mt-2 shadow-2xl text-left">
                                  <button
                                    onClick={() => {
                                      setActiveMenuProjectId(null);
                                      onSelectProjectForTopology?.(project.name);
                                    }}
                                    className="apple-popover-item"
                                  >
                                    <Share2 size={14} className="text-sky-500" />
                                    <span>DAG 拓扑链路定位</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuProjectId(null);
                                      handleRunListTask("check", project.name, `门禁安全检查 - ${project.name}`);
                                    }}
                                    className="apple-popover-item"
                                  >
                                    <ShieldCheck size={14} className="text-emerald-500" />
                                    <span>门禁安全体检</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveMenuProjectId(null);
                                      handleRunListTask("install", project.name, `智能依赖安装 - ${project.name}`);
                                    }}
                                    className="apple-popover-item"
                                  >
                                    <PackageCheck size={14} className="text-teal-500" />
                                    <span>智能依赖安装</span>
                                  </button>
                                  <div className="my-1.5 border-t border-[var(--border-glass-subtle)]" />
                                  <button
                                    onClick={() => {
                                      setActiveMenuProjectId(null);
                                      handleOpenProjectModal(project);
                                    }}
                                    className="apple-popover-item"
                                  >
                                    <Info size={14} className="text-purple-500" />
                                    <span>查看项目详细信息</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Refined Calm Grid Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-4.5">
          {filteredProjects.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-[var(--text-muted)] font-sans apple-glass-card rounded-2xl p-8 border border-[var(--border-glass)]">
              <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                <Folder size={32} className="opacity-30 text-sky-400" />
                <span className="font-semibold text-[var(--text-primary)]">
                  没有找到匹配的项目
                </span>
                <p className="text-xs text-[var(--text-muted)]">
                  未检索到符合当前分类、生态、仓库类型或状态筛选条件的资产模块
                </p>
                {isAnyFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="apple-glass-button primary text-xs py-1.5 px-3.5 mt-2 gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RotateCcw size={12} />
                    <span>重置所有筛选</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            filteredProjects.map((project) => {
            const categoryLabel = getCategoryLabel(project.category);
            const categoryBadgeClass = getCategoryBadgeClass(project.category);

            return (
              <div
                key={project.id}
                onClick={() => setInspectedProject(project)}
                className="apple-glass-panel p-5 cursor-pointer flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h4 className="font-bold text-base text-[var(--text-primary)] whitespace-nowrap">
                          {project.name}
                        </h4>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold whitespace-nowrap ${categoryBadgeClass}`}>
                          {categoryLabel}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[var(--text-secondary)] mt-1 truncate max-w-[280px]">
                        {project.relativeDir}
                      </p>
                    </div>

                    {project.version && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[var(--text-muted)] border border-[var(--border-glass)] whitespace-nowrap">
                        v{project.version}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-[var(--text-secondary)] my-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          project.git.isDirty ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                      ></span>
                      <span className="font-mono text-xs sm:text-sm font-medium">{project.git.branch || "无Git"}</span>
                    </div>

                    {project.git.dirtyCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-xs font-mono font-semibold whitespace-nowrap">
                        +{project.git.dirtyCount} 待提交
                      </span>
                    )}

                    {project.git.commitsAhead > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-500 text-xs font-mono font-semibold whitespace-nowrap">
                        ⬆{project.git.commitsAhead} 待发版
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className="pt-3.5 border-t border-[var(--border-glass-subtle)] flex items-center justify-between text-xs sm:text-sm text-[var(--text-secondary)] whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRunListTask("build", project.name)}
                      className="apple-action-icon-btn text-sky-500"
                      title="构建项目"
                    >
                      <Hammer size={14} />
                    </button>
                    <button
                      onClick={() => setWorkflowModal({ type: "deploy", project })}
                      className="apple-action-icon-btn text-emerald-500"
                      title="部署流程"
                    >
                      <Send size={14} />
                    </button>
                    <button
                      onClick={() => setWorkflowModal({ type: "release", project })}
                      className="apple-action-icon-btn text-purple-500"
                      title="发版管理"
                    >
                      <Rocket size={14} />
                    </button>
                  </div>

                  <span
                    onClick={() => handleOpenProjectModal(project)}
                    className="text-sky-500 font-semibold hover:text-sky-400 flex items-center gap-1 cursor-pointer"
                  >
                    查看详情 <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })
        )}
        </div>
      )}

      {/* 5. Apple Centered Project Inspector Modal (Portaled to document.body at z-[100]) */}
      {inspectedProject &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 apple-modal-backdrop">
            {/* Backdrop click to dismiss */}
            <div
              onClick={() => setInspectedProject(null)}
              className="absolute inset-0 cursor-pointer"
              aria-label="关闭窗口"
            />

            {/* Centered Modal Window with preset fixed dimensions and aspect ratio */}
            <div className="apple-modal-window relative z-10 w-[92vw] max-w-[1140px] h-[80vh] min-h-[540px] max-h-[820px] flex flex-col rounded-2xl overflow-hidden shadow-2xl">
              {/* Modal Unified Header with Integrated Navigation Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 border-b border-slate-200/80 dark:border-slate-800 shrink-0 bg-white dark:bg-[#0f172a]">
                {/* Project Identity */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-mono flex items-center gap-2">
                      {inspectedProject.name}
                      {inspectedProject.version && (
                        <span className="text-xs font-normal text-[var(--text-muted)] font-sans px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          v{inspectedProject.version}
                        </span>
                      )}
                    </h3>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold whitespace-nowrap ${getCategoryBadgeClass(inspectedProject.category)}`}>
                      {getCategoryLabel(inspectedProject.category)}
                    </span>
                    {inspectedProject.private && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[var(--text-muted)] font-mono border border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">
                        私有
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-1.5 mt-0.5">
                    <Folder size={12} className="text-[var(--text-muted)] shrink-0" />
                    <span>{inspectedProject.relativeDir}</span>
                  </p>
                </div>

                {/* Apple Segmented Navigation Tabs + Window Controls */}
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs sm:text-sm">
                    <button
                      onClick={() => setModalTab("overview")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                        modalTab === "overview"
                          ? "bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <Info size={14} />
                      <span>项目概览</span>
                    </button>
                    <button
                      onClick={() => setModalTab("installed")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                        modalTab === "installed"
                          ? "bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <Package size={14} />
                      <span>已装依赖</span>
                    </button>
                    <button
                      onClick={() => setModalTab("search")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                        modalTab === "search"
                          ? "bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <PackagePlus size={14} />
                      <span>安装依赖</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
                    <span className="hidden sm:inline-block text-xs font-mono text-[var(--text-muted)] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                      ESC
                    </span>
                    <button
                      onClick={() => setInspectedProject(null)}
                      className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title="关闭窗口"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Body - Vertical Scroll with min-h-0 ensuring rock-solid window height */}
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6 bg-slate-50/50 dark:bg-slate-950/30">
                {modalTab === "overview" ? (
                  <>
                    {/* Git Status Card */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                      <span className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2 whitespace-nowrap">
                        <GitBranch size={16} className="text-indigo-400" />
                        <span>Git 仓库状态</span>
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm font-mono">
                        <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[var(--text-muted)] font-sans">分支:</span>
                          <span className="font-semibold text-[var(--text-primary)]">{inspectedProject.git.branch || "无独立仓库"}</span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[var(--text-muted)] font-sans">仓库模式:</span>
                          <span className="font-sans">{inspectedProject.git.isStandalone ? "独立仓库" : "工作区共有"}</span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[var(--text-muted)] font-sans">未提交修改:</span>
                          <span className={inspectedProject.git.isDirty ? "text-amber-500 font-semibold" : "text-emerald-500"}>
                            {inspectedProject.git.dirtyCount} 个文件
                          </span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[var(--text-muted)] font-sans">待发版提交:</span>
                          <span className={inspectedProject.git.commitsAhead > 0 ? "text-purple-500 font-semibold" : ""}>
                            {inspectedProject.git.commitsAhead} commits
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Workspace Dependencies */}
                    <div>
                      <span className="text-sm font-bold text-[var(--text-secondary)] block mb-2.5 whitespace-nowrap">
                        依赖的上游包 ({inspectedProject.workspaceDependencies.length})
                      </span>
                      {inspectedProject.workspaceDependencies.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs sm:text-sm">
                          {inspectedProject.workspaceDependencies.map((dep, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between"
                            >
                              <span className="text-sky-500 dark:text-sky-400 font-semibold">{dep.name}</span>
                              <span className="text-xs text-[var(--text-muted)] font-mono">{dep.versionReq}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)] italic">无内部公共包依赖</p>
                      )}
                    </div>

                    {/* Dependents */}
                    <div>
                      <span className="text-sm font-bold text-[var(--text-secondary)] block mb-2.5 whitespace-nowrap">
                        引用此包的下游应用 ({inspectedProject.dependents.length})
                      </span>
                      {inspectedProject.dependents.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs sm:text-sm">
                          {inspectedProject.dependents.map((dep, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm text-indigo-500 dark:text-indigo-400 font-semibold"
                            >
                              {dep}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)] italic">暂无下游项目引用</p>
                      )}
                    </div>
                  </>
                ) : (
                  <DependencyManager
                    project={inspectedProject}
                    onExecuteTask={handleRunEmbeddedTask}
                    activeTab={modalTab === "search" ? "search" : "installed"}
                    onTabChange={(t) => setModalTab(t)}
                    hideTabSwitcher={true}
                    refreshTrigger={dependencyRefreshKey}
                    isTerminalRunning={terminalRunning}
                  />
                )}
              </div>

              {/* Embedded Command Execution Console (Collapsible Drawer with Smooth Transition & Auto-Collapse) */}
              <div
                className={`relative z-20 shrink-0 overflow-hidden transition-all duration-300 ease-in-out ${
                  isTerminalExpanded
                    ? "max-h-[300px] sm:max-h-[340px] border-t border-slate-300 dark:border-slate-700 shadow-[0_-12px_30px_-4px_rgba(0,0,0,0.15),0_-4px_10px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_-16px_36px_rgba(0,0,0,0.7)] opacity-100"
                    : "max-h-0 border-t-0 opacity-0 pointer-events-none"
                }`}
              >
                {embeddedModalTask ? (
                  <TaskTerminal
                    task={embeddedModalTask}
                    mode="embedded"
                    onClose={() => {
                      if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current);
                      setIsTerminalExpanded(false);
                      setDependencyRefreshKey((k) => k + 1);
                    }}
                    onSuccess={() => {
                      onRetry?.();
                      setDependencyRefreshKey((k) => k + 1);
                    }}
                    onStatusChange={(s) => {
                      setTerminalRunning(s.isRunning);
                      setTerminalExitCode(s.exitCode);
                      if (!s.isRunning) {
                        if (s.exitCode === 0) {
                          // Succeeded: wait 2.5s and then automatically collapse
                          if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current);
                          autoCollapseTimerRef.current = setTimeout(() => {
                            setIsTerminalExpanded(false);
                          }, 2500);
                        } else {
                          // Failed: reset pending status in DependencyManager immediately
                          setDependencyRefreshKey((k) => k + 1);
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="bg-[#080b11] text-[#e2e8f0] font-mono text-xs p-5 h-[180px] flex flex-col justify-center items-center text-slate-400 space-y-2 select-none">
                    <div className="flex items-center gap-2 text-sky-400 font-semibold">
                      <Terminal size={16} />
                      <span>命令终端就绪</span>
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      点击下方「构建」、「同步依赖」或在「安装依赖」中操作，命令执行日志将在此输出
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsTerminalExpanded(false)}
                      className="mt-1 text-xs px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      收起终端
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Action Bar (Sticky at bottom) */}
              <div className="p-4 sm:p-5 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0f172a] shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* 1. 构建 */}
                    <button
                      onClick={() => handleRunEmbeddedTask("build")}
                      className="apple-glass-button primary text-xs sm:text-sm py-2 px-4 shadow-sm cursor-pointer"
                      title="执行项目构建 (leoms build)"
                    >
                      <Hammer size={14} />
                      <span>构建</span>
                    </button>

                    {/* 2. 部署 */}
                    <button
                      onClick={() =>
                        setWorkflowModal({
                          type: "deploy",
                          project: inspectedProject,
                        })
                      }
                      className="apple-glass-button text-xs sm:text-sm py-2 px-4 shadow-sm cursor-pointer"
                      title="打开部署流程界面 (自动模拟演练并确认部署)"
                    >
                      <Send size={14} className="text-emerald-500" />
                      <span>部署</span>
                    </button>

                    {/* 3. 发布 */}
                    <button
                      onClick={() =>
                        setWorkflowModal({
                          type: "release",
                          project: inspectedProject,
                        })
                      }
                      className="apple-glass-button text-xs sm:text-sm py-2 px-4 shadow-sm cursor-pointer"
                      title="打开多模块发版管理器 (自动模拟演练并确认发版)"
                    >
                      <Rocket size={14} className="text-purple-500" />
                      <span>发布</span>
                    </button>

                    {/* 4. 同步依赖 */}
                    <button
                      onClick={() => handleRunEmbeddedTask("install")}
                      className="apple-glass-button text-xs sm:text-sm py-2 px-4 shadow-sm cursor-pointer"
                      title="全量安装并同步项目依赖与软链 (leoms install)"
                    >
                      <PackageCheck size={14} className="text-teal-500" />
                      <span>同步依赖</span>
                    </button>

                    {/* 5. 门禁检查 */}
                    <button
                      onClick={() => handleRunEmbeddedTask("check")}
                      className="apple-glass-button text-xs sm:text-sm py-2 px-4 shadow-sm cursor-pointer"
                      title="运行全量质量门禁规则体检 (leoms check)"
                    >
                      <ShieldCheck size={14} className="text-emerald-500" />
                      <span>门禁检查</span>
                    </button>

                    {/* 6. DAG定位 */}
                    <button
                      onClick={() => {
                        onSelectProjectForTopology?.(inspectedProject.name);
                        setInspectedProject(null);
                      }}
                      className="apple-glass-button text-xs sm:text-sm py-2 px-4 shadow-sm cursor-pointer"
                      title="在拓扑图谱中高亮定位此项目"
                    >
                      <Share2 size={14} className="text-sky-500" />
                      <span>DAG定位</span>
                    </button>
                  </div>

                  {/* Terminal Toggle Button at Far Right */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (autoCollapseTimerRef.current) {
                          clearTimeout(autoCollapseTimerRef.current);
                          autoCollapseTimerRef.current = null;
                        }
                        setIsTerminalExpanded((prev) => !prev);
                      }}
                      title={
                        terminalRunning
                          ? `正在执行命令: ${embeddedModalTask?.title || ""} (点击${isTerminalExpanded ? "收起" : "展开"}控制台)`
                          : isTerminalExpanded
                          ? "收起命令终端"
                          : "展开命令终端"
                      }
                      className={`relative flex items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                        terminalRunning
                          ? "bg-sky-500/15 text-sky-500 dark:text-sky-400 border-sky-500/40 shadow-sm ring-2 ring-sky-500/20"
                          : isTerminalExpanded
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 shadow-sm"
                          : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 border-slate-200/80 dark:border-slate-800"
                      }`}
                    >
                      <Terminal size={17} />
                      {terminalRunning ? (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
                        </span>
                      ) : terminalExitCode !== null ? (
                        <span
                          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                            terminalExitCode === 0 ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                        />
                      ) : null}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 6. Real-Time Task Execution Popup Modal (Triggered from project list/table) */}
      {listModalTask &&
        createPortal(
          <TaskTerminal
            task={listModalTask}
            mode="modal"
            onClose={() => setListModalTask(null)}
            onSuccess={() => onRetry?.()}
          />,
          document.body
        )}

      {/* 7. Interactive Action Workflow Modal for Deploy & Release */}
      {workflowModal && (
        <ActionWorkflowModal
          isOpen={true}
          type={workflowModal.type}
          project={workflowModal.project}
          allProjects={allProjects}
          onClose={() => setWorkflowModal(null)}
          onSuccess={() => {
            onRetry?.();
            setDependencyRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
};
