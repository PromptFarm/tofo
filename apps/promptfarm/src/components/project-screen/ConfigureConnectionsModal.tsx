"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import type { SyntheticNode, SyntheticEdge } from "@/lib/planning/types";

const NW = 172, NH = 64;

const EDGE_META = {
  oversight:     { label: "Oversight",     symbol: "✓", color: "#34d399", dash: "6 3",   desc: "one agent reviews or approves another"     },
  tension:       { label: "Tension",       symbol: "↔", color: "#f87171", dash: "4 4",   desc: "agents have conflicting perspectives"       },
  amplification: { label: "Amplification", symbol: "↑", color: "#60a5fa", dash: "none",  desc: "one agent strengthens another's output"    },
} as const;
type EdgeType = keyof typeof EDGE_META;

const STRUCTURAL_COLOR = "#454870";
const IDEA_ID    = "__idea__";
const OUTCOME_ID = "__outcome__";
const MIN_SCALE  = 0.25;
const MAX_SCALE  = 2.5;
const GRID_STEP  = 24;

const PORTS = [
  { id: "r", side: "r", px: NW,   py: NH / 2 },
  { id: "l", side: "l", px: 0,    py: NH / 2 },
  { id: "t", side: "t", px: NW/2, py: 0      },
  { id: "b", side: "b", px: NW/2, py: NH     },
];

type CanvasNode = {
  id: string; x: number; y: number;
  code: string; name: string; role: string;
  nodeType?: "idea" | "outcome";
};
type CanvasEdge = {
  id: string; from: string; to: string;
  fromPort: string; toPort: string; type: EdgeType;
};

function agentColor(code: string): string {
  const C = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#ec4899"];
  let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return C[h % C.length]!;
}

function portCenter(node: CanvasNode, portId: string) {
  const p = PORTS.find(p => p.id === portId) ?? PORTS[0]!;
  return { x: node.x + p.px, y: node.y + p.py, side: p.side };
}

function curvePath(ax: number, ay: number, as_: string, bx: number, by: number, bs: string) {
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  const c  = Math.max(50, Math.min(120, dx, dy));
  const off = (s: string): [number, number] =>
    s === "r" ? [c, 0] : s === "l" ? [-c, 0] : s === "t" ? [0, -c] : [0, c];
  const [sox, soy] = off(as_);
  const [tox, toy] = off(bs);
  return `M ${ax} ${ay} C ${ax+sox} ${ay+soy}, ${bx+tox} ${by+toy}, ${bx} ${by}`;
}

function midXY(ax: number, ay: number, bx: number, by: number) {
  return { x: (ax + bx) / 2, y: (ay + by) / 2 - 8 };
}

function closestPort(node: CanvasNode, wx: number, wy: number) {
  let best = "l", bestD = Infinity;
  for (const p of PORTS) {
    const d = Math.hypot((node.x + p.px) - wx, (node.y + p.py) - wy);
    if (d < bestD) { bestD = d; best = p.id; }
  }
  return best;
}

function rfHandleToPort(handle: string | undefined, fallback: string): string {
  if (!handle) return fallback;
  const side = handle.replace(/-source$|-target$/, "").split("-")[0] ?? "";
  const map: Record<string, string> = { right: "r", left: "l", top: "t", bottom: "b" };
  return map[side] ?? fallback;
}

function portToRfHandle(port: string, suffix: "source" | "target"): string {
  const map: Record<string, string> = { r: "right", l: "left", t: "top", b: "bottom" };
  return `${map[port] ?? "right"}-${suffix}`;
}

type Props = {
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  onUpdateEdges: (edges: SyntheticEdge[]) => void;
  onClose: () => void;
};

