"use client";

import type { DomainVerdict } from "@/lib/thinking-graph/server/types";
import { MONO, SANS } from "../OutcomeReport.utils";

// ── ReadinessProgressBar ──────────────────────────────────────────────────────

/**
 * Renders a segmented progress bar tracking how many blocking decisions have
 * been resolved. Colour and CTA text respond to both resolved count and the
 * overall overallVerdict from the run summary.
 *
 * Hidden entirely when totalBlocking === 0.
 */
export function ReadinessProgressBar({
  totalBlocking,
  resolvedBlocking,
  overallVerdict,
}: {
  totalBlocking: number;
  resolvedBlocking: number;
  overallVerdict?: DomainVerdict | null;
}) {
  if (totalBlocking === 0) return null;

  const pct = Math.round((resolvedBlocking / totalBlocking) * 100);
  const allDone = resolvedBlocking >= totalBlocking;

  // Colour: green only when all done AND overall verdict is go; amber when all
  // done but still conditional; red/amber otherwise.
  const barColor = allDone
    ? overallVerdict === "go"
      ? "var(--color-success-text)"
      : "var(--color-warning-text)"
    : resolvedBlocking > 0
      ? "var(--color-warning-text)"
      : "var(--color-error-text)";

  const borderColor = allDone
    ? overallVerdict === "go"
      ? "var(--color-success-border)"
      : "var(--color-warning-border)"
    : "var(--surface-container)";

  const bgColor = allDone
    ? overallVerdict === "go"
      ? "color-mix(in srgb, var(--color-success-bg) 20%, var(--surface-low))"
      : "color-mix(in srgb, var(--color-warning-bg) 15%, var(--surface-low))"
    : "var(--surface-low)";

  // CTA text per state matrix from the plan
  let ctaText: string;
  if (!allDone) {
    ctaText =
      resolvedBlocking > 0
        ? `${resolvedBlocking} of ${totalBlocking} decisions resolved — keep going`
        : "Resolve open decisions before building";
  } else if (overallVerdict === "go") {
    ctaText = "All decisions resolved — ready to build";
  } else if (overallVerdict === "conditional") {
    ctaText = "Decisions resolved — re-run to confirm";
  } else {
    ctaText = "Ready to prototype — run again";
  }

  const segments = 10;
  const filled = Math.round((pct / 100) * segments);

  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: bgColor,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-caption)",
            fontFamily: MONO,
            color: "var(--on-surface-variant)",
            lineHeight: 1,
          }}
        >
          Open decisions resolved:{" "}
          <strong style={{ color: barColor }}>
            {resolvedBlocking} of {totalBlocking}
          </strong>
        </span>

        {/* Segment bar */}
        <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {Array.from({ length: segments }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: i < filled ? barColor : "var(--surface-container)",
                transition: "background 0.2s",
              }}
            />
          ))}
        </span>

        <span
          style={{
            fontSize: "var(--text-label)",
            fontFamily: MONO,
            color: barColor,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {pct}%
        </span>
      </div>

      <p
        style={{
          fontSize: "var(--text-label)",
          fontFamily: SANS,
          color: "var(--on-surface-variant)",
          margin: 0,
          lineHeight: 1,
        }}
      >
        → {ctaText}
      </p>
    </div>
  );
}

