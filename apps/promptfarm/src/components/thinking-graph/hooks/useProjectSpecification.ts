"use client";

import { useMemo } from "react";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type {
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
} from "@/lib/thinking-graph/server/types";
import type { WorkingContextSection } from "@/lib/thinking-graph/projectSpecification";
import {
  buildProjectSpecificationText,
  buildWorkingContextSections,
} from "@/lib/thinking-graph/projectSpecification";

// ── Input / output types ──────────────────────────────────────────────────────

export type ProjectSpecInput = {
  ideaPrompt: string;
  appliedChatDigest: string[];
  appliedDecisions: SyntheticPreparedDecision[];
  appliedStructuredClarifications: SyntheticPreparedClarification[];
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
};

export type ProjectSpecViewModel = {
  /**
   * The full serialised working-context string, suitable for copy-pasting or
   * inclusion in the next LLM prompt. Shown in the collapsible `<pre>` block.
   */
  specText: string;
  /**
   * Filtered, display-ready sections for the card grid. Decision-family
   * duplicates and fully-hidden sections are already removed.
   */
  contextSections: WorkingContextSection[];
  /**
   * Whether there are any meaningful sections to display (excludes the always-
   * present "What We Are Building" stub so an empty run shows a helpful message).
   */
  hasSections: boolean;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Prepares all data for `WorkingContextTab`.
 *
 * Encapsulates the two `useMemo` blocks that were previously inline in the
 * component so the component itself becomes a pure renderer with no logic.
 *
 * Filtering rules for `contextSections`:
 * - "Decision Families" section is hidden when `decisionFamilies` is non-empty
 *   (the Decision Matrix tab already surfaces these).
 * - "What Can Be Done Now" section is trimmed to items that are NOT pure
 *   `choose …` entries (those belong in the Decision Matrix too).
 */
export function useProjectSpecification(input: ProjectSpecInput): ProjectSpecViewModel {
  const specText = useMemo(
    () =>
      buildProjectSpecificationText({
        ideaPrompt: input.ideaPrompt,
        appliedChatDigest: input.appliedChatDigest,
        appliedDecisions: input.appliedDecisions,
        appliedStructuredClarifications: input.appliedStructuredClarifications,
        summaryReport: input.summaryReport,
        synthetics: input.synthetics,
        edges: input.edges,
        outputsBySyntheticId: input.outputsBySyntheticId,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.ideaPrompt,
      input.appliedChatDigest,
      input.appliedDecisions,
      input.appliedStructuredClarifications,
      input.summaryReport,
      input.synthetics,
      input.edges,
      input.outputsBySyntheticId,
    ],
  );

  const contextSections = useMemo(() => {
    const hasDecisionFamilies = input.summaryReport.decisionFamilies.length > 0;

    return buildWorkingContextSections({
      ideaPrompt: input.ideaPrompt,
      appliedChatDigest: input.appliedChatDigest,
      appliedDecisions: input.appliedDecisions,
      appliedStructuredClarifications: input.appliedStructuredClarifications,
      summaryReport: input.summaryReport,
      synthetics: input.synthetics,
      edges: input.edges,
      outputsBySyntheticId: input.outputsBySyntheticId,
    }).filter((section) => {
      // Decision families are already shown in the Decision Matrix tab
      if (hasDecisionFamilies && section.title === "Decision Families") return false;
      // Trim "What Can Be Done Now" to non-choice items when families exist
      if (hasDecisionFamilies && section.title === "What Can Be Done Now") {
        return section.items.some(
          (item) => !item.trim().toLowerCase().startsWith("choose "),
        );
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.ideaPrompt,
    input.appliedChatDigest,
    input.appliedDecisions,
    input.appliedStructuredClarifications,
    input.summaryReport,
    input.synthetics,
    input.edges,
    input.outputsBySyntheticId,
  ]);

  const hasSections = contextSections.some(
    (s) => s.title !== "What We Are Building" && s.items.length > 0,
  );

  return { specText, contextSections, hasSections };
}

