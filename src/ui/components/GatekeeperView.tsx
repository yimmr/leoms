import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Zap,
  Filter,
  FileCode2,
  Wrench,
  Search,
} from "lucide-react";
import {
  fetchCheckRules,
  runChecks,
  type CheckRuleItem,
  type CheckRunResponse,
} from "../api/client.js";

interface GatekeeperViewProps {
  initialTargetProject?: string;
}

export const GatekeeperView: React.FC<GatekeeperViewProps> = ({ initialTargetProject }) => {
  const [rules, setRules] = useState<CheckRuleItem[]>([]);
  const [selectedRules, setSelectedRules] = useState<Set<string>>(new Set());
  const [targetProject, setTargetProject] = useState<string>(initialTargetProject || "");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CheckRunResponse | null>(null);
  const [issueFilter, setIssueFilter] = useState<"all" | "error" | "warning">("all");
  const [searchIssue, setSearchIssue] = useState<string>("");

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    if (initialTargetProject) {
      setTargetProject(initialTargetProject);
    }
  }, [initialTargetProject]);

  const loadRules = async () => {
    try {
      const res = await fetchCheckRules();
      setRules(res.rules);
      // Default to daily rules
      const defaults = new Set(res.rules.filter((r) => r.default).map((r) => r.id));
      setSelectedRules(defaults);
    } catch (err) {
      console.error("Failed to load rules:", err);
    }
  };

  const handleRunChecks = async (isAll: boolean = false) => {
    setLoading(true);
    try {
      const ruleIds = isAll ? undefined : Array.from(selectedRules);
      const res = await runChecks({
        all: isAll,
        ruleIds,
        targetPattern: targetProject.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      console.error("Check execution failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = (id: string) => {
    const next = new Set(selectedRules);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRules(next);
  };

  const filteredIssues = (result?.issues || []).filter((issue) => {
    if (issueFilter === "error" && issue.level !== "error") return false;
    if (issueFilter === "warning" && issue.level !== "warning") return false;
    if (searchIssue.trim()) {
      const q = searchIssue.toLowerCase();
      return (
        issue.project.toLowerCase().includes(q) ||
        issue.message.toLowerCase().includes(q) ||
        issue.ruleName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Control Action Center */}
      <div className="apple-glass p-5 sm:p-6 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2.5">
              <ShieldCheck className="text-emerald-400" size={20} />
              <span>微内核可插拔门禁体检中心 (Gatekeeper Center)</span>
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              8大维度原子化校验规则，覆盖软链满足度、清单卫生、AST幽灵依赖与离仓自洽性
            </p>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleRunChecks(false)}
              disabled={loading || selectedRules.size === 0}
              className={`apple-glass-button text-xs md:text-sm py-2 px-4 transition-all ${
                selectedRules.size === 0 ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title={selectedRules.size === 0 ? "请至少选择 1 项体检规则" : undefined}
            >
              <Zap size={15} className="text-amber-400" />
              <span>{loading ? "体检中..." : `执行所选体检 (${selectedRules.size}项)`}</span>
            </button>

            <button
              onClick={() => handleRunChecks(true)}
              disabled={loading}
              className="apple-glass-button primary text-xs md:text-sm py-2 px-4.5 shadow-[0_4px_16px_rgba(56,189,248,0.35)]"
            >
              <ShieldAlert size={15} />
              <span>{loading ? "深度扫描中..." : "全量深度门禁 --all (8项终审)"}</span>
            </button>
          </div>
        </div>

        {/* Target project query */}
        <div className="flex items-center gap-2.5 pt-3 border-t border-[var(--border-glass)]">
          <span className="text-xs sm:text-sm text-[var(--text-muted)] font-medium whitespace-nowrap">目标项目过滤:</span>
          <input
            type="text"
            placeholder="留空检测全工作区，或输入特定项目名（如 @meocox/ui）"
            value={targetProject}
            onChange={(e) => setTargetProject(e.target.value)}
            className="apple-glass-input text-xs sm:text-sm py-2 px-3.5 grow font-mono max-w-lg"
          />
          {targetProject && (
            <button
              onClick={() => setTargetProject("")}
              className="apple-glass-button text-xs py-1.5 px-3 text-[var(--text-muted)]"
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* 2. 8-Rules Selection Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1 flex-wrap gap-2">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            已注册体检规则清单 ({rules.length} 大维度
            {selectedRules.size > 0 ? (
              <span className="text-sky-500 dark:text-sky-400 font-mono ml-1.5 normal-case font-semibold">
                · 已选 {selectedRules.size} 项
              </span>
            ) : (
              <span className="text-rose-500 font-mono ml-1.5 normal-case font-semibold">
                · 未选择规则
              </span>
            )}
            )
          </span>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <button
              type="button"
              onClick={() => setSelectedRules(new Set(rules.map((r) => r.id)))}
              className="text-sky-500 hover:text-sky-400 hover:underline cursor-pointer"
            >
              全选
            </button>
            <span className="text-[var(--text-muted)]">•</span>
            <button
              type="button"
              onClick={() => setSelectedRules(new Set())}
              disabled={selectedRules.size === 0}
              className={`cursor-pointer transition-colors ${
                selectedRules.size === 0
                  ? "text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                  : "text-[var(--text-muted)] hover:text-rose-500 hover:underline"
              }`}
            >
              清除已选
            </button>
            <span className="text-[var(--text-muted)]">•</span>
            <button
              type="button"
              onClick={() => setSelectedRules(new Set(rules.filter((r) => r.default).map((r) => r.id)))}
              className="text-sky-500 hover:text-sky-400 hover:underline cursor-pointer"
            >
              重置日常默认
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {rules.map((rule) => {
            const isChecked = selectedRules.has(rule.id);
            return (
              <div
                key={rule.id}
                onClick={() => toggleRule(rule.id)}
                className={`apple-glass-card p-4 sm:p-5 rounded-2xl cursor-pointer transition-all ${
                  isChecked
                    ? "border-sky-500/40 bg-[var(--bg-surface-hover)] shadow-[0_0_16px_rgba(56,189,248,0.15)]"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2.5 mb-2">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="accent-sky-500 rounded cursor-pointer w-4 h-4"
                    />
                    <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                      {rule.id}
                    </span>
                  </div>

                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      rule.default
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                        : "bg-purple-500/15 text-purple-400 border-purple-500/25"
                    }`}
                  >
                    {rule.default ? "日常默认" : "深度项"}
                  </span>
                </div>

                <h4 className="text-xs sm:text-sm font-bold text-[var(--text-secondary)] mb-1">
                  {rule.name}
                </h4>
                <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                  {rule.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Check Results Dashboard & Issue List */}
      {result && (
        <div className="apple-glass-panel p-6 sm:p-7 space-y-6">
          {/* Result Banner: Clean Apple Callout with crisp accent border, zero muddy background */}
          <div
            className={`p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-glass)] flex flex-wrap items-center justify-between gap-4 shadow-sm ${
              result.passed
                ? "border-l-4 border-l-emerald-500"
                : "border-l-4 border-l-rose-500"
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              {result.passed ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                  <CheckCircle2 size={22} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
                  <XCircle size={22} />
                </div>
              )}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  {result.passed ? (
                    <span className="text-emerald-500">门禁体检全部通过！工作区资产符合规范</span>
                  ) : (
                    <span>
                      门禁体检发现违规问题 (
                      <span className="text-rose-500 font-mono font-bold">{result.totalErrors} 错误</span>
                      ,{" "}
                      <span className="text-amber-500 font-mono font-bold">{result.totalWarnings} 警告</span>
                      )
                    </span>
                  )}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5 font-medium">
                  耗时: {result.durationMs}ms · 检查了 {result.targets.length} 个目标项目 · 执行了{" "}
                  {result.executedRules.length} 条门禁规则
                </p>
              </div>
            </div>

            {/* Filter pills: Unified Apple Segmented Control */}
            <div className="apple-segmented-control shrink-0">
              <button
                onClick={() => setIssueFilter("all")}
                className={`apple-segmented-item ${issueFilter === "all" ? "active" : ""}`}
              >
                <span>全部</span>
                <span className="text-xs opacity-75 font-mono">({result.issues.length})</span>
              </button>
              <button
                onClick={() => setIssueFilter("error")}
                className={`apple-segmented-item ${
                  issueFilter === "error"
                    ? "active !bg-rose-500/25 !text-rose-500 !border-rose-500/40"
                    : "text-rose-500/80 hover:text-rose-500"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span>错误</span>
                <span className="text-xs font-mono font-semibold">({result.totalErrors})</span>
              </button>
              <button
                onClick={() => setIssueFilter("warning")}
                className={`apple-segmented-item ${
                  issueFilter === "warning"
                    ? "active !bg-amber-500/25 !text-amber-500 !border-amber-500/40"
                    : "text-amber-500/80 hover:text-amber-500"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>警告</span>
                <span className="text-xs font-mono font-semibold">({result.totalWarnings})</span>
              </button>
            </div>
          </div>

          {/* Issues List */}
          {filteredIssues.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  发现的问题与修复建议 ({filteredIssues.length} 项)
                </span>

                <div className="relative w-52 sm:w-64">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="按项目或规则过滤..."
                    value={searchIssue}
                    onChange={(e) => setSearchIssue(e.target.value)}
                    className="apple-glass-input text-xs sm:text-sm py-1.5 pl-8 pr-3 w-full"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {filteredIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-glass)] shadow-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full border tracking-wide whitespace-nowrap ${
                            issue.level === "error"
                              ? "bg-rose-500/15 text-rose-500 border-rose-500/30"
                              : "bg-amber-500/15 text-amber-500 border-amber-500/30"
                          }`}
                        >
                          {issue.level === "error" ? "ERROR" : "WARN"}
                        </span>
                        <span className="font-mono text-sm sm:text-base font-bold text-sky-500">
                          {issue.project}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-medium bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md border border-[var(--border-glass-subtle)]">
                          [{issue.ruleName}]
                        </span>
                      </div>

                      {issue.filePath && (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-mono bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-[var(--border-glass-subtle)]">
                          <FileCode2 size={13} className="text-[var(--text-muted)]" />
                          <span>
                            {issue.filePath}
                            {issue.fileLine ? `:${issue.fileLine}` : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-[var(--text-primary)] font-medium leading-relaxed">
                      {issue.message}
                    </p>

                    {issue.remedy && (
                      <div className="p-3.5 rounded-xl bg-sky-500/5 dark:bg-sky-500/10 border border-sky-500/20 text-xs sm:text-sm text-[var(--text-secondary)] flex items-start gap-2.5 leading-relaxed">
                        <Wrench size={15} className="shrink-0 mt-0.5 text-sky-500" />
                        <div>
                          <span className="font-bold text-sky-500 mr-1.5">修复建议:</span>
                          <span className="text-[var(--text-primary)]">{issue.remedy}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              暂无匹配的问题条目
            </div>
          )}
        </div>
      )}
    </div>
  );
};
