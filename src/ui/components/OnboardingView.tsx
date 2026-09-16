import React, { useState } from "react";
import {
  FolderGit2,
  Radio,
  Zap,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  type DesktopSettings,
  saveDesktopSettings,
  DEFAULT_WORKSPACE_PATH,
} from "../utils/desktop.js";

export interface OnboardingViewProps {
  initialSettings?: DesktopSettings;
  onComplete: (settings: DesktopSettings) => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  initialSettings,
  onComplete,
}) => {
  // 引导步骤状态（支持扩展多步，当前为单步核心环境配置）
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 1;

  // 默认值保证不为空：优先当前配置值，否则采用 ~/org 及 3200 默认值
  const [workspacePath, setWorkspacePath] = useState<string>(
    initialSettings?.workspace_path || DEFAULT_WORKSPACE_PATH
  );
  const [port, setPort] = useState<number>(initialSettings?.port || 3200);
  const [autoStart, setAutoStart] = useState<boolean>(
    initialSettings?.auto_start !== undefined ? initialSettings.auto_start : true
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isLastStep = currentStep === totalSteps;

  // 提交并保存配置
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLastStep) {
      setCurrentStep((prev) => prev + 1);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const portNum = Number(port) || 3200;
      if (portNum < 1024 || portNum > 65535) {
        throw new Error("端口号必须在 1024 到 65535 之间");
      }

      const finalPath = workspacePath.trim() || DEFAULT_WORKSPACE_PATH;
      const finalConfig: DesktopSettings = {
        workspace_path: finalPath,
        port: portNum,
        auto_start: autoStart,
        initialized: true,
      };

      const saved = await saveDesktopSettings(finalConfig);
      onComplete(saved);
    } catch (err: any) {
      setError(err.message || "保存配置失败");
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden transition-all my-auto">
      {/* Glow ambient background accent */}
      <div
        className="absolute -top-32 -right-32 w-72 h-72 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -left-32 w-72 h-72 bg-gradient-to-tr from-purple-500/15 to-pink-500/15 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Header Icon & Title */}
      <div className="relative z-10 text-center space-y-3 mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border border-sky-500/30 shadow-lg shadow-sky-500/20 mb-2">
          <img src="/icon.png" alt="leoms" className="w-full h-full object-cover" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
          <Sparkles size={13} className="text-sky-500 dark:text-sky-400" />
          首次使用 • 运行环境配置
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          欢迎使用 leoms Studio
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
          跨语言、多仓库 Monorepo 全景透视与编排工作台。已为您预设推荐参数，确认后即可开箱即用。
        </p>
      </div>

      {error && (
        <div className="relative z-10 mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <span className="font-bold">提示:</span> {error}
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSubmit} className="relative z-10 space-y-5">
        {/* 1. Workspace Directory */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FolderGit2 size={14} className="text-sky-500 dark:text-sky-400" />
              工作区根目录 (Workspace Path)
            </label>
            <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 font-medium">默认推荐</span>
          </div>
          <input
            type="text"
            required
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            placeholder="例如: ~/org 或 /home/username/org"
            className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all shadow-xs"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            包含 <code className="text-sky-600 dark:text-sky-400 font-mono font-medium">pnpm-workspace.yaml</code> 或 <code className="text-sky-600 dark:text-sky-400 font-mono font-medium">leoms.yml</code> 的工程根目录。伴生服务将在此目录下自动运行。
          </p>
        </div>

        {/* 2. Service Port */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Radio size={14} className="text-indigo-500 dark:text-indigo-400" />
              核心服务端口 (Service Port)
            </label>
            <span className="text-[11px] font-mono text-indigo-500 dark:text-indigo-400 font-medium">默认 3200</span>
          </div>
          <input
            type="number"
            min={1024}
            max={65535}
            required
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value, 10) || 3200)}
            className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all shadow-xs"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            后台守护进程监听的通信端口。若遇端口占用，服务将自动顺延探测。
          </p>
        </div>

        {/* 3. Auto-start Toggle */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Zap size={13} className="text-amber-500 dark:text-amber-400" />
              自动拉起核心伴生服务
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              每次打开桌面端时，自动在后台静默运行核心服务（无需手动开启终端）
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAutoStart(!autoStart)}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 cursor-pointer ${
              autoStart ? "bg-sky-500" : "bg-slate-300 dark:bg-zinc-600"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                autoStart ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Config file hint */}
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 pt-1">
          <span>配置文件位置:</span>
          <code className="text-sky-600 dark:text-sky-400 font-mono font-medium">~/.config/leoms/desktop.json</code>
          <span>（随时可修改）</span>
        </div>

        {/* Single Dynamic Action Button */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 hover:from-sky-400 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                正在保存配置并初始化服务...
              </>
            ) : isLastStep ? (
              <>
                <span>完成配置并进入应用</span>
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                <span>下一步</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
