"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Zap, Check, RefreshCw } from "lucide-react";
import { ExportBar } from "@/components/project-screen/tabs/PlanExport";
import { hexRgba } from "@/components/project-screen/tagColors";
import type { SimulationRun } from "@/components/thinking-graph/runtime/runtimeTypes";
import { buildPlanApiRequest } from "@/lib/thinking-graph/plan/planContextBuilder";
import type {
  GeneratedPlanOutput,
  PlanApiResponse,
  PlanFormatId,
  PlanTaskItem,
  PlanSprintGroup,
  PlanPhaseGroup,
  PhaseItemDependent,
  BacklogItemDependent,
  RoleGroup,
  RoleItemDependent,
} from "@/lib/thinking-graph/plan/planTypes";

// ── Types (local display layer) ────────────────────────────────────────────────

type TaskType = "epic" | "story" | "task";
type Priority = "high" | "medium" | "low";

type DisplayTask = {
  id: string;
  type: TaskType;
  title: string;
  synth?: string;
  role?: string;
  points?: number;
  desc?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<TaskType, { bg: string; border: string; text: string }> = {
  epic:  { bg: "oklch(0.60 0.22 295 / 0.14)", border: "oklch(0.60 0.22 295 / 0.35)", text: "oklch(0.72 0.18 295)" },
  story: { bg: "oklch(0.60 0.18 240 / 0.14)", border: "oklch(0.60 0.18 240 / 0.35)", text: "oklch(0.72 0.16 240)" },
  task:  { bg: "var(--surface-2)",              border: "var(--border)",                text: "var(--t3)"          },
};

const FORMATS: { id: PlanFormatId; icon: string; label: string; sub: string }[] = [
  { id: "sprints", icon: "⚡", label: "By Sprints",   sub: "2-week iterations"        },
  { id: "phases",  icon: "🏁", label: "By Phases",    sub: "Prototype · MVP · Launch" },
  { id: "backlog", icon: "📋", label: "Flat Backlog",  sub: "Single task list"         },
  { id: "roles",   icon: "🤖", label: "By Roles",     sub: "Digital Twin"             },
];

const PRIORITY_CFG: Record<Priority, { label: string; color: string }> = {
  high:   { label: "High",   color: "oklch(0.72 0.18 75)"  },
  medium: { label: "Medium", color: "oklch(0.62 0.22 265)" },
  low:    { label: "Low",    color: "var(--t3)"            },
};

const SYNTH_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#3b82f6", "#ec4899"];

// Append alpha to a bare oklch() color string that has no alpha yet
const oa = (color: string, a: number) =>
  color.startsWith("var(") || color.includes("/") ? color : color.replace(")", ` / ${a})`);

// ── Data mapping helpers ───────────────────────────────────────────────────────

function apiTaskToDisplay(t: PlanTaskItem): DisplayTask {
  return {
    id:     t.id,
    type:   t.type,
    title:  t.title,
    synth:  t.source_synthetic || undefined,
    role:   t.role             || undefined,
    points: t.story_points,
    desc:   t.description      || undefined,
  };
}

function apiPhaseItemToDisplay(t: PhaseItemDependent): DisplayTask {
  return {
    id:     t.id,
    type:   t.type,
    title:  t.title,
    synth:  t.source_synthetic || undefined,
    role:   t.role             || undefined,
    points: t.story_points,
    desc:   t.description      || undefined,
  };
}

function apiRoleItemToDisplay(t: RoleItemDependent, groupTitle: string): DisplayTask {
  return {
    id:     t.id,
    type:   t.type,
    title:  t.title,
    synth:  groupTitle,
    role:   t.role || undefined,
    points: t.story_points,
    desc:   t.description || undefined,
  };
}

// ── Primitives ─────────────────────────────────────────────────────────────────

function PlanAvatar({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0] ?? "").slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: hexRgba(color, 0.18), color, border: `0.5px solid ${hexRgba(color, 0.4)}` }}
    >
      {initials}
    </div>
  );
}

function TypeBadge({ type }: { type: TaskType }) {
  const c = PLAN_COLORS[type];
  const LABELS: Record<TaskType, string> = { epic: "Epic", story: "Story", task: "Task" };
  return (
    <span
      className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold uppercase tracking-[0.05em] shrink-0 font-[var(--font-head)]"
      style={{ background: c.bg, border: `0.5px solid ${c.border}`, color: c.text }}
    >
      {LABELS[type]}
    </span>
  );
}

