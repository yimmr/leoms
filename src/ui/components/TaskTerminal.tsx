import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Play,
  RotateCcw,
  Copy,
  Check,
  Zap,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  WrapText,
  Square,
} from "lucide-react";
import { runTask, abortTask, streamTaskLogs, type TaskLogEntry } from "../api/client.js";
import { parseAnsi } from "../utils/ansi.js";

export interface TaskTarget {
  action: string;
  target?: string;
  options?: Record<string, any>;
  title?: string;
}

export interface TaskTerminalProps {
  task: TaskTarget | null;
  mode: "embedded" | "modal";
  onClose: () => void;
  onSuccess?: () => void;
  onStatusChange?: (status: {
    isRunning: boolean;
    exitCode: number | null;
    durationMs: number | null;
  }) => void;
}

export function formatLeomsCommand(task: TaskTarget): string {
  const parts: string[] = ["leoms"];
  const action = task.action;
  const target = task.target?.trim();
  const opts = task.options || {};
  const eco = opts.ecosystem;

  switch (action) {
    case "add": {
      parts.push("add");
      if (target) parts.push("-p", target);
      if (opts.dev) parts.push("-D");
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");

      const rawPkgs = opts.packages || (opts.package ? [opts.package] : []);
      const pkgs = Array.isArray(rawPkgs) ? rawPkgs : [rawPkgs];
      if (pkgs.length > 0) parts.push(...pkgs);
      break;
    }

    case "remove":
    case "rm": {
      parts.push("remove");
      if (target) parts.push("-p", target);
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");

      const rawPkgs = opts.packages || (opts.package ? [opts.package] : []);
      const pkgs = Array.isArray(rawPkgs) ? rawPkgs : [rawPkgs];
      if (pkgs.length > 0) {
        parts.push(
          ...pkgs.map((p: string) => {
            if (p.startsWith("@")) {
              const slash = p.indexOf("/");
              if (slash !== -1) {
                const at = p.indexOf("@", slash + 1);
                const colon = p.indexOf(":", slash + 1);
                const cut = at !== -1 ? at : colon;
                return cut !== -1 ? p.slice(0, cut) : p;
              }
            }
            const at = p.indexOf("@");
            const colon = p.indexOf(":");
            let cut = -1;
            if (at !== -1 && colon !== -1) cut = Math.min(at, colon);
            else if (at !== -1) cut = at;
            else if (colon !== -1) cut = colon;
            return cut !== -1 ? p.slice(0, cut) : p;
          })
        );
      }
      break;
    }

    case "install":
    case "i": {
      parts.push("install");
      if (target) parts.push("-p", target);
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");
      break;
    }

    case "build": {
      parts.push("build");
      if (target) {
        parts.push(target);
      } else {
        parts.push("--all");
      }
      if (opts.affected) parts.push("--affected");
      if (opts.noDeps) parts.push("--no-deps");
      if (opts.base) parts.push("-b", String(opts.base));
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");
      break;
    }

    case "check": {
      parts.push("check");
      if (target) {
        parts.push(target);
      } else {
        parts.push("--all");
      }
      if (opts.plan) parts.push("--plan");
      if (opts.listRules) parts.push("--list-rules");
      if (opts.only) {
        const rules = Array.isArray(opts.only) ? opts.only : [opts.only];
        parts.push("-i", ...rules);
      }
      if (opts.skip) {
        const rules = Array.isArray(opts.skip) ? opts.skip : [opts.skip];
        parts.push("--skip", ...rules);
      }
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");
      break;
    }

    case "release-dry-run": {
      parts.push("release");
      if (target) parts.push(target);
      parts.push("--dry-run");
      break;
    }

    case "release":
    case "rel": {
      parts.push("release");
      if (target) parts.push(target);
      if (opts.dryRun) parts.push("--dry-run");
      if (opts.patch) parts.push("--patch");
      if (opts.minor) parts.push("--minor");
      if (opts.major) parts.push("--major");
      if (opts.to) parts.push("--to", String(opts.to));
      if (opts.publish) parts.push("--publish");
      if (opts.noPush) parts.push("--no-push");
      if (opts.noTag) parts.push("--no-tag");
      if (opts.noCascade) parts.push("--no-cascade");
      if (opts.force) parts.push("--force");
      if (opts.message) parts.push("-m", String(opts.message));
      if (opts.script) parts.push("-s", String(opts.script));
      break;
    }

    case "plan": {
      parts.push("plan");
      if (target) parts.push(target);
      break;
    }

    case "deploy": {
      parts.push("deploy");
      if (target) parts.push(target);
      if (opts.dryRun) parts.push("--dry-run");
      if (opts.env) parts.push("-e", String(opts.env));
      if (opts.skipCheck) parts.push("--skip-check");
      if (opts.skipBuild) parts.push("--skip-build");
      if (opts.script) parts.push("-s", String(opts.script));
      break;
    }

    case "doctor": {
      parts.push("doctor");
      break;
    }

    case "affected": {
      parts.push("affected");
      if (opts.base) parts.push("-b", String(opts.base));
      if (opts.plain) parts.push("-p");
      if (opts.type) parts.push("-t", String(opts.type));
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");
      break;
    }

    case "status": {
      parts.push("status");
      if (target) parts.push(target);
      if (eco === "npm" || opts.npm) parts.push("--npm");
      else if (eco === "composer" || eco === "php" || opts.php) parts.push("--php");
      break;
    }

    case "publish":
    case "pub": {
      parts.push("publish");
      if (target) parts.push(target);
      if (opts.dryRun) parts.push("-d");
      if (opts.tag) parts.push("--tag", String(opts.tag));
      if (opts.access) parts.push("--access", String(opts.access));
      if (opts.noBuild) parts.push("--no-build");
      if (opts.force) parts.push("-f");
      break;
    }

    default: {
      parts.push(action);
      if (target) parts.push(target);
      break;
    }
  }

  return parts.join(" ");
}

