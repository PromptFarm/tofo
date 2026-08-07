"use client";

import type { ReactNode } from "react";
import { MONO, SANS } from "../../OutcomeReport.utils";

// ── InlineToken ───────────────────────────────────────────────────────────────

export function InlineToken({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "state" | "field";
}) {
  const palette =
    tone === "state"
      ? { border: "var(--color-info-border)", background: "var(--color-info-bg)", color: "var(--color-info-text)" }
      : tone === "field"
        ? { border: "var(--color-success-border)", background: "var(--color-success-bg)", color: "var(--color-success-text)" }
        : { border: "var(--surface-container)", background: "var(--surface-low)", color: "var(--on-surface-variant)" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        fontSize: "var(--text-caption)",
        fontFamily: MONO,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        verticalAlign: "baseline",
      }}
    >
      {children}
    </span>
  );
}

// ── renderRuleLikeText ────────────────────────────────────────────────────────

export function renderRuleLikeText(text: string): ReactNode {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const rulePattern = /^(ready|decision_required|user_input_required|conflict)\s+needs\s+(.+)$/i;
  const segments = trimmed.split(/\s*,\s*/);
  const parsedSegments = segments.map((segment) => {
    const match = segment.match(rulePattern);
    return match ? { state: match[1], requirement: match[2] } : null;
  });

  if (parsedSegments.every(Boolean)) {
    return (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, rowGap: 8 }}>
        {parsedSegments.map((segment, index) => (
          <span key={`${segment!.state}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <InlineToken tone="state">{segment!.state}</InlineToken>
            <span>needs</span>
            <InlineToken tone="field">{segment!.requirement}</InlineToken>
          </span>
        ))}
      </span>
    );
  }

  const fragmentPattern = /\b(ready|decision_required|user_input_required|conflict|nextStep|required questions|real trade-offs|2-3 options)\b/g;
  const pieces: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fragmentPattern.exec(trimmed)) !== null) {
    if (match.index > lastIndex) pieces.push(trimmed.slice(lastIndex, match.index));
    const token = match[0];
    const tone =
      token === "ready" || token === "decision_required" || token === "user_input_required" || token === "conflict"
        ? "state"
        : "field";
    pieces.push(<InlineToken key={`${token}-${match.index}`} tone={tone}>{token}</InlineToken>);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < trimmed.length) pieces.push(trimmed.slice(lastIndex));
  return pieces.length > 0 ? <>{pieces}</> : trimmed;
}

// ── StructuredListText ────────────────────────────────────────────────────────

function parseInlineListText(text: string): { label: string | null; items: string[] } {
  const trimmed = text.trim();
  if (!trimmed) return { label: null, items: [] };
  const labeledMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
  const label = labeledMatch ? labeledMatch[1].trim() : null;
  const body = labeledMatch ? labeledMatch[2].trim() : trimmed;
  const items = body.split(/\s*;\s*/).map((item) => item.trim()).filter((item) => item.length > 0);
  return { label, items };
}

export function StructuredListText({ text, fontSize = 11 }: { text: string; fontSize?: number }) {
  const parsed = parseInlineListText(text);
  if (parsed.items.length < 2) return <>{renderRuleLikeText(text)}</>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {parsed.label ? <span style={{ color: "var(--on-surface)" }}>{parsed.label}:</span> : null}
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {parsed.items.map((item, index) => (
          <li key={`${parsed.label ?? "inline-list"}-${index}`} style={{ fontSize, color: "var(--on-surface-variant)", lineHeight: 1.55, fontFamily: SANS }}>
            {renderRuleLikeText(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

