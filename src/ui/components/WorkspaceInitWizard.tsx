import React, { useState } from "react";
import { initWorkspace, type WorkspaceStatusResponse } from "../api/client.js";

export interface WorkspaceInitWizardProps {
  rootDir?: string;
  status?: WorkspaceStatusResponse | null;
  onInitialized: () => void;
  onRetry: () => void;
}

export const WorkspaceInitWizard: React.FC<WorkspaceInitWizardProps> = ({
  rootDir = "当前目录",
  onInitialized,
  onRetry,
}) => {
  const [ecosystem, setEcosystem] = useState<"hybrid" | "node" | "php">("hybrid");
  const [generateConfig, setGenerateConfig] = useState<boolean>(false);
  const [setComposerHome, setSetComposerHome] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyPath = () => {
    if (rootDir) {
      navigator.clipboard.writeText(rootDir);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInit = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await initWorkspace({
        config: generateConfig,
        setComposerHome,
      });
      if (res.success) {
        setSuccessMsg("🎉 初始化完成！正在加载工作台...");
        setTimeout(() => {
          onInitialized();
        }, 1200);
      } else {
        setError(res.message || "初始化失败，请检查目录权限");
      }
    } catch (err: any) {
      setError(err.message || "请求后端失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 py-12">
      <div className="w-full max-w-2xl bg-[var(--surface-bg)] backdrop-blur-2xl border border-[var(--border-subtle)] rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        {/* Glow ambient background accent */}
        <div
          className="absolute -top-32 -right-32 w-72 h-72 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -left-32 w-72 h-72 bg-gradient-to-tr from-sky-500/15 to-emerald-500/15 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Header Icon & Title */}
        <div className="relative z-10 text-center space-y-3 mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full overflow-hidden border border-indigo-500/30 shadow-lg shadow-indigo-500/20 mb-2">
            <img src="/icon.png" alt="leoms" className="w-full h-full object-cover" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            首次使用 • 待初始化工作区
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            欢迎使用 LEOMS 工作台
          </h2>
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            检测到当前目录尚未配置为 LEOMS 多包工作区。一键开箱即用初始化，立即享受高效的多仓库编排体验。
          </p>
        </div>

        {/* Directory Card */}
        <div className="relative z-10 mb-6 bg-[var(--surface-bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              目标工作区目录
            </div>
            <div className="font-mono text-xs text-[var(--text-primary)] truncate" title={rootDir}>
              {rootDir}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyPath}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-xl bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] border border-white/10 transition-colors"
          >
            {copied ? "已复制 ✔" : "复制路径"}
          </button>
        </div>

        {/* Ecosystem Selection */}
        <div className="relative z-10 space-y-3 mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            工作区技术栈模式
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setEcosystem("hybrid")}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all ${
                ecosystem === "hybrid"
                  ? "bg-indigo-500/15 border-indigo-500/50 shadow-md shadow-indigo-500/10"
                  : "bg-white/5 border-[var(--border-subtle)] hover:border-white/20 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-base font-bold text-[var(--text-primary)]">全栈混合架构</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                  推荐
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Node.js + PHP 双引擎，支持 pnpm 与 Composer 双层符号链接拓扑
              </p>
            </button>

            <button
              type="button"
              onClick={() => setEcosystem("node")}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all ${
                ecosystem === "node"
                  ? "bg-indigo-500/15 border-indigo-500/50 shadow-md shadow-indigo-500/10"
                  : "bg-white/5 border-[var(--border-subtle)] hover:border-white/20 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-base font-bold text-[var(--text-primary)]">Node.js 优先</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                纯前端 / Node 单体多包，完全基于 pnpm workspace 原生机制
              </p>
            </button>

            <button
              type="button"
              onClick={() => setEcosystem("php")}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all ${
                ecosystem === "php"
                  ? "bg-indigo-500/15 border-indigo-500/50 shadow-md shadow-indigo-500/10"
                  : "bg-white/5 border-[var(--border-subtle)] hover:border-white/20 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-base font-bold text-[var(--text-primary)]">PHP 独立</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                企业级 PHP 多仓库，Composer 独立隔离与本地 Path 映射
              </p>
            </button>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="relative z-10 space-y-3 mb-8 bg-black/20 rounded-2xl p-4 border border-[var(--border-subtle)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            初始化内容预设
          </div>

          <div className="flex items-center gap-3 text-xs text-[var(--text-primary)]">
            <span className="text-emerald-400 font-bold">✔</span>
            <span>自动建立标准规范目录：<code className="text-[var(--text-accent)]">apps/</code>、<code className="text-[var(--text-accent)]">packages/</code>、<code className="text-[var(--text-accent)]">libs/</code></span>
          </div>

          <div className="flex items-center gap-3 text-xs text-[var(--text-primary)]">
            <span className="text-emerald-400 font-bold">✔</span>
            <span>自动配置根级 <code className="text-[var(--text-accent)]">pnpm-workspace.yaml</code> 与 <code className="text-[var(--text-accent)]">.gitignore</code></span>
          </div>

          <label className="flex items-center gap-3 text-xs text-[var(--text-primary)] cursor-pointer hover:opacity-90 transition-opacity">
            <input
              type="checkbox"
              checked={generateConfig}
              onChange={(e) => setGenerateConfig(e.target.checked)}
              className="rounded border-[var(--border-subtle)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 bg-white/10"
            />
            <span>生成 <code className="text-[var(--text-accent)]">leoms.yml</code>（可选：自定义发版远端与部署流程）</span>
          </label>

          <label className="flex items-center gap-3 text-xs text-[var(--text-primary)] cursor-pointer hover:opacity-90 transition-opacity">
            <input
              type="checkbox"
              checked={setComposerHome}
              onChange={(e) => setSetComposerHome(e.target.checked)}
              className="rounded border-[var(--border-subtle)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 bg-white/10"
            />
            <span>在当前 Shell 注入全局 <code className="text-[var(--text-accent)]">COMPOSER_HOME</code>（原生 composer 终端免配置支持）</span>
          </label>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="relative z-10 mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-3">
            <span className="text-base">⚠️</span>
            <span className="flex-1 font-medium">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="relative z-10 mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-3">
            <span className="text-base">🎉</span>
            <span className="flex-1 font-medium">{successMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleInit}
            disabled={loading}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl font-semibold text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>正在初始化工作区...</span>
              </>
            ) : (
              <>
                <span>✨ 立即初始化 (开箱即用)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="w-full sm:w-auto py-3.5 px-6 rounded-2xl font-semibold text-sm text-[var(--text-secondary)] bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-[var(--border-subtle)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            🔄 重新检测
          </button>
        </div>
      </div>
    </div>
  );
};
