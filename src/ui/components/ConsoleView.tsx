import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Terminal,
  Play,
  RotateCcw,
  Copy,
  Check,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  Folder,
  FolderOpen,
  FolderTree,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
  Hammer,
  ShieldCheck,
  PackageCheck,
  GitBranch,
  Stethoscope,
  Package,
  Layers,
  Square,
} from "lucide-react";
import {
  runTask,
  abortTask,
  streamTaskLogs,
  type TaskLogEntry,
  type ProjectModel,
  type WorkspaceStatusResponse,
} from "../api/client.js";

interface TextSpan {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: "#1e293b",
  31: "#f43f5e", // red
  32: "#10b981", // green
  33: "#f59e0b", // yellow
  34: "#38bdf8", // blue
  35: "#c084fc", // magenta
  36: "#2dd4bf", // cyan
  37: "#f8fafc", // white
  90: "#94a3b8", // gray / dim
  91: "#fb7185",
  92: "#34d399",
  93: "#fcd34d",
  94: "#60a5fa",
  95: "#e879f9",
  96: "#67e8f9",
  97: "#ffffff",
};

const ANSI_BG_MAP: Record<number, string> = {
  40: "#0f172a",
  41: "#881337",
  42: "#064e3b",
  43: "#78350f",
  44: "#0c4a6e",
  45: "#581c87",
  46: "#134e4a",
  47: "#e2e8f0",
  100: "#334155",
  101: "#9f1239",
  102: "#065f46",
  103: "#854d0e",
  104: "#075985",
  105: "#6b21a8",
  106: "#115e59",
  107: "#f1f5f9",
};

function parseAnsi(input: string): TextSpan[] {
  const cleaned = input.replace(/\x1b\[[?0-9;]*[a-zA-HJKSTfinu]/g, (match) => {
    if (match.endsWith("m")) return match;
    return "";
  });

  const regex = /\x1b\[([0-9;]*)m/g;
  const result: TextSpan[] = [];
  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let currentBgColor: string | undefined = undefined;
  let currentBold = false;
  let currentDim = false;
  let currentUnderline = false;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      const text = cleaned.substring(lastIndex, match.index);
      if (text) {
        result.push({
          text,
          color: currentColor,
          bgColor: currentBgColor,
          bold: currentBold,
          dim: currentDim,
          underline: currentUnderline,
        });
      }
    }
    lastIndex = regex.lastIndex;

    const codeStr = match[1];
    if (!codeStr || codeStr === "" || codeStr === "0") {
      currentColor = undefined;
      currentBgColor = undefined;
      currentBold = false;
      currentDim = false;
      currentUnderline = false;
    } else {
      const codes = codeStr.split(";").map(Number);
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
          currentColor = undefined;
          currentBgColor = undefined;
          currentBold = false;
          currentDim = false;
          currentUnderline = false;
        } else if (code === 1) {
          currentBold = true;
        } else if (code === 2) {
          currentDim = true;
        } else if (code === 4) {
          currentUnderline = true;
        } else if (code === 22) {
          currentBold = false;
          currentDim = false;
        } else if (code === 24) {
          currentUnderline = false;
        } else if (code === 39) {
          currentColor = undefined;
        } else if (code === 49) {
          currentBgColor = undefined;
        } else if (ANSI_COLOR_MAP[code]) {
          currentColor = ANSI_COLOR_MAP[code];
        } else if (ANSI_BG_MAP[code]) {
          currentBgColor = ANSI_BG_MAP[code];
        } else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          i += 2;
        } else if (code === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
          currentColor = `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`;
          i += 4;
        }
      }
    }
  }

  if (lastIndex < cleaned.length) {
    const text = cleaned.substring(lastIndex);
    if (text) {
      result.push({
        text,
        color: currentColor,
        bgColor: currentBgColor,
        bold: currentBold,
        dim: currentDim,
        underline: currentUnderline,
      });
    }
  }

  return result;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
}

const defaultCategoryNames: Record<string, string> = {
  apps: "应用",
  packages: "公共包",
  libs: "私有库",
};

