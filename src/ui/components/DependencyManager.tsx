import React, { useState, useEffect, useMemo } from "react";
import {
  Package,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Edit3,
  Check,
  X,
  Sparkles,
  Link,
  AlertCircle,
  FolderOpen,
  ArrowUpDown,
  Filter,
  Loader2,
  PackagePlus,
} from "lucide-react";
import {
  fetchProjectDependencies,
  modifyProjectDependency,
  searchCommunityRegistry,
  type ProjectModel,
  type ProjectDependenciesResponse,
  type ProjectDependencyEntry,
  type RegistrySearchResult,
} from "../api/client.js";
import type { TaskTarget } from "./TaskTerminal.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface DependencyManagerProps {
  project: ProjectModel;
  onExecuteTask: (task: TaskTarget) => void;
  activeTab?: "installed" | "search";
  onTabChange?: (tab: "installed" | "search") => void;
  hideTabSwitcher?: boolean;
  refreshTrigger?: number;
}

type CategoryTab = "all" | "dependencies" | "devDependencies" | "require" | "require-dev" | "peerDependencies" | "workspace";

export const DependencyManager: React.FC<DependencyManagerProps> = ({
  project,
  onExecuteTask,
  activeTab: propActiveTab,
  onTabChange,
  hideTabSwitcher = false,
  refreshTrigger = 0,
}) => {
  const [data, setData] = useState<ProjectDependenciesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Two main tabs: "installed" vs "search"
  const [internalTab, setInternalTab] = useState<"installed" | "search">("installed");
  const currentTab = propActiveTab || internalTab;
  const setCurrentTab = (tab: "installed" | "search") => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // Category filter state in installed view
  const [categoryTab, setCategoryTab] = useState<CategoryTab>("all");
  const [filterQuery, setFilterQuery] = useState<string>("");

  // Community search & install states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchEcosystem, setSearchEcosystem] = useState<"npm" | "composer">(
    project.packageManager === "composer" ? "composer" : "npm"
  );
  const [searchResults, setSearchResults] = useState<RegistrySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Search Results Filtering & Sorting states
  const [statusFilter, setStatusFilter] = useState<"all" | "installed" | "uninstalled">("all");
  const [sortMode, setSortMode] = useState<"installed_first" | "relevance" | "name_asc" | "name_desc">(
    "installed_first"
  );

  // In-place edit state: { [pkgName]: newVersion }
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const [editVersionInput, setEditVersionInput] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Real-time pending package operations: { [pkgName.toLowerCase()]: { action, dev, spec } }
  const [pendingPkgs, setPendingPkgs] = useState<
    Record<string, { action: "add" | "remove" | "update"; dev?: boolean; spec?: string }>
  >({});

  // Modern confirmation dialog state for removing dependencies
  const [confirmingRemoveDep, setConfirmingRemoveDep] = useState<ProjectDependencyEntry | null>(null);

  useEffect(() => {
    loadDependencies();
  }, [project.name]);

  // Synchronize dependencies when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadDependencies().then(() => {
        setPendingPkgs({});
      });
    }
  }, [refreshTrigger]);

  const loadDependencies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProjectDependencies(project.name, project);
      setData(res);
    } catch (err: any) {
      console.error("Failed to load project dependencies:", err);
      setError(err.message || "无法获取项目依赖清单");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: "success" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Parse search query for package name and optional target version/constraint
  const parseSearchQuery = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return { queryText: "", specVersion: "" };

    // e.g. "symfony/console:^6.0" or "monolog/monolog:^3.0"
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":");
      return { queryText: parts[0].trim(), specVersion: parts.slice(1).join(":").trim() };
    }

    // e.g. "lodash@^4.17.21" or "@types/node@^20.0.0"
    if (trimmed.includes("@")) {
      if (trimmed.startsWith("@")) {
        const secondAt = trimmed.indexOf("@", 1);
        if (secondAt !== -1) {
          return {
            queryText: trimmed.slice(0, secondAt).trim(),
            specVersion: trimmed.slice(secondAt + 1).trim(),
          };
        }
      } else {
        const parts = trimmed.split("@");
        return { queryText: parts[0].trim(), specVersion: parts.slice(1).join("@").trim() };
      }
    }

    return { queryText: trimmed, specVersion: "" };
  };

  // Debounced search for community packages
  useEffect(() => {
    const parsed = parseSearchQuery(searchQuery);
    if (!parsed.queryText) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const res = await searchCommunityRegistry(parsed.queryText, searchEcosystem);
        if (res.error) setSearchError(res.error);
        setSearchResults(res.results || []);
      } catch (err: any) {
        setSearchError(err.message || "搜索失败");
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, searchEcosystem]);

  // Check if a package is already installed
  const findInstalled = (pkgName: string): ProjectDependencyEntry | undefined => {
    if (!data) return undefined;
    return data.all.find((d) => d.name.toLowerCase() === pkgName.toLowerCase());
  };

  // Combine registry search results with any matching installed dependencies in project
  const combinedResults = useMemo(() => {
    const list = [...searchResults];
    const cleanQuery = parseSearchQuery(searchQuery).queryText.toLowerCase();

    if (cleanQuery && data?.all) {
      const existingNames = new Set(list.map((r) => r.name.toLowerCase()));

      data.all.forEach((dep) => {
        if (existingNames.has(dep.name.toLowerCase())) return;
        if (searchEcosystem === "composer" && dep.ecosystem !== "composer") return;
        if (searchEcosystem === "npm" && dep.ecosystem !== "npm") return;

        if (dep.name.toLowerCase().includes(cleanQuery)) {
          list.push({
            name: dep.name,
            description: dep.isWorkspace ? "工作区内部本地依赖" : "当前项目已安装依赖",
            url: "",
            version: dep.version,
            ecosystem: dep.ecosystem,
          });
        }
      });
    }

    return list;
  }, [searchResults, searchQuery, data, searchEcosystem]);

  // Filter and sort display results (default: installed packages first)
  const finalDisplayResults = useMemo(() => {
    let list = [...combinedResults];

    // Filter by installed status
    if (statusFilter === "installed") {
      list = list.filter((p) => Boolean(findInstalled(p.name)));
    } else if (statusFilter === "uninstalled") {
      list = list.filter((p) => !findInstalled(p.name));
    }

    // Sort: default is installed first
    list.sort((a, b) => {
      const aInstalled = Boolean(findInstalled(a.name));
      const bInstalled = Boolean(findInstalled(b.name));

      if (sortMode === "installed_first") {
        if (aInstalled && !bInstalled) return -1;
        if (!aInstalled && bInstalled) return 1;
        return 0;
      }

      if (sortMode === "name_asc") {
        return a.name.localeCompare(b.name);
      }

      if (sortMode === "name_desc") {
        return b.name.localeCompare(a.name);
      }

      // "relevance"
      return 0;
    });

    return list;
  }, [combinedResults, statusFilter, sortMode, data]);

  // Install package from community search (supports specified version if typed in query)
  const handleCommunityInstall = (pkg: RegistrySearchResult, isDev: boolean = false) => {
    const pkgKey = pkg.name.toLowerCase();
    if (pendingPkgs[pkgKey]) return;

    const parsed = parseSearchQuery(searchQuery);
    let pkgSpec = pkg.name;
    if (parsed.specVersion && pkg.name.toLowerCase() === parsed.queryText.toLowerCase()) {
      pkgSpec =
        searchEcosystem === "composer"
          ? `${pkg.name}:${parsed.specVersion}`
          : `${pkg.name}@${parsed.specVersion}`;
    }

    setPendingPkgs((prev) => ({
      ...prev,
      [pkgKey]: { action: "add", dev: isDev, spec: pkgSpec },
    }));

    onExecuteTask({
      action: "add",
      target: project.name,
      options: {
        packages: [pkgSpec],
        dev: isDev,
        ecosystem: searchEcosystem,
      },
      title: `安装依赖: ${pkgSpec} (${isDev ? "开发" : "生产"})`,
    });
    showToast("success", `已提交安装 ${pkgSpec} (${isDev ? "开发" : "生产"}) 任务，正在执行并实时同步...`);
  };

  // Open modern confirm dialog for package removal
  const handleRemove = (dep: ProjectDependencyEntry) => {
    setConfirmingRemoveDep(dep);
  };

  // Execute package removal after confirmation
  const handleConfirmRemove = () => {
    if (!confirmingRemoveDep) return;
    const dep = confirmingRemoveDep;
    const depKey = dep.name.toLowerCase();
    if (pendingPkgs[depKey]) return;

    setConfirmingRemoveDep(null);

    setPendingPkgs((prev) => ({
      ...prev,
      [depKey]: { action: "remove" },
    }));

    onExecuteTask({
      action: "remove",
      target: project.name,
      options: {
        packages: [dep.name],
        ecosystem: dep.ecosystem,
      },
      title: `移除依赖: ${dep.name}`,
    });
    showToast("success", `已提交移除 ${dep.name} 任务，正在执行...`);
  };

  // Quick update package handler
  const handleUpdateLatest = (dep: ProjectDependencyEntry) => {
    const depKey = dep.name.toLowerCase();
    if (pendingPkgs[depKey]) return;

    const isDev = dep.category === "devDependencies" || dep.category === "require-dev";
    const pkgSpec = dep.ecosystem === "composer" ? `${dep.name}:*` : `${dep.name}@latest`;

    setPendingPkgs((prev) => ({
      ...prev,
      [depKey]: { action: "update", dev: isDev },
    }));

    onExecuteTask({
      action: "add",
      target: project.name,
      options: {
        packages: [pkgSpec],
        dev: isDev,
        ecosystem: dep.ecosystem,
      },
      title: `更新 ${dep.name} 至最新版本`,
    });
    showToast("success", `已提交更新 ${dep.name} 任务，正在执行...`);
  };

  // In-place version edit save
  const handleSaveEdit = async (dep: ProjectDependencyEntry) => {
    if (!editVersionInput.trim()) return;
    setIsSavingEdit(true);
    try {
      await modifyProjectDependency({
        projectName: project.name,
        name: dep.name,
        action: "update",
        version: editVersionInput.trim(),
        category: dep.category,
        ecosystem: dep.ecosystem,
      });
      showToast("success", `已将 ${dep.name} 版本规则更新为: ${editVersionInput.trim()}`);
      setEditingPkg(null);
      await loadDependencies();
    } catch (err: any) {
      showToast("error", err.message || "更新版本失败");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter installed dependencies
  const allDeps = data?.all || [];
  const filteredDeps = allDeps.filter((dep) => {
    // Tab filter
    if (categoryTab === "workspace" && !dep.isWorkspace) return false;
    if (categoryTab === "dependencies" && dep.category !== "dependencies") return false;
    if (categoryTab === "devDependencies" && dep.category !== "devDependencies") return false;
    if (categoryTab === "require" && dep.category !== "require") return false;
    if (categoryTab === "require-dev" && dep.category !== "require-dev") return false;
    if (categoryTab === "peerDependencies" && dep.category !== "peerDependencies") return false;

    // Search query filter
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      return dep.name.toLowerCase().includes(q) || dep.version.toLowerCase().includes(q);
    }

    return true;
  });

  // Calculate category counts
  const countAll = allDeps.length;
  const countProd = allDeps.filter((d) => d.category === "dependencies" || d.category === "require").length;
  const countDev = allDeps.filter((d) => d.category === "devDependencies" || d.category === "require-dev").length;
  const countWorkspace = allDeps.filter((d) => d.isWorkspace).length;
  const countPeer = allDeps.filter((d) => d.category === "peerDependencies").length;

  const isComposer = project.packageManager === "composer";

  return (
    <div className="space-y-5">
      {/* Modern Confirmation Dialog for Dependency Removal */}
      <ConfirmDialog
        isOpen={Boolean(confirmingRemoveDep)}
        onClose={() => setConfirmingRemoveDep(null)}
        onConfirm={handleConfirmRemove}
        title="确认移除依赖"
        variant="danger"
        confirmText="确认移除"
        cancelText="取消"
        description="移除后该依赖将从当前项目中卸载，并在工作区执行移除任务。确定要继续吗？"
      >
        {confirmingRemoveDep && (
          <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                {confirmingRemoveDep.name}
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)] bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                v{confirmingRemoveDep.version}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="px-2 py-0.5 rounded-md font-mono font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                {confirmingRemoveDep.ecosystem === "composer" ? "Packagist (PHP)" : "NPM"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md font-mono font-medium ${
                  confirmingRemoveDep.category === "devDependencies" ||
                  confirmingRemoveDep.category === "require-dev"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                }`}
              >
                {confirmingRemoveDep.category === "devDependencies" ||
                confirmingRemoveDep.category === "require-dev"
                  ? "开发依赖"
                  : "生产依赖"}
              </span>
              <span className="text-[var(--text-muted)] flex items-center gap-1 font-mono">
                <span>所属项目:</span>
                <span className="font-semibold text-[var(--text-secondary)]">{project.name}</span>
              </span>
            </div>
            {confirmingRemoveDep.targetPath && (
              <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                源路径: {confirmingRemoveDep.targetPath}
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>

      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-2.5 text-xs sm:text-sm animate-fadeIn ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            <span className="font-medium">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
            title="关闭提示"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Dependency Management Two-Tab Switcher (Only shown if not controlled externally) */}
      {!hideTabSwitcher && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs sm:text-sm">
            <button
              onClick={() => setCurrentTab("installed")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                currentTab === "installed"
                  ? "bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Package size={15} />
              <span>已装依赖 ({countAll})</span>
            </button>
            <button
              onClick={() => setCurrentTab("search")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                currentTab === "search"
                  ? "bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <PackagePlus size={15} />
              <span>安装依赖</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================== TAB 1: INSTALLED DEPENDENCIES ===================== */}
      {currentTab === "installed" && (
        <div className="space-y-4">
          {/* Controls Bar: Categories & Quick Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setCategoryTab("all")}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  categoryTab === "all"
                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                全部 ({countAll})
              </button>

              {!isComposer && (
                <button
                  onClick={() => setCategoryTab("dependencies")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    categoryTab === "dependencies"
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  生产依赖 ({countProd})
                </button>
              )}

              {!isComposer && (
                <button
                  onClick={() => setCategoryTab("devDependencies")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    categoryTab === "devDependencies"
                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  开发依赖 ({countDev})
                </button>
              )}

              {isComposer && (
                <button
                  onClick={() => setCategoryTab("require")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    categoryTab === "require"
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  生产依赖 ({countProd})
                </button>
              )}

              {isComposer && (
                <button
                  onClick={() => setCategoryTab("require-dev")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    categoryTab === "require-dev"
                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  开发依赖 ({countDev})
                </button>
              )}

              <button
                onClick={() => setCategoryTab("workspace")}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  categoryTab === "workspace"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                内部联动 ({countWorkspace})
              </button>

              {countPeer > 0 && (
                <button
                  onClick={() => setCategoryTab("peerDependencies")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    categoryTab === "peerDependencies"
                      ? "bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/30"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  同行依赖 ({countPeer})
                </button>
              )}
            </div>

            {/* Quick in-list search + Refresh */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="在已装依赖中筛选..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 focus:border-sky-500 focus:outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-sm"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button
                onClick={loadDependencies}
                disabled={loading}
                className="apple-glass-button text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0 shadow-sm"
                title="刷新依赖清单"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                <span className="hidden sm:inline">刷新</span>
              </button>
            </div>
          </div>

          {/* Dependencies List Items */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs sm:text-sm text-[var(--text-muted)]">
              <div className="w-5 h-5 rounded-full border-2 border-sky-500 border-t-transparent animate-spin"></div>
              <span>正在加载并解析项目依赖配置...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : filteredDeps.length === 0 ? (
            <div className="py-16 px-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-3">
                <Package size={24} className="opacity-80" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                {filterQuery || categoryTab !== "all" ? "未找到匹配的依赖项" : "当前项目暂无依赖记录"}
              </h4>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
                {filterQuery || categoryTab !== "all"
                  ? "请尝试调整搜索关键词或切换依赖分类筛选"
                  : "可在「安装依赖」标签页中检索并安装所需第三方依赖包"}
              </p>
              {(filterQuery || categoryTab !== "all") && (
                <button
                  onClick={() => {
                    setFilterQuery("");
                    setCategoryTab("all");
                  }}
                  className="mt-4 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[var(--text-primary)] transition-all shadow-sm"
                >
                  清除筛选条件
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Optimistic in-progress installation banners */}
              {Object.entries(pendingPkgs)
                .filter(([_, p]) => p.action === "add")
                .map(([pkgName, p]) => (
                  <div
                    key={`pending-add-${pkgName}`}
                    className="p-3.5 rounded-xl bg-sky-500/[0.08] dark:bg-sky-500/[0.12] border border-dashed border-sky-500/50 flex flex-wrap items-center justify-between gap-3 animate-pulse shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Loader2 size={16} className="text-sky-500 animate-spin shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs sm:text-sm text-sky-600 dark:text-sky-300">
                            {p.spec || pkgName}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-600 dark:text-sky-300 font-semibold font-mono">
                            {p.dev ? "开发依赖" : "生产依赖"}
                          </span>
                          <span className="text-xs text-sky-500 font-medium">正在执行安装，等待实时同步...</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
                      <span>进程运行中</span>
                    </div>
                  </div>
                ))}

              {filteredDeps.map((dep) => {
                const isEditing = editingPkg === dep.name;
                const depPending = pendingPkgs[dep.name.toLowerCase()];

                return (
                  <div
                    key={`${dep.category}-${dep.name}`}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-all hover:border-sky-400/50 dark:hover:border-sky-500/30 hover:shadow"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                            {dep.name}
                          </span>

                          {/* Category Badge */}
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md font-mono font-semibold ${
                              dep.category === "devDependencies" || dep.category === "require-dev"
                                ? "bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20"
                                : dep.category === "peerDependencies"
                                ? "bg-pink-500/10 text-pink-500 dark:text-pink-400 border border-pink-500/20"
                                : "bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20"
                            }`}
                          >
                            {dep.category}
                          </span>

                          {/* Workspace Badge */}
                          {dep.isWorkspace && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold flex items-center gap-1">
                              <Link size={10} />
                              <span>内部联动</span>
                            </span>
                          )}
                        </div>

                        {dep.targetPath && (
                          <p className="text-xs font-mono text-[var(--text-muted)] mt-0.5 truncate">
                            源目录: {dep.targetPath}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Version & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {depPending ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 text-xs font-medium">
                          <Loader2 size={12} className="animate-spin text-sky-500" />
                          <span>{depPending.action === "remove" ? "正在移除中..." : "正在更新中..."}</span>
                        </div>
                      ) : isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editVersionInput}
                            onChange={(e) => setEditVersionInput(e.target.value)}
                            placeholder="新版本规则"
                            className="w-28 sm:w-36 px-2 py-1 text-xs font-mono rounded-lg bg-[var(--bg-app)] border border-sky-500 text-[var(--text-primary)] focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(dep);
                              if (e.key === "Escape") setEditingPkg(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveEdit(dep)}
                            disabled={isSavingEdit}
                            title="保存修改"
                            className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 transition-colors"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingPkg(null)}
                            title="取消修改"
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-[var(--border-glass-subtle)] text-[var(--text-primary)]">
                            {dep.version}
                          </span>

                          {/* Edit version button */}
                          <button
                            onClick={() => {
                              setEditingPkg(dep.name);
                              setEditVersionInput(dep.version);
                            }}
                            title="修改版本规则"
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-sky-500 transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>

                          {/* Quick Update Button */}
                          <button
                            onClick={() => handleUpdateLatest(dep)}
                            title="更新至最新版本"
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-sky-500 transition-colors"
                          >
                            <RefreshCw size={14} />
                          </button>

                          {/* Remove Button */}
                          <button
                            onClick={() => handleRemove(dep)}
                            title="从清单中移除"
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: SEARCH & INSTALL ===================== */}
      {currentTab === "search" && (
        <div className="space-y-4">
          {/* 1. Community Registry Search Bar & Ecosystem Switcher */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PackagePlus size={18} className="text-sky-500" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                    安装依赖 (开源社区检索)
                  </h4>
                  <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                    支持 NPM 与 Packagist 官方社区源 · 自动比对已安装版本 · 一键安装并实时同步
                  </p>
                </div>
              </div>

              {/* Ecosystem Switcher */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                <button
                  type="button"
                  onClick={() => setSearchEcosystem("npm")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    searchEcosystem === "npm"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-300"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  NPM 官方源
                </button>
                <button
                  type="button"
                  onClick={() => setSearchEcosystem("composer")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    searchEcosystem === "composer"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Packagist (PHP)
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  searchEcosystem === "npm"
                    ? "输入关键词或包名 (如 react, lodash@^4.17.21, tailwindcss, @types/node)..."
                    : "输入关键词或包名 (如 monolog/monolog, symfony/console:^6.0, guzzlehttp/guzzle)..."
                }
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 focus:border-sky-500 focus:outline-none text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick recommendation chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="text-[11px] font-medium text-[var(--text-muted)] mr-1">快捷检索:</span>
              {(searchEcosystem === "npm"
                ? ["lodash", "dayjs", "axios", "zod", "zustand", "tailwindcss", "vite", "@types/node"]
                : ["monolog/monolog", "guzzlehttp/guzzle", "symfony/console", "vlucas/phpdotenv", "nesbot/carbon"]
              ).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setSearchQuery(chip)}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/15 hover:text-sky-500 border border-slate-200/60 dark:border-slate-700/60 text-[11px] font-mono transition-colors cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Results Toolbar (Filters & Sorting) */}
          {searchQuery.trim() && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              {/* Left: Filter by Status */}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    statusFilter === "all"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-sky-600 dark:text-sky-300"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  全部结果 ({combinedResults.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("installed")}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    statusFilter === "installed"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  <span>
                    已安装 ({combinedResults.filter((p) => Boolean(findInstalled(p.name))).length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("uninstalled")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    statusFilter === "uninstalled"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-slate-700 dark:text-slate-200"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  未安装 ({combinedResults.filter((p) => !findInstalled(p.name)).length})
                </button>
              </div>

              {/* Right: Sorting Selector */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1 text-[var(--text-muted)]">
                  <ArrowUpDown size={13} />
                  <span>排序:</span>
                </div>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as any)}
                  className="apple-glass-input text-xs py-1 px-2.5 rounded-lg font-medium cursor-pointer"
                >
                  <option value="installed_first">默认 (已安装靠前)</option>
                  <option value="relevance">社区流行度 / 相关性</option>
                  <option value="name_asc">包名 A-Z</option>
                  <option value="name_desc">包名 Z-A</option>
                </select>
              </div>
            </div>
          )}

          {/* 3. Search Results List */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            {isSearching ? (
              <div className="py-16 flex items-center justify-center gap-2.5 text-xs sm:text-sm text-[var(--text-muted)]">
                <div className="w-5 h-5 rounded-full border-2 border-sky-500 border-t-transparent animate-spin"></div>
                <span>正在检索 {searchEcosystem === "npm" ? "NPM" : "Packagist"} 社区官方源...</span>
              </div>
            ) : searchError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm">
                检索失败: {searchError}
              </div>
            ) : finalDisplayResults.length > 0 ? (
              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                {finalDisplayResults.map((pkg) => {
                  const installed = findInstalled(pkg.name);
                  const parsed = parseSearchQuery(searchQuery);
                  const hasSpecifiedVersion =
                    parsed.specVersion && pkg.name.toLowerCase() === parsed.queryText.toLowerCase();

                  return (
                    <div
                      key={pkg.name}
                      className={`p-4 rounded-xl transition-all border ${
                        installed
                          ? "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] border-l-4 border-l-emerald-500 border-emerald-500/30 dark:border-emerald-500/30 hover:border-emerald-500/50"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/60 hover:border-sky-400/50"
                      } flex flex-wrap items-center justify-between gap-3`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                            {pkg.name}
                          </span>

                          {/* Version tags */}
                          {pkg.version && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700/70 font-mono text-[var(--text-muted)]">
                              最新: v{pkg.version}
                            </span>
                          )}

                          {/* Installed Badge vs Uninstalled Badge */}
                          {installed ? (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1.5 shadow-2xs">
                              <Check size={12} className="text-emerald-500" />
                              <span>已安装 · v{installed.version}</span>
                              <span className="text-[10px] opacity-75 font-mono">
                                ({installed.category === "devDependencies" || installed.category === "require-dev" ? "开发依赖" : "生产依赖"})
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700/60 text-[var(--text-muted)] font-medium">
                              未安装
                            </span>
                          )}

                          {/* Specified Version Tag if matched */}
                          {hasSpecifiedVersion && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 font-mono font-medium">
                              指定版本: {parsed.specVersion}
                            </span>
                          )}
                        </div>

                        {pkg.description && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-1">
                            {pkg.description}
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          const pkgPending = pendingPkgs[pkg.name.toLowerCase()];
                          if (pkgPending) {
                            return (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25 text-xs font-semibold">
                                <Loader2 size={13} className="animate-spin text-sky-500" />
                                <span>
                                  {pkgPending.action === "add"
                                    ? `正在安装${pkgPending.dev ? " (开发)" : " (生产)"}...`
                                    : pkgPending.action === "remove"
                                    ? "正在移除中..."
                                    : "正在更新中..."}
                                </span>
                              </div>
                            );
                          }

                          if (installed) {
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateLatest(installed)}
                                  className="apple-glass-button text-xs py-1.5 px-3 text-sky-600 dark:text-sky-400 hover:text-sky-500 shadow-sm cursor-pointer"
                                  title="更新至最新版本"
                                >
                                  <RefreshCw size={12} />
                                  <span>更新</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemove(installed)}
                                  className="apple-glass-button text-xs py-1.5 px-3 text-rose-500 hover:text-rose-400 shadow-sm cursor-pointer"
                                  title="从当前项目中卸载移除"
                                >
                                  <Trash2 size={12} />
                                  <span>移除</span>
                                </button>
                              </>
                            );
                          }

                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCommunityInstall(pkg, false)}
                                className="apple-glass-button primary text-xs py-1.5 px-3 shadow-sm font-semibold cursor-pointer"
                              >
                                <Plus size={12} />
                                <span>
                                  安装为生产依赖
                                  {hasSpecifiedVersion ? ` (${parsed.specVersion})` : ""}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCommunityInstall(pkg, true)}
                                className="apple-glass-button text-xs py-1.5 px-3 text-purple-600 dark:text-purple-400 hover:text-purple-500 shadow-sm cursor-pointer"
                              >
                                <Plus size={12} />
                                <span>
                                  安装为开发依赖
                                  {hasSpecifiedVersion ? ` (${parsed.specVersion})` : ""}
                                </span>
                              </button>
                            </>
                          );
                        })()}

                        {pkg.url && (
                          <a
                            href={pkg.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            title="查看社区官方主页"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery.trim() ? (
              <div className="py-12 text-center text-xs sm:text-sm text-[var(--text-muted)] space-y-1">
                <p className="italic">
                  未在 {searchEcosystem === "npm" ? "NPM" : "Packagist"} 社区找到符合当前筛选条件的包
                </p>
                {statusFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className="text-sky-500 hover:underline text-xs cursor-pointer"
                  >
                    切换为查看全部结果
                  </button>
                )}
              </div>
            ) : (
              <div className="py-14 text-center text-xs sm:text-sm text-[var(--text-muted)] flex flex-col items-center gap-2.5">
                <PackagePlus size={32} className="opacity-30 text-sky-400" />
                <span className="font-medium text-[var(--text-primary)]">在上方搜索栏输入关键词或包名检索开源社区</span>
                <span className="text-xs text-[var(--text-muted)] opacity-75 max-w-md text-center">
                  支持指定精确版本号，一键安装并将依赖实时同步至当前项目
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
