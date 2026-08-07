"use client";

import { useState } from "react";
import type {
  SyntheticPreparedDecision,
  SyntheticPreparedClarification,
} from "@/lib/thinking-graph/server/types";
import type { StagedDecision } from "../hooks/useStagingBuffer";
import { MONO, SANS } from "../OutcomeReport.utils";

const SHELL_BASE: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 2,
  backdropFilter: "blur(12px)",
  isolation: "isolate",
};

function buildSummaryLabels(
  pendingDecisions: StagedDecision[],
  pendingActions: string[],
): string {
  const parts: string[] = [
    ...pendingDecisions.map((d) => d.optionLabel),
    ...pendingActions,
  ];
  if (parts.length === 0) return "";
  const visible = parts.slice(0, 3);
  const overflow = parts.length - visible.length;
  return visible.join(", ") + (overflow > 0 ? ` +${overflow} more` : "");
}

export function StagedChangesBar({
  pendingDecisions = [],
  pendingActions = [],
  decisions,
  clarifications,
  hasStagedChanges,
  stagedChangesCount,
  onDiscard,
  onRun,
  onRemoveDecision,
  onRemoveClarification,
  onRemoveAction,
}: {
  /** Items currently in the staging buffer — not yet flushed to the prompt. */
  pendingDecisions?: StagedDecision[];
  /** Adopted action texts currently staged. */
  pendingActions?: string[];
  /** Already-committed decisions applied in a previous run. Shown read-only. */
  decisions: SyntheticPreparedDecision[];
  clarifications: SyntheticPreparedClarification[];
  hasStagedChanges: boolean;
  /** Authoritative total from the staging buffer (includes conflicts). */
  stagedChangesCount?: number;
  onDiscard?: () => void;
  onRun?: () => void;
  /** Called with familyId to remove a pending decision from the buffer. */
  onRemoveDecision?: (familyId: string) => void;
  onRemoveClarification?: (syntheticId: string) => void;
  onRemoveAction?: (action: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const pendingCount = pendingDecisions.length + pendingActions.length;
  const displayCount = stagedChangesCount ?? pendingCount;
  const appliedCount = decisions.length + clarifications.length;
  const canExpand = pendingCount > 0 || appliedCount > 0;

  if (!hasStagedChanges) {
    return (
      <div
        style={{
          ...SHELL_BASE,
          borderTop: "1px solid var(--surface-container)",
          background: "var(--surface-low, #1a1a1a)",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: MONO, margin: 0 }}>
          No changes staged — the next run will use the same setup
        </p>
      </div>
    );
  }

  const summaryLabels = buildSummaryLabels(pendingDecisions, pendingActions);

  return (
    <div
      style={{
        ...SHELL_BASE,
        borderTop: "1px solid var(--color-success-border)",
        background: "color-mix(in srgb, var(--color-success-bg) 85%, var(--surface-low, #1a1a1a))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Expanded tray ── */}
      {expanded && (
        <div
          style={{
            borderBottom: "1px solid var(--color-success-border)",
            padding: "10px 20px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* ── Staged (pending) — removable ── */}
          {(pendingDecisions.length > 0 || pendingActions.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <p style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--color-success-text)", letterSpacing: "0.5px", textTransform: "uppercase", margin: 0 }}>
                Staged for next run
              </p>
              {pendingDecisions.map((d) => (
                <div
                  key={`pending-${d.familyId}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <p style={{ fontSize: "var(--text-caption)", fontFamily: SANS, color: "var(--on-surface-variant)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: MONO, color: "var(--on-surface)", fontWeight: 600 }}>{d.decisionTitle}</span>
                    {" → "}
                    {d.optionLabel}
                  </p>
                  {onRemoveDecision && (
                    <button
                      type="button"
                      onClick={() => onRemoveDecision(d.familyId)}
                      style={{ padding: "0 4px", border: "none", background: "transparent", color: "var(--t3)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {pendingActions.map((action) => (
                <div
                  key={`action-${action}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <p style={{ fontSize: "var(--text-caption)", fontFamily: SANS, color: "var(--on-surface-variant)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: MONO, color: "var(--on-surface)", fontWeight: 600 }}>Action</span>
                    {" — "}
                    {action}
                  </p>
                  {onRemoveAction && (
                    <button
                      type="button"
                      onClick={() => onRemoveAction(action)}
                      style={{ padding: "0 4px", border: "none", background: "transparent", color: "var(--t3)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Applied (committed) — read-only ── */}
          {(decisions.length > 0 || clarifications.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <p style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)", letterSpacing: "0.5px", textTransform: "uppercase", margin: 0 }}>
                Applied this run
              </p>
              {decisions.map((d) => (
                <p
                  key={`applied-${d.syntheticId}-${d.optionId}`}
                  style={{ fontSize: "var(--text-caption)", fontFamily: SANS, color: "var(--t3)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  <span style={{ fontFamily: MONO, color: "var(--on-surface-variant)", fontWeight: 600 }}>{d.decisionTitle}</span>
                  {" → "}
                  {d.optionLabel}
                </p>
              ))}
              {clarifications.map((c) => (
                <p
                  key={`applied-clarification-${c.syntheticId}`}
                  style={{ fontSize: "var(--text-caption)", fontFamily: SANS, color: "var(--t3)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  <span style={{ fontFamily: MONO, color: "var(--on-surface-variant)", fontWeight: 600 }}>{c.syntheticName}</span>
                  {" — "}
                  {c.answers.length} answer{c.answers.length !== 1 ? "s" : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Summary row ── */}
      <div
        style={{
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              style={{ padding: 0, border: "none", background: "transparent", color: "var(--t3)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}
            >
              Discard
            </button>
          )}

          <button
            type="button"
            onClick={() => canExpand && setExpanded((v) => !v)}
            style={{ padding: 0, border: "none", background: "transparent", cursor: canExpand ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
          >
            <p style={{ fontSize: "var(--text-caption)", color: "var(--color-success-text)", fontFamily: SANS, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: MONO, fontWeight: 700 }}>
                Next run:{" "}
                <span style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 999, padding: "0px 6px", fontSize: "var(--text-label)" }}>
                  {displayCount}
                </span>{" "}
                {displayCount === 1 ? "change" : "changes"} staged
              </span>
              {summaryLabels && (
                <span style={{ color: "var(--on-surface-variant)", fontFamily: SANS }}>
                  {" — "}
                  {summaryLabels}
                </span>
              )}
            </p>
            {canExpand && (
              <span style={{ fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--t3)", flexShrink: 0, transition: "transform 0.15s", display: "inline-block", transform: expanded ? "rotate(180deg)" : "none" }}>
                ▾
              </span>
            )}
          </button>
        </div>

        {onRun && (
          <button
            type="button"
            onClick={onRun}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-caption)", fontWeight: 700, padding: "6px 16px", borderRadius: 6, border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "var(--color-success-text)", cursor: "pointer", fontFamily: MONO, flexShrink: 0 }}
          >
            Run now →
          </button>
        )}
      </div>
    </div>
  );
}
