import React, { useState, useEffect } from "react";
import { Header } from "./components/Header.js";
import { Navigation, type NavTab } from "./components/Navigation.js";
import { DashboardView } from "./components/DashboardView.js";
import { TopologyView } from "./components/TopologyView.js";
import { GatekeeperView } from "./components/GatekeeperView.js";
import { ConsoleView } from "./components/ConsoleView.js";
import { IsolationView } from "./components/IsolationView.js";
import { WorkspaceInitWizard } from "./components/WorkspaceInitWizard.js";
import { fetchStatus, type WorkspaceStatusResponse, type ProjectModel } from "./api/client.js";

export const App: React.FC = () => {
  const [status, setStatus] = useState<WorkspaceStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<NavTab>("dashboard");
  const [showWizard, setShowWizard] = useState<boolean>(false);

  // Cross-view navigation state
  const [topologyTarget, setTopologyTarget] = useState<string | undefined>(undefined);
  const [consoleAction, setConsoleAction] = useState<string | undefined>(undefined);
  const [consoleTarget, setConsoleTarget] = useState<string | undefined>(undefined);
  const [gatekeeperTarget, setGatekeeperTarget] = useState<string | undefined>(undefined);

  const [error, setError] = useState<string | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("all");
  const [activeStandaloneFilter, setActiveStandaloneFilter] = useState<string>("all");

  const [loadingMessage, setLoadingMessage] = useState<string>("正在连接 leoms 核心服务...");

  useEffect(() => {
    loadWorkspaceStatus();
  }, []);

  const loadWorkspaceStatus = async () => {
    setLoading(true);
    setError(null);
    setLoadingMessage("正在连接 leoms 核心服务...");

    // 自动重试与平滑等待机制：最多持续 10 次，每次间隔 800ms（总计约 8 秒）
    // 桌面端在唤醒 WSL 后台守护进程期间将优雅轮询，避免秒崩报错
    const maxAttempts = 10;
    let lastError = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 2) {
          setLoadingMessage(`正在自动唤醒后台核心服务，请稍候 (${attempt}/${maxAttempts})...`);
        }
        const res = await fetchStatus();
        setStatus(res);
        setError(null);
        setLoading(false);
        return;
      } catch (err: any) {
        lastError = err.message || "无法连接到后台服务";
        if (attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // 只有在全部轮询耗尽后，才认定为真正的边界异常并展示错误卡片
    console.error("Failed to connect after retries:", lastError);
    setError(lastError);
    setLoading(false);
  };

  const handleSelectProjectForTopology = (projectName: string) => {
    setTopologyTarget(projectName);
    setCurrentTab("topology");
  };

  const handleRunProjectTask = (action: string, projectName: string) => {
    setConsoleAction(action);
    setConsoleTarget(projectName);
    setCurrentTab("console");
  };

  const handleRunCheckOnProject = (projectName: string) => {
    setGatekeeperTarget(projectName);
    setCurrentTab("gatekeeper");
  };

  const allProjects: ProjectModel[] = status ? Object.values(status.categories).flat() : [];
  const isUninitialized =
    status !== null &&
    !status.hasPnpmWorkspace &&
    !status.hasComposerWorkspace &&
    !status.hasLeomsConfig &&
    status.stats.totalProjects === 0;

  return (
    <div className="relative min-h-screen pb-16">
      {/* 1. Apple Ambient Background Mesh Glows */}
      <div className="ambient-container" aria-hidden="true">
        <div className="ambient-blob blob-1"></div>
        <div className="ambient-blob blob-2"></div>
        <div className="ambient-blob blob-3"></div>
      </div>

      <div className="max-w-[1780px] 2xl:max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10">
        {/* Unified Apple Studio Header with Segmented Navigation & Theme Switcher */}
        <Header
          status={status}
          loading={loading}
          onRefresh={loadWorkspaceStatus}
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          activeStatusFilter={activeStatusFilter}
          onToggleStatusFilter={(newStatus) => {
            setActiveStatusFilter(newStatus);
            if (currentTab !== "dashboard") setCurrentTab("dashboard");
          }}
          onOpenWizard={() => setShowWizard(true)}
        />

        {/* 4. Main Workspace View Container */}
        <main className="relative">
          {isUninitialized || showWizard ? (
            <WorkspaceInitWizard
              rootDir={status?.rootDir}
              status={status}
              onInitialized={() => {
                setShowWizard(false);
                loadWorkspaceStatus();
              }}
              onRetry={() => {
                setShowWizard(false);
                loadWorkspaceStatus();
              }}
            />
          ) : (
            <>
              {currentTab === "dashboard" && (
                <DashboardView
                  status={status}
                  error={error}
                  loading={loading}
                  loadingMessage={loadingMessage}
                  onRetry={loadWorkspaceStatus}
                  onSelectProjectForTopology={handleSelectProjectForTopology}
                  onRunProjectTask={handleRunProjectTask}
                  onRunCheckOnProject={handleRunCheckOnProject}
                  activeStatus={activeStatusFilter}
                  onStatusChange={setActiveStatusFilter}
                  activeStandalone={activeStandaloneFilter}
                  onStandaloneChange={setActiveStandaloneFilter}
                />
              )}

              {currentTab === "topology" && (
                <TopologyView
                  initialSelectedProject={topologyTarget}
                  onRunTask={(action, target) => handleRunProjectTask(action, target || "")}
                />
              )}

              {currentTab === "gatekeeper" && (
                <GatekeeperView initialTargetProject={gatekeeperTarget} />
              )}

              {currentTab === "console" && (
                <ConsoleView
                  projects={allProjects}
                  status={status}
                  presetAction={consoleAction}
                  presetTarget={consoleTarget}
                />
              )}

              {currentTab === "isolation" && <IsolationView />}
            </>
          )}
        </main>

        {/* 5. Sleek Minimal Footer */}
        <footer className="mt-16 text-center text-xs text-[var(--text-muted)] font-medium space-y-1.5 pb-8">
          <p className="text-sm font-semibold">🦁 leoms • Lean Ecosystem Orchestrator & Multi-repo Suite</p>
          <p className="text-xs opacity-75">
            Native-first • 100% Standalone Hygiene • Composer Dual-Layer Isolation
          </p>
        </footer>
      </div>
    </div>
  );
};
