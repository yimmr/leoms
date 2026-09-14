import React from "react";
import {
  Sun,
  Moon,
  Laptop,
  RefreshCw,
  FolderGit2,
  AlertTriangle,
  ShieldCheck,
  LayoutDashboard,
  Network,
  ShieldAlert,
  Terminal,
  Layers,
} from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext.js";
import type { WorkspaceStatusResponse } from "../api/client.js";
import type { NavTab } from "./Navigation.js";

interface HeaderProps {
  status: WorkspaceStatusResponse | null;
  loading: boolean;
  onRefresh: () => void;
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  gatekeeperBadgeCount?: number;
  activeStatusFilter?: string;
  onToggleStatusFilter?: (status: string) => void;
  onOpenWizard?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  loading,
  onRefresh,
  currentTab,
  onTabChange,
  gatekeeperBadgeCount = 0,
  activeStatusFilter = "all",
  onToggleStatusFilter,
  onOpenWizard,
}) => {
  const { theme, setTheme } = useTheme();

  const themeOptions: { key: Theme; label: string; icon: React.ReactNode }[] = [
    { key: "system", label: "系统", icon: <Laptop size={14} /> },
    { key: "light", label: "浅色", icon: <Sun size={14} /> },
    { key: "dark", label: "深色", icon: <Moon size={14} /> },
  ];

  const tabs: { key: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "dashboard", label: "资产大盘", icon: <LayoutDashboard size={15} /> },
    { key: "topology", label: "DAG 拓扑", icon: <Network size={15} /> },
    {
      key: "gatekeeper",
      label: "门禁体检",
      icon: <ShieldAlert size={15} />,
      badge: gatekeeperBadgeCount > 0 ? gatekeeperBadgeCount : undefined,
    },
    { key: "console", label: "终端", icon: <Terminal size={15} /> },
    { key: "isolation", label: "隔离透视", icon: <Layers size={15} /> },
  ];

  return (
    <header className="apple-glass sticky top-3 z-30 mb-6 mt-3 px-4 sm:px-6 py-3 rounded-2xl flex items-center justify-between gap-4 transition-all">
      {/* 1. Left: Brand & Workspace */}
      <div className="flex items-center gap-3.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-400 via-indigo-500 to-purple-600 flex items-center justify-center text-lg shadow-[0_2px_12px_rgba(56,189,248,0.35)] select-none shrink-0">
            🦁
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold tracking-tight bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                leoms
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 tracking-wide">
                STUDIO
              </span>
            </div>
          </div>
        </div>

        {/* Workspace directory chip */}
        {status && (
          <button
            type="button"
            onClick={onOpenWizard}
            className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-glass)] text-xs text-[var(--text-secondary)] hover:text-sky-400 font-mono transition-colors cursor-pointer group"
            title={`当前工作区: ${status.rootDir}\n点击打开工作区初始化/配置向导`}
          >
            <FolderGit2 size={13} className="text-sky-400 group-hover:scale-110 transition-transform" />
            <span className="truncate max-w-[240px]" title={status.rootDir}>
              {status.rootDir.split("/").slice(-2).join("/")}
            </span>
          </button>
        )}
      </div>

      {/* 2. Center: Apple macOS Unified Segmented Navigation */}
      <nav className="apple-segmented-control hidden md:inline-flex">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`apple-segmented-item ${isActive ? "active" : ""}`}
            >
              {tab.icon}
              <span className="text-xs sm:text-sm font-medium">{tab.label}</span>
              {typeof tab.badge === "number" && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white shadow-sm">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. Right: Status & Theme & Refresh */}
      <div className="flex items-center gap-2.5 shrink-0">
        {status && (
          <div className="hidden sm:flex items-center gap-2 text-xs mr-1">
            {status.stats.dirtyGitRepos > 0 ? (
              <span
                onClick={() => {
                  if (currentTab !== "dashboard") onTabChange("dashboard");
                  onToggleStatusFilter?.(activeStatusFilter === "dirty" ? "all" : "dirty");
                }}
                className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 font-semibold px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 cursor-pointer select-none"
                title={`点击筛选待提交项目 (${status.stats.dirtyGitRepos})`}
              >
                <AlertTriangle size={13} />
                {status.stats.dirtyGitRepos} 待提交
              </span>
            ) : (
              <span
                onClick={() => {
                  if (currentTab !== "dashboard") onTabChange("dashboard");
                  onToggleStatusFilter?.(activeStatusFilter === "clean" ? "all" : "clean");
                }}
                className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400 font-semibold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 cursor-pointer select-none"
                title="点击筛选洁净项目"
              >
                <ShieldCheck size={13} />
                洁净
              </span>
            )}
          </div>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="apple-glass-button text-xs py-2 px-3"
          title="刷新工作区数据"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-sky-400" : ""} />
        </button>

        {/* 3-state Theme Switcher */}
        <div className="apple-segmented-control">
          {themeOptions.map((opt) => {
            const active = theme === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setTheme(opt.key)}
                className={`apple-segmented-item py-1.5 px-2.5 text-xs ${active ? "active" : ""}`}
                title={`切换为${opt.label}主题`}
              >
                {opt.icon}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
