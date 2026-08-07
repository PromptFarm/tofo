"use client";

import { useMemo, useState } from "react";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type {
  DomainGateResult,
  DomainVerdict,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticReport,
} from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import {
  MONO, SANS,
  collectHandoffRows,
  deriveAgentCardViewModel,
  meterColor,
} from "../OutcomeReport.utils";
import { generatePathToGo } from "@/lib/thinking-graph/reportSummary";
import { StructuredListText } from "./shared/StructuredListText";
import { RecommendSolutionModal } from "./RecommendSolutionModal";

// ── Verdict helpers (mirror GoNoGoPanel) ──────────────────────────────────────

const VERDICT_CFG: Record<DomainVerdict, { label: string; color: string; bg: string; border: string }> = {
  go:          { label: "Go",          color: "var(--color-success-text)", bg: "var(--color-success-bg)",       border: "var(--color-success-border)" },
  conditional: { label: "Conditional", color: "var(--color-warning-text)", bg: "var(--color-warning-bg-subtle)", border: "var(--color-warning-border)" },
  no_go:       { label: "No-Go",       color: "var(--color-error-text)",   bg: "var(--color-error-bg-subtle)",   border: "var(--color-error-border)"   },
};

function getOperational(
  output: SyntheticOutputJson | null,
) {
  if (!output || !("details" in output)) return null;
  return (output as SyntheticReport).operational ?? null;
}

// ── MeterBar ──────────────────────────────────────────────────────────────────

