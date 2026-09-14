import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Network,
  GitCompare,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Search,
  SlidersHorizontal,
  FolderGit2,
  Package,
  Boxes,
  HelpCircle,
} from "lucide-react";
import {
  fetchTopology,
  fetchAffected,
  fetchPublishPlan,
  type TopologyResponse,
  type AffectedResponse,
  type PublishPlanResponse,
  type PublishStep,
} from "../api/client.js";

interface TopologyViewProps {
  initialSelectedProject?: string;
  onRunTask?: (action: string, target?: string) => void;
}

export const TopologyView: React.FC<TopologyViewProps> = ({
  initialSelectedProject,
  onRunTask,
}) => {
  const [data, setData] = useState<TopologyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(initialSelectedProject || null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [baseRef, setBaseRef] = useState<string>("main");
  const [affectedData, setAffectedData] = useState<AffectedResponse | null>(null);
  const [affectedLoading, setAffectedLoading] = useState<boolean>(false);
  const [publishPlan, setPublishPlan] = useState<PublishPlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState<boolean>(false);

  // Layout mode: "topology" (Ranked DAG - default) vs "category" (Directory grouped)
  const [layoutMode, setLayoutMode] = useState<"topology" | "category">("topology");
  const [showAllEdges, setShowAllEdges] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Canvas Pan & Zoom state: Default 100% (1.0) scale for crisp, legible viewing
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 30 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTopology();
  }, []);

  useEffect(() => {
    if (initialSelectedProject) {
      setSelectedNode(initialSelectedProject);
    }
  }, [initialSelectedProject]);

  const loadTopology = async () => {
    setLoading(true);
    try {
      const res = await fetchTopology();
      setData(res);
    } catch (err) {
      console.error("Failed to load topology:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAffected = async () => {
    setAffectedLoading(true);
    try {
      const res = await fetchAffected(baseRef);
      setAffectedData(res);
    } catch (err) {
      console.error("Failed to calculate affected:", err);
    } finally {
      setAffectedLoading(false);
    }
  };

  const handleSimulatePublishPlan = async (target?: string) => {
    setPlanLoading(true);
    try {
      const plan = await fetchPublishPlan(target);
      setPublishPlan(plan);
    } catch (err) {
      console.error("Failed to calculate publish plan:", err);
    } finally {
      setPlanLoading(false);
    }
  };

  // Node position calculation for SVG layout
  const {
    nodeMap,
    directAffectedSet,
    downstreamAffectedSet,
    activeConnectedNodes,
    activeUpstreamSet,
    activeDownstreamSet,
    layoutNodes,
    columnsMeta,
    contentBounds,
  } = useMemo(() => {
    if (!data) {
      return {
        nodeMap: new Map(),
        directAffectedSet: new Set<string>(),
        downstreamAffectedSet: new Set<string>(),
        activeConnectedNodes: new Set<string>(),
        activeUpstreamSet: new Set<string>(),
        activeDownstreamSet: new Set<string>(),
        layoutNodes: [],
        columnsMeta: [],
        contentBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 700, width: 1200, height: 700 },
      };
    }

    const nMap = new Map<string, any>();
    data.nodes.forEach((n) => nMap.set(n.id, n));

    const directSet = new Set<string>();
    const downstreamSet = new Set<string>();

    if (affectedData) {
      affectedData.directProjects.forEach((p) => directSet.add(p.project.name));
      affectedData.downstreamProjects.forEach((p) => downstreamSet.add(p.project.name));
    }

    // Active focus node (hovered takes precedence, then selected)
    const activeNode = hoveredNode || selectedNode;
    const upSet = new Set<string>();
    const downSet = new Set<string>();
    const connSet = new Set<string>();

    if (activeNode) {
      connSet.add(activeNode);
      data.edges.forEach((e) => {
        // e.source depends on e.target
        if (e.source === activeNode) {
          upSet.add(e.target);
          connSet.add(e.target);
        }
        if (e.target === activeNode) {
          downSet.add(e.source);
          connSet.add(e.source);
        }
      });
    }

    // Dependency count lookup
    const upstreamCountMap = new Map<string, number>();
    const downstreamCountMap = new Map<string, number>();
    data.nodes.forEach((n) => {
      upstreamCountMap.set(n.name, 0);
      downstreamCountMap.set(n.name, 0);
    });
    data.edges.forEach((e) => {
      upstreamCountMap.set(e.source, (upstreamCountMap.get(e.source) || 0) + 1);
      downstreamCountMap.set(e.target, (downstreamCountMap.get(e.target) || 0) + 1);
    });

    const lNodes: Array<{
      node: any;
      x: number;
      y: number;
      level: number;
      colIdx: number;
      rowIdx: number;
      upstreamCount: number;
      downstreamCount: number;
    }> = [];

    const colWidth = 270;
    const rowHeight = 88;
    let colsMeta: Array<{ title: string; count: number; x: number }> = [];

    if (layoutMode === "topology") {
      // 1. Calculate topological rank/depth for every node
      // Level 0 = leaf providers with 0 workspace dependencies
      const depthMemo = new Map<string, number>();
      const visiting = new Set<string>();

      const getDepth = (name: string): number => {
        if (depthMemo.has(name)) return depthMemo.get(name)!;
        if (visiting.has(name)) return 0; // Prevent cyclic loops
        visiting.add(name);

        const myDeps = data.edges.filter((e) => e.source === name).map((e) => e.target);
        let maxDepDepth = -1;
        for (const dep of myDeps) {
          const d = getDepth(dep);
          if (d > maxDepDepth) maxDepDepth = d;
        }

        visiting.delete(name);
        const result = maxDepDepth + 1;
        depthMemo.set(name, result);
        return result;
      };

      data.nodes.forEach((n) => getDepth(n.name));

      // Group by computed topological level
      const levelGroups = new Map<number, any[]>();
      data.nodes.forEach((n) => {
        const lvl = depthMemo.get(n.name) || 0;
        if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
        levelGroups.get(lvl)!.push(n);
      });

      const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

      const levelTitles: Record<number, string> = {
        0: "Level 0 · 基础底座/独立包",
        1: "Level 1 · 公共组件与工具",
        2: "Level 2 · 复合业务模块",
        3: "Level 3 · 核心业务应用",
        4: "Level 4 · 交付定制终端",
      };

      colsMeta = sortedLevels.map((lvl, colIdx) => ({
        title: levelTitles[lvl] || `Level ${lvl} · 架构分层`,
        count: levelGroups.get(lvl)!.length,
        x: 60 + colIdx * colWidth,
      }));

      sortedLevels.forEach((lvl, colIdx) => {
        const items = levelGroups.get(lvl)!;
        // Sort items inside column alphabetically or by dependents count
        items.sort((a, b) => (downstreamCountMap.get(b.name) || 0) - (downstreamCountMap.get(a.name) || 0));

        items.forEach((item, rowIdx) => {
          lNodes.push({
            node: item,
            x: 60 + colIdx * colWidth,
            y: 80 + rowIdx * rowHeight,
            level: lvl,
            colIdx,
            rowIdx,
            upstreamCount: upstreamCountMap.get(item.name) || 0,
            downstreamCount: downstreamCountMap.get(item.name) || 0,
          });
        });
      });
    } else {
      // 2. Category grouped layout
      const categoryColumns: Record<string, any[]> = {
        libs: [],
        packages: [],
        apps: [],
        other: [],
      };

      data.nodes.forEach((n) => {
        const cat = n.category || "other";
        if (!categoryColumns[cat]) {
          categoryColumns[cat] = [];
        }
        categoryColumns[cat].push(n);
      });

      const standardKeys = ["libs", "packages", "apps"];
      const customKeys = Object.keys(categoryColumns).filter(
        (c) => !standardKeys.includes(c) && c !== "other"
      );
      const colKeys = [...standardKeys, ...customKeys, "other"].filter(
        (c) => categoryColumns[c] && categoryColumns[c].length > 0
      );

      const categoryTitles: Record<string, string> = {
        libs: "私有库 (Libs)",
        packages: "公共包 (Packages)",
        apps: "业务应用 (Apps)",
        other: "其他扩展 (Other)",
      };

      colsMeta = colKeys.map((cKey, colIdx) => ({
        title: categoryTitles[cKey] || cKey,
        count: categoryColumns[cKey].length,
        x: 60 + colIdx * colWidth,
      }));

      colKeys.forEach((cKey, colIdx) => {
        const items = categoryColumns[cKey];
        items.sort((a, b) => (downstreamCountMap.get(b.name) || 0) - (downstreamCountMap.get(a.name) || 0));

        items.forEach((item, rowIdx) => {
          lNodes.push({
            node: item,
            x: 60 + colIdx * colWidth,
            y: 80 + rowIdx * rowHeight,
            level: colIdx,
            colIdx,
            rowIdx,
            upstreamCount: upstreamCountMap.get(item.name) || 0,
            downstreamCount: downstreamCountMap.get(item.name) || 0,
          });
        });
      });
    }

    // Calculate content bounding box
    const xs = lNodes.map((n) => n.x);
    const ys = lNodes.map((n) => n.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs.map((x) => x + 210)) : 1200;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys.map((y) => y + 60)) : 700;

    const bounds = {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1200, maxX + 100),
      height: Math.max(700, maxY + 120),
    };

    return {
      nodeMap: nMap,
      directAffectedSet: directSet,
      downstreamAffectedSet: downstreamSet,
      activeConnectedNodes: connSet,
      activeUpstreamSet: upSet,
      activeDownstreamSet: downSet,
      layoutNodes: lNodes,
      columnsMeta: colsMeta,
      contentBounds: bounds,
    };
  }, [data, affectedData, selectedNode, hoveredNode, layoutMode]);

  // Fit to screen view calculation
  const handleFitView = useCallback(() => {
    if (!containerRef.current || layoutNodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vW = rect.width || 900;
    const vH = rect.height || 600;

    const { minX, minY, width, height } = contentBounds;
    const graphW = width - minX + 80;
    const graphH = height - minY + 80;

    const scaleW = vW / graphW;
    const scaleH = vH / graphH;
    // Keep a comfortable readable floor so text does not become tiny
    const targetScale = Math.min(Math.max(Math.min(scaleW, scaleH) * 0.95, 0.72), 1.15);

    const centerX = minX + graphW / 2;
    const centerY = minY + graphH / 2;

    setZoom(targetScale);
    setPan({
      x: vW / 2 - centerX * targetScale,
      y: vH / 2 - centerY * targetScale + 20,
    });
  }, [contentBounds, layoutNodes.length]);

  // Pan & Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click drags
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel: zoom with Ctrl/Meta or trackpad pinch, or smooth pan
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left : 400;
      const mouseY = rect ? e.clientY - rect.top : 300;

      const delta = e.deltaY < 0 ? 1.1 : 0.91;
      const newZoom = Math.min(Math.max(zoom * delta, 0.35), 2.4);
      const scaleChange = newZoom / zoom;

      setPan((prev) => ({
        x: mouseX - (mouseX - prev.x) * scaleChange,
        y: mouseY - (mouseY - prev.y) * scaleChange,
      }));
      setZoom(newZoom);
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Search & Pan-to-Node
  const handleSearchLocate = (nodeName: string) => {
    const target = layoutNodes.find((l) => l.node.name.toLowerCase().includes(nodeName.toLowerCase()));
    if (!target || !containerRef.current) return;

    setSelectedNode(target.node.name);
    const rect = containerRef.current.getBoundingClientRect();
    const vW = rect.width || 900;
    const vH = rect.height || 600;

    setPan({
      x: vW / 2 - (target.x + 100) * zoom,
      y: vH / 2 - (target.y + 24) * zoom,
    });
  };

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 mb-4 animate-spin">
          <Network size={24} />
        </div>
        <p className="text-sm text-[var(--text-secondary)] font-medium">
          正在计算依赖有向无环图 (DAG)...
        </p>
      </div>
    );
  }

  const selectedNodeData = selectedNode ? nodeMap.get(selectedNode) : null;
  const activeFocus = hoveredNode || selectedNode;

  return (
    <div className="space-y-4">
      {/* 1. Control Toolbar */}
      <div className="apple-glass p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        {/* Left: Layout mode switch & Affected simulation */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Layout Mode Switch */}
          <div className="apple-segmented-control">
            <button
              onClick={() => setLayoutMode("topology")}
              className={`apple-segmented-item ${layoutMode === "topology" ? "active" : ""}`}
              title="按有向无环图拓扑层级自底向上分层排列（推荐）"
            >
              <Boxes size={13} />
              <span>DAG 拓扑分层</span>
            </button>
            <button
              onClick={() => setLayoutMode("category")}
              className={`apple-segmented-item ${layoutMode === "category" ? "active" : ""}`}
              title="按 libs/packages/apps 目录结构列式排列"
            >
              <Package size={13} />
              <span>资产目录排列</span>
            </button>
          </div>

          <div className="h-5 w-px bg-[var(--border-glass)] hidden sm:block"></div>

          {/* Git Affected Analyzer */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              placeholder="对比基准 (main)"
              className="apple-glass-input text-xs py-1 px-2.5 w-28 font-mono"
            />
            <button
              onClick={handleSimulateAffected}
              disabled={affectedLoading}
              className="apple-glass-button primary text-xs md:text-sm py-1.5 px-3.5"
            >
              <GitCompare size={14} className={affectedLoading ? "animate-spin" : ""} />
              <span>{affectedLoading ? "分析中..." : "波及影响分析"}</span>
            </button>
          </div>

          {/* Release Plan DAG Simulator */}
          <button
            onClick={() => handleSimulatePublishPlan(selectedNode || undefined)}
            disabled={planLoading}
            className={`apple-glass-button text-xs md:text-sm py-1.5 px-3.5 ${
              publishPlan ? "bg-purple-500/20 text-purple-300 border-purple-500/40" : ""
            }`}
            title="模拟计算有向无环图发版拓扑次序 (发布依赖链模拟)"
          >
            <Layers size={14} className={planLoading ? "animate-spin" : ""} />
            <span>{planLoading ? "推演中..." : "发版顺序模拟"}</span>
          </button>

          {publishPlan && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="status-pill purple text-xs py-0.5 px-2.5 whitespace-nowrap font-semibold">
                发版批次: {publishPlan.orderedSteps.length} 步
              </span>
              {publishPlan.hasCycle && (
                <span className="status-pill rose text-xs py-0.5 px-2.5 whitespace-nowrap font-semibold">
                  ⚠️ 存在循环依赖!
                </span>
              )}
            </div>
          )}

          {affectedData && (
            <div className="flex items-center gap-2 text-xs">
              <span className="status-pill amber text-xs py-0.5 px-2.5 whitespace-nowrap font-semibold">
                变动: {affectedData.directProjects.length}
              </span>
              <span className="status-pill rose text-xs py-0.5 px-2.5 whitespace-nowrap font-semibold">
                受波及: {affectedData.downstreamProjects.length}
              </span>
            </div>
          )}
        </div>

        {/* Right: Search, Filter & Zoom Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim()) handleSearchLocate(e.target.value);
              }}
              placeholder="搜索定位项目..."
              className="apple-glass-input text-xs sm:text-sm py-1.5 pl-8 pr-3 w-40 sm:w-48 font-mono"
            />
            <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
          </div>

          {/* Toggle All Edges */}
          <button
            onClick={() => setShowAllEdges((v) => !v)}
            className={`apple-glass-button text-xs md:text-sm py-1.5 px-3 ${showAllEdges ? "active" : ""}`}
            title="切换完整关系网显隐"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">{showAllEdges ? "全部关系" : "高亮链路"}</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-black/5 dark:bg-black/20 p-1 rounded-xl border border-[var(--border-glass)]">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.15, 2.2))}
              className="apple-glass-button text-xs py-1 px-2.5"
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.35))}
              className="apple-glass-button text-xs py-1 px-2.5"
              title="缩小"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={handleFitView}
              className="apple-glass-button text-xs py-1 px-2.5"
              title="自适应居中视图"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 40, y: 40 });
              }}
              className="apple-glass-button text-xs py-1 px-2.5"
              title="重置到 100%"
            >
              <RotateCcw size={14} />
            </button>
            <span className="text-xs font-mono text-[var(--text-muted)] px-2 whitespace-nowrap font-medium">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* 2. Visual DAG Canvas & Inspector Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Main Canvas Viewport (Pannable & Zoomable) */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`lg:col-span-3 apple-glass-card p-0 h-[700px] relative border border-[var(--border-glass)] select-none overflow-hidden shadow-md ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {/* Top Left Canvas Badges & Legend */}
          <div className="absolute top-3.5 left-3.5 z-10 flex flex-wrap items-center gap-2.5 pointer-events-none">
            {/* Category / Direction Legend */}
            <div className="apple-glass-pill px-3.5 py-1.5 flex items-center gap-3.5 text-xs text-[var(--text-secondary)] pointer-events-auto font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span>私有库 (Libs)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                <span>公共包 (Packages)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                <span>应用 (Apps)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                <span>其他扩展 (Other)</span>
              </div>
            </div>

            {/* Relation Flow Direction Legend */}
            <div className="apple-glass-pill px-3 py-1.5 flex items-center gap-2.5 text-xs text-[var(--text-secondary)] pointer-events-auto font-medium">
              <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                ↑ 向上依赖
              </span>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                ↓ 向下引用
              </span>
            </div>
          </div>

          {/* Bottom Left Navigation Tips */}
          <div className="absolute bottom-3.5 left-3.5 z-10 apple-glass-pill px-3.5 py-1.5 text-xs text-[var(--text-muted)] pointer-events-none flex items-center gap-2">
            <HelpCircle size={13} />
            <span>按住鼠标左键可自由拖动画布 · 滚轮缩放与平移 · 点击节点聚焦关系链路</span>
          </div>

          {/* Interactive SVG Canvas */}
          <svg className="w-full h-full">
            <defs>
              {/* Default passive arrow */}
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(148, 163, 184, 0.45)" />
              </marker>

              {/* Upstream dependency arrow (Active Sky Blue) */}
              <marker
                id="arrow-upstream"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
              </marker>

              {/* Downstream dependent arrow (Active Neon Purple) */}
              <marker
                id="arrow-downstream"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#c084fc" />
              </marker>

              {/* Affected arrow (Rose) */}
              <marker
                id="arrow-affected"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
              </marker>
            </defs>

            {/* Master Transform Group for Pan & Zoom */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Column Header Titles & Guides */}
              {columnsMeta.map((col, idx) => (
                <g key={idx} transform={`translate(${col.x}, 35)`}>
                  <rect
                    x="0"
                    y="0"
                    width="200"
                    height="28"
                    rx="8"
                    fill="rgba(0,0,0,0.08)"
                    stroke="var(--border-glass-subtle)"
                  />
                  <text
                    x="12"
                    y="18"
                    fill="var(--text-secondary)"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="sans-serif"
                  >
                    {col.title}
                  </text>
                  <text
                    x="188"
                    y="18"
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {col.count}
                  </text>
                </g>
              ))}

              {/* Relationship Lines (Edges) */}
              {data.edges.map((edge) => {
                const sourceLayout = layoutNodes.find((l) => l.node.name === edge.source);
                const targetLayout = layoutNodes.find((l) => l.node.name === edge.target);
                if (!sourceLayout || !targetLayout) return null;

                // Relationship analysis:
                // edge.source depends on edge.target
                const isUpstreamOfActive = activeFocus === edge.source; // I depend on target
                const isDownstreamOfActive = activeFocus === edge.target; // Target depends on source

                const isConnected = isUpstreamOfActive || isDownstreamOfActive;

                const isDownstreamAffected =
                  downstreamAffectedSet.has(edge.source) && directAffectedSet.has(edge.target);

                // If focus mode is on and edge is not connected, dim or hide
                if (!showAllEdges && activeFocus && !isConnected && !isDownstreamAffected) {
                  return null;
                }

                let strokeColor = "rgba(148, 163, 184, 0.35)";
                let strokeWidth = 1.3;
                let markerEnd = "url(#arrow-default)";
                let strokeOpacity = 1;

                if (isDownstreamAffected) {
                  strokeColor = "#f43f5e";
                  strokeWidth = 2.6;
                  markerEnd = "url(#arrow-affected)";
                } else if (isUpstreamOfActive) {
                  // Upstream dependency: Sky blue
                  strokeColor = "#38bdf8";
                  strokeWidth = 2.6;
                  markerEnd = "url(#arrow-upstream)";
                } else if (isDownstreamOfActive) {
                  // Downstream dependent: Purple
                  strokeColor = "#c084fc";
                  strokeWidth = 2.6;
                  markerEnd = "url(#arrow-downstream)";
                } else if (activeFocus) {
                  strokeOpacity = 0.12;
                }

                // Smart Bezier routing to avoid crossing cards
                const nodeWidth = 200;
                const nodeHeight = 46;
                let sx: number, sy: number, tx: number, ty: number, pathData: string;

                if (sourceLayout.x > targetLayout.x) {
                  // Source is to the right of target (standard DAG flow)
                  sx = sourceLayout.x;
                  sy = sourceLayout.y + nodeHeight / 2;
                  tx = targetLayout.x + nodeWidth;
                  ty = targetLayout.y + nodeHeight / 2;
                  const dx = (sx - tx) * 0.5;
                  pathData = `M ${sx} ${sy} C ${sx - dx} ${sy}, ${tx + dx} ${ty}, ${tx} ${ty}`;
                } else if (sourceLayout.x < targetLayout.x) {
                  // Source is to the left of target
                  sx = sourceLayout.x + nodeWidth;
                  sy = sourceLayout.y + nodeHeight / 2;
                  tx = targetLayout.x;
                  ty = targetLayout.y + nodeHeight / 2;
                  const dx = (tx - sx) * 0.5;
                  pathData = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
                } else {
                  // Same column! Avoid straight line crossing through other nodes: route with side arc
                  sx = sourceLayout.x;
                  sy = sourceLayout.y + nodeHeight / 2;
                  tx = targetLayout.x;
                  ty = targetLayout.y + nodeHeight / 2;
                  const loopDist = Math.min(50 + Math.abs(sy - ty) * 0.12, 75);
                  pathData = `M ${sx} ${sy} C ${sx - loopDist} ${sy}, ${tx - loopDist} ${ty}, ${tx} ${ty}`;
                }

                return (
                  <path
                    key={edge.id}
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={strokeOpacity}
                    strokeDasharray={edge.isDev ? "4,4" : undefined}
                    markerEnd={markerEnd}
                    className="transition-all duration-150"
                  />
                );
              })}

              {/* Node Cards */}
              {layoutNodes.map(
                ({ node, x, y, upstreamCount, downstreamCount }) => {
                  const isSelected = selectedNode === node.name;
                  const isHovered = hoveredNode === node.name;
                  const isDirect = directAffectedSet.has(node.name);
                  const isDownstream = downstreamAffectedSet.has(node.name);

                  const isUpstream = activeUpstreamSet.has(node.name);
                  const isDownstreamRel = activeDownstreamSet.has(node.name);
                  const isConnected = activeConnectedNodes.has(node.name);

                  let borderColor = "var(--border-glass)";
                  let glowFilter = "";

                  if (isDirect) {
                    borderColor = "#f59e0b";
                    glowFilter = "drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))";
                  } else if (isDownstream) {
                    borderColor = "#f43f5e";
                    glowFilter = "drop-shadow(0 0 10px rgba(244, 63, 94, 0.6))";
                  } else if (isSelected || isHovered) {
                    borderColor = "#38bdf8";
                    glowFilter = "drop-shadow(0 0 12px rgba(56, 189, 248, 0.5))";
                  } else if (isUpstream) {
                    borderColor = "#38bdf8";
                    glowFilter = "drop-shadow(0 0 8px rgba(56, 189, 248, 0.35))";
                  } else if (isDownstreamRel) {
                    borderColor = "#c084fc";
                    glowFilter = "drop-shadow(0 0 8px rgba(192, 132, 252, 0.35))";
                  }

                  const catColor =
                    node.category === "libs"
                      ? "#34d399"
                      : node.category === "packages"
                      ? "#38bdf8"
                      : node.category === "apps"
                      ? "#818cf8"
                      : "#fbbf24";

                  return (
                    <g
                      key={node.name}
                      transform={`translate(${x}, ${y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(node.name);
                      }}
                      onMouseEnter={() => setHoveredNode(node.name)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="cursor-pointer"
                      style={{
                        transition: "all 0.2s ease",
                        filter: glowFilter,
                      }}
                    >
                      {/* Node Card Box */}
                      <rect
                        width="200"
                        height="48"
                        rx="12"
                        fill="var(--bg-surface)"
                        stroke={borderColor}
                        strokeWidth={
                          isSelected || isHovered || isDirect || isDownstream || isUpstream || isDownstreamRel
                            ? 2
                            : 1
                        }
                      />

                      {/* Category Pill Dot */}
                      <circle cx="16" cy="24" r="5" fill={catColor} />

                      {/* Project Title */}
                      <text
                        x="28"
                        y="21"
                        fill="var(--text-primary)"
                        fontSize="12"
                        fontWeight="700"
                        fontFamily="ui-monospace, monospace"
                      >
                        {node.name.length > 20 ? node.name.slice(0, 18) + "…" : node.name}
                      </text>

                      {/* Version or relative directory */}
                      <text
                        x="28"
                        y="36"
                        fill="var(--text-muted)"
                        fontSize="10.5"
                        fontFamily="ui-monospace, monospace"
                      >
                        {node.version ? `v${node.version}` : node.relativeDir}
                      </text>

                      {/* Badges: Upstream / Downstream count */}
                      <g transform="translate(138, 11)">
                        {upstreamCount > 0 && (
                          <g>
                            <rect width="26" height="16" rx="5" fill="rgba(56, 189, 248, 0.18)" />
                            <text
                              x="13"
                              y="11.5"
                              textAnchor="middle"
                              fill="#38bdf8"
                              fontSize="10"
                              fontWeight="600"
                              fontFamily="monospace"
                            >
                              ↑{upstreamCount}
                            </text>
                          </g>
                        )}
                        {downstreamCount > 0 && (
                          <g transform="translate(28, 0)">
                            <rect width="26" height="16" rx="5" fill="rgba(192, 132, 252, 0.18)" />
                            <text
                              x="13"
                              y="11.5"
                              textAnchor="middle"
                              fill="#c084fc"
                              fontSize="10"
                              fontWeight="600"
                              fontFamily="monospace"
                            >
                              ↓{downstreamCount}
                            </text>
                          </g>
                        )}
                      </g>

                      {/* Publish Step Badge if simulated */}
                      {publishPlan?.orderedSteps.find((s) => s.project.name === node.name) && (
                        <g transform="translate(138, 29)">
                          <rect width="54" height="15" rx="4.5" fill="rgba(192, 132, 252, 0.25)" stroke="#c084fc" strokeWidth="0.8" />
                          <text
                            x="27"
                            y="11"
                            textAnchor="middle"
                            fill="#f3e8ff"
                            fontSize="9"
                            fontWeight="bold"
                            fontFamily="monospace"
                          >
                            #{publishPlan.orderedSteps.find((s) => s.project.name === node.name)!.step} 批次
                          </text>
                        </g>
                      )}

                      {/* Affected Indicator Dots */}
                      {isDirect && (
                        <circle cx="192" cy="10" r="4.5" fill="#f59e0b" stroke="#fff" strokeWidth="1" />
                      )}
                      {isDownstream && (
                        <circle cx="192" cy="10" r="4.5" fill="#f43f5e" stroke="#fff" strokeWidth="1" />
                      )}
                    </g>
                  );
                }
              )}
            </g>
          </svg>
        </div>

        {/* Node Inspector Sidebar */}
        <div className="apple-glass-card p-5 sm:p-6 flex flex-col justify-between shadow-md">
          {selectedNodeData ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-[var(--text-muted)]">
                  节点检查器 (Node Inspector)
                </span>
                <h3 className="text-lg font-bold text-sky-400 font-mono break-all mt-1">
                  {selectedNodeData.name}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] font-mono mt-0.5">
                  {selectedNodeData.relativeDir}
                </p>
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="text-xs px-2.5 py-0.5 rounded-full border border-sky-500/25 bg-sky-500/10 text-sky-400 font-semibold">
                    {selectedNodeData.category}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full border border-[var(--border-glass)] bg-black/5 dark:bg-white/5 text-[var(--text-muted)] font-mono">
                    {selectedNodeData.packageManager}
                  </span>
                  {selectedNodeData.version && (
                    <span className="text-xs text-[var(--text-muted)] font-mono">
                      v{selectedNodeData.version}
                    </span>
                  )}
                </div>
              </div>

              {/* Affected Warning if applicable */}
              {directAffectedSet.has(selectedNodeData.name) && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs sm:text-sm text-amber-300 flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>Git 本地发生代码变更的项目</span>
                </div>
              )}

              {downstreamAffectedSet.has(selectedNodeData.name) && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs sm:text-sm text-rose-300 flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>间接受上游变更波及的下游应用</span>
                </div>
              )}

              {/* Upstream Dependencies (What this project depends on) */}
              <div>
                <span className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    直接依赖的上游 (Dependencies)
                  </span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {data.edges.filter((e) => e.source === selectedNodeData.name).length}
                  </span>
                </span>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {data.edges
                    .filter((e) => e.source === selectedNodeData.name)
                    .map((e, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSearchLocate(e.target)}
                        className="p-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-glass)] text-xs sm:text-sm font-mono flex items-center justify-between cursor-pointer transition-colors group"
                      >
                        <span className="text-sky-300 group-hover:text-sky-200 truncate font-medium">
                          {e.target}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">{e.versionReq}</span>
                      </div>
                    ))}
                  {data.edges.filter((e) => e.source === selectedNodeData.name).length === 0 && (
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] italic py-1">无内部上游依赖</p>
                  )}
                </div>
              </div>

              {/* Downstream Dependents (Who depends on this project) */}
              <div>
                <span className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                    直接引用此包的下游 (Dependents)
                  </span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {data.edges.filter((e) => e.target === selectedNodeData.name).length}
                  </span>
                </span>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {data.edges
                    .filter((e) => e.target === selectedNodeData.name)
                    .map((e, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSearchLocate(e.source)}
                        className="p-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-glass)] text-xs sm:text-sm font-mono flex items-center justify-between cursor-pointer transition-colors group"
                      >
                        <span className="text-purple-300 group-hover:text-purple-200 truncate font-medium">
                          {e.source}
                        </span>
                        <ArrowRight size={13} className="text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    ))}
                  {data.edges.filter((e) => e.target === selectedNodeData.name).length === 0 && (
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] italic py-1">暂无下游依赖此包</p>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-3 border-t border-[var(--border-glass)] space-y-2">
                <button
                  onClick={() => onRunTask?.("build", selectedNodeData.name)}
                  className="apple-glass-button primary w-full justify-center text-xs sm:text-sm py-2"
                >
                  编译此项目与上游依赖
                </button>
                <button
                  onClick={() => onRunTask?.("check", selectedNodeData.name)}
                  className="apple-glass-button w-full justify-center text-xs sm:text-sm py-2"
                >
                  对该项目执行门禁体检
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[var(--text-muted)]">
              <Layers size={36} className="mb-3 opacity-30 text-sky-400" />
              <p className="text-xs font-medium text-[var(--text-primary)]">点击画布中任意节点</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-[200px]">
                查看完整的上下游依赖调用链路与变更波及面
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
