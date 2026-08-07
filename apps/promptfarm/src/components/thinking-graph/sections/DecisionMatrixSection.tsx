"use client";

import { useState } from "react";
import type {
  RunSummaryReport,
  SyntheticPreparedInputSource,
} from "@/lib/thinking-graph/server/types";
import { MONO } from "../OutcomeReport.utils";
import type { DecisionRequiredPayload } from "../OutcomeReport.types";
import type { StagedDecision } from "../hooks/useStagingBuffer";
import { DecisionMatrixTab } from "../tabs/DecisionMatrixTab";

export function DecisionMatrixSection({
  summaryReport,
  allPendingDecisions,
  stagedDecisions,
  onApplyDecisionOption,
  onUnstageDecision,
}: {
  summaryReport: RunSummaryReport;
  allPendingDecisions?: DecisionRequiredPayload[];
  stagedDecisions?: ReadonlyMap<string, StagedDecision>;
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  onUnstageDecision?: (familyId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const familyCount = summaryReport.decisionFamilies.length;
  if (familyCount === 0 && summaryReport.decisionMatrix.length === 0) return null;

  return (
    <section>
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
        <span>Decision matrix</span>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-label)", opacity: 0.6 }}>
          {familyCount}
        </span>
      </button>

      {open && (
        <div style={{ paddingTop: 14 }}>
          <DecisionMatrixTab
            summaryReport={summaryReport}
            decisionRequired={allPendingDecisions?.[0] ?? null}
            allPendingDecisions={allPendingDecisions}
            stagedDecisions={stagedDecisions}
            onApplyDecisionOption={onApplyDecisionOption}
            onUnstageDecision={onUnstageDecision}
          />
        </div>
      )}
    </section>
  );
}