export const TaskTerminal: React.FC<TaskTerminalProps> = ({
  task,
  mode,
  onClose,
  onSuccess,
  onStatusChange,
}) => {
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [exitStatus, setExitStatus] = useState<{ exitCode: number; durationMs: number } | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [cmdCopied, setCmdCopied] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [wrapLines, setWrapLines] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Dynamic initial window size: comfortably wide and tall to fit complex tables and build logs
  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>(() => {
    if (typeof window === "undefined") return { width: 1200, height: 720 };
    const w = Math.min(1320, Math.max(760, Math.floor(window.innerWidth * 0.88)));
    const h = Math.min(840, Math.max(480, Math.floor(window.innerHeight * 0.82)));
    return { width: w, height: h };
  });

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const executedTaskKeyRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<number>(0);

  // Drag resize tracking refs
  const isDraggingRef = useRef<"corner" | "right" | "bottom" | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });

  const getTaskKey = (t: TaskTarget): string => {
    return `${t.action}::${t.target || ""}::${JSON.stringify(t.options || {})}`;
  };

  useEffect(() => {
    if (!task) {
      executedTaskKeyRef.current = null;
      return;
    }
    const currentKey = getTaskKey(task);
    if (executedTaskKeyRef.current === currentKey) {
      return;
    }
    executedTaskKeyRef.current = currentKey;
    startTask(task);

    return () => {
      if (closeStreamRef.current) {
        closeStreamRef.current();
        closeStreamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [task]);

  // Keyboard shortcut: Escape to close modal
  useEffect(() => {
    if (mode !== "modal") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, onClose]);

  const startTask = async (t: TaskTarget) => {
    const runId = ++activeRunIdRef.current;
    setIsRunning(true);
    setExitStatus(null);
    setLogs([]);
    setElapsedMs(0);
    setIsAutoScrollPaused(false);
    startTimeRef.current = Date.now();

    onStatusChange?.({ isRunning: true, exitCode: null, durationMs: null });

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }

    try {
      const res = await runTask(t.action, t.target, t.options);
      if (runId !== activeRunIdRef.current) return;

      const taskId = res.task.id;
      setCurrentTaskId(taskId);

      closeStreamRef.current = streamTaskLogs(
        taskId,
        (log) => {
          if (runId !== activeRunIdRef.current) return;
          setLogs((prev) => [...prev, log]);
        },
        (result) => {
          if (runId !== activeRunIdRef.current) return;
          setIsRunning(false);
          setExitStatus(result);
          onStatusChange?.({
            isRunning: false,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
          });
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (result.exitCode === 0) {
            onSuccess?.();
          }
        }
      );
    } catch (err: any) {
      if (runId !== activeRunIdRef.current) return;
      setIsRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onStatusChange?.({ isRunning: false, exitCode: 1, durationMs: null });
      setLogs((prev) => [
        ...prev,
        {
          type: "error",
          text: `\n任务调度失败: ${err.message}\n`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  // Scroll detection: pause auto-scroll when user manually scrolls up
  const handleScroll = () => {
    const el = terminalScrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAutoScrollPaused(!isNearBottom);
  };

  const handleAbortTask = async () => {
    if (!currentTaskId) return;
    try {
      await abortTask(currentTaskId);
    } catch (err: any) {
      console.error("Failed to abort task:", err);
    }
  };

  useEffect(() => {
    if (!isAutoScrollPaused && !isMinimized) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isMinimized, isAutoScrollPaused]);

  // Drag resize handler
  const handleStartResize = (direction: "corner" | "right" | "bottom", e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    isDraggingRef.current = direction;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: windowSize.width,
      h: windowSize.height,
    };
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      const minW = 600;
      const maxW = window.innerWidth - 24;
      const minH = 340;
      const maxH = window.innerHeight - 24;

      setWindowSize(() => {
        let newW = dragStartRef.current.w;
        let newH = dragStartRef.current.h;

        if (isDraggingRef.current === "corner" || isDraggingRef.current === "right") {
          newW = Math.max(minW, Math.min(maxW, dragStartRef.current.w + dx));
        }
        if (isDraggingRef.current === "corner" || isDraggingRef.current === "bottom") {
          newH = Math.max(minH, Math.min(maxH, dragStartRef.current.h + dy));
        }

        return { width: newW, height: newH };
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = null;
      setIsResizing(false);
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleCopyLogs = () => {
    const rawText = logs.map((l) => l.text).join("");
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!task) return null;

  const displayCommand = formatLeomsCommand(task);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(displayCommand);
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 2000);
  };

  const renderTerminalBody = () => (
    <div
      ref={terminalScrollRef}
      onScroll={handleScroll}
      className={`flex-1 min-h-0 bg-[#080b11] text-[#e2e8f0] font-mono text-xs sm:text-[13px] p-4 sm:p-5 overflow-y-auto overflow-x-auto select-text relative apple-scrollbar ${
        mode === "embedded" ? "max-h-[260px]" : ""
      }`}
    >
      {logs.length === 0 ? (
        <div className="text-gray-500 italic flex items-center gap-2.5 py-4">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0"></div>
          <span>等待进程启动并输出日志...</span>
        </div>
      ) : (
        <div className="space-y-0.5">
          {logs.map((log, i) => {
            const spans = parseAnsi(log.text);
            return (
              <div
                key={i}
                className={`leading-relaxed font-mono ${
                  wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                }`}
              >
                {spans.map((span, sIdx) => {
                  const style: React.CSSProperties = {
                    color: span.color,
                    backgroundColor: span.bgColor,
                    fontWeight: span.bold ? "bold" : "normal",
                    opacity: span.dim ? 0.65 : 1,
                    textDecoration: span.underline ? "underline" : "none",
                  };
                  return (
                    <span key={sIdx} style={style}>
                      {span.text}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <div ref={terminalEndRef} />
    </div>
  );

  const renderHeader = () => (
    <div className="flex flex-col shrink-0">
      {mode === "embedded" && (
        <div className="bg-slate-100/90 dark:bg-[#0b101e] pt-2 pb-0.5 flex justify-center items-center select-none">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600/80" />
        </div>
      )}
      <div
        onDoubleClick={() => mode === "modal" && setIsMaximized(!isMaximized)}
        className={`flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 ${
          mode === "embedded"
            ? "py-2 bg-slate-100/90 dark:bg-[#0b101e] border-b border-slate-200/90 dark:border-slate-800"
            : "py-3.5 bg-white dark:bg-[#0f172a] border-b border-slate-200/80 dark:border-slate-800"
        } shrink-0 select-none cursor-default`}
      >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0 shadow-sm border border-sky-500/20">
          <Terminal size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">
              {task.title || `执行命令`}
            </span>
            {/* Status indicator */}
            {isRunning ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
                <span>运行中 ({(elapsedMs / 1000).toFixed(1)}s)</span>
              </span>
            ) : exitStatus ? (
              exitStatus.exitCode === 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 size={13} />
                  <span>执行成功 ({exitStatus.durationMs}ms)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <XCircle size={13} />
                  <span>异常退出 (code: {exitStatus.exitCode})</span>
                </span>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={handleCopyCommand}
              title="点击复制完整命令"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-sky-400 transition-colors group cursor-pointer max-w-lg truncate"
            >
              <span className="truncate">$ {displayCommand}</span>
              {cmdCopied ? (
                <Check size={12} className="text-emerald-400 shrink-0" />
              ) : (
                <Copy size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Line wrap toggle */}
        <button
          onClick={() => setWrapLines(!wrapLines)}
          title={wrapLines ? "当前: 自动折行 (点击保持原始排版与横向滚动)" : "当前: 保持原始排版 (点击切换自动折行)"}
          className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors border ${
            wrapLines
              ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
              : "bg-black/5 dark:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          }`}
        >
          <WrapText size={14} />
          <span className="hidden sm:inline">{wrapLines ? "已折行" : "保持排版"}</span>
        </button>

        {/* Abort task button */}
        {isRunning && currentTaskId && (
          <button
            onClick={handleAbortTask}
            title="终止当前运行中的任务 (SIGTERM)"
            className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-colors text-xs flex items-center gap-1.5 animate-pulse cursor-pointer"
          >
            <Square size={13} className="fill-rose-400" />
            <span className="hidden sm:inline">终止任务</span>
          </button>
        )}

        {/* Retry button */}
        {!isRunning && (
          <button
            onClick={() => {
              executedTaskKeyRef.current = null;
              startTask(task);
            }}
            title="重新执行命令"
            className="px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs flex items-center gap-1.5 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">重试</span>
          </button>
        )}

        {/* Copy logs */}
        <button
          onClick={handleCopyLogs}
          title="复制全部输出日志"
          className="px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs flex items-center gap-1.5 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          <span className="hidden sm:inline">{copied ? "已复制" : "复制日志"}</span>
        </button>

        {mode === "modal" && (
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "还原窗口大小" : "最大化窗口 (也可双击标题栏)"}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}

        {mode === "embedded" && (
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "展开控制台" : "收起控制台"}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          title="关闭命令面板 (Esc)"
          className="p-1.5 rounded-lg hover:bg-rose-500/15 hover:text-rose-400 text-[var(--text-muted)] transition-colors ml-1"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  </div>
);

  if (mode === "modal") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 apple-modal-backdrop">
        {/* Backdrop click to dismiss */}
        <div onClick={onClose} className="absolute inset-0 cursor-pointer" aria-label="关闭窗口" />

        {/* Modal Window Container with Dynamic Free Resize Support */}
        <div
          style={
            isMaximized
              ? {
                  width: "calc(100vw - 24px)",
                  height: "calc(100vh - 24px)",
                  maxWidth: "none",
                  maxHeight: "none",
                }
              : {
                  width: `${windowSize.width}px`,
                  height: `${windowSize.height}px`,
                  maxWidth: "calc(100vw - 24px)",
                  maxHeight: "calc(100vh - 24px)",
                }
          }
          className={`apple-modal-window relative z-10 flex flex-col shadow-2xl rounded-2xl overflow-hidden bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 ${
            isResizing ? "select-none" : "transition-[width,height] duration-150"
          }`}
        >
          {renderHeader()}
          {renderTerminalBody()}

          {/* Interactive Free Resize Handles (Right Edge, Bottom Edge, Corner) */}
          {!isMaximized && (
            <>
              <div
                onMouseDown={(e) => handleStartResize("right", e)}
                className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-sky-500/20 active:bg-sky-500/30 transition-colors z-20"
                title="拖动调整宽度"
              />
              <div
                onMouseDown={(e) => handleStartResize("bottom", e)}
                className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize hover:bg-sky-500/20 active:bg-sky-500/30 transition-colors z-20"
                title="拖动调整高度"
              />
              <div
                onMouseDown={(e) => handleStartResize("corner", e)}
                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1.5 z-30 group"
                title="拖动自由调整窗口大小"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 group-hover:text-sky-400 transition-colors pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="19" y1="5" x2="5" y2="19" />
                  <line x1="19" y1="11" x2="11" y2="19" />
                  <line x1="19" y1="17" x2="17" y2="19" />
                </svg>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Embedded mode (e.g. pinned to bottom of Project Detail modal)
  return (
    <div className="flex flex-col shrink-0 overflow-hidden">
      {renderHeader()}
      {!isMinimized && renderTerminalBody()}
    </div>
  );
};
