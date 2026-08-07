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
import { MONO, SANS, deriveAgentCardViewModel } from "../OutcomeReport.utils";

const VERDICT_RANK: Record<DomainVerdict, number> = { no_go: 2, conditional: 1, go: 0 };

function asSyntheticReport(output: SyntheticOutputJson): SyntheticReport | null {
  if (!("details" in output)) return null;
  return output;
}

// ── Verdict config ────────────────────────────────────────────────────────────

const EDGE_RELATION_COLORS: Record<string, string> = {
  tension: "#f87171",
  oversight: "#34d399",
  amplification: "#60a5fa",
};

const VERDICT_CFG: Record<
  DomainVerdict,
  { icon: string; label: string; color: string; bg: string; border: string }
> = {
  go: {
    icon: "🟢",
    label: "Go",
    color: "var(--color-success-text)",
    bg: "var(--color-success-bg)",
    border: "var(--color-success-border)",
  },
  conditional: {
    icon: "🟡",
    label: "Conditional",
    color: "var(--color-warning-text)",
    bg: "var(--color-warning-bg)",
    border: "var(--color-warning-border)",
  },
  no_go: {
    icon: "🔴",
    label: "No-Go",
    color: "var(--color-error-text)",
    bg: "var(--color-error-bg)",
    border: "var(--color-error-border)",
  },
};

// ── Retry badge ───────────────────────────────────────────────────────────────

function RetryBadge({
  validationAttempts,
  validationStatus,
}: {
  validationAttempts: number;
  validationStatus: "pass" | "fail";
}) {
  // Only show badge on fail with 2+ attempts
  if (validationStatus !== "fail" || validationAttempts < 2) return null;

  const label = `⚠ ${validationAttempts} retries`;
  const isMax = validationAttempts >= 3;

  return (
    <span
      title={
        isMax
          ? "Agent exhausted retry budget — output may have unresolved quality issues"
          : "Agent required multiple attempts to produce valid output"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 6px",
        borderRadius: 4,
        border: "1px solid var(--color-warning-border)",
        background: "var(--color-warning-bg)",
        color: "var(--color-warning-text)",
        fontSize: "var(--text-label)",
        fontFamily: MONO,
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: isMax ? "help" : "default",
      }}
    >
      {label}
    </span>
  );
}

// ── MDA finding prefix parser (mirrors FindingsSection) ───────────────────────

function parseFindingPrefix(sentence: string): { label: string | null; body: string } {
  const match = sentence.match(/^(?:MDA\s+)?([A-Za-z][A-Za-z\s]{0,30}?)(?:\s+lens)?:\s+(.+)$/);
  if (!match) return { label: null, body: sentence.trim() };
  const rawLabel = match[1].trim().replace(/^MDA\s+/i, "").replace(/\s+lens$/i, "").trim();
  return { label: rawLabel.length > 0 ? rawLabel : null, body: match[2].trim() };
}

type ChipVariant = "primary" | "info" | "warning" | "muted";

function labelVariant(label: string | null): ChipVariant {
  if (!label) return "muted";
  const lower = label.toLowerCase();
  if (lower.includes("mechanic")) return "primary";
  if (lower.includes("dynamic")) return "info";
  if (lower.includes("aesthetic")) return "warning";
  return "muted";
}

const CHIP_COLORS: Record<ChipVariant, { color: string; bg: string; border: string }> = {
  primary: { color: "var(--primary)", bg: "var(--primary-container)", border: "var(--primary-border)" },
  info: { color: "var(--color-info-text, var(--primary))", bg: "var(--color-info-bg, var(--primary-container))", border: "var(--color-info-border, var(--primary-border))" },
  warning: { color: "var(--color-warning-text)", bg: "var(--color-warning-bg)", border: "var(--color-warning-border)" },
  muted: { color: "var(--t3)", bg: "var(--surface-container)", border: "var(--surface-container)" },
};