const getCategoryBadgeClass = (category: string): string => {
  switch (category) {
    case "apps":
      return "bg-sky-500/15 text-sky-500 dark:text-sky-400 border-sky-500/25";
    case "packages":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
    case "libs":
      return "bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border-indigo-500/25";
    default:
      return "bg-purple-500/15 text-purple-500 dark:text-purple-400 border-purple-500/25";
  }
};

export interface DirectoryTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  projectCount: number;
  project?: ProjectModel;
  children: DirectoryTreeNode[];
  level: number;
  category?: string;
}

export function buildDirectoryTree(projects: ProjectModel[]): DirectoryTreeNode {
  const root: DirectoryTreeNode = {
    id: "root",
    name: "工作区根目录",
    path: "",
    isFolder: true,
    projectCount: projects.length,
    children: [],
    level: 0,
  };

  const nodeMap = new Map<string, DirectoryTreeNode>();
  nodeMap.set("", root);

  const getOrCreateNode = (fullPath: string, level: number, segName: string): DirectoryTreeNode => {
    if (nodeMap.has(fullPath)) {
      return nodeMap.get(fullPath)!;
    }

    const parentPath = fullPath.includes("/")
      ? fullPath.slice(0, fullPath.lastIndexOf("/"))
      : "";
    const parentNode = nodeMap.has(parentPath)
      ? nodeMap.get(parentPath)!
      : getOrCreateNode(parentPath, level - 1, parentPath.split("/").pop() || "");

    const newNode: DirectoryTreeNode = {
      id: fullPath,
      name: segName,
      path: fullPath,
      isFolder: true,
      projectCount: 0,
      children: [],
      level,
    };

    parentNode.children.push(newNode);
    nodeMap.set(fullPath, newNode);
    return newNode;
  };

  for (const p of projects) {
    const rel = (p.relativeDir || "").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!rel) {
      root.project = p;
      continue;
    }

    const segments = rel.split("/");
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      const node = getOrCreateNode(currentPath, i + 1, seg);
      node.projectCount += 1;
      if (i === 0) {
        node.category = p.category;
      }
      if (i === segments.length - 1) {
        node.project = p;
      }
    }
  }

  const sortNodes = (node: DirectoryTreeNode) => {
    node.children.sort((a, b) => {
      const aHasChildren = a.children.length > 0;
      const bHasChildren = b.children.length > 0;
      if (aHasChildren && !bHasChildren) return -1;
      if (!aHasChildren && bHasChildren) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNodes);
  };
  sortNodes(root);

  return root;
}

export function filterDirectoryTree(
  node: DirectoryTreeNode,
  query: string
): DirectoryTreeNode | null {
  const q = query.toLowerCase().trim();
  if (!q) return node;

  const matchesSelf =
    node.name.toLowerCase().includes(q) ||
    node.path.toLowerCase().includes(q) ||
    Boolean(node.project?.name.toLowerCase().includes(q)) ||
    Boolean(node.category && node.category.toLowerCase().includes(q));

  const filteredChildren: DirectoryTreeNode[] = [];
  for (const child of node.children) {
    const res = filterDirectoryTree(child, q);
    if (res) filteredChildren.push(res);
  }

  if (matchesSelf || filteredChildren.length > 0) {
    return {
      ...node,
      children: filteredChildren,
    };
  }

  return null;
}

interface ConsoleViewProps {
  projects: ProjectModel[];
  status?: WorkspaceStatusResponse | null;
  presetAction?: string;
  presetTarget?: string;
}

