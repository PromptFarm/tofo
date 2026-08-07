"use client";

import { useState } from "react";
import { Network, Plus } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { hexRgba } from "@/components/project-screen/tagColors";
import { AddMemberModal } from "@/app/teams/AddMemberModal";
import type { SyntheticNode, SyntheticEdge } from "@/lib/planning/types";
import { useRunContext } from "@/lib/run-context";
import { getDeleteSyntheticDialogDescription } from "./deleteSyntheticDialogState";
import { getTeamSaveLabel } from "./teamSaveIndicator";

const EDGE_CHIP_META = {
  oversight:     { symbol: "✓", label: "Oversight",     color: "#34d399" },
  tension:       { symbol: "↔", label: "Tension",       color: "#f87171" },
  amplification: { symbol: "↑", label: "Amplification", color: "#60a5fa" },
} as const;

const AGENT_COLORS: Record<string, string> = {
  UX: "#a78bfa", U2: "#a78bfa",
  EN: "#60a5fa", B2: "#60a5fa",
  PM: "#34d399", QA: "#34d399", AT: "#34d399",
  FN: "#fbbf24", FO: "#fbbf24",
  MK: "#fb923c", BR: "#fb923c",
  RS: "#38bdf8", AN: "#38bdf8",
  PV: "#e879f9", LO: "#e879f9",
  MD: "#f472b6", CS: "#f472b6",
  CN: "#4ade80", GR: "#4ade80",
  MB: "#818cf8", PT: "#818cf8",
  CM: "#c084fc",
};

function agentColor(code: string): string {
  return AGENT_COLORS[code] ?? "#8890b0";
}

