import React from "react";
import { LayoutDashboard, Network, ShieldAlert, Terminal, Layers } from "lucide-react";

export type NavTab = "dashboard" | "topology" | "gatekeeper" | "console" | "isolation";

interface NavigationProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  gatekeeperBadgeCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  gatekeeperBadgeCount = 0,
}) => {
  const tabs: { key: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "dashboard", label: "资产大盘", icon: <LayoutDashboard size={16} /> },
    { key: "topology", label: "DAG 拓扑", icon: <Network size={16} /> },
    {
      key: "gatekeeper",
      label: "门禁体检",
      icon: <ShieldAlert size={16} />,
      badge: gatekeeperBadgeCount > 0 ? gatekeeperBadgeCount : undefined,
    },
    { key: "console", label: "终端", icon: <Terminal size={16} /> },
    { key: "isolation", label: "隔离与透视", icon: <Layers size={16} /> },
  ];

  return (
    <div className="flex justify-center mx-4 mb-6">
      <nav className="apple-glass-pill p-1.5 flex items-center gap-1.5 shadow-[var(--shadow-floating)] max-w-full overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-gradient-to-r from-sky-500/90 to-indigo-500/90 text-white shadow-[0_4px_16px_rgba(56,189,248,0.35),inset_0_1px_0_rgba(255,255,255,0.4)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.badge === "number" && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-sm">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