export function ConfigureConnectionsModal({ synthetics, edges: rawEdges, onUpdateEdges, onClose }: Props) {
  const agents     = synthetics.filter(s => s.nodeRole !== "advisor");
  const agentIdSet = new Set(agents.map(a => a.id));

  const [nodes, setNodes] = useState<CanvasNode[]>(() => {
    const agentNodes = agents.map(s => ({
      id: s.id, x: s.layout.x, y: s.layout.y,
      code: s.code, name: s.name, role: s.role,
    }));
    const xs  = agentNodes.map(n => n.x);
    const ys  = agentNodes.map(n => n.y);
    const minX = xs.length ? Math.min(...xs) : 200;
    const maxX = xs.length ? Math.max(...xs) : 400;
    const minY = ys.length ? Math.min(...ys) : 200;
    const maxY = ys.length ? Math.max(...ys) : 400;
    const midX = (minX + maxX) / 2;
    return [
      { id: IDEA_ID,    x: midX - NW/2, y: minY - 140, code: "💡", name: "Starting point", role: "Idea",   nodeType: "idea"    as const },
      ...agentNodes,
      { id: OUTCOME_ID, x: midX - NW/2, y: maxY + 80,  code: "📋", name: "Final output",   role: "Report", nodeType: "outcome" as const },
    ];
  });

  const [edges, setEdges] = useState<CanvasEdge[]>(() =>
    rawEdges
      .filter(e => e.type !== "structural" && agentIdSet.has(e.from) && agentIdSet.has(e.to))
      .map(e => ({
        id: e.id, from: e.from, to: e.to,
        fromPort: rfHandleToPort(e.sourceHandle, "r"),
        toPort:   rfHandleToPort(e.targetHandle, "l"),
        type: (e.type === "tension" || e.type === "oversight" || e.type === "amplification")
          ? e.type : "oversight",
      }))
  );

  const [scale, setScale] = useState(1);
  const [pan,   setPan]   = useState<{ x: number; y: number }>(() => {
    const xs = agents.map(s => s.layout.x);
    const ys = agents.map(s => s.layout.y);
    const minX = xs.length ? Math.min(...xs) : 200;
    const minY = ys.length ? Math.min(...ys) : 200;
    return { x: -(minX - NW/2) + 80, y: -(minY - 140) + 60 };
  });

  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<
    | { type: "pan";  mx: number; my: number; px: number; py: number }
    | { type: "node"; id: string; mx: number; my: number; ox: number; oy: number }
    | null
  >(null);

  // Keep scale/pan in refs for use inside event callbacks that don't re-subscribe
  const scaleRef = useRef(scale);
  const panRef   = useRef(pan);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const [hoveredId,    setHoveredId]    = useState<string | null>(null);
  const [connecting,   setConnecting]   = useState<{ fromId: string; fromPortId: string } | null>(null);
  const [ghostEnd,     setGhostEnd]     = useState<{ x: number; y: number } | null>(null);
  const [selEdgeId,    setSelEdgeId]    = useState<string | null>(null);
  const [edgePopup,    setEdgePopup]    = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [hoveredEdge,  setHoveredEdge]  = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [legendOpen,   setLegendOpen]   = useState(true);

  // Persist semantic edge changes back to ThinkingGraph
  const prevEdgesRef = useRef(edges);
  useEffect(() => {
    if (prevEdgesRef.current === edges) return;
    prevEdgesRef.current = edges;
    const structural = rawEdges.filter(e => e.type === "structural");
    const updated: SyntheticEdge[] = edges.map(e => ({
      id: e.id, from: e.from, to: e.to, type: e.type,
      sourceHandle: portToRfHandle(e.fromPort, "source"),
      targetHandle: portToRfHandle(e.toPort, "target"),
    }));
    onUpdateEdges([...structural, ...updated]);
  }, [edges, rawEdges, onUpdateEdges]);

  // Mouse move/up: pan, node drag, ghost edge tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d?.type === "pan") {
        setPan({ x: d.px + e.clientX - d.mx, y: d.py + e.clientY - d.my });
      } else if (d?.type === "node") {
        const s = scaleRef.current;
        setNodes(prev => prev.map(n =>
          n.id === d.id ? { ...n, x: d.ox + (e.clientX - d.mx) / s, y: d.oy + (e.clientY - d.my) / s } : n
        ));
      }
      if (connecting && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const p    = panRef.current;
        const s    = scaleRef.current;
        setGhostEnd({ x: (e.clientX - rect.left - p.x) / s, y: (e.clientY - rect.top - p.y) / s });
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [connecting]);

  // Zoom on scroll (non-passive so preventDefault works)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prevScale = scaleRef.current;
      const prevPan   = panRef.current;
      const factor    = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale * factor));
      const rect = svg.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      const ratio = nextScale / prevScale;
      setScale(nextScale);
      setPan({ x: cx - (cx - prevPan.x) * ratio, y: cy - (cy - prevPan.y) * ratio });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (connecting) { setConnecting(null); setGhostEnd(null); }
        else if (edgePopup) setEdgePopup(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connecting, edgePopup, onClose]);

  const handleNodeClick = useCallback((targetId: string) => {
    if (!connecting) return;
    if (targetId === connecting.fromId) { setConnecting(null); setGhostEnd(null); return; }
    if (edges.some(e => (e.from === connecting.fromId && e.to === targetId) || (e.from === targetId && e.to === connecting.fromId))) {
      setConnecting(null); setGhostEnd(null); return;
    }
    const tgtNode = nodes.find(n => n.id === targetId);
    const toPort  = (tgtNode && ghostEnd) ? closestPort(tgtNode, ghostEnd.x, ghostEnd.y) : "l";
    setEdges(prev => [...prev, {
      id: `${connecting.fromId}-${targetId}-${Date.now()}`,
      from: connecting.fromId, to: targetId,
      fromPort: connecting.fromPortId, toPort, type: "oversight",
    }]);
    setConnecting(null); setGhostEnd(null);
  }, [connecting, edges, ghostEnd, nodes]);

  const handleEdgeClick = useCallback((e: React.MouseEvent, edgeId: string) => {
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    setEdgePopup(rect ? { edgeId, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    setSelEdgeId(edgeId);
  }, []);

  const setEdgeType = useCallback((edgeId: string, type: EdgeType) => {
    setEdges(prev => prev.map(e => e.id === edgeId ? { ...e, type } : e));
    setEdgePopup(null);
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    setEdgePopup(null); setSelEdgeId(null);
  }, []);

  const nodeMap      = new Map(nodes.map(n => [n.id, n]));
  const agentCanvases = nodes.filter(n => !n.nodeType);
  const fromNode      = connecting ? nodeMap.get(connecting.fromId) : null;
  const ghostSrc      = fromNode ? portCenter(fromNode, connecting!.fromPortId) : null;

  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{ flex: 1, margin: 20, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border-2)", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontWeight: 700, fontSize: 14, color: "var(--on-surface)", letterSpacing: "-0.01em" }}>
            Configure Connections
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
            Hover node · drag port to connect · scroll to zoom
          </span>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex", alignItems: "center", padding: 4, borderRadius: 6 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Canvas ── */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <svg
            ref={svgRef}
            width="100%" height="100%"
            style={{ cursor: connecting ? "crosshair" : "default", userSelect: "none", display: "block" }}
            onMouseDown={e => {
              if (e.target === svgRef.current || (e.target as SVGElement).dataset?.canvas) {
                dragRef.current = { type: "pan", mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
              }
              setEdgePopup(null);
            }}
            onClick={() => { if (!connecting) setSelEdgeId(null); }}
          >
            <defs>
              <pattern id="ccgrid"
                x={pan.x % (GRID_STEP * scale)} y={pan.y % (GRID_STEP * scale)}
                width={GRID_STEP * scale} height={GRID_STEP * scale}
                patternUnits="userSpaceOnUse"
              >
                <circle cx="0" cy="0" r="1" fill="var(--border)" />
              </pattern>
              {(Object.keys(EDGE_META) as EdgeType[]).map(type => (
                <marker key={type} id={`cc-${type}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0 0 L8 3 L0 6z" fill={EDGE_META[type].color} />
                </marker>
              ))}
              <marker id="cc-struct" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0 0 L8 3 L0 6z" fill={STRUCTURAL_COLOR} />
              </marker>
              <marker id="cc-ghost" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0 0 L8 3 L0 6z" fill="var(--primary)" />
              </marker>
            </defs>

            {/* Background grid (screen space) */}
            <rect data-canvas="true" width="100%" height="100%" fill="url(#ccgrid)" />

            {/* All content in world space */}
            <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>

              {/* Structural edges — hidden by default, revealed on hover */}
              {agentCanvases.map(agent => {
                const idea    = nodeMap.get(IDEA_ID);
                const outcome = nodeMap.get(OUTCOME_ID);
                const visible = hoveredId === IDEA_ID || hoveredId === OUTCOME_ID || hoveredId === agent.id;
                const op      = visible ? 0.5 : 0;
                return (
                  <g key={`struct-${agent.id}`} style={{ pointerEvents: "none" }}>
                    {idea && (() => { const sp = portCenter(idea, "b"), tp = portCenter(agent, "t"); return (
                      <path d={curvePath(sp.x, sp.y, "b", tp.x, tp.y, "t")}
                        fill="none" stroke={STRUCTURAL_COLOR} strokeWidth={1} strokeDasharray="4 4"
                        markerEnd="url(#cc-struct)" opacity={op}
                        style={{ transition: "opacity 0.18s" }} />
                    ); })()}
                    {outcome && (() => { const sp = portCenter(agent, "b"), tp = portCenter(outcome, "t"); return (
                      <path d={curvePath(sp.x, sp.y, "b", tp.x, tp.y, "t")}
                        fill="none" stroke={STRUCTURAL_COLOR} strokeWidth={1} strokeDasharray="4 4"
                        markerEnd="url(#cc-struct)" opacity={op}
                        style={{ transition: "opacity 0.18s" }} />
                    ); })()}
                  </g>
                );
              })}

              {/* Semantic edges (editable) */}
              {edges.map(edge => {
                const src = nodeMap.get(edge.from), tgt = nodeMap.get(edge.to);
                if (!src || !tgt) return null;
                const meta  = EDGE_META[edge.type];
                const isSel = selEdgeId === edge.id;
                const sp    = portCenter(src, edge.fromPort);
                const tp    = portCenter(tgt, edge.toPort);
                const path  = curvePath(sp.x, sp.y, sp.side, tp.x, tp.y, tp.side);
                const mid   = midXY(sp.x, sp.y, tp.x, tp.y);
                return (
                  <g key={edge.id}>
                    <path d={path} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }}
                      onClick={e => handleEdgeClick(e, edge.id)}
                      onMouseEnter={e => { const r = svgRef.current?.getBoundingClientRect(); if (r) setHoveredEdge({ edgeId: edge.id, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                      onMouseMove={e  => { const r = svgRef.current?.getBoundingClientRect(); if (r) setHoveredEdge({ edgeId: edge.id, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                    <path d={path} fill="none"
                      stroke={isSel ? "var(--primary)" : meta.color}
                      strokeWidth={isSel ? 2 : 1.5}
                      strokeDasharray={meta.dash === "none" ? undefined : meta.dash}
                      markerEnd={`url(#cc-${edge.type})`}
                      style={{ pointerEvents: "none", transition: "stroke 0.15s" }}
                    />
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={mid.x-11} y={mid.y-8} width={22} height={15} rx={7}
                        fill="var(--surface)" stroke={isSel ? "var(--primary)" : "var(--border)"} strokeWidth={1} />
                      <text x={mid.x} y={mid.y+0.5} textAnchor="middle" dominantBaseline="central"
                        fontSize={9} fontWeight={600}
                        fill={isSel ? "var(--primary)" : meta.color}
                        fontFamily="var(--font-jetbrains-mono), monospace"
                      >{meta.symbol}</text>
                    </g>
                  </g>
                );
              })}

              {/* Ghost edge while drawing connection */}
              {ghostSrc && ghostEnd && (() => {
                const dx = ghostEnd.x - ghostSrc.x, dy = ghostEnd.y - ghostSrc.y;
                const tSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "l" : "r") : (dy > 0 ? "t" : "b");
                return <path
                  d={curvePath(ghostSrc.x, ghostSrc.y, ghostSrc.side, ghostEnd.x, ghostEnd.y, tSide)}
                  fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="6 3"
                  markerEnd="url(#cc-ghost)" opacity={0.8} style={{ pointerEvents: "none" }} />;
              })()}

              {/* All nodes */}
              {nodes.map(node => {
                const isIdea    = node.nodeType === "idea";
                const isOutcome = node.nodeType === "outcome";
                const isSpecial = isIdea || isOutcome;
                const isHov     = hoveredId === node.id;
                const isConnTgt = !isSpecial && Boolean(connecting && connecting.fromId !== node.id);
                const showPorts = !isSpecial && (isHov || isConnTgt);

                const color       = isIdea ? "#a78bfa" : isOutcome ? "#34d399" : agentColor(node.code);
                const borderColor = isIdea
                  ? (isHov ? "#a78bfa" : "var(--primary-border)")
                  : isOutcome
                    ? (isHov ? "#34d399" : "var(--color-success-border)")
                    : (isHov || isConnTgt) ? color : "var(--border)";
                const accentFill  = isIdea ? "var(--primary)" : isOutcome ? "var(--color-success-text)" : color;
                const avatarBg    = isIdea ? "var(--primary-fixed-dim)" : isOutcome ? "var(--color-success-bg-subtle)" : undefined;
                const titleFill   = isIdea ? "var(--primary)" : isOutcome ? "var(--color-success-text)"
                  : isHov ? "var(--on-surface)" : "var(--on-surface-variant)";
                const subtitle    = isIdea
                  ? `→ ${agentCanvases.length} agent${agentCanvases.length !== 1 ? "s" : ""}`
                  : isOutcome
                    ? `${agentCanvases.length} agent${agentCanvases.length !== 1 ? "s" : ""} →`
                    : node.name;

                return (
                  <g key={node.id}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={e => {
                      e.stopPropagation();
                      if (isSpecial) { if (connecting) { setConnecting(null); setGhostEnd(null); } }
                      else handleNodeClick(node.id);
                    }}
                    style={{ cursor: connecting && isSpecial ? "not-allowed" : "grab" }}
                  >
                    {/* Card background */}
                    <rect x={node.x} y={node.y} width={NW} height={NH} rx={10}
                      fill="var(--surface)"
                      stroke={borderColor}
                      strokeWidth={(isHov || isConnTgt) ? 1.5 : 1}
                      style={{ transition: "stroke 0.12s" }}
                      onMouseDown={e => {
                        e.stopPropagation();
                        if (connecting) return;
                        dragRef.current = { type: "node", id: node.id, mx: e.clientX, my: e.clientY, ox: node.x, oy: node.y };
                      }}
                    />
                    {/* Left accent bar */}
                    <rect x={node.x} y={node.y+10} width={3} height={NH-20} rx={2}
                      fill={accentFill} style={{ pointerEvents: "none" }} />
                    {/* Avatar circle */}
                    {avatarBg
                      ? <circle cx={node.x+22} cy={node.y+NH/2} r={14} fill={avatarBg} style={{ pointerEvents: "none" }} />
                      : <circle cx={node.x+22} cy={node.y+NH/2} r={14} fill={color} opacity={0.15} style={{ pointerEvents: "none" }} />
                    }
                    {/* Avatar label */}
                    <text x={node.x+22} y={node.y+NH/2} textAnchor="middle" dominantBaseline="central"
                      fontSize={isSpecial ? 13 : 10} fontWeight={700}
                      fill={isSpecial ? undefined : color}
                      fontFamily="var(--font-jetbrains-mono), monospace"
                      style={{ pointerEvents: "none" }}
                    >{node.code}</text>
                    {/* Role title */}
                    <text x={node.x+44} y={node.y+NH/2-8} fontSize={12} fontWeight={600}
                      fill={titleFill} fontFamily="var(--font-manrope), sans-serif"
                      style={{ pointerEvents: "none", transition: "fill 0.12s" }}
                    >{node.role.length > 17 ? node.role.slice(0, 16) + "…" : node.role}</text>
                    {/* Name subtitle */}
                    <text x={node.x+44} y={node.y+NH/2+9} fontSize={10} fill="var(--t3)"
                      fontFamily="var(--font-jetbrains-mono), monospace"
                      style={{ pointerEvents: "none" }}
                    >{subtitle}</text>

                    {/* Port handles (agent nodes only) */}
                    {showPorts && PORTS.map(port => (
                      <circle key={port.id}
                        cx={node.x + port.px} cy={node.y + port.py}
                        r={isConnTgt ? 6 : 4.5}
                        fill={isConnTgt ? `${color}22` : "var(--surface)"}
                        stroke={color} strokeWidth={isConnTgt ? 1.5 : 1.2}
                        style={{ cursor: "crosshair" }}
                        onMouseEnter={e => e.currentTarget.setAttribute("r", isConnTgt ? "7" : "5.5")}
                        onMouseLeave={e => e.currentTarget.setAttribute("r", isConnTgt ? "6" : "4.5")}
                        onMouseDown={e => {
                          if (connecting) return;
                          e.stopPropagation();
                          const rect = svgRef.current?.getBoundingClientRect();
                          setConnecting({ fromId: node.id, fromPortId: port.id });
                          if (rect) setGhostEnd({
                            x: (e.clientX - rect.left - panRef.current.x) / scaleRef.current,
                            y: (e.clientY - rect.top  - panRef.current.y) / scaleRef.current,
                          });
                        }}
                      />
                    ))}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Edge type popup */}
          {edgePopup && (
            <div
              style={{ position: "absolute", left: edgePopup.x, top: edgePopup.y, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 164 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 10, color: "var(--t3)", padding: "2px 8px 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
                Connection type
              </div>
              {(Object.entries(EDGE_META) as [EdgeType, typeof EDGE_META[EdgeType]][]).map(([type, cfg]) => {
                const cur = edges.find(e => e.id === edgePopup.edgeId)?.type;
                return (
                  <div key={type} onClick={() => setEdgeType(edgePopup.edgeId, type)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, cursor: "pointer", background: cur === type ? "var(--surface-2)" : "transparent", transition: "background 0.1s" }}
                  >
                    <span style={{ fontSize: 13, width: 16, textAlign: "center" as const, color: cfg.color }}>{cfg.symbol}</span>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-manrope), sans-serif", color: cur === type ? "var(--on-surface)" : "var(--on-surface-variant)", fontWeight: cur === type ? 600 : 400 }}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
                <div onClick={() => deleteEdge(edgePopup.edgeId)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, cursor: "pointer", color: "var(--danger-text)", fontFamily: "var(--font-jetbrains-mono), monospace" }}
                >
                  <span style={{ fontSize: 12 }}>Delete connection</span>
                </div>
              </div>
            </div>
          )}

          {/* Connection hint */}
          {connecting && (
            <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: "1px solid var(--primary-border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "var(--primary)", pointerEvents: "none", whiteSpace: "nowrap", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
              Click another agent to connect · Esc to cancel
            </div>
          )}

          {/* Edge hover tooltip */}
          {hoveredEdge && !edgePopup && (() => {
            const edge = edges.find(e => e.id === hoveredEdge.edgeId);
            if (!edge) return null;
            const src  = nodeMap.get(edge.from);
            const tgt  = nodeMap.get(edge.to);
            const meta = EDGE_META[edge.type];
            return (
              <div style={{
                position: "absolute",
                left: hoveredEdge.x + 14, top: hoveredEdge.y - 36,
                pointerEvents: "none", zIndex: 20,
                background: "var(--surface)", border: "1px solid var(--border-2)",
                borderRadius: 7, padding: "5px 9px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                display: "flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.symbol}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, fontFamily: "var(--font-manrope), sans-serif" }}>{meta.label}</span>
                <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "var(--font-jetbrains-mono), monospace" }}>—</span>
                <span style={{ fontSize: 11, color: "var(--on-surface-variant)", fontFamily: "var(--font-manrope), sans-serif" }}>
                  {src?.role ?? src?.name} → {tgt?.role ?? tgt?.name}
                </span>
              </div>
            );
          })()}

          {/* Legend panel (bottom-left) */}
          <div style={{ position: "absolute", bottom: 14, left: 14, zIndex: 10 }}>
            {legendOpen ? (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", minWidth: 226 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
                    Connection types
                  </span>
                  <button onClick={() => setLegendOpen(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: 12, padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center" }}
                    title="Collapse legend"
                  >×</button>
                </div>
                {(Object.entries(EDGE_META) as [EdgeType, typeof EDGE_META[EdgeType]][]).map(([, cfg]) => (
                  <div key={cfg.label} style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 5, lineHeight: 1.3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, width: 14, textAlign: "center" as const, flexShrink: 0 }}>{cfg.symbol}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, fontFamily: "var(--font-manrope), sans-serif", flexShrink: 0 }}>{cfg.label}</span>
                    <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: "var(--font-jetbrains-mono), monospace" }}>— {cfg.desc}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setLegendOpen(true)}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, width: 28, height: 28, cursor: "pointer", color: "var(--on-surface-variant)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                title="Show connection legend"
              >?</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