export const ConsoleView: React.FC<ConsoleViewProps> = ({
  projects,
  status,
  presetAction,
  presetTarget,
}) => {
  // Working Directory states:
  // currentCwd is where commands currently execute in the terminal
  const [currentCwd, setCurrentCwd] = useState<string>("");
  // stagedDir is what's selected in the Project Directory dropdown before clicking "前往"
  const [stagedDir, setStagedDir] = useState<string>("");
  const [isDirDropdownOpen, setIsDirDropdownOpen] = useState<boolean>(false);

  // Interactive Command Input states
  const [commandInput, setCommandInput] = useState<string>("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Terminal runtime & streaming logs states
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [exitStatus, setExitStatus] = useState<{ exitCode: number; durationMs: number } | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Find currently active project model based on currentCwd
  const currentProject = useMemo(() => {
    if (!currentCwd) return null;
    return (
      projects.find(
        (p) =>
          p.relativeDir === currentCwd ||
          p.relativeDir === currentCwd.replace(/^\.\//, "") ||
          p.name === currentCwd
      ) || null
    );
  }, [currentCwd, projects]);

  // Find staged project model based on stagedDir
  const stagedProject = useMemo(() => {
    if (!stagedDir) return null;
    return projects.find((p) => p.relativeDir === stagedDir || p.name === stagedDir) || null;
  }, [stagedDir, projects]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDirDropdownOpen(false);
      }
    };
    if (isDirDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDirDropdownOpen]);

  // Handle preset action/target if passed from outside
  useEffect(() => {
    if (presetTarget) {
      const match = projects.find((p) => p.name === presetTarget);
      if (match) {
        setStagedDir(match.relativeDir);
        setCurrentCwd(match.relativeDir);
      }
    }
  }, [presetTarget, projects]);

  // Scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (closeStreamRef.current) {
        closeStreamRef.current();
      }
    };
  }, []);

  // Category labels helper (aligned with DashboardView)
  const getCategoryLabel = (category: string): string => {
    if (status?.categoryNames?.[category]) {
      return status.categoryNames[category];
    }
    if (defaultCategoryNames[category]) {
      return defaultCategoryNames[category];
    }
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  // Multi-level Directory Tree Interface & Builder
  const directoryTree = useMemo(() => {
    return buildDirectoryTree(projects);
  }, [projects]);

  // Expanded directory paths in tree - default multi-level collapsed
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Navigate / Go to directory action
  const handleGoToDirectory = (dirToNavigate?: string) => {
    const targetDir = dirToNavigate !== undefined ? dirToNavigate : stagedDir;
    setCurrentCwd(targetDir);
    setIsDirDropdownOpen(false);

    const displayName = targetDir ? `~/org/${targetDir}` : "~/org (工作区根目录)";
    setLogs((prev) => [
      ...prev,
      {
        type: "system",
        text: `\x1b[36m$ cd ${targetDir || "~"}\x1b[0m\n📁 终端工作目录切换至: \x1b[1;32m${displayName}\x1b[0m\n\n`,
        timestamp: Date.now(),
      },
    ]);

    setTimeout(() => {
      commandInputRef.current?.focus();
    }, 100);
  };

  // Direct shell / task execution handler (authentic terminal execution)
  const handleExecuteCommand = async (cmdToRun: string, cwdToUse?: string) => {
    const trimmed = cmdToRun.trim();
    const activeCwd = cwdToUse !== undefined ? cwdToUse : currentCwd;
    const promptHeader = `\x1b[1;32mleoms@workspace\x1b[0m:\x1b[1;34m~/org${activeCwd ? `/${activeCwd}` : ""}\x1b[0m$ ${trimmed}\n`;

    if (!trimmed) {
      setLogs((prev) => [
        ...prev,
        {
          type: "stdout",
          text: `\x1b[1;32mleoms@workspace\x1b[0m:\x1b[1;34m~/org${activeCwd ? `/${activeCwd}` : ""}\x1b[0m$ \n`,
          timestamp: Date.now(),
        },
      ]);
      setCommandInput("");
      return;
    }

    // Handle 'clear' command locally
    if (trimmed === "clear" || trimmed === "cls") {
      setLogs([]);
      setExitStatus(null);
      setCommandInput("");
      return;
    }

    // Handle 'cd' command locally
    if (trimmed.startsWith("cd ") || trimmed === "cd") {
      const targetPath = trimmed.slice(3).trim();
      let newCwd = "";
      if (!targetPath || targetPath === "~" || targetPath === "/" || targetPath === ".") {
        newCwd = "";
      } else if (targetPath === "..") {
        if (activeCwd.includes("/")) {
          newCwd = activeCwd.split("/").slice(0, -1).join("/");
        } else {
          newCwd = "";
        }
      } else {
        const matched = projects.find(
          (p) =>
            p.relativeDir.toLowerCase() === targetPath.toLowerCase() ||
            p.name.toLowerCase() === targetPath.toLowerCase() ||
            p.relativeDir.endsWith("/" + targetPath)
        );
        if (matched) {
          newCwd = matched.relativeDir;
        } else {
          newCwd = activeCwd ? `${activeCwd}/${targetPath}`.replace(/\/+/g, "/") : targetPath;
        }
      }

      setCurrentCwd(newCwd);
      setStagedDir(newCwd);
      setCommandHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 50));
      setHistoryIndex(-1);
      setCommandInput("");

      setLogs((prev) => [
        ...prev,
        {
          type: "stdout",
          text: `${promptHeader}📁 终端工作目录已切换至: \x1b[1;32m~/org${newCwd ? `/${newCwd}` : ""}\x1b[0m\n`,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // Add to history
    setCommandHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 50));
    setHistoryIndex(-1);
    setCommandInput("");

    // Append command prompt line to terminal screen
    setLogs((prev) => [
      ...prev,
      {
        type: "stdout",
        text: promptHeader,
        timestamp: Date.now(),
      },
    ]);

    setIsRunning(true);
    setExitStatus(null);

    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }

    try {
      const res = await runTask("raw", undefined, {
        command: trimmed,
        cwd: activeCwd,
      });
      const taskId = res.task.id;
      setCurrentTaskId(taskId);

      closeStreamRef.current = streamTaskLogs(
        taskId,
        (log) => {
          setLogs((prev) => [...prev, log]);
        },
        (result) => {
          setIsRunning(false);
          setExitStatus(result);
          setTimeout(() => {
            commandInputRef.current?.focus();
          }, 50);
        }
      );
    } catch (err: any) {
      setIsRunning(false);
      setLogs((prev) => [
        ...prev,
        {
          type: "error",
          text: `\x1b[31m命令执行失败: ${err.message}\x1b[0m\n`,
          timestamp: Date.now(),
        },
      ]);
      setTimeout(() => {
        commandInputRef.current?.focus();
      }, 50);
    }
  };

  const handleAbortTask = async () => {
    if (!isRunning) return;
    if (currentTaskId) {
      try {
        await abortTask(currentTaskId);
      } catch (err: any) {
        console.error("Failed to abort task:", err);
      }
    }
    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }
    setIsRunning(false);
    setLogs((prev) => [
      ...prev,
      {
        type: "stderr",
        text: `\x1b[31m^C (任务已被主动终止)\x1b[0m\n`,
        timestamp: Date.now(),
      },
    ]);
    setTimeout(() => {
      commandInputRef.current?.focus();
    }, 50);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isRunning) return;
      handleExecuteCommand(commandInput);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex + 1 < commandHistory.length ? historyIndex + 1 : historyIndex;
      setHistoryIndex(nextIdx);
      setCommandInput(commandHistory[nextIdx] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommandInput(commandHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput("");
      }
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      if (isRunning) {
        handleAbortTask();
      } else {
        setLogs((prev) => [
          ...prev,
          {
            type: "stdout",
            text: `\x1b[1;32mleoms@workspace\x1b[0m:\x1b[1;34m~/org${currentCwd ? `/${currentCwd}` : ""}\x1b[0m$ ${commandInput}^C\n`,
            timestamp: Date.now(),
          },
        ]);
        setCommandInput("");
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLogs([]);
      setExitStatus(null);
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => stripAnsi(l.text)).join("");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compute commands for basic operations based on active working directory
  const basicActions = useMemo(() => {
    // 1. Build
    let buildCmd = "leoms build --all";
    let buildDesc = "DAG 全量构建";
    if (currentCwd) {
      if (currentProject) {
        buildCmd = `leoms build ${currentProject.name}`;
        buildDesc = `构建 ${currentProject.name}`;
      } else {
        buildCmd = "pnpm run build";
        buildDesc = "在当前目录执行构建";
      }
    }

    // 2. Check
    let checkCmd = "leoms check --all";
    let checkDesc = "全量质量门禁";
    if (currentCwd) {
      if (currentProject) {
        checkCmd = `leoms check ${currentProject.name}`;
        checkDesc = `门禁体检 ${currentProject.name}`;
      } else {
        checkCmd = "leoms check .";
        checkDesc = "当前目录门禁体检";
      }
    }

    // 3. Install
    let installCmd = "leoms install";
    let installDesc = "多生态统一智能安装";
    if (currentCwd) {
      if (currentProject?.packageManager === "composer") {
        installCmd = "composer install";
        installDesc = "Composer 隔离安装";
      } else if (currentProject?.packageManager === "hybrid") {
        installCmd = `leoms install -p ${currentProject.name}`;
        installDesc = "双生态融合安装";
      } else {
        installCmd = "pnpm install";
        installDesc = "Pnpm 依赖安装";
      }
    }

    // 4. Test
    let testCmd = "pnpm test";
    let testDesc = "运行全工作区测试";
    if (currentCwd) {
      if (currentProject?.packageManager === "composer") {
        testCmd = "composer test";
        testDesc = "运行 PHP 单元测试";
      } else {
        testCmd = "pnpm test";
        testDesc = "运行项目测试";
      }
    }

    // 5. Git Status
    const gitCmd = "git status -s";
    const gitDesc = currentCwd ? "检查当前目录改动" : "检查全局改动";

    // 6. Doctor
    const doctorCmd = "leoms doctor";
    const doctorDesc = "环境健康体检";

    return [
      {
        id: "build",
        label: "构建",
        cmd: buildCmd,
        desc: buildDesc,
        icon: Hammer,
        colorClass: "text-sky-400 hover:text-sky-300",
      },
      {
        id: "check",
        label: "门禁体检",
        cmd: checkCmd,
        desc: checkDesc,
        icon: ShieldCheck,
        colorClass: "text-emerald-400 hover:text-emerald-300",
      },
      {
        id: "install",
        label: "安装依赖",
        cmd: installCmd,
        desc: installDesc,
        icon: PackageCheck,
        colorClass: "text-indigo-400 hover:text-indigo-300",
      },
      {
        id: "test",
        label: "运行测试",
        cmd: testCmd,
        desc: testDesc,
        icon: Activity,
        colorClass: "text-amber-400 hover:text-amber-300",
      },
      {
        id: "git",
        label: "Git 状态",
        cmd: gitCmd,
        desc: gitDesc,
        icon: GitBranch,
        colorClass: "text-purple-400 hover:text-purple-300",
      },
      {
        id: "doctor",
        label: "环境体检",
        cmd: doctorCmd,
        desc: doctorDesc,
        icon: Stethoscope,
        colorClass: "text-rose-400 hover:text-rose-300",
      },
    ];
  }, [currentCwd, currentProject]);

  const renderTreeNode = (node: DirectoryTreeNode): React.ReactNode => {
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = stagedDir === node.path;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id || node.path || "root"} className="select-none">
        <div
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node.path);
              setStagedDir(node.path);
            } else {
              setStagedDir(node.path);
              setIsDirDropdownOpen(false);
            }
          }}
          onDoubleClick={() => handleGoToDirectory(node.path)}
          style={{ paddingLeft: `${node.level * 14 + 6}px` }}
          className={`flex items-center gap-2 py-1.5 pr-2 rounded-lg cursor-pointer text-xs font-mono transition-all group ${
            isSelected
              ? "bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold border border-sky-500/30"
              : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent"
          }`}
          title={`${node.path} ${node.project ? `(${node.project.name})` : ""} · 双击直接前往`}
        >
          {/* Expand/Collapse Chevron Button */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.path);
              }}
              className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded shrink-0 cursor-pointer"
            >
              {isExpanded ? (
                <ChevronDown size={13} className="text-slate-600 dark:text-slate-300" />
              ) : (
                <ChevronRight size={13} className="text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Node Icon */}
          <span className="shrink-0 flex items-center">
            {node.path === "" ? (
              <FolderTree size={15} className="text-sky-500 dark:text-sky-400" />
            ) : hasChildren ? (
              isExpanded ? (
                <FolderOpen size={15} className="text-amber-500 dark:text-amber-400" />
              ) : (
                <Folder size={15} className="text-amber-500/80 dark:text-amber-400/80" />
              )
            ) : (
              <Package size={14} className="text-indigo-500 dark:text-indigo-400" />
            )}
          </span>

          {/* Name & Relative details */}
          <span className="truncate flex-1 min-w-0 font-medium">
            {node.name}
            {node.project && node.project.name !== node.name && (
              <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                ({node.project.name})
              </span>
            )}
          </span>

          {/* Badges / Metadata */}
          <div className="flex items-center gap-1.5 shrink-0">
            {node.category && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${getCategoryBadgeClass(
                  node.category
                )}`}
              >
                {getCategoryLabel(node.category)}
              </span>
            )}
            {node.project?.packageManager && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                {node.project.packageManager}
              </span>
            )}
            {hasChildren && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/5 text-slate-400">
                {node.projectCount}
              </span>
            )}
            {isSelected && <Check size={14} className="text-sky-400" />}
          </div>
        </div>

        {/* Render child nodes if expanded */}
        {hasChildren && isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Terminal Top Control Bar */}
      <div className="apple-glass p-4 sm:p-5 rounded-2xl space-y-4 border border-[var(--border-glass)] relative z-30">
        {/* Top Header Row (当前目录已移除) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center border border-sky-500/25 shrink-0 shadow-sm">
              <Terminal size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  终端 (Terminal)
                </h3>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  原生交互式终端
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                原生终端命令行环境，支持任意命令输入回车执行，支持按树状多级目录选择并前往
              </p>
            </div>
          </div>
        </div>

        {/* Directory Picker & Basic Operations Row */}
        <div className="pt-3 border-t border-[var(--border-glass)] grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          {/* Project Directory Picker (Left 6-7 cols) */}
          <div className="lg:col-span-6 space-y-1.5" ref={dropdownRef}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                项目目录
              </span>
              {stagedDir !== currentCwd && (
                <span className="text-[11px] text-amber-400 font-normal">
                  已选择未前往 (点击右侧前往切换)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Dropdown Selector Container */}
              <div className="relative flex-1">
                {/* Dropdown Trigger */}
                <button
                  type="button"
                  onClick={() => setIsDirDropdownOpen((prev) => !prev)}
                  className={`apple-glass-input w-full h-[38px] px-3 flex items-center justify-between text-left text-xs sm:text-sm cursor-pointer hover:border-sky-400/50 transition-colors ${
                    isDirDropdownOpen ? "border-sky-400 ring-2 ring-sky-400/20" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {stagedDir === "" ? (
                      <FolderTree size={16} className="text-sky-400 shrink-0" />
                    ) : (
                      <Folder size={16} className="text-amber-400 shrink-0" />
                    )}
                    <span className="truncate font-mono">
                      {stagedDir === ""
                        ? "工作区根目录 (Workspace Root) · ~/org"
                        : stagedProject
                        ? `${stagedProject.name} (${stagedProject.relativeDir})`
                        : `~/org/${stagedDir}`}
                    </span>
                  </div>
                  <ChevronDown
                    size={15}
                    className={`text-slate-400 transition-transform duration-200 shrink-0 ${
                      isDirDropdownOpen ? "rotate-180 text-sky-400" : ""
                    }`}
                  />
                </button>

                {/* Floating Multi-Level Directory Dropdown Menu (100% Solid & Fully Scroll-Isolated) */}
                {isDirDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      zIndex: 9999,
                      maxHeight: "320px",
                      overflowY: "auto",
                      overflowX: "hidden",
                      overscrollBehavior: "contain",
                    }}
                    onWheel={(e) => {
                      e.stopPropagation();
                      const el = e.currentTarget;
                      const isAtTop = el.scrollTop <= 0;
                      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                      if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
                        e.preventDefault();
                      }
                    }}
                    className="project-dir-dropdown-menu space-y-0.5"
                  >
                    {/* Root Option */}
                    <div
                      onClick={() => {
                        setStagedDir("");
                        setIsDirDropdownOpen(false);
                      }}
                      onDoubleClick={() => handleGoToDirectory("")}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer text-xs font-mono transition-all select-none ${
                        stagedDir === ""
                          ? "bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold border border-sky-500/30"
                          : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent"
                      }`}
                      title="工作区根目录 (~/org) · 双击直接前往"
                    >
                      <FolderTree size={15} className="text-sky-500 dark:text-sky-400 shrink-0" />
                      <span className="truncate flex-1 font-medium">工作区根目录 (~/org)</span>
                      {stagedDir === "" && (
                        <Check size={14} className="text-sky-500 dark:text-sky-400 shrink-0 ml-auto" />
                      )}
                    </div>

                    <div className="my-1 border-t border-slate-200 dark:border-slate-700/60" />

                    {/* Category / Folder Trees */}
                    {directoryTree.children.map((child) => renderTreeNode(child))}
                  </div>
                )}
              </div>

              {/* 前往 (Go) Button Unified on Right */}
              <button
                type="button"
                onClick={() => handleGoToDirectory()}
                disabled={isRunning}
                className="apple-glass-button primary h-[38px] px-4 text-xs sm:text-sm font-semibold shrink-0 gap-1.5 shadow-sm cursor-pointer"
                title="切换终端工作目录至选中的项目目录"
              >
                <CornerDownRight size={15} />
                <span>前往</span>
              </button>
            </div>
          </div>

          {/* Basic Operations (Right 6 cols) */}
          <div className="lg:col-span-6 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                快捷操作 (基于当前工作目录)
              </span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                目标: {currentCwd ? currentCwd : "工作区根目录"}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {basicActions.map((action) => {
                const IconComponent = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleExecuteCommand(action.cmd)}
                    disabled={isRunning}
                    title={`${action.desc}\n执行命令: ${action.cmd}`}
                    className="apple-glass-button flex-col items-center justify-center p-2 text-center text-xs group cursor-pointer transition-all hover:-translate-y-0.5"
                  >
                    <IconComponent
                      size={15}
                      className={`${action.colorClass} group-hover:scale-110 transition-transform`}
                    />
                    <span className="mt-1 font-medium text-[var(--text-primary)] text-[11px] truncate w-full">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Terminal Window */}
      <div className="glass-terminal flex flex-col min-h-[520px] rounded-2xl border border-[var(--border-glass)] shadow-[var(--shadow-floating)] overflow-hidden">
        {/* Terminal macOS Titlebar */}
        <div className="px-4 sm:px-5 py-2.5 bg-black/40 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* macOS window dots */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>

            {/* Prompt info */}
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300 min-w-0 truncate">
              <span className="text-emerald-400 font-bold">leoms@workspace</span>
              <span className="text-slate-500">:</span>
              <span className="text-sky-300 font-semibold truncate">
                ~/org{currentCwd ? `/${currentCwd}` : ""}
              </span>
              {currentProject && (
                <span className="text-amber-300 text-[11px]">
                  [{currentProject.name}]
                </span>
              )}
              {currentTaskId && (
                <span className="text-slate-500 hidden sm:inline">• {currentTaskId}</span>
              )}
            </div>
          </div>

          {/* Status badge & Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning && (
              <span className="status-pill cyan text-xs py-0.5 px-2.5">
                <span className="pulse-dot"></span>
                执行中
              </span>
            )}

            {exitStatus && (
              <span
                className={`status-pill ${
                  exitStatus.exitCode === 0 ? "emerald" : "rose"
                } text-xs py-0.5 px-2.5`}
              >
                {exitStatus.exitCode === 0 ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <XCircle size={13} />
                )}
                退出码 {exitStatus.exitCode} ({exitStatus.durationMs}ms)
              </span>
            )}

            <button
              onClick={() => setAutoScroll((s) => !s)}
              className={`text-xs px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                autoScroll ? "text-sky-400 bg-sky-500/15" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              自动滚屏
            </button>

            <button
              onClick={handleCopyLogs}
              className="text-slate-400 hover:text-white p-1.5 rounded cursor-pointer transition-colors"
              title="复制全部终端日志"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>

            <button
              onClick={() => {
                setLogs([]);
                setExitStatus(null);
              }}
              className="text-slate-400 hover:text-white p-1.5 rounded cursor-pointer transition-colors"
              title="清空终端屏幕 (clear)"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Terminal Screen Body with embedded authentic prompt line */}
        <div
          onClick={() => commandInputRef.current?.focus()}
          className="p-4 sm:p-5 text-xs sm:text-sm overflow-auto flex-1 min-h-[460px] max-h-[640px] select-text cursor-text space-y-1"
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            letterSpacing: 0,
            tabSize: 2,
          }}
        >
          {/* Welcome banner on clean screen */}
          {logs.length === 0 && !isRunning && (
            <div className="text-slate-400 pb-3 select-none space-y-1 font-mono">
              <div className="text-emerald-400 font-bold">leoms 交互式工作台终端已就绪 (x86_64-linux-gnu)</div>
              <div className="text-slate-500">
                当前工作区: ~/org · 直接在下方提示符输入命令后按 <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300">Enter</kbd> 执行
              </div>
              <div className="text-slate-600">
                支持 cd, clear, ls, git, pnpm, composer, leoms 等全量命令 · 按 <kbd className="px-1 py-0.2 rounded bg-white/5 text-slate-400">Ctrl+C</kbd> 中止执行
              </div>
            </div>
          )}

          {/* Streamed Output Logs */}
          {logs.map((log, logIdx) => {
            const spans = parseAnsi(log.text);

            let fallbackColor = "#cbd5e1";
            if (log.type === "stderr") fallbackColor = "#fb7185";
            if (log.type === "system") fallbackColor = "#38bdf8";
            if (log.type === "done") fallbackColor = "#34d399";
            if (log.type === "error") fallbackColor = "#f43f5e";

            return (
              <span key={logIdx}>
                {spans.map((span, spanIdx) => (
                  <span
                    key={spanIdx}
                    style={{
                      color: span.color || fallbackColor,
                      backgroundColor: span.bgColor,
                      fontWeight:
                        span.bold || log.type === "done" || log.type === "system"
                          ? 700
                          : undefined,
                      opacity: span.dim ? 0.7 : undefined,
                      textDecoration: span.underline ? "underline" : undefined,
                    }}
                  >
                    {span.text}
                  </span>
                ))}
              </span>
            );
          })}

          {/* Authentic Real Terminal Prompt Line directly inside screen buffer */}
          <div className="flex items-center gap-2 pt-1 font-mono text-xs sm:text-sm text-slate-100 min-h-[26px]">
            <span className="text-emerald-400 font-bold shrink-0 select-none">
              leoms@workspace
            </span>
            <span className="text-slate-500 select-none">:</span>
            <span
              className="text-sky-400 font-semibold shrink-0 select-none truncate max-w-[200px] sm:max-w-[340px]"
              title={currentCwd ? `~/org/${currentCwd}` : "~/org"}
            >
              ~/org{currentCwd ? `/${currentCwd}` : ""}
            </span>
            <span className="text-slate-300 font-bold shrink-0 select-none">$</span>

            {isRunning ? (
              <div className="flex items-center gap-3 text-slate-400 text-xs font-mono select-none">
                <span className="text-sky-400 animate-pulse font-bold">●</span>
                <span>命令运行中...</span>
                <button
                  type="button"
                  onClick={handleAbortTask}
                  className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 cursor-pointer transition-colors text-[11px] font-sans font-semibold flex items-center gap-1 shrink-0"
                  title="终止当前命令 (SIGTERM)"
                >
                  <Square size={11} className="fill-rose-300" />
                  <span>停止 (Ctrl+C)</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center min-w-0 relative">
                <input
                  ref={commandInputRef}
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={isRunning}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  className="w-full bg-transparent text-slate-100 font-mono text-xs sm:text-sm outline-none border-none p-0 m-0 shadow-none ring-0 focus:ring-0 caret-sky-400"
                  placeholder=""
                />
              </div>
            )}
          </div>

          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};