function LabelChip({ label }: { label: string }) {
  const variant = labelVariant(label);
  const s = CHIP_COLORS[variant];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "1px 5px", borderRadius: 4,
      border: `1px solid ${s.border}`, background: s.bg, color: s.color,
      fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600,
      lineHeight: 1.4, flexShrink: 0, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ── Expanded agent detail ─────────────────────────────────────────────────────

function AgentExpandedDetail({ output }: { output: SyntheticOutputJson }) {
  const op = asSyntheticReport(output)?.operational;
  const vm = deriveAgentCardViewModel(output);

  const findings = op?.findings?.filter(Boolean) ?? [];
  const risks = op?.risks?.slice(0, 5) ?? [];

  // Clarification requests with IDs
  const clarifications = (op?.clarificationRequests ?? []).filter((c) => c.required || c.id);
  const nextSteps = op?.nextSteps?.slice(0, 5) ?? [];

  return (
    <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--surface-container)" }}>

      {/* Summary */}
      {vm.summary && (
        <div>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: MONO, marginBottom: 4 }}>
            Summary
          </p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.55, margin: 0, overflowWrap: "break-word" }}>
            {vm.summary}
          </p>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: MONO, marginBottom: 6 }}>
            Findings
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {findings.map((f, i) => {
              const { label, body } = parseFindingPrefix(f);
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  {label ? (
                    <LabelChip label={label} />
                  ) : (
                    <span style={{ fontSize: "var(--text-label)", color: "var(--t3)", fontFamily: MONO, opacity: 0.4, flexShrink: 0, lineHeight: 1.55 }}>–</span>
                  )}
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.55, overflowWrap: "break-word" }}>
                    {body}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <div>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-warning-text)", fontFamily: MONO, marginBottom: 6, opacity: 0.9 }}>
            Risks
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {risks.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--color-warning-text)", flexShrink: 0, lineHeight: 1.55 }}>⚠</span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.55, overflowWrap: "break-word" }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open questions — structured with IDs */}
      {clarifications.length > 0 && (
        <div>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: MONO, marginBottom: 6 }}>
            Open questions
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clarifications.map((c, i) => (
              <div key={c.id ?? i} style={{ display: "flex", gap: 8 }}>
                {c.id && (
                  <span style={{
                    fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)",
                    flexShrink: 0, lineHeight: 1.55, opacity: 0.7, paddingTop: 1,
                  }}>
                    {c.id}
                  </span>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface)", fontFamily: SANS, lineHeight: 1.5, fontWeight: c.required ? 600 : 400 }}>
                    {c.question}
                  </span>
                  {c.whyItMatters && (
                    <span style={{ fontSize: "var(--text-label)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.4, opacity: 0.8 }}>
                      {c.whyItMatters}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <div>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: MONO, marginBottom: 6 }}>
            Next steps
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {nextSteps.map((step, i) => (
              <li key={i} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.5 }}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Single agent row ──────────────────────────────────────────────────────────

function AgentRow({
  synthetic,
  output,
  gate,
  connections,
}: {
  synthetic: SyntheticNode;
  output: SyntheticOutputJson | null;
  gate: DomainGateResult | null;
  connections?: { label: string; color: string }[];
}) {
  const [expanded, setExpanded] = useState(false);

  const isPending = output === null;
  const vm = deriveAgentCardViewModel(isPending ? null : output);

  const quality = !isPending && !isAdvisorReport(output) ? output.outputQuality : undefined;
  const verdictCfg = gate ? VERDICT_CFG[gate.verdict] : null;

  // Condition sentence shown in collapsed row
  const conditionText = gate?.condition ?? (isPending ? null : vm.action);

  const borderLeftColor = gate
    ? gate.verdict === "no_go"
      ? "var(--color-error-border)"
      : gate.verdict === "conditional"
        ? "var(--color-warning-border)"
        : "var(--color-success-border)"
    : "var(--surface-container)";

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--surface-container)",
        borderLeft: `3px solid ${borderLeftColor}`,
        background: "var(--surface-high)",
        overflow: "hidden",
      }}
    >
      {/* ── Collapsed header row ── */}
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {/* Agent code chip */}
        <span style={{
          fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 700,
          color: "var(--t3)", background: "var(--surface-container)",
          border: "1px solid var(--surface-container)", borderRadius: 4,
          padding: "2px 7px", flexShrink: 0,
        }}>
          {synthetic.code}
        </span>

        {/* Verdict chip or pending */}
        {isPending ? (
          <span style={{
            fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", border: "1px solid var(--t3)", display: "inline-block" }} />
            Pending
          </span>
        ) : verdictCfg ? (
          <span style={{
            fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600,
            color: verdictCfg.color, background: verdictCfg.bg,
            border: `1px solid ${verdictCfg.border}`, borderRadius: 4,
            padding: "2px 7px", flexShrink: 0, whiteSpace: "nowrap",
          }}>
            {verdictCfg.icon} {verdictCfg.label}
          </span>
        ) : null}

        {/* Retry badge */}
        {quality && (
          <RetryBadge
            validationAttempts={quality.validationAttempts}
            validationStatus={quality.validationStatus}
          />
        )}

        {/* Connection chips */}
        {connections && connections.length > 0 && (
          <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {connections.map(({ label, color }) => (
              <span
                key={label}
                title={label}
                style={{
                  fontSize: "var(--text-label)",
                  fontFamily: MONO,
                  fontWeight: 600,
                  color,
                  background: `${color}14`,
                  border: `1px solid ${color}30`,
                  borderRadius: 4,
                  padding: "1px 5px",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.3px",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            ))}
          </span>
        )}

        {/* Condition / action text */}
        {conditionText && (
          <span style={{
            fontSize: "var(--text-caption)", color: "var(--on-surface-variant)",
            fontFamily: SANS, lineHeight: 1.4, flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
            title={conditionText}
          >
            {conditionText}
          </span>
        )}

        {/* Expand/collapse button — only when output exists */}
        {!isPending && !isAdvisorReport(output) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              marginLeft: "auto",
              flexShrink: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--t3)",
              fontSize: "var(--text-label)",
              fontFamily: MONO,
              padding: "2px 4px",
              lineHeight: 1,
            }}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* ── Expanded detail ── */}
      {expanded && !isPending && !isAdvisorReport(output) && (
        <AgentExpandedDetail output={output} />
      )}
    </div>
  );
}

// ── AgentVerdictsSection (exported) ──────────────────────────────────────────

export function AgentVerdictsSection({
  summaryReport,
  synthetics,
  edges,
  outputsBySyntheticId,
  defaultOpen = false,
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const gateById = useMemo(
    () => new Map(summaryReport.domainGates.map((g) => [g.syntheticId, g])),
    [summaryReport.domainGates],
  );

  const syntheticNameById = useMemo(
    () => new Map(synthetics.map((s) => [s.id, s.name])),
    [synthetics],
  );

  const connectionsByNodeId = useMemo(() => {
    const map = new Map<string, { label: string; color: string }[]>();
    for (const edge of edges) {
      if (edge.type === "structural") continue;
      const color = EDGE_RELATION_COLORS[edge.type] ?? "var(--t3)";
      const fromName = syntheticNameById.get(edge.from) ?? edge.from;
      const toName = syntheticNameById.get(edge.to) ?? edge.to;
      const fromLabel =
        edge.type === "tension"
          ? `↔ ${toName}`
          : edge.type === "oversight"
            ? `↓ ${toName}`
            : `→ ${toName}`;
      const toLabel =
        edge.type === "tension"
          ? `↔ ${fromName}`
          : edge.type === "oversight"
            ? `↑ ${fromName}`
            : `← ${fromName}`;
      if (!map.has(edge.from)) map.set(edge.from, []);
      map.get(edge.from)!.push({ label: fromLabel, color });
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)!.push({ label: toLabel, color });
    }
    return map;
  }, [edges, syntheticNameById]);

  // Sort agents by gate severity so the most critical appear first in the list.
  const agentSynthetics = useMemo(
    () => [...synthetics].sort((a, b) => {
      const gA = gateById.get(a.id)
      const gB = gateById.get(b.id)
      return (VERDICT_RANK[gB?.verdict ?? "go"] ?? 0) - (VERDICT_RANK[gA?.verdict ?? "go"] ?? 0)
    }),
    [synthetics, gateById],
  );

  // Count non-pending agents for the header
  const readyCount = agentSynthetics.filter((s) => outputsBySyntheticId[s.id] !== null).length;

  if (agentSynthetics.length === 0) return null;

  return (
    <section>
      {/* ── Toggle header ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          borderBottom: "1px solid var(--surface-container)",
          paddingBottom: 8,
          cursor: "pointer",
          color: "var(--t3)",
          fontFamily: MONO,
          fontSize: "var(--text-caption)",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{open ? "▼" : "▶"}</span>
        <span>Agent verdicts</span>
        <span style={{ opacity: 0.5, marginLeft: 2 }}>
          · {readyCount} of {agentSynthetics.length}
        </span>

        {/* Verdict summary chips in header */}
        {open === false && summaryReport.domainGates.length > 0 && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
            {(["no_go", "conditional", "go"] as DomainVerdict[]).map((v) => {
              const count = summaryReport.domainGates.filter((g) => g.verdict === v).length;
              if (count === 0) return null;
              const cfg = VERDICT_CFG[v];
              return (
                <span key={v} style={{
                  fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600,
                  color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                  borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
                }}>
                  {cfg.icon} {count}
                </span>
              );
            })}
          </span>
        )}
      </button>

      {/* ── Agent rows ── */}
      {open && (
        <div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {agentSynthetics.map((synthetic) => (
            <AgentRow
              key={synthetic.id}
              synthetic={synthetic}
              output={outputsBySyntheticId[synthetic.id] ?? null}
              gate={gateById.get(synthetic.id) ?? null}
              connections={connectionsByNodeId.get(synthetic.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
