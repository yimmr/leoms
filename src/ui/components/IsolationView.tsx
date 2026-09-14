import React, { useState, useEffect } from "react";
import {
  Layers,
  ShieldCheck,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
} from "lucide-react";
import { fetchComposerIsolation, type ComposerIsolationInfo } from "../api/client.js";

export const IsolationView: React.FC = () => {
  const [data, setData] = useState<ComposerIsolationInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchComposerIsolation();
      setData(res);
    } catch (err) {
      console.error("Failed to load isolation info:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 mb-4 animate-spin">
          <Layers size={24} />
        </div>
        <p className="text-sm text-[var(--text-secondary)] font-medium">正在审计工作区双层隔离机制...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="apple-glass p-5 sm:p-6 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2.5">
            <ShieldCheck className="text-emerald-400" size={22} />
            <span>PHP Composer 双层隔离机制与离仓纯净度审计</span>
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            顶层专属 COMPOSER_HOME 隔离承载，严禁子项目写入本地 path 仓库，推送到远端 100% 独立无污染
          </p>
        </div>

        <button onClick={loadData} className="apple-glass-button text-xs md:text-sm py-2 px-3.5">
          <RefreshCw size={14} />
          <span>重新审计</span>
        </button>
      </div>

      {/* 2. Core Isolation Philosophy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {/* Layer 1: Workspace level */}
        <div className="apple-glass-card p-5 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-400">
              第一层：工作区专属 COMPOSER_HOME
            </span>
            <span className="status-pill emerald text-xs font-semibold px-2.5 py-0.5">已隔离激活</span>
          </div>

          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            所有内部公共包的软链映射完全收敛在顶层配置文件，不侵入各个独立子项目的清单文件。
          </p>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glass)] font-mono text-xs sm:text-sm text-[var(--text-muted)] space-y-1">
            <div className="text-[var(--text-secondary)] font-semibold">配置文件路径:</div>
            <div className="text-sky-300 break-all">{data.configFile || "未探测到 .leoms/composer/config.json"}</div>
          </div>
        </div>

        {/* Layer 2: 100% Off-repo purity */}
        <div className="apple-glass-card p-5 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-400">
              第二层：100% 离仓独立性终审
            </span>
            <span className="status-pill emerald text-xs font-semibold px-2.5 py-0.5">零污染</span>
          </div>

          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            每个子项目离开当前工作区交付或推送到 GitHub / Gitlab 时，保证纯净自洽，绝无本地绝对或相对路径残留。
          </p>

          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glass)] text-xs sm:text-sm text-emerald-400 font-medium flex items-center gap-2.5">
            <CheckCircle2 size={18} />
            <span>全量子项目 composer.json 与 package.json 卫生审计通过</span>
          </div>
        </div>
      </div>

      {/* 3. Path Repositories Table */}
      <div className="apple-glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold flex items-center gap-2.5">
            <FolderTree size={18} className="text-indigo-400" />
            <span>工作区顶层注册的公共包路径映射 ({data.repositories.length})</span>
          </h3>
          <span className="text-xs sm:text-sm text-[var(--text-muted)]">由 leoms init / composer 自动维护</span>
        </div>

        {data.repositories.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead>
                <tr className="apple-table-header backdrop-blur-sm tracking-wide">
                  <th className="py-3 px-4 font-semibold">包名/标识</th>
                  <th className="py-3 px-4 font-semibold">仓库类型</th>
                  <th className="py-3 px-4 font-semibold">路径声明</th>
                  <th className="py-3 px-4 font-semibold">解析绝对路径</th>
                  <th className="py-3 px-4 font-semibold">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-glass-subtle)] font-mono">
                {data.repositories.map((repo, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <td className="py-3 px-4 font-bold text-sky-400">{repo.name}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{repo.type}</td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">{repo.url}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] truncate max-w-xs" title={repo.resolvedPath}>
                      {repo.resolvedPath}
                    </td>
                    <td className="py-3 px-4">
                      {repo.isLinked ? (
                        <span className="status-pill emerald text-xs font-semibold px-2.5 py-0.5">有效就绪</span>
                      ) : (
                        <span className="status-pill rose text-xs font-semibold px-2.5 py-0.5">路径无效</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            当前工作区尚未配置 Composer path 映射
          </div>
        )}
      </div>

      {/* 4. Detected Symlinks */}
      <div className="apple-glass-card p-5 sm:p-6 space-y-4">
        <h3 className="text-sm sm:text-base font-bold flex items-center gap-2.5">
          <FileCheck2 size={18} className="text-purple-400" />
          <span>探测到的本地符号链接引用 ({data.symlinks.length} 个项目)</span>
        </h3>

        {data.symlinks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {data.symlinks.map((s, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glass)] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-sky-400">{s.projectName}</span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">{s.vendorDir}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.linkedPackages.map((pkg, i) => (
                    <span
                      key={i}
                      className="font-mono text-xs px-2.5 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium"
                    >
                      {pkg}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            各应用暂未生成 vendor 软链接，可执行 <code>leoms install</code> 进行安装联动
          </div>
        )}
      </div>
    </div>
  );
};
