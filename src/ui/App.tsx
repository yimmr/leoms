import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { OnboardingView } from "./components/OnboardingView.js";
import { Workbench } from "./components/Workbench.js";
import { fetchStatus, setApiPort, type WorkspaceStatusResponse } from "./api/client.js";
import {
  getDesktopSettings,
  saveDesktopSettings,
  type DesktopSettings,
} from "./utils/desktop.js";

type AppLifecycleState = "checking" | "onboarding" | "workbench";

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppLifecycleState>("checking");
  const [desktopConfig, setDesktopConfig] = useState<DesktopSettings | null>(null);

  useEffect(() => {
    checkEnvironment();
  }, []);

  const checkEnvironment = async () => {
    setAppState("checking");

    let cfg: DesktopSettings = {
      port: 3200,
      auto_start: true,
    };

    try {
      cfg = await getDesktopSettings();
    } catch {
      // ignore
    }

    if (cfg.port) {
      setApiPort(cfg.port);
    }

    // 1. 优先探测当前是否有活跃的伴生服务
    let liveStatus: WorkspaceStatusResponse | null = null;
    try {
      liveStatus = await fetchStatus();
    } catch {
      // 若当前配置端口不同于 3200 且探测失败，尝试默认 3200 端口
      if (cfg.port && cfg.port !== 3200) {
        setApiPort(3200);
        try {
          liveStatus = await fetchStatus();
        } catch {
          setApiPort(cfg.port);
        }
      }
    }

    // 2. 活跃服务自愈判定：如果伴生服务存活，且已知有效工作区
    if (liveStatus && liveStatus.rootDir) {
      // 静默自动补全恢复 desktop.json
      if (!cfg.initialized || !cfg.workspace_path) {
        const healedCfg: DesktopSettings = {
          workspace_path: liveStatus.rootDir,
          port: cfg.port || 3200,
          auto_start: cfg.auto_start !== undefined ? cfg.auto_start : true,
          initialized: true,
          theme: cfg.theme || "system",
          language: cfg.language || "zh",
        };
        try {
          await saveDesktopSettings(healedCfg);
          cfg = healedCfg;
        } catch {}
      }
      setDesktopConfig(cfg);
      setAppState("workbench");
      return;
    }

    // 3. 伴生服务未连通：检查本地是否已有明确的工作区路径
    const hasKnownWorkspace = Boolean(cfg.workspace_path && cfg.workspace_path.trim());

    // 4. “如果伴生服务和工作区目录，二者中，有一个无法确定，应该弹出引导”
    if (!hasKnownWorkspace) {
      setDesktopConfig(cfg);
      setAppState("onboarding");
      return;
    }

    // 工作区已明确，直接进入主工作台进行连接与自动拉起
    setDesktopConfig(cfg);
    setAppState("workbench");
  };

  const handleOnboardingComplete = (saved: DesktopSettings) => {
    setDesktopConfig(saved);
    if (saved.port) {
      setApiPort(saved.port);
    }
    // 完成引导后，直接进入工作台
    setAppState("workbench");
  };

  // 1. 全屏静默环境检测态
  if (appState === "checking") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative p-4 select-none">
        <div className="ambient-container" aria-hidden="true">
          <div className="ambient-blob blob-1"></div>
          <div className="ambient-blob blob-2"></div>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full overflow-hidden shadow-xl shadow-sky-500/25 border border-sky-400/30 animate-pulse flex items-center justify-center">
            <img src="/icon.png" alt="leoms" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)] font-medium">
            <Loader2 size={15} className="animate-spin text-sky-400" />
            <span>正在检测运行环境与伴生服务...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. 独立纯净引导态（完全不挂载工作台，无任何代码与状态污染）
  if (appState === "onboarding") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <div className="ambient-container" aria-hidden="true">
          <div className="ambient-blob blob-1"></div>
          <div className="ambient-blob blob-2"></div>
          <div className="ambient-blob blob-3"></div>
        </div>
        <OnboardingView
          initialSettings={desktopConfig || undefined}
          onComplete={handleOnboardingComplete}
        />
      </div>
    );
  }

  // 3. 实际应用工作台态（引导未激活时直接进入，包含全部主应用功能）
  return (
    <Workbench
      initialConfig={desktopConfig || { port: 3200, auto_start: true }}
      onReconfigure={() => setAppState("onboarding")}
    />
  );
};