function FixedNodeRow({
  icon, label, desc, onClick,
}: {
  icon: string; label: string; desc: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-[14px] py-[10px] rounded-[10px] bg-[var(--surface)] border border-[var(--border)] opacity-70 ${onClick ? "cursor-pointer hover:opacity-100 hover:border-[var(--primary-border)] transition-all" : ""}`}
    >
      <div className="w-[34px] h-[34px] rounded-[9px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-base shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] text-[var(--on-surface)]">{label}</div>
        <div className="text-[11px] text-[var(--t3)]">{desc}</div>
      </div>
      <span className="shrink-0 text-[10px] font-mono px-[7px] py-[2px] rounded-full border border-[var(--border)] text-[var(--t3)] bg-[var(--surface-2)]">
        Fixed
      </span>
    </div>
  );
}

type SyntheticsTabProps = {
  synthetics: SyntheticNode[];
  edges?: SyntheticEdge[];
  isReadOnly?: boolean;
  hasRun?: boolean;
  onOpenGraph: () => void;
  onNavigateTo: (tab: "idea" | "report") => void;
  onRemove?: (id: string) => void;
  onAdd?: (templateId: string) => void;
  onAddCustom?: (name: string, roleDesc: string) => void;
};

export function SyntheticsTab({
  synthetics,
  edges = [],
  isReadOnly = false,
  hasRun = false,
  onOpenGraph,
  onNavigateTo,
  onRemove,
  onAddCustom,
}: SyntheticsTabProps) {
  const agents = synthetics.filter((s) => s.nodeRole !== "advisor");
  const agentById = new Map(agents.map(a => [a.id, a]));
  const semanticEdges = edges.filter(e =>
    e.type === "oversight" || e.type === "tension" || e.type === "amplification"
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDeleteSynthetic, setPendingDeleteSynthetic] = useState<SyntheticNode | null>(null);
  const { teamSaveState } = useRunContext();

  if (process.env.NODE_ENV !== "production") {
    console.log("[team-save][synthetics-tab][render]", {
      synthetics: synthetics.map((synthetic) => ({
        id: synthetic.id,
        name: synthetic.name,
        role: synthetic.role,
        nodeRole: synthetic.nodeRole ?? null,
        status: synthetic.status,
      })),
      agents: agents.map((synthetic) => ({
        id: synthetic.id,
        name: synthetic.name,
        role: synthetic.role,
        nodeRole: synthetic.nodeRole ?? null,
        status: synthetic.status,
      })),
    });
  }

  const teamSaveLabel = getTeamSaveLabel(teamSaveState);

  return (
    <>
      <div className="flex-1 overflow-auto px-7 py-6">
        <div className="max-w-[680px] flex flex-col gap-[7px]">

          {/* Header */}
          <div className="flex items-center justify-between mb-[10px]">
            <div>
              <div className="font-bold text-[15px] text-[var(--on-surface)] font-[var(--font-head)]">
                Simulation Team
              </div>
              <div className="text-[12px] text-[var(--t3)]">
                {agents.length} of {agents.length} active on canvas
              </div>
              {teamSaveLabel ? (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--t3)]">
                  {teamSaveState === "saving" ? (
                    <span className="w-[10px] h-[10px] rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin inline-block" />
                  ) : null}
                  <span>{teamSaveLabel}</span>
                </div>
              ) : null}
            </div>
            {!isReadOnly ? (
              hasRun ? (
                <button
                  type="button"
                  onClick={onOpenGraph}
                  className="flex items-center gap-[6px] px-[11px] py-[7px] rounded-[8px] border border-[var(--border)] bg-transparent text-[12px] text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:border-[var(--primary-border)] cursor-pointer transition-colors"
                >
                  <Network size={12} />
                  Configure connections
                </button>
              ) : (
                <div className="relative group/confbtn">
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-[6px] px-[11px] py-[7px] rounded-[8px] border border-[var(--border)] bg-transparent text-[12px] text-[var(--t3)] cursor-not-allowed opacity-50"
                  >
                    <Network size={12} />
                    Configure connections
                  </button>
                  <div className="absolute bottom-full right-0 mb-[6px] px-[10px] py-[6px] rounded-[8px] bg-[var(--surface-3)] border border-[var(--border)] text-[10px] text-[var(--on-surface-variant)] whitespace-nowrap opacity-0 group-hover/confbtn:opacity-100 transition-opacity pointer-events-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    Run the simulation first to unlock
                  </div>
                </div>
              )
            ) : null}
          </div>

          {/* Fixed: Idea */}
          <FixedNodeRow icon="💡" label="Idea" desc="Starting point · always present" onClick={() => onNavigateTo("idea")} />

          {/* Agents */}
          {agents.map((s) => {
            const color = agentColor(s.code);
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 px-[14px] py-[10px] rounded-[10px] border transition-all"
                style={{
                  background: hexRgba(color, 0.04),
                  borderColor: hexRgba(color, 0.21),
                }}
              >
                <div
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ background: hexRgba(color, 0.15), color }}
                >
                  {s.code}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] text-[var(--on-surface)] mb-[2px]">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-[var(--t3)] truncate">{s.role}</div>
                  {(() => {
                    const chips = semanticEdges
                      .filter(e => e.from === s.id || e.to === s.id)
                      .map(e => {
                        const partnerId = e.from === s.id ? e.to : e.from;
                        const partner   = agentById.get(partnerId);
                        const meta      = EDGE_CHIP_META[e.type as keyof typeof EDGE_CHIP_META];
                        if (!partner || !meta) return null;
                        const outgoing = e.from === s.id;
                        const isTension = e.type === "tension";
                        const label = isTension
                          ? `${meta.symbol} ${partner.code}`
                          : outgoing
                            ? `${meta.symbol}→ ${partner.code}`
                            : `←${meta.symbol} ${partner.code}`;
                        const title = `${meta.label}${isTension ? "" : outgoing ? " (outgoing)" : " (incoming)"} · ${partner.name}`;
                        return { key: e.id, label, title, color: meta.color };
                      })
                      .filter((c): c is NonNullable<typeof c> => c !== null);
                    if (chips.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-[4px] mt-[5px]">
                        {chips.map(c => (
                          <span
                            key={c.key}
                            title={c.title}
                            className="inline-flex items-center px-[5px] py-[1px] rounded-[4px] text-[10px] font-mono leading-tight"
                            style={{ color: c.color, background: hexRgba(c.color, 0.1), border: `1px solid ${hexRgba(c.color, 0.25)}` }}
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {!isReadOnly ? (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteSynthetic(s)}
                    className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[7px] border border-[var(--border)] bg-transparent text-[11px] text-[var(--t3)] hover:text-[var(--on-surface)] cursor-pointer transition-all shrink-0"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })}

          {agents.length === 0 && (
            <div className="py-8 text-center text-[13px] text-[var(--t3)]">
              No agents on canvas yet.
            </div>
          )}

          {/* Fixed: Report */}
          <FixedNodeRow icon="📋" label="Report" desc="Final output · always present" onClick={() => onNavigateTo("report")} />

          {/* Add member button */}
          {!isReadOnly ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center justify-center gap-[6px] px-[14px] py-[10px] rounded-[10px] border border-dashed border-[var(--border)] bg-transparent text-[12px] text-[var(--t3)] hover:text-[var(--on-surface)] hover:border-[var(--primary-border)] cursor-pointer transition-colors"
            >
              <Plus size={13} />
              Add member
            </button>
          ) : null}

          {/* Hint */}
          <div className="mt-1 px-[14px] py-[11px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[10px] text-[12px] text-[var(--t3)] leading-relaxed">
            {isReadOnly ? (
              <>Historical iteration: simulation team is view-only.</>
            ) : !hasRun ? (
              <>
                Run the simulation once to unlock{" "}
                <strong className="text-[var(--on-surface-variant)]">Configure connections</strong>
                {" "}— then you can define how synthetics interact across iterations.
              </>
            ) : (
              <>
                💡 Click{" "}
                <strong className="text-[var(--on-surface-variant)]">Configure connections</strong>{" "}
                to define how synthetics interact — who feeds into whom, who debates, who validates.
              </>
            )}
          </div>

        </div>
      </div>

      {modalOpen && (
        <AddMemberModal
          teamMembers={[]}
          onAdd={async ({ name, skillDescription }) => {
            onAddCustom?.(name, skillDescription);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}

      <DialogPrimitive.Root
        open={Boolean(pendingDeleteSynthetic)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteSynthetic(null);
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <DialogPrimitive.Popup
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              zIndex: 50,
              width: "min(26rem, calc(100% - 2rem))",
              transform: "translate(-50%, -50%)",
              borderRadius: 10,
              border: "1px solid var(--surface-container)",
              background: "var(--surface-lowest)",
              padding: 20,
            }}
          >
            <DialogPrimitive.Title
              style={{
                fontFamily: "var(--font-manrope), sans-serif",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--on-surface)",
              }}
            >
              Remove synthetic
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "var(--on-surface-variant)",
                fontFamily: "var(--font-jetbrains-mono), monospace",
              }}
            >
              {getDeleteSyntheticDialogDescription(pendingDeleteSynthetic?.name ?? null)}
            </DialogPrimitive.Description>
            <div
              style={{
                marginTop: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 6,
                  border: "1px solid var(--surface-container)",
                  background: "none",
                  fontSize: 10,
                  color: "var(--on-surface-variant)",
                  cursor: "pointer",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
                onClick={() => setPendingDeleteSynthetic(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 6,
                  background: "var(--danger-bg)",
                  border: "1px solid rgba(248,113,113,0.35)",
                  color: "var(--danger-text)",
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
                onClick={() => {
                  if (pendingDeleteSynthetic) {
                    onRemove?.(pendingDeleteSynthetic.id);
                  }
                  setPendingDeleteSynthetic(null);
                }}
              >
                Remove
              </button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