function MeterBar({ label, value, highMeansBad }: { label: string; value: number; highMeansBad: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)" }}>{label}</span>
        <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 700, color: meterColor(value, highMeansBad) }}>{value}</span>
      </div>
      <div style={{ height: 4, background: "var(--surface-container)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: meterColor(value, highMeansBad), borderRadius: 99, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ── PeerContextAccordion ──────────────────────────────────────────────────────

type HandoffRow = ReturnType<typeof collectHandoffRows>[number];

function PeerContextAccordion({ incomingRows }: { incomingRows: HandoffRow[] }) {
  const groups = incomingRows.flatMap((row) => {
    if (!row.handoff) return [];
    const h = row.handoff;
    return [
      { rowId: row.fromSyntheticId, from: row.fromSyntheticName, label: "Known",          color: "var(--color-success-text)", items: h.facts },
      { rowId: row.fromSyntheticId, from: row.fromSyntheticName, label: "Constraints",    color: "var(--color-warning-text)", items: h.constraints },
      { rowId: row.fromSyntheticId, from: row.fromSyntheticName, label: "Open decisions", color: "var(--color-info-text)",    items: h.openDecisions },
      { rowId: row.fromSyntheticId, from: row.fromSyntheticName, label: "Needs you",      color: "var(--color-error-text)",   items: h.blockedByUser },
      { rowId: row.fromSyntheticId, from: row.fromSyntheticName, label: "Next focus",     color: "#a78bfa",                   items: h.nextFocus },
    ].filter((g) => g.items.length > 0);
  });

  return (
    <details style={{ borderTop: "1px solid var(--surface-container)" }}>
      <summary style={{ cursor: "pointer", padding: "8px 14px", fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--t3)", listStyle: "none", userSelect: "none" }}>
        Context received from peers ↓
      </summary>
      <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {groups.length === 0 ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.6 }}>
            No peer context yet — run a second iteration to see cross-agent context flow.
          </p>
        ) : (
          groups.map((g, i) => (
            <div key={`${g.rowId}-${g.label}-${i}`}>
              <p style={{ fontSize: "var(--text-label)", letterSpacing: "0.9px", textTransform: "uppercase", color: g.color, fontFamily: MONO, marginBottom: 4, opacity: 0.9 }}>
                {g.from} · {g.label}
              </p>
              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                {g.items.map((item, j) => (
                  <li key={j} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.55, fontFamily: SANS }}>
                    <StructuredListText text={item} fontSize={11} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

// ── AnalysisCard ──────────────────────────────────────────────────────────────

function AnalysisCard({
  synthetic,
  output,
  gate,
  incomingRows,
  sessionId,
  onSolutionAdded,
  recommendedSolutions = [],
}: {
  synthetic: SyntheticNode;
  output: SyntheticOutputJson | null;
  gate: DomainGateResult | null;
  incomingRows: HandoffRow[];
  sessionId: string;
  onSolutionAdded?: () => void;
  recommendedSolutions?: import("@/lib/thinking-graph/server/types").RecommendedSolution[];
}) {
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [solutionRisk, setSolutionRisk] = useState<string>("");
  const vm = deriveAgentCardViewModel(output);
  const isSynthReport = output !== null && !isAdvisorReport(output);
  const feasibility = isSynthReport ? output.concernLevels.feasibility : null;
  const risk = isSynthReport ? output.concernLevels.risk : null;
  const operational = getOperational(output);

  // ── Prefer operational.risks (agent-computed, never polluted with questions)
  // Fall back to root keyRisks only when operational is absent (legacy outputs).
  const risks: string[] = operational?.risks?.slice(0, 4) ??
    (isSynthReport ? output.keyRisks.slice(0, 4) : []);

  // ── Open questions: clarificationRequests + missingInformation
  const clarificationQuestions: string[] =
    operational?.clarificationRequests
      ?.filter((q) => q.required)
      .map((q) => q.question)
      .slice(0, 4) ?? [];
  const missingItems: string[] =
    operational?.missingInformation?.slice(0, 3) ?? [];
  // Deduplicate: skip missingInfo items already covered verbatim by a clarification question
  const openQuestions: string[] = [
    ...clarificationQuestions,
    ...missingItems.filter(
      (m) => !clarificationQuestions.some((q) => q.toLowerCase().includes(m.toLowerCase().slice(0, 30))),
    ),
  ].slice(0, 5);

  const gateCfg = gate ? VERDICT_CFG[gate.verdict] : null;

  const isBlocked = vm.statusTier === "blocked";

  return (
    <div style={{
      borderRadius: 8,
      border: "1px solid var(--surface-container)",
      borderLeft: isBlocked ? "4px solid var(--color-error-border)" : "1px solid var(--surface-container)",
      background: isBlocked
        ? "color-mix(in srgb, var(--color-error-bg) 15%, var(--surface-high))"
        : "var(--surface-high)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <p style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--on-surface)", fontFamily: SANS }}>{synthetic.name}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Blocked badge */}
            {isBlocked && (
              <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 700, color: "var(--color-error-text)", background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
                ⚠ Blocked
              </span>
            )}
            {/* Code badge */}
            <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 700, color: "var(--t3)", background: "var(--surface-container)", border: "1px solid var(--surface-container)", borderRadius: 4, padding: "2px 7px" }}>
              {synthetic.code}
            </span>
            {/* Domain gate chip */}
            {gateCfg && (
              <span title={gate?.condition ?? undefined} style={{ fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600, color: gateCfg.color, background: gateCfg.bg, border: `1px solid ${gateCfg.border}`, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
                {gateCfg.label}
                {gate?.condition ? " ·?" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Condition text when gate is conditional/no_go */}
        {gate?.condition && gate.verdict !== "go" && (
          <p style={{ fontSize: "var(--text-caption)", color: VERDICT_CFG[gate.verdict].color, fontFamily: SANS, lineHeight: 1.5, opacity: 0.9 }}>
            {gate.condition}
          </p>
        )}

        {/* Summary */}
        <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.55, fontFamily: SANS }}>
          {vm.summary ?? "No report yet."}
        </p>
      </div>

      {/* ── Risks ── from operational.risks (never polluted with questions) */}
      {risks.length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-error-text)", fontFamily: MONO, marginBottom: 5, opacity: 0.85 }}>
            ⚠ Risks
          </p>
          <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            {risks.map((r, i) => (
              <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: SANS }}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Open Questions ── from clarificationRequests + missingInformation */}
      {openQuestions.length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-warning-text)", fontFamily: MONO, marginBottom: 5, opacity: 0.85 }}>
            ❓ Open Questions
          </p>
          <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            {openQuestions.map((q, i) => (
              <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: SANS }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Path to GO ── concrete actions to reach GO status */}
      {(() => {
        const pathToGo = isSynthReport ? generatePathToGo(gate, output as SyntheticReport) : null;
        if (!pathToGo) return null;
        return (
          <div style={{ padding: "0 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-info-text)", fontFamily: MONO, opacity: 0.85 }}>
                🎯 {pathToGo.summary}
              </p>
              <button
                onClick={() => {
                  setSolutionRisk(risks[0] || "addressing risks");
                  setShowSolutionModal(true);
                }}
                style={{
                  fontSize: "var(--text-label)",
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-info-border)",
                  background: "var(--color-info-bg)",
                  color: "var(--color-info-text)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                disabled={!risks.length}
              >
                💡 Recommend
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 5 }}>
              {pathToGo.steps.map((step, i) => (
                <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface)", lineHeight: 1.6, fontFamily: SANS }}>
                  <span style={{
                    fontWeight: 600,
                    color: step.priority === "high" ? "var(--color-error-text)" : step.priority === "medium" ? "var(--color-warning-text)" : "var(--on-surface-variant)"
                  }}>
                    {step.action}
                  </span>
                  <div style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", marginTop: 2, fontStyle: "italic", opacity: 0.8 }}>
                    → {step.why}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Meters */}
      {feasibility !== null && risk !== null && (
        <div style={{ padding: "0 14px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MeterBar label="Feasibility" value={feasibility} highMeansBad={false} />
          <MeterBar label="Risk" value={risk} highMeansBad={true} />
        </div>
      )}

      {/* Recommendation */}
      {vm.action && (
        <div style={{ padding: "0 14px 12px" }}>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: MONO, marginBottom: 4 }}>Next Step</p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface)", lineHeight: 1.5, fontFamily: SANS }}>{vm.action}</p>
        </div>
      )}

      {/* Peer context accordion */}
      <PeerContextAccordion incomingRows={incomingRows} />

      {/* Recommended Solutions with Delta */}
      {recommendedSolutions.length > 0 && (
        <div style={{ borderTop: "1px solid var(--surface-container)" }}>
          <details style={{ borderTop: "none" }}>
            <summary style={{ cursor: "pointer", padding: "8px 14px", fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--t3)", listStyle: "none", userSelect: "none" }}>
              Solutions Recommended ({recommendedSolutions.length})
            </summary>
            <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {recommendedSolutions.map((sol) => (
                <div key={sol.id} style={{ padding: 10, background: "var(--surface-low)", borderRadius: 6, border: "1px solid var(--surface-container)" }}>
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: "var(--text-label)", color: "var(--on-surface)", fontWeight: 600, marginBottom: 3 }}>
                      {sol.riskDescription}
                    </p>
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      {sol.solution}
                    </p>
                  </div>
                  {sol.priorRisk !== undefined && sol.postRisk !== undefined && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--color-error-text)" }}>
                        {Math.round(sol.priorRisk)}%
                      </span>
                      <span style={{ color: "var(--t3)" }}>→</span>
                      <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: Math.round(sol.postRisk) < 50 ? "var(--color-success-text)" : "var(--color-warning-text)" }}>
                        {Math.round(sol.postRisk)}%
                      </span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--t3)" }}>
                        ({sol.postRisk < sol.priorRisk ? "✓ improved" : "—"})
                      </span>
                    </div>
                  )}
                  {!sol.postRisk && (
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontStyle: "italic" }}>
                      Pending evaluation in next run
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Recommend Solution Modal */}
      {showSolutionModal && (
        <RecommendSolutionModal
          synthetic={{ id: synthetic.id, name: synthetic.name }}
          risk={solutionRisk}
          priorRisk={risk ?? 0}
          sessionId={sessionId}
          onSubmit={async (solution) => {
            const res = await fetch("/api/thinking-graph/session", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                recommendedSolution: {
                  syntheticId: synthetic.id,
                  syntheticName: synthetic.name,
                  riskDescription: solutionRisk,
                  solution,
                  priorRisk: risk ?? undefined,
                },
              }),
            });
            if (!res.ok) {
              throw new Error("Failed to save solution");
            }
            onSolutionAdded?.();
          }}
          onClose={() => setShowSolutionModal(false)}
        />
      )}
    </div>
  );
}

// ── AnalysisTab ───────────────────────────────────────────────────────────────

export function AnalysisTab({
  summaryReport,
  synthetics,
  edges,
  outputsBySyntheticId,
  sessionId,
  onDataRefresh,
  recommendedSolutions = [],
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  sessionId: string;
  onDataRefresh?: () => void;
  recommendedSolutions?: import("@/lib/thinking-graph/server/types").RecommendedSolution[];
}) {
  const gateById = useMemo(
    () => new Map(summaryReport.domainGates.map((g) => [g.syntheticId, g])),
    [summaryReport.domainGates],
  );

  const allHandoffRows = useMemo(
    () => collectHandoffRows({ synthetics, edges, outputsBySyntheticId }),
    [synthetics, edges, outputsBySyntheticId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {synthetics.map((synthetic) => {
        const incomingRows = allHandoffRows.filter((r) => r.toSyntheticId === synthetic.id);
        const syntheticSolutions = recommendedSolutions.filter((s) => s.syntheticId === synthetic.id);
        return (
          <AnalysisCard
            key={synthetic.id}
            synthetic={synthetic}
            output={outputsBySyntheticId[synthetic.id] ?? null}
            gate={gateById.get(synthetic.id) ?? null}
            incomingRows={incomingRows}
            sessionId={sessionId}
            onSolutionAdded={onDataRefresh}
            recommendedSolutions={syntheticSolutions}
          />
        );
      })}
    </div>
  );
}
