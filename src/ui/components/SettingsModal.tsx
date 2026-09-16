import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  X,
  Radio,
  FolderGit2,
  Zap,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Sun,
  Moon,
  Save,
  Globe,
  Loader2,
} from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext.js";
import {
  type DesktopSettings,
  saveDesktopSettings,
  restartBackendDaemon,
} from "../utils/desktop.js";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: DesktopSettings;
  onSaved: (settings: DesktopSettings) => void;
  isBackendAlive?: boolean;
}

type SettingsTab = "companion" | "workspace" | "general";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSaved,
  isBackendAlive = false,
}) => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("companion");

  const [workspacePath, setWorkspacePath] = useState<string>(
    currentSettings.workspace_path || ""
  );
  const [port, setPort] = useState<number>(currentSettings.port || 3200);
  const [autoStart, setAutoStart] = useState<boolean>(
    currentSettings.auto_start !== undefined ? currentSettings.auto_start : true
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [restarting, setRestarting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setWorkspacePath(currentSettings.workspace_path || "");
      setPort(currentSettings.port || 3200);
      setAutoStart(currentSettings.auto_start !== undefined ? currentSettings.auto_start : true);
      setFeedbackMsg(null);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setFeedbackMsg(null);
    try {
      const portNum = Number(port) || 3200;
      if (portNum < 1024 || portNum > 65535) {
        throw new Error("端口号范围必须在 1024 ~ 65535 之间");
      }
      const newSettings: DesktopSettings = {
        ...currentSettings,
        workspace_path: workspacePath.trim() || undefined,
        port: portNum,
        auto_start: autoStart,
        initialized: true,
      };
      const saved = await saveDesktopSettings(newSettings);
      setFeedbackMsg({ type: "success", text: "设置已保存至 ~/.config/leoms/desktop.json" });
      setTimeout(() => {
        onSaved(saved);
        onClose();
      }, 500);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleRestartBackend = async () => {
    setRestarting(true);
    setFeedbackMsg(null);
    try {
      // 先保存最新配置
      await saveDesktopSettings({
        ...currentSettings,
        workspace_path: workspacePath.trim() || undefined,
        port: Number(port) || 3200,
        auto_start: autoStart,
        initialized: true,
      });

      // 调用后端重启
      await restartBackendDaemon();
      setFeedbackMsg({ type: "success", text: "伴生服务已重启，正在重新连接..." });
      setTimeout(() => {
        onSaved({
          ...currentSettings,
          workspace_path: workspacePath.trim() || undefined,
          port: Number(port) || 3200,
          auto_start: autoStart,
          initialized: true,
        });
      }, 1500);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "重启服务失败" });
    } finally {
      setRestarting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Settings size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">应用设置</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">配置全局伴生服务、工作区与偏好选项</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 bg-slate-50/70 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab("companion")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "companion"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <Radio size={14} />
            伴生服务与连接
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("workspace")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "workspace"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <FolderGit2 size={14} />
            工作区设置
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "general"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <Globe size={14} />
            外观与偏好
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {feedbackMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                feedbackMsg.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400"
              }`}
            >
              {feedbackMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {feedbackMsg.text}
            </div>
          )}

          {/* TAB 1: Companion Service */}
          {activeTab === "companion" && (
            <div className="space-y-4">
              {/* Status banner */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    {isBackendAlive ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                    )}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {isBackendAlive ? "核心伴生服务运行中" : "核心服务未连接"}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      http://127.0.0.1:{port}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={restarting}
                  onClick={handleRestartBackend}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-sky-500/40 bg-white dark:bg-slate-800/80 hover:bg-sky-500/10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  title="重启 WSL / 后台守护进程并重新对齐端口"
                >
                  <RotateCw size={13} className={restarting ? "animate-spin text-sky-400" : ""} />
                  {restarting ? "重启中..." : "重启服务"}
                </button>
              </div>

              {/* Port Config */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Radio size={14} className="text-indigo-500 dark:text-indigo-400" />
                    伴生服务通信端口
                  </label>
                  <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">默认: 3200</span>
                </div>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value, 10) || 3200)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 focus:border-sky-500 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all shadow-xs"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  伴生服务监听的 TCP 端口。保存后若端口改变，系统将自动对齐并更新 API 请求地址。
                </p>
              </div>

              {/* Auto Start Switch */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Zap size={13} className="text-amber-500 dark:text-amber-400" />
                    应用启动时自动拉起后台服务
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    检测到服务未启动时，自动在 WSL/后台静默唤醒守护进程
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
            </div>
          )}

          {/* TAB 2: Workspace */}
          {activeTab === "workspace" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FolderGit2 size={14} className="text-sky-500 dark:text-sky-400" />
                  工作区根目录路径 (Workspace Path)
                </label>
                <input
                  type="text"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder="例如: /home/username/org 或 D:\projects\monorepo"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 focus:border-sky-500 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all shadow-xs"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  leoms 识别与分析的项目工作区路径。修改后保存并重启伴生服务即可切换工作区。
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: General & Preferences */}
          {activeTab === "general" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  外观主题 (Theme)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setTheme("system")}
                    className={`p-3 rounded-2xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      theme === "system"
                        ? "bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/50 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Laptop size={14} />
                    跟随系统
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`p-3 rounded-2xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      theme === "light"
                        ? "bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/50 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Sun size={14} />
                    浅色模式
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`p-3 rounded-2xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      theme === "dark"
                        ? "bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/50 text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Moon size={14} />
                    深色模式
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  配置文件持久化
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  所有配置均保存在系统的标准配置路径：
                  <div className="mt-1 font-mono text-sky-600 dark:text-sky-400 select-all font-semibold">~/.config/leoms/desktop.json</div>
                  您也可以直接使用文本编辑器打开此文件进行任意项的自定义与备份。
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/70 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-sky-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save size={13} />
                保存设置
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