function Points({ n }: { n?: number }) {
  if (n === undefined) return null;
  return (
    <span className="inline-flex items-center justify-center w-[26px] h-[20px] rounded-[5px] bg-[var(--surface-2)] border border-[var(--border)] text-[10px] font-bold text-[var(--t3)] font-[var(--font-jetbrains-mono)] shrink-0">
      {n}
    </span>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────────────────

function TaskRow({ task, colorMap, compact = false }: {
  task: DisplayTask;
  colorMap: Record<string, string>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sc = (task.synth && colorMap[task.synth]) ?? "#8890b0";

  return (
    <div className="rounded-[8px] border border-[var(--border)] overflow-hidden transition-colors" style={{ background: open ? "var(--surface-2)" : "transparent" }}>
      <div
        onClick={() => task.desc && setOpen(o => !o)}
        className={`flex items-center gap-[9px] ${compact ? "px-[10px] py-[7px]" : "px-[12px] py-[9px]"} ${task.desc ? "cursor-pointer" : ""}`}
      >
        {task.desc ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-[var(--t3)] transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : <span className="w-[10px] shrink-0" />}
        <TypeBadge type={task.type} />
        <span className="flex-1 text-[12px] font-medium text-[var(--on-surface)] leading-[1.4] min-w-0">{task.title}</span>
        {task.synth && (
          <div className="flex items-center gap-[5px] shrink-0">
            <PlanAvatar name={task.synth} color={sc} size={18} />
            <span className="text-[10px] text-[var(--t3)] whitespace-nowrap">{task.role}</span>
          </div>
        )}
        <Points n={task.points} />
      </div>
      {open && task.desc && (
        <div className="px-[12px] pb-[12px] pt-[10px] pl-[31px] text-[12px] text-[var(--on-surface-variant)] leading-[1.7] border-t border-[var(--border)]">
          {task.desc}
        </div>
      )}
    </div>
  );
}

// ── SprintsView ────────────────────────────────────────────────────────────────

function SprintSection({ sprint, colorMap }: { sprint: PlanSprintGroup; colorMap: Record<string, string> }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className="font-[var(--font-head)] font-bold text-[14px] text-[var(--on-surface)]">{sprint.title}</span>
          <div className="text-[11px] text-[var(--t3)] mt-[2px]">{sprint.goal}</div>
        </div>
        <div className="flex items-center gap-[6px] shrink-0">
          <span className="text-[11px] text-[var(--t3)]">{sprint.items.length} tasks</span>
          <span className="text-[11px] font-bold text-[var(--primary)] px-[8px] py-[2px] rounded-full bg-[var(--primary-container)] border border-[var(--primary-border)]">{sprint.total_points} SP</span>
        </div>
      </div>
      <div className="p-[10px] flex flex-col gap-[4px]">
        {sprint.items.map(t => <TaskRow key={t.id} task={apiTaskToDisplay(t)} colorMap={colorMap} />)}
      </div>
    </div>
  );
}

// ── PhasesView ─────────────────────────────────────────────────────────────────

function PhasesView({ groups, colorMap }: { groups: PlanPhaseGroup[]; colorMap: Record<string, string> }) {
  const PHASE_COLORS = [
    "oklch(0.62 0.22 265)",
    "oklch(0.65 0.18 160)",
    "oklch(0.72 0.18 75)",
    "oklch(0.65 0.20 35)",
    "oklch(0.68 0.18 200)",
  ];
  return (
    <div className="flex flex-col">
      {groups.map((phase, pi) => {
        const color = PHASE_COLORS[pi % PHASE_COLORS.length]!;
        const total = phase.items.reduce((s, t) => s + (t.story_points ?? 0), 0);
        return (
          <div key={phase.id || pi} className="flex gap-0">
            <div className="w-[48px] flex flex-col items-center shrink-0">
              <div className="w-[14px] h-[14px] rounded-full mt-[18px] shrink-0 z-10"
                style={{ background: color, border: "2px solid var(--background)", boxShadow: `0 0 0 2px ${oa(color, 0.35)}` }} />
              {pi < groups.length - 1 && <div className="flex-1 w-[1.5px] bg-[var(--border)] mt-1" />}
            </div>
            <div className="flex-1 pb-7 min-w-0">
              <div className="mb-[10px] pt-3">
                <div className="flex items-center gap-2 mb-[3px] flex-wrap">
                  <span className="font-[var(--font-head)] font-extrabold text-[15px] text-[var(--on-surface)] tracking-[-0.02em]">{phase.title}</span>
                  {total > 0 && (
                    <span className="text-[11px] font-bold px-[7px] py-[1px] rounded-full ml-auto"
                      style={{ color, background: oa(color, 0.1), border: `0.5px solid ${oa(color, 0.35)}` }}>
                      {total} SP
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[var(--on-surface-variant)] mb-2 leading-[1.6]">{phase.description}</div>
                {phase.exit_criteria && (
                  <div className="flex items-start gap-[7px] px-[10px] py-[8px] rounded-[8px] mb-3 text-[11px] leading-[1.55]"
                    style={{ color, background: oa(color, 0.07), border: `0.5px solid ${oa(color, 0.25)}` }}>
                    <Check size={11} className="shrink-0 mt-[1px]" />
                    <span>{phase.exit_criteria}</span>
                  </div>
                )}
              </div>
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                {phase.items.map((t, ti) => (
                  <div key={t.id} style={{ borderBottom: ti < phase.items.length - 1 ? "0.5px solid var(--border)" : "none" }}>
                    <TaskRow task={apiPhaseItemToDisplay(t)} colorMap={colorMap} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── RoleCard ───────────────────────────────────────────────────────────────────

function IOChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-[4px]">
      {items.map((text, i) => (
        <span key={i} className="inline-block text-[10px] px-[8px] py-[2px] rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--on-surface-variant)] truncate max-w-[200px]" title={text}>
          {text}
        </span>
      ))}
    </div>
  );
}

function RoleCard({ group, colorMap }: { group: RoleGroup; colorMap: Record<string, string> }) {
  const [mode, setMode] = useState<"human" | "agent">(group.execution_mode);
  const color = colorMap[group.title] ?? "#8890b0";
  const total = group.items.reduce((s, t) => s + t.story_points, 0);

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 py-[13px] border-b border-[var(--border)] flex items-center gap-3" style={{ background: hexRgba(color, 0.05) }}>
        <PlanAvatar name={group.title} color={color} size={36} />
        <div className="flex-1 min-w-0">
          <div className="font-[var(--font-head)] font-bold text-[13px] text-[var(--on-surface)]">{group.title}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-[var(--t3)]">{total} SP</span>
          <div className="flex rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden">
            {(["human", "agent"] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className="px-[10px] py-[4px] text-[10px] font-semibold cursor-pointer border-none transition-all"
                style={{
                  background: mode === m ? (m === "agent" ? "var(--primary-container)" : "var(--surface-3)") : "transparent",
                  color: mode === m ? (m === "agent" ? "var(--primary)" : "var(--on-surface)") : "var(--t3)",
                }}>
                {m === "human" ? "Human" : "Agent"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(group.inputs.length > 0 || group.outputs.length > 0) && (
        <div className="px-4 py-3 border-b border-[var(--border)] grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--t3)] mb-[6px]">Receives</div>
            <IOChips items={group.inputs} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--t3)] mb-[6px]">Delivers</div>
            <IOChips items={group.outputs} />
          </div>
        </div>
      )}

      <div className="p-[10px] flex flex-col gap-[4px]">
        {group.items.map(t => (
          <TaskRow key={t.id} task={apiRoleItemToDisplay(t, group.title)} colorMap={colorMap} compact />
        ))}
      </div>

      {mode === "agent" && (
        <div className="px-[14px] py-[8px] border-t border-[var(--border)] bg-[var(--primary-container)] flex items-center gap-[6px] text-[11px] text-[var(--primary)]">
          <Zap size={11} />
          Tasks will be executed by AI agent on export
        </div>
      )}
    </div>
  );
}

// ── BacklogView ────────────────────────────────────────────────────────────────

type SortKey = "priority" | "points";
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function BacklogRow({ task, colorMap }: { task: BacklogItemDependent; colorMap: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const sc = (task.source_synthetic && colorMap[task.source_synthetic]) ?? "#8890b0";
  const pc = PRIORITY_CFG[task.priority];

  return (
    <div className="rounded-[7px] border border-[var(--border)] overflow-hidden transition-colors" style={{ background: open ? "var(--surface-2)" : "var(--surface)" }}>
      <div
        onClick={() => task.description && setOpen(o => !o)}
        className="grid items-center gap-[10px] px-3 py-[8px]"
        style={{ gridTemplateColumns: "20px 56px 1fr 90px 48px", cursor: task.description ? "pointer" : "default" }}
      >
        <span title={pc.label} className="inline-block w-[7px] h-[7px] rounded-full shrink-0" style={{ background: pc.color }} />
        <TypeBadge type={task.type} />
        <span className="text-[12px] font-medium text-[var(--on-surface)] truncate min-w-0">
          {task.description && (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="mr-[5px] text-[var(--t3)] inline align-middle" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
              <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {task.title}
        </span>
        <div className="flex items-center gap-[5px] min-w-0">
          {task.source_synthetic && <PlanAvatar name={task.source_synthetic} color={sc} size={16} />}
          <span className="text-[10px] text-[var(--t3)] truncate">{task.role?.split(" ")[0]}</span>
        </div>
        <Points n={task.story_points} />
      </div>
      {open && task.description && (
        <div className="px-3 pb-[10px] pt-2 pl-[42px] text-[12px] text-[var(--on-surface-variant)] leading-[1.7] border-t border-[var(--border)]">
          {task.description}
        </div>
      )}
    </div>
  );
}

function BacklogView({ items, colorMap }: { items: BacklogItemDependent[]; colorMap: Record<string, string> }) {
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [filterType, setFilterType] = useState<TaskType | "all">("all");

  const filtered = items
    .filter(t => filterType === "all" || t.type === filterType)
    .sort((a, b) =>
      sortBy === "priority"
        ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        : b.story_points - a.story_points,
    );

  const totalSP = filtered.reduce((s, t) => s + t.story_points, 0);

  const pill = (active: boolean) =>
    `px-[10px] py-[4px] rounded-[6px] border text-[11px] cursor-pointer font-[var(--font-body)] transition-all ${
      active ? "border-[var(--primary)] bg-[var(--primary-container)] text-[var(--primary)] font-semibold" : "border-[var(--border)] bg-transparent text-[var(--t3)]"
    }`;

  return (
    <div>
      <div className="flex items-center gap-4 mb-[14px] flex-wrap">
        <div className="flex items-center gap-[5px]">
          <span className="text-[10px] text-[var(--t3)] font-bold uppercase tracking-[0.06em]">Sort</span>
          {(["priority", "points"] as SortKey[]).map(v => (
            <button key={v} type="button" className={pill(sortBy === v)} onClick={() => setSortBy(v)}>
              {v === "priority" ? "Priority" : "SP"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-[5px]">
          <span className="text-[10px] text-[var(--t3)] font-bold uppercase tracking-[0.06em]">Type</span>
          {(["all", "epic", "story", "task"] as const).map(v => (
            <button key={v} type="button" className={pill(filterType === v)} onClick={() => setFilterType(v)}>
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-[var(--t3)]">{filtered.length} tasks · {totalSP} SP</span>
      </div>

      <div className="grid gap-[10px] px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--t3)] border-b border-[var(--border)] mb-[2px]"
        style={{ gridTemplateColumns: "20px 56px 1fr 90px 48px" }}>
        <span /><span>Type</span><span>Task</span><span>Owner</span><span className="text-right">SP</span>
      </div>
      <div className="flex flex-col gap-[1px] mt-[2px]">
        {filtered.map(t => <BacklogRow key={t.id} task={t} colorMap={colorMap} />)}
      </div>
    </div>
  );
}


// ── Format picker ──────────────────────────────────────────────────────────────

function FormatCard({ fmt, selected, onClick }: { fmt: typeof FORMATS[number]; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="p-[14px] rounded-[12px] cursor-pointer transition-all flex items-start gap-3"
      style={{ border: `0.5px solid ${selected ? "var(--primary)" : "var(--border)"}`, background: selected ? "var(--primary-container)" : "var(--surface)" }}
    >
      <div className="w-[16px] h-[16px] rounded-full shrink-0 mt-[1px] flex items-center justify-center transition-all"
        style={{ border: `1.5px solid ${selected ? "var(--primary)" : "var(--border-solid)"}`, background: selected ? "var(--primary)" : "transparent" }}>
        {selected && <div className="w-[6px] h-[6px] rounded-full bg-white" />}
      </div>
      <div>
        <div className="text-[13px] font-semibold mb-[2px]" style={{ color: selected ? "var(--on-surface)" : "var(--on-surface-variant)" }}>{fmt.label}</div>
        <div className="text-[11px] text-[var(--t3)]">{fmt.sub}</div>
      </div>
    </div>
  );
}

function FormatTabs({ selected, generated, onChange }: {
  selected: PlanFormatId;
  generated: Partial<Record<PlanFormatId, GeneratedPlanOutput>>;
  onChange: (f: PlanFormatId) => void;
}) {
  return (
    <div className="flex gap-[6px] flex-wrap mb-5">
      {FORMATS.map(f => {
        const isDone = !!generated[f.id];
        const isActive = selected === f.id;
        return (
          <button key={f.id} type="button" onClick={() => onChange(f.id)}
            className="flex items-center gap-[6px] px-3 py-[5px] rounded-[8px] text-[12px] font-medium cursor-pointer transition-all font-[var(--font-body)]"
            style={{
              border: `0.5px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
              background: isActive ? "var(--primary-container)" : "var(--surface-2)",
              color: isActive ? "var(--primary)" : isDone ? "var(--on-surface-variant)" : "var(--t3)",
            }}>
            {f.icon} {f.label}
            {isDone && <Check size={10} style={{ marginLeft: 1, color: isActive ? "var(--primary)" : "var(--on-surface-variant)" }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── States ─────────────────────────────────────────────────────────────────────

function PlanEmpty({ selectedFormat, onSelectFormat, onGenerate, isLoading }: {
  selectedFormat: PlanFormatId;
  onSelectFormat: (f: PlanFormatId) => void;
  onGenerate: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-8 py-10">
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-8">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[24px] mx-auto mb-[14px]">📐</div>
          <div className="font-[var(--font-head)] font-bold text-[18px] mb-2 tracking-[-0.02em] text-[var(--on-surface)]">Implementation Plan</div>
          <p className="text-[13px] text-[var(--on-surface-variant)] leading-[1.75] max-w-[380px] mx-auto">
            The orchestrator will build a step-by-step plan based on all synthetic recommendations. Choose a format to get started.
          </p>
        </div>
        <div className="mb-6">
          <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[var(--t3)] mb-3">Plan format</div>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map(f => <FormatCard key={f.id} fmt={f} selected={selectedFormat === f.id} onClick={() => onSelectFormat(f.id)} />)}
          </div>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading}
          className="w-full py-[11px] rounded-[10px] bg-[var(--primary)] border-none text-white text-[13px] font-semibold cursor-pointer flex items-center justify-center gap-[7px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-[var(--font-body)]"
        >
          {isLoading ? <span className="w-[13px] h-[13px] border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap size={13} />}
          {isLoading ? "Generating…" : "Generate Plan"}
        </button>
      </div>
    </div>
  );
}

function PlanIdle({ format, formatTabs, onGenerate, isLoading }: {
  format: PlanFormatId;
  formatTabs: ReactNode;
  onGenerate: () => void;
  isLoading: boolean;
}) {
  const fmt = FORMATS.find(f => f.id === format)!;
  return (
    <div className="px-7 pt-[22px] pb-6">
      <div className="max-w-[780px] mx-auto">
        {formatTabs}
        <div className="min-h-[35vh] flex flex-col items-center justify-center gap-4 py-10">
          <div className="text-[32px]">{fmt.icon}</div>
          <div className="text-center">
            <div className="text-[14px] font-semibold text-[var(--on-surface)] mb-1">{fmt.label}</div>
            <p className="text-[12px] text-[var(--t3)] max-w-[300px] leading-[1.7]">
              No plan generated in this format yet for this iteration.
            </p>
          </div>
          <button type="button" onClick={onGenerate} disabled={isLoading}
            className="flex items-center gap-2 px-5 py-[9px] rounded-[10px] bg-[var(--primary)] border-none text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-[var(--font-body)]">
            {isLoading
              ? <span className="w-[12px] h-[12px] border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Zap size={12} />}
            {isLoading ? "Generating…" : "Generate in this format"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanGenerating() {
  const steps = ["Analyzing recommendations…", "Identifying dependencies…", "Grouping into phases…", "Estimating effort…", "Assigning roles…", "Finalizing plan…"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 480);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5">
      <div className="w-[44px] h-[44px] rounded-[12px] bg-[var(--primary-container)] border border-[var(--primary-border)] flex items-center justify-center">
        <span className="w-[16px] h-[16px] border-[2.5px] border-[var(--primary)] border-t-transparent rounded-full inline-block animate-spin" />
      </div>
      <div className="text-center">
        <div className="text-[13px] font-semibold text-[var(--on-surface)] mb-[6px]">Generating plan…</div>
        <div className="text-[12px] text-[var(--t3)] h-[18px]">{steps[step]}</div>
      </div>
      <div className="flex gap-[5px]">
        {steps.map((_, i) => (
          <div key={i} className="w-[6px] h-[6px] rounded-full transition-colors" style={{ background: i <= step ? "var(--primary)" : "var(--border-solid)" }} />
        ))}
      </div>
    </div>
  );
}

function PlanGenerated({ plan, colorMap, formatTabs }: {
  plan: GeneratedPlanOutput;
  colorMap: Record<string, string>;
  formatTabs: ReactNode;
}) {
  const fmtLabel = FORMATS.find(f => f.id === plan.format)?.label ?? plan.format;

  const totalSP = (() => {
    if (plan.format === "sprints") return plan.groups.reduce((a, g) => a + g.total_points, 0);
    if (plan.format === "phases")  return plan.groups.flatMap(p => p.items).reduce((a, t) => a + (t.story_points ?? 0), 0);
    if (plan.format === "backlog") return plan.groups.flatMap(g => g.items).reduce((a, t) => a + t.story_points, 0);
    if (plan.format === "roles")   return plan.groups.flatMap(g => g.items).reduce((a, t) => a + t.story_points, 0);
    return 0;
  })();

  const totalTasks = (() => {
    if (plan.format === "sprints") return plan.groups.reduce((a, g) => a + g.items.length, 0);
    if (plan.format === "phases")  return plan.groups.reduce((a, p) => a + p.items.length, 0);
    if (plan.format === "backlog") return plan.groups.reduce((a, g) => a + g.items.length, 0);
    if (plan.format === "roles")   return plan.groups.reduce((a, g) => a + g.items.length, 0);
    return 0;
  })();

  return (
    <div className="px-7 pt-[22px] pb-6">
      <div className="max-w-[780px] mx-auto">
        {formatTabs}
        <div className="flex items-start gap-4 mb-5 flex-wrap">
          <div>
            <div className="font-[var(--font-head)] font-extrabold text-[16px] tracking-[-0.02em] mb-1 text-[var(--on-surface)]">
              {plan.title || `Implementation Plan · ${fmtLabel}`}
            </div>
            <div className="flex items-center gap-[10px] text-[12px] text-[var(--t3)]">
              <span>{totalTasks} tasks</span>
              <span className="w-[3px] h-[3px] rounded-full bg-[var(--t3)]" />
              <span>{totalSP} story points</span>
            </div>
          </div>
        </div>

        {plan.format === "sprints" && (
          <div className="flex flex-col gap-[14px]">
            {plan.summary && (
              <p className="text-[12px] text-[var(--on-surface-variant)] leading-[1.7] px-[2px]">{plan.summary}</p>
            )}
            {plan.groups.map(g => <SprintSection key={g.id} sprint={g} colorMap={colorMap} />)}
          </div>
        )}
        {plan.format === "phases" && (
          <>
            {plan.summary && (
              <p className="text-[12px] text-[var(--on-surface-variant)] leading-[1.7] px-[2px] mb-4">{plan.summary}</p>
            )}
            <PhasesView groups={plan.groups} colorMap={colorMap} />
          </>
        )}
        {plan.format === "backlog" && (
          <>
            {plan.summary && (
              <p className="text-[12px] text-[var(--on-surface-variant)] leading-[1.7] px-[2px] mb-4">{plan.summary}</p>
            )}
            <BacklogView items={plan.groups[0]?.items ?? []} colorMap={colorMap} />
          </>
        )}
        {plan.format === "roles" && (
          <>
            {plan.summary && (
              <p className="text-[12px] text-[var(--on-surface-variant)] leading-[1.7] px-[2px] mb-4">{plan.summary}</p>
            )}
            <div className="flex flex-col gap-3">
              {plan.groups.map(g => <RoleCard key={g.id} group={g} colorMap={colorMap} />)}
            </div>
          </>
        )}

        <ExportBar format={plan.format} formatLabel={fmtLabel} plan={plan} />
      </div>
    </div>
  );
}

// ── PlanTab ────────────────────────────────────────────────────────────────────

type PlanTabProps = {
  activeRun: SimulationRun | null;
  userAnswers?: { question: string; answer: string }[];
};

export function PlanTab({ activeRun, userAnswers = [] }: PlanTabProps) {
  const [phase, setPhase] = useState<"empty" | "generating" | "done" | "idle" | "error">("empty");
  const [format, setFormat] = useState<PlanFormatId>("sprints");
  const [plansByFormat, setPlansByFormat] = useState<Partial<Record<PlanFormatId, GeneratedPlanOutput>>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const hasAnyPlan = Object.keys(plansByFormat).length > 0;
  const currentPlan = plansByFormat[format] ?? null;

  useEffect(() => {
    setPlansByFormat({});
    setPhase("empty");
    setFormat("sprints");
    setErrorMsg("");

    if (!activeRun) return;

    void fetch(`/api/thinking-graph/plan?runId=${encodeURIComponent(activeRun.id)}`)
      .then(r => r.json() as Promise<{ plans: Partial<Record<PlanFormatId, GeneratedPlanOutput>> }>)
      .then(data => {
        const loaded = data?.plans;
        if (!loaded) return;
        const formats = Object.keys(loaded) as PlanFormatId[];
        if (formats.length === 0) return;
        setPlansByFormat(loaded);
        setFormat(formats[0]!);
        setPhase("done");
      })
      .catch(() => {});
  }, [activeRun?.id]);

  const synthColorMap = useMemo<Record<string, string>>(() => {
    if (!activeRun) return {};
    return Object.fromEntries(
      activeRun.synthetics
        .filter(s => s.nodeRole !== "advisor")
        .map((s, i) => [s.name, SYNTH_COLORS[i % SYNTH_COLORS.length]!]),
    );
  }, [activeRun]);

  const handleFormatChange = (f: PlanFormatId) => {
    if (phase === "generating") return;
    setFormat(f);
    if (plansByFormat[f]) {
      setPhase("done");
    } else if (hasAnyPlan) {
      setPhase("idle");
    }
  };

  const generate = async () => {
    if (!activeRun) return;
    setIsLoading(true);
    setPhase("generating");
    setErrorMsg("");

    const body = buildPlanApiRequest(activeRun, format, userAnswers);

    try {
      const res = await fetch("/api/thinking-graph/plan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = (await res.json()) as PlanApiResponse;
      if (!data.ok) throw new Error(data.error);
      setPlansByFormat(prev => ({ ...prev, [format]: data.plan }));
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Plan generation failed.");
      setPhase("error");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTabs = hasAnyPlan ? (
    <FormatTabs selected={format} generated={plansByFormat} onChange={handleFormatChange} />
  ) : null;

  if (phase === "error") {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-[14px] p-10">
        <div className="w-[52px] h-[52px] rounded-[14px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[22px]">⚠️</div>
        <div className="text-[14px] font-medium text-[var(--on-surface-variant)]">Generation failed</div>
        <p className="text-[12px] text-[var(--t3)] max-w-[340px] text-center leading-[1.7]">{errorMsg}</p>
        <button type="button" onClick={() => setPhase(hasAnyPlan ? "idle" : "empty")}
          className="flex items-center gap-2 px-4 py-[7px] rounded-[8px] border border-[var(--border)] bg-transparent text-[var(--on-surface-variant)] text-[12px] cursor-pointer hover:border-[var(--primary-border)] transition-colors">
          <RefreshCw size={12} />Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {phase === "empty"      && <PlanEmpty selectedFormat={format} onSelectFormat={handleFormatChange} onGenerate={generate} isLoading={isLoading} />}
      {phase === "generating" && (
        <div className="px-7 pt-[22px]">
          <div className="max-w-[780px] mx-auto">
            {formatTabs}
            <PlanGenerating />
          </div>
        </div>
      )}
      {phase === "done" && currentPlan && (
        <PlanGenerated plan={currentPlan} colorMap={synthColorMap} formatTabs={formatTabs} />
      )}
      {phase === "idle" && (
        <PlanIdle format={format} formatTabs={formatTabs} onGenerate={generate} isLoading={isLoading} />
      )}
    </>
  );
}
