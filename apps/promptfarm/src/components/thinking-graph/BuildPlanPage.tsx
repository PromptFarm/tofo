"use client";

import { useState, useCallback } from "react";
import type { SyntheticNode, SyntheticEdge } from "@/lib/planning/types";
import { buildBuildPlanExportPayload } from "@/lib/thinking-graph/buildPlanExport";
import { deriveBuildPlanUiState } from "@/lib/thinking-graph/buildPlanUiState";
import {
  formatPreparedClarificationHeader,
  formatPreparedDecisionInline,
} from "@/lib/thinking-graph/userFacingPresentation";
import type {
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticReport,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
} from "@/lib/thinking-graph/server/types";

const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

export type BuildTask = {
  id: string;
  title: string;
  ownerCode: string;
  ownerColor: string;
  duration: string;
  durationDays: number;
  storyPoints: number;
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  acceptanceCriteria: string[];
  subTasks: string[];
  risk?: { label: string; color: string };
  agentId?: string;
};

export type BuildPhase = {
  id: string;
  name: string;
  goal: string;
  totalDuration: string;
  totalDays: number;
  tasks: BuildTask[];
  conflicts: { agent: string; agentCode: string; flag: string }[];
};

function agentColor(code: string): string {
  const map: Record<string, string> = {
    UX: "#a78bfa",
    U2: "#a78bfa",
    EN: "#60a5fa",
    B2: "#60a5fa",
    PM: "#34d399",
    QA: "#34d399",
    AT: "#34d399",
    FN: "#fbbf24",
    FO: "#fbbf24",
    MK: "#fb923c",
    BR: "#fb923c",
    RS: "#38bdf8",
    AN: "#38bdf8",
    PV: "#e879f9",
    LO: "#e879f9",
    MD: "#f472b6",
    CS: "#f472b6",
    CN: "#4ade80",
    GR: "#4ade80",
    MB: "#818cf8",
    PT: "#818cf8",
    CM: "#c084fc",
  };
  return map[code] ?? "#8890b0";
}

function findOutputByCode(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  code: string,
): SyntheticOutputJson | null {
  const synthetic = synthetics.find((item) => item.code === code);
  if (!synthetic) return null;
  return outputsBySyntheticId[synthetic.id] ?? null;
}

function asSyntheticReport(
  output: SyntheticOutputJson | null,
): SyntheticReport | null {
  if (!output || !("details" in output)) return null;
  return output;
}

function getOutputSummary(output: SyntheticOutputJson | null): string | null {
  if (!output) return null;
  if ("summary" in output && typeof output.summary === "string") {
    return output.summary;
  }
  if ("topRecommendation" in output && typeof output.topRecommendation === "string") {
    return output.topRecommendation;
  }
  return null;
}

function getOperationalReport(output: SyntheticOutputJson | null) {
  return asSyntheticReport(output)?.operational ?? null;
}

function firstOperationalAction(
  output: SyntheticOutputJson | null,
): string | null {
  const operational = getOperationalReport(output);
  if (!operational) return null;
  return operational.nextSteps[0]?.trim() || null;
}

function firstOperationalArtifact(
  output: SyntheticOutputJson | null,
): string | null {
  const operational = getOperationalReport(output);
  if (!operational) return null;
  return operational.artifactsReady[0]?.trim() || null;
}

function firstOperationalFinding(
  output: SyntheticOutputJson | null,
): string | null {
  const operational = getOperationalReport(output);
  if (!operational) return null;
  return (
    operational.findings[0]?.trim() ||
    operational.summary.trim() ||
    null
  );
}

function firstOperationalRisk(
  output: SyntheticOutputJson | null,
): string | null {
  const operational = getOperationalReport(output);
  if (!operational) return null;
  return (
    operational.risks[0]?.trim() ||
    operational.readiness.blockers[0]?.trim() ||
    null
  );
}

// Returns the first non-empty opinion text found across the given agent codes,
// falling back to a prompt-anchored sentence if no agent has run opinions yet.
function deriveGoal(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  summaryReport: RunSummaryReport,
  ideaPrompt: string,
  preferredCodes: string[],
  fallback: string,
): string {
  const idea = ideaPrompt.trim();
  const ideaFragment =
    idea.length > 0
      ? idea.length > 72
        ? `${idea.slice(0, 72)}…`
        : idea
      : null;

  for (const code of preferredCodes) {
    const output = findOutputByCode(synthetics, outputsBySyntheticId, code);
    const text =
      firstOperationalAction(output) ??
      firstOperationalArtifact(output) ??
      firstOperationalFinding(output) ??
      getOutputSummary(output);
    if (text?.trim()) return text.trim();
  }

  // No opinions yet — weave the idea into the fallback so it's at least specific
  const summaryFallback = summaryReport.executiveBrief[0]?.sentence;
  if (summaryFallback?.trim()) return summaryFallback.trim();

  return ideaFragment ? `${fallback} Scoped for: ${ideaFragment}.` : fallback;
}

// Extracts a risk label from the owning agent's opinion, keeping the original
// fallback color (which carries severity intent). Falls back to the hardcoded
// label when no opinions have been generated yet.
function deriveRisk(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  ownerCode: string,
  fallback: { label: string; color: string },
): { label: string; color: string } {
  const output = findOutputByCode(synthetics, outputsBySyntheticId, ownerCode);
  const operationalRisk = firstOperationalRisk(output);
  if (operationalRisk) {
    const label =
      operationalRisk.length > 72
        ? `${operationalRisk.slice(0, 72)}…`
        : operationalRisk;
    return { label, color: fallback.color };
  }
  const directRisk = asSyntheticReport(output)?.keyRisks[0]?.trim();
  if (directRisk) {
    const label =
      directRisk.length > 72 ? `${directRisk.slice(0, 72)}…` : directRisk;
    return { label, color: fallback.color };
  }

  const text = asSyntheticReport(output)?.details ?? getOutputSummary(output);
  if (text?.trim()) {
    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);
    const riskSentence =
      sentences.find((s) =>
        /risk|concern|challeng|issue|gap|missing|problem|unclear|unknown|caution|warn|compli|depend|limit/i.test(
          s,
        ),
      ) ?? sentences[0];
    if (riskSentence) {
      const label =
        riskSentence.length > 72
          ? `${riskSentence.slice(0, 72)}…`
          : riskSentence;
      return { label, color: fallback.color };
    }
  }
  return fallback;
}

function daysToPoints(days: number): number {
  if (days <= 1) return 2;
  if (days <= 2) return 3;
  if (days <= 3) return 5;
  if (days <= 5) return 8;
  return 13;
}

// Pull a short description from the owning agent's opinion; fall back to the
// task title rephrased as an imperative sentence.
function deriveDescription(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  ownerCode: string,
  fallback: string,
): string {
  const output = findOutputByCode(synthetics, outputsBySyntheticId, ownerCode);
  const text =
    firstOperationalFinding(output) ??
    firstOperationalAction(output) ??
    getOutputSummary(output);
  if (text?.trim()) {
    const first = text
      .trim()
      .split(/[.!?]+/)[0]
      ?.trim();
    if (first && first.length > 20) {
      return first.length > 160 ? `${first.slice(0, 160)}…` : first;
    }
  }
  return fallback;
}

function derivePhaseConflicts(input: {
  synthetics: SyntheticNode[];
  summaryReport: RunSummaryReport;
  agentCodes: string[];
  fallbacks: { agent: string; agentCode: string; flag: string }[];
}): { agent: string; agentCode: string; flag: string }[] {
  const syntheticById = new Map(
    input.synthetics.map((synthetic) => [synthetic.id, synthetic]),
  );

  const summaryConflicts = input.summaryReport.conflictMap
    .map((conflict) => {
      const fromSynthetic = syntheticById.get(conflict.fromSyntheticId);
      const toSynthetic = syntheticById.get(conflict.toSyntheticId);
      const owner =
        (fromSynthetic && input.agentCodes.includes(fromSynthetic.code)
          ? fromSynthetic
          : undefined) ??
        (toSynthetic && input.agentCodes.includes(toSynthetic.code)
          ? toSynthetic
          : undefined);

      if (!owner) return null;

      return {
        agent: owner.name,
        agentCode: owner.code,
        flag: conflict.description,
      };
    })
    .filter(
      (
        conflict,
      ): conflict is { agent: string; agentCode: string; flag: string } =>
        Boolean(conflict),
    );

  return summaryConflicts.length > 0 ? summaryConflicts : input.fallbacks;
}

export function makeBuildPlan(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  summaryReport: RunSummaryReport,
  ideaPrompt: string,
): BuildPhase[] {
  const hasCode = (c: string) => synthetics.some((s) => s.code === c);
  const pickCode = (...candidates: string[]) =>
    candidates.find(hasCode) ?? candidates[0];

  const eng = pickCode("EN", "B2");
  const design = pickCode("UX", "U2");
  const pm = pickCode("PM");
  const qa = pickCode("QA", "AT");
  const legal = pickCode("LO", "PV");
  const fin = pickCode("FN", "FO");
  const analytics = pickCode("AN");
  const content = pickCode("CN");
  const mkt = pickCode("MK", "BR");
  const research = pickCode("RS");
  const cm = pickCode("CM");
  const cs = pickCode("CS");

  // Prefer an exact code match; fall back to any available synthetic so the
  // Chat button is never disabled just because the canvas uses custom role codes.
  const nodeIdFor = (code: string): string | undefined =>
    (synthetics.find((s) => s.code === code) ?? synthetics[0])?.id;

  return [
    {
      id: "design",
      name: "Design & Validate",
      goal: deriveGoal(
        synthetics,
        outputsBySyntheticId,
        summaryReport,
        ideaPrompt,
        [research, design, pm, legal],
        "Lock the core UX, derisk technical unknowns, and validate key assumptions before writing production code.",
      ),
      totalDuration: "2 weeks",
      totalDays: 14,
      tasks: [
        {
          id: "d1",
          title: "Map first-session user flow end to end",
          ownerCode: design,
          ownerColor: agentColor(design),
          duration: "3d",
          durationDays: 3,
          storyPoints: daysToPoints(3),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            design,
            "Document every screen and decision point a new user encounters from sign-up through their first completed action.",
          ),
          acceptanceCriteria: [
            "Flow covers all entry paths (invited, self-signup, SSO)",
            "Drop-off hypotheses noted at each step with instrumentation plan",
            "Diagram reviewed and signed off by PM",
          ],
          subTasks: [
            "Conduct 3 user interviews focused on the first check-in moment",
            "Map current-state emotional journey from onboarding to first team log",
            "Identify drop-off points and define instrumentation events",
            "Deliver annotated flow diagram with edge cases documented",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, design, {
            label: "First-session drop-off risk",
            color: "#f87171",
          }),
          agentId: nodeIdFor(design),
        },
        {
          id: "d2",
          title: "Technical spike on auth & integration layer",
          ownerCode: eng,
          ownerColor: agentColor(eng),
          duration: "3d",
          durationDays: 3,
          storyPoints: daysToPoints(3),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            eng,
            "Prototype the auth flow and integration endpoints to surface complexity and lock in the technical approach before the build phase.",
          ),
          acceptanceCriteria: [
            "Auth flow works end-to-end in staging environment",
            "Integration risk register documented with mitigations",
            "Library / approach decision recorded in ADR",
          ],
          subTasks: [
            "Prototype OAuth flow with primary identity provider",
            "Benchmark integration endpoint latency under realistic load",
            "Document integration risks and mitigation options",
            "Record architectural decision and share with team",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, eng, {
            label: "Integration complexity unscoped",
            color: "#f87171",
          }),
          agentId: nodeIdFor(eng),
        },
        {
          id: "d3",
          title: "Core feature spec & scope document",
          ownerCode: pm,
          ownerColor: agentColor(pm),
          duration: "2d",
          durationDays: 2,
          storyPoints: daysToPoints(2),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            pm,
            "Write a clear problem statement, define what is in and out of scope, and get alignment from eng, design, and stakeholders before any code is written.",
          ),
          acceptanceCriteria: [
            "Spec approved by eng, design, and key stakeholders",
            "Success metrics are measurable and baselined",
            "Out-of-scope list agreed to prevent scope creep",
          ],
          subTasks: [
            "Write problem statement and measurable success metrics",
            "Draft feature spec with explicit in/out-of-scope boundary",
            "Run spec review session with eng and design leads",
          ],
          agentId: nodeIdFor(pm),
        },
        {
          id: "d4",
          title: "Data collection & privacy consent review",
          ownerCode: legal,
          ownerColor: agentColor(legal),
          duration: "2d",
          durationDays: 2,
          storyPoints: daysToPoints(2),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            legal,
            "Audit every data field collected in the first session against GDPR and CCPA requirements and produce a consent-flow spec for engineering.",
          ),
          acceptanceCriteria: [
            "Data minimisation checklist completed for all first-session fields",
            "Consent flow covers all target jurisdictions",
            "Legal sign-off obtained before build phase starts",
          ],
          subTasks: [
            "Audit all data fields collected during first session",
            "Map data flows to GDPR / CCPA requirements",
            "Draft consent copy and submit for legal review",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, legal, {
            label: "Privacy consent scope not confirmed",
            color: "#fb923c",
          }),
          agentId: nodeIdFor(legal),
        },
        {
          id: "d5",
          title: "Cost model & infrastructure sizing",
          ownerCode: fin,
          ownerColor: agentColor(fin),
          duration: "1d",
          durationDays: 1,
          storyPoints: daysToPoints(1),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            fin,
            "Model baseline, average, and burst traffic scenarios to size infrastructure and get budget approval before committing to production architecture.",
          ),
          acceptanceCriteria: [
            "Cost model covers baseline, average, and burst scenarios",
            "Budget approved by finance before infrastructure provisioned",
            "Alert thresholds configured in monitoring tool",
          ],
          subTasks: [
            "Model three traffic scenarios (baseline / average / burst)",
            "Get cloud cost estimates per scenario from provider console",
            "Define budget thresholds and configure billing alerts",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, fin, {
            label: "Burst scenario not modelled",
            color: "#fb923c",
          }),
          agentId: nodeIdFor(fin),
        },
      ],
      conflicts: derivePhaseConflicts({
        synthetics,
        summaryReport,
        agentCodes: [eng, fin, legal, design, pm, research],
        fallbacks: [
          {
            agent: "Engineer",
            agentCode: eng,
            flag: "Auth integration complexity could delay Phase 2 start by up to one week.",
          },
          {
            agent: "Finance",
            agentCode: fin,
            flag: "Cost model is missing a burst-traffic scenario — risk of budget overrun at scale.",
          },
        ],
      }),
    },
    {
      id: "mvp",
      name: "Build MVP",
      goal: deriveGoal(
        synthetics,
        outputsBySyntheticId,
        summaryReport,
        ideaPrompt,
        [eng, pm, qa],
        "Deliver the minimum viable product: core features, onboarding, and instrumentation.",
      ),
      totalDuration: "4 weeks",
      totalDays: 28,
      tasks: [
        {
          id: "m1",
          title: "Implement core logging UX",
          ownerCode: eng,
          ownerColor: agentColor(eng),
          duration: "1w",
          durationDays: 5,
          storyPoints: daysToPoints(5),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            eng,
            "Build the primary check-in interface — form, validation, local state, server sync, and all error/loading states — against the Phase 1 design spec.",
          ),
          acceptanceCriteria: [
            "User can complete a check-in in under 60 seconds on target devices",
            "Data persists correctly on refresh and across sessions",
            "All error states handled gracefully with actionable messaging",
          ],
          subTasks: [
            "Build check-in form component with field validation",
            "Implement optimistic local state with server sync",
            "Wire form to backend API endpoints",
            "Add loading, error, and empty states",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, eng, {
            label: "Depends on Phase 1 design spec",
            color: "#60a5fa",
          }),
          agentId: nodeIdFor(eng),
        },
        {
          id: "m2",
          title: "Build & test formula engine",
          ownerCode: eng,
          ownerColor: agentColor(eng),
          duration: "1w",
          durationDays: 5,
          storyPoints: daysToPoints(5),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            eng,
            "Implement the core calculation logic with full unit-test coverage, a configuration UI, and edge-case handling for empty inputs and boundary conditions.",
          ),
          acceptanceCriteria: [
            "Formula engine passes all unit tests including edge cases",
            "Results match expected output for all documented scenarios",
            "Engine handles division-by-zero and null inputs without crashing",
          ],
          subTasks: [
            "Implement core calculation logic with unit tests",
            "Build formula configuration UI component",
            "Handle edge cases: empty inputs, division by zero, large numbers",
            "Performance test with realistic production data volume",
          ],
          agentId: nodeIdFor(eng),
        },
        {
          id: "m3",
          title: "Onboarding copy & first-session flow",
          ownerCode: content,
          ownerColor: agentColor(content),
          duration: "4d",
          durationDays: 4,
          storyPoints: daysToPoints(4),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            content,
            "Write all product copy for onboarding — welcome screens, tooltips, empty states, and error messages — so no placeholder text ships to production.",
          ),
          acceptanceCriteria: [
            "All UI states have copy reviewed by PM (no placeholders in production)",
            "Reading level appropriate for the target audience",
            "Copy localisation-ready (no embedded values in strings)",
          ],
          subTasks: [
            "Write welcome and value-proposition screen copy",
            "Write step-by-step onboarding tooltip sequence",
            "Write empty-state and error messages for all flows",
          ],
          agentId: nodeIdFor(content),
        },
        {
          id: "m4",
          title: "Instrumentation & KPI tracking setup",
          ownerCode: analytics,
          ownerColor: agentColor(analytics),
          duration: "3d",
          durationDays: 3,
          storyPoints: daysToPoints(3),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            analytics,
            "Define the event taxonomy, instrument all key user actions, validate events in staging, and build an initial KPI dashboard before launch.",
          ),
          acceptanceCriteria: [
            "All defined events fire correctly in production with correct properties",
            "KPI dashboard populated with live data on day one",
            "Event schema documented for future reference",
          ],
          subTasks: [
            "Define event taxonomy and naming convention",
            "Instrument analytics events for all key user actions",
            "Validate event firing and properties in staging",
            "Build initial KPI dashboard with core metrics",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, analytics, {
            label: "Behavioural signal not yet validated",
            color: "#fb923c",
          }),
          agentId: nodeIdFor(analytics),
        },
        {
          id: "m5",
          title: "Privacy consent flow implementation",
          ownerCode: legal,
          ownerColor: agentColor(legal),
          duration: "2d",
          durationDays: 2,
          storyPoints: daysToPoints(2),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            legal,
            "Implement consent capture, storage, retrieval, and opt-out including a data deletion pathway, matching the spec approved in Phase 1.",
          ),
          acceptanceCriteria: [
            "Consent captured and stored before any data collection begins",
            "Opt-out triggers data deletion within 30 days",
            "Legal confirms implementation matches approved spec",
          ],
          subTasks: [
            "Build consent banner and modal component",
            "Implement consent storage and retrieval logic",
            "Implement opt-out flow and data deletion request pathway",
          ],
          agentId: nodeIdFor(legal),
        },
        {
          id: "m6",
          title: "E2E tests for first-session journey",
          ownerCode: qa,
          ownerColor: agentColor(qa),
          duration: "3d",
          durationDays: 3,
          storyPoints: daysToPoints(3),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            qa,
            "Map all branches in the first-session flow and write E2E tests covering the happy path and all error/edge paths, integrated into CI.",
          ),
          acceptanceCriteria: [
            "Coverage ≥80% of first-session branches",
            "All tests pass in CI before any PR is merged to main",
            "Test results surfaced in PR review comments",
          ],
          subTasks: [
            "Map all branches in the first-session user flow",
            "Write E2E tests for the happy path",
            "Write E2E tests for error and edge-case paths",
            "Integrate test suite into CI pipeline with pass/fail gate",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, qa, {
            label: "Highest branch complexity, least coverage",
            color: "#f87171",
          }),
          agentId: nodeIdFor(qa),
        },
      ],
      conflicts: derivePhaseConflicts({
        synthetics,
        summaryReport,
        agentCodes: [pm, qa, eng, analytics, legal, content],
        fallbacks: [
          {
            agent: "Product",
            agentCode: pm,
            flag: "Formula + community features in same phase creates scope-creep risk.",
          },
          {
            agent: "QA",
            agentCode: qa,
            flag: "Onboarding flow has the highest branch complexity — needs dedicated E2E coverage before any release.",
          },
        ],
      }),
    },
    {
      id: "launch",
      name: "Launch & Iterate",
      goal: deriveGoal(
        synthetics,
        outputsBySyntheticId,
        summaryReport,
        ideaPrompt,
        [mkt, cm, cs],
        "Controlled beta, public announcement, and a post-launch feedback loop to inform the next iteration.",
      ),
      totalDuration: "2 weeks",
      totalDays: 14,
      tasks: [
        {
          id: "l1",
          title: "Private beta with 5–10 core users",
          ownerCode: cm,
          ownerColor: agentColor(cm),
          duration: "1w",
          durationDays: 5,
          storyPoints: daysToPoints(5),
          priority: "high",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            cm,
            "Recruit and onboard a small cohort of high-fit users, guide them through the product, and collect structured feedback to validate core assumptions.",
          ),
          acceptanceCriteria: [
            "≥5 users complete at least 3 check-in sessions each",
            "Structured feedback collected from all participants",
            "Top 3 pain points documented and prioritised for next iteration",
          ],
          subTasks: [
            "Identify and recruit beta cohort from existing network",
            "Onboard each user with a guided walkthrough session",
            "Collect structured feedback via in-app survey and follow-up interviews",
          ],
          agentId: nodeIdFor(cm),
        },
        {
          id: "l2",
          title: "Marketing announcement & case study",
          ownerCode: mkt,
          ownerColor: agentColor(mkt),
          duration: "3d",
          durationDays: 3,
          storyPoints: daysToPoints(3),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            mkt,
            "Write the launch blog post, prepare the social media announcement sequence, and create a one-page case study from beta user outcomes.",
          ),
          acceptanceCriteria: [
            "Launch copy approved by PM and legal before publish date",
            "Case study includes at least one quantified outcome from beta",
            "All channels scheduled and ready 48h before launch",
          ],
          subTasks: [
            "Write launch blog post with product story and beta outcome",
            "Prepare social media announcement sequence (3–5 posts)",
            "Create 1-page case study from beta feedback and metrics",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, mkt, {
            label: "No proof points yet — messaging at risk",
            color: "#fb923c",
          }),
          agentId: nodeIdFor(mkt),
        },
        {
          id: "l3",
          title: "Post-launch monitoring & alerting",
          ownerCode: analytics,
          ownerColor: agentColor(analytics),
          duration: "ongoing",
          durationDays: 5,
          storyPoints: daysToPoints(5),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            analytics,
            "Configure uptime and error-rate alerts, set KPI baselines and anomaly thresholds, and establish a weekly metrics review cadence.",
          ),
          acceptanceCriteria: [
            "Alerts firing correctly in staging before go-live",
            "On-call runbook published and shared with team",
            "First weekly metrics review held within 7 days of launch",
          ],
          subTasks: [
            "Configure uptime and error-rate alerts in monitoring tool",
            "Set KPI baselines and anomaly detection thresholds",
            "Write and publish on-call runbook",
            "Schedule recurring weekly metrics review",
          ],
          agentId: nodeIdFor(analytics),
        },
        {
          id: "l4",
          title: "Support knowledge base pre-launch",
          ownerCode: cs,
          ownerColor: agentColor(cs),
          duration: "2d",
          durationDays: 2,
          storyPoints: daysToPoints(2),
          priority: "medium",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            cs,
            "Identify the top support scenarios from beta, write help articles for each, and publish the knowledge base with a visible in-product link before launch day.",
          ),
          acceptanceCriteria: [
            "Knowledge base covers top 5 support scenarios identified from beta",
            "Articles reviewed and approved by CS lead",
            "Help link visible in product before public launch",
          ],
          subTasks: [
            "Identify top 5 support scenarios from beta feedback",
            "Write and illustrate a help article for each scenario",
            "Publish knowledge base and wire up in-product help link",
          ],
          risk: deriveRisk(synthetics, outputsBySyntheticId, cs, {
            label: "Top support scenarios not yet mapped",
            color: "#fbbf24",
          }),
          agentId: nodeIdFor(cs),
        },
        {
          id: "l5",
          title: "Iteration retrospective & next-pass plan",
          ownerCode: pm,
          ownerColor: agentColor(pm),
          duration: "1d",
          durationDays: 1,
          storyPoints: daysToPoints(1),
          priority: "low",
          description: deriveDescription(
            synthetics,
            outputsBySyntheticId,
            pm,
            "Run a structured retrospective with the full team, synthesise learnings into themes, and draft the next iteration scope with updated estimates.",
          ),
          acceptanceCriteria: [
            "Retro completed within 2 weeks of launch",
            "Action items documented with owners and due dates",
            "Next iteration scope reviewed and approved by stakeholders",
          ],
          subTasks: [
            "Collect async retro input from all team members",
            "Facilitate retro session and synthesise themes",
            "Draft next iteration scope with updated story point estimates",
          ],
          agentId: nodeIdFor(pm),
        },
      ],
      conflicts: derivePhaseConflicts({
        synthetics,
        summaryReport,
        agentCodes: [mkt, research, cm, cs, analytics, pm],
        fallbacks: [
          {
            agent: "Marketing",
            agentCode: mkt,
            flag: "Launch date commitment may not align with technical readiness — consider a soft launch.",
          },
          {
            agent: "Research",
            agentCode: research,
            flag: "Evidence for the behaviour-change loop is still thin — validate with beta cohort before scaling.",
          },
        ],
      }),
    },
  ];
}

/* ─────────────────────── Gantt bar row ─────────────────────── */

const PRIORITY_META: Record<
  BuildTask["priority"],
  { label: string; color: string }
> = {
  critical: { label: "Critical", color: "#f87171" },
  high: { label: "High", color: "#fb923c" },
  medium: { label: "Medium", color: "#fbbf24" },
  low: { label: "Low", color: "#60a5fa" },
};

function GanttRow({
  task,
  phaseTotal,
  onChatWithAgent,
  hoveredTaskId,
  setHoveredTaskId,
  isCompleted,
  onToggleComplete,
  isExpanded,
  onToggleExpand,
}: {
  task: BuildTask;
  phaseTotal: number;
  onChatWithAgent: (agentId: string) => void;
  hoveredTaskId: string | null;
  setHoveredTaskId: (id: string | null) => void;
  isCompleted: boolean;
  onToggleComplete: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}) {
  const barPct = Math.min(
    100,
    Math.max(4, (task.durationDays / phaseTotal) * 100),
  );
  const isHovered = hoveredTaskId === task.id;
  const priority = PRIORITY_META[task.priority];

  return (
    <div
      onMouseEnter={() => setHoveredTaskId(task.id)}
      onMouseLeave={() => setHoveredTaskId(null)}
      style={{
        borderRadius: 6,
        border: `1px solid ${isCompleted ? "rgba(52,211,153,0.2)" : isExpanded ? "rgba(167,139,250,0.35)" : isHovered ? "rgba(167,139,250,0.3)" : "var(--surface-container)"}`,
        background: isCompleted
          ? "rgba(52,211,153,0.04)"
          : isExpanded
            ? "rgba(167,139,250,0.05)"
            : isHovered
              ? "rgba(167,139,250,0.04)"
              : "var(--surface-low)",
        transition: "border-color 0.12s, background 0.12s",
        opacity: isCompleted ? 0.65 : 1,
        overflow: "hidden",
      }}
    >
      {/* ── Collapsed row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto 1fr auto auto",
          gap: 10,
          alignItems: "center",
          padding: "8px 10px",
        }}
      >
        {/* Checkbox */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(task.id);
          }}
          title={isCompleted ? "Mark incomplete" : "Mark complete"}
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            flexShrink: 0,
            padding: 0,
            border: `1.5px solid ${isCompleted ? "#34d399" : "var(--surface-container)"}`,
            background: isCompleted ? "rgba(52,211,153,0.15)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.12s",
          }}
        >
          {isCompleted && (
            <span style={{ fontSize: 9, color: "#34d399", lineHeight: 1 }}>
              ✓
            </span>
          )}
        </button>

        {/* Owner badge */}
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 4,
            flexShrink: 0,
            background: `${task.ownerColor}18`,
            border: `1px solid ${task.ownerColor}44`,
            color: task.ownerColor,
            fontFamily: MONO,
          }}
        >
          {task.ownerCode}
        </span>

        {/* Title + bar */}
        <button
          type="button"
          onClick={() => onToggleExpand(task.id)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <p
                style={{
                  fontSize: 11,
                  fontFamily: SANS,
                  lineHeight: 1.3,
                  margin: 0,
                  textDecoration: isCompleted ? "line-through" : "none",
                  color: isCompleted ? "var(--t3)" : "var(--on-surface)",
                }}
              >
                {task.title}
              </p>
              <span
                style={{
                  fontSize: 8,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  flexShrink: 0,
                }}
              >
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: "var(--surface-container)",
                  borderRadius: 99,
                  overflow: "hidden",
                  maxWidth: 200,
                }}
              >
                <div
                  style={{
                    width: `${barPct}%`,
                    height: "100%",
                    background: task.ownerColor,
                    borderRadius: 99,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 8,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  flexShrink: 0,
                }}
              >
                {task.duration}
              </span>
              <span
                style={{
                  fontSize: 8,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  flexShrink: 0,
                }}
              >
                {task.storyPoints} pts
              </span>
              <span
                style={{
                  fontSize: 8,
                  padding: "1px 5px",
                  borderRadius: 3,
                  flexShrink: 0,
                  background: `${priority.color}18`,
                  color: priority.color,
                  fontFamily: MONO,
                }}
              >
                {priority.label}
              </span>
              {task.risk && (
                <span
                  style={{
                    fontSize: 8,
                    padding: "1px 7px",
                    borderRadius: 20,
                    flexShrink: 0,
                    background: `${task.risk.color}15`,
                    border: `1px solid ${task.risk.color}44`,
                    color: task.risk.color,
                    fontFamily: MONO,
                  }}
                >
                  ⚑ {task.risk.label}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Chat button */}
        <button
          type="button"
          onClick={() => task.agentId && onChatWithAgent(task.agentId)}
          disabled={!task.agentId}
          title={
            task.agentId
              ? `Chat with ${task.ownerCode} about this task`
              : "No agents on canvas"
          }
          style={{
            fontSize: 8,
            padding: "3px 8px",
            borderRadius: 4,
            flexShrink: 0,
            whiteSpace: "nowrap",
            border: `1px solid ${task.agentId ? "var(--surface-container)" : "transparent"}`,
            background: "transparent",
            color: task.agentId ? "var(--on-surface-variant)" : "var(--t3)",
            fontFamily: MONO,
            cursor: task.agentId ? "pointer" : "default",
            opacity: task.agentId ? (isHovered ? 1 : 0.6) : 0.3,
            transition: "opacity 0.12s",
          }}
        >
          Chat ↗
        </button>
      </div>

      {/* ── Expanded detail panel ── */}
      {isExpanded && (
        <div
          style={{
            borderTop: "1px solid var(--surface-container)",
            padding: "14px 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Description */}
          <p
            style={{
              fontSize: 11,
              color: "var(--on-surface-variant)",
              fontFamily: SANS,
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {task.description}
          </p>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Acceptance Criteria */}
            <div>
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: MONO,
                  marginBottom: 8,
                }}
              >
                Acceptance Criteria
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {task.acceptanceCriteria.map((criterion, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 7,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "#34d399",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      ✓
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--on-surface-variant)",
                        fontFamily: SANS,
                        lineHeight: 1.5,
                      }}
                    >
                      {criterion}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sub-tasks */}
            <div>
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: MONO,
                  marginBottom: 8,
                }}
              >
                Implementation Steps
              </p>
              <ol
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {task.subTasks.map((step, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 7,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        color: "var(--t3)",
                        fontFamily: MONO,
                        flexShrink: 0,
                        minWidth: 14,
                        marginTop: 2,
                      }}
                    >
                      {i + 1}.
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--on-surface-variant)",
                        fontFamily: SANS,
                        lineHeight: 1.5,
                      }}
                    >
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Phase header strip ─────────────────────── */

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PhaseTimeline({
  phases,
  selectedPhaseId,
  onSelect,
  startDate,
}: {
  phases: BuildPhase[];
  selectedPhaseId: string;
  onSelect: (id: string) => void;
  startDate: Date;
}) {
  const totalDays = phases.reduce((sum, p) => sum + p.totalDays, 0);

  // Compute cumulative start day offset for each phase
  const phaseOffsets: number[] = [];
  let cursor = 0;
  for (const p of phases) {
    phaseOffsets.push(cursor);
    cursor += p.totalDays;
  }

  return (
    <div>
      {/* "Starting today" anchor */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(167,139,250,0.15)",
            border: "1px solid rgba(167,139,250,0.35)",
            color: "var(--primary)",
            fontFamily: MONO,
          }}
        >
          starts {fmtDate(startDate)}
        </span>
        <span style={{ fontSize: 8, color: "var(--t3)", fontFamily: MONO }}>
          · {totalDays} days total · ends{" "}
          {fmtDate(addDays(startDate, totalDays))}
        </span>
      </div>

      {/* Phase selector row */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderRadius: 8,
          border: "1px solid var(--surface-container)",
          overflow: "hidden",
        }}
      >
        {phases.map((phase, i) => {
          const isSelected = phase.id === selectedPhaseId;
          const widthPct = (phase.totalDays / totalDays) * 100;
          const phaseStart = addDays(startDate, phaseOffsets[i]);
          const phaseEnd = addDays(
            startDate,
            phaseOffsets[i] + phase.totalDays,
          );
          return (
            <button
              key={`${phase.id}-${i}`}
              type="button"
              onClick={() => onSelect(phase.id)}
              style={{
                width: `${widthPct}%`,
                padding: "10px 12px",
                borderRight:
                  i < phases.length - 1
                    ? "1px solid var(--surface-container)"
                    : "none",
                background: isSelected
                  ? "rgba(167,139,250,0.1)"
                  : "var(--surface-low)",
                borderBottom: isSelected
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
            >
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "0.7px",
                  textTransform: "uppercase",
                  color: isSelected ? "var(--primary)" : "var(--t3)",
                  fontFamily: MONO,
                  marginBottom: 2,
                  whiteSpace: "nowrap",
                }}
              >
                Phase {i + 1} · {phase.totalDuration}
              </p>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isSelected
                    ? "var(--on-surface)"
                    : "var(--on-surface-variant)",
                  fontFamily: SANS,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 3,
                }}
              >
                {phase.name}
              </p>
              <p
                style={{
                  fontSize: 8,
                  color: isSelected ? "rgba(167,139,250,0.8)" : "var(--t3)",
                  fontFamily: MONO,
                  whiteSpace: "nowrap",
                }}
              >
                {fmtDate(phaseStart)} – {fmtDate(phaseEnd)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Linear gantt bar */}
      <div
        style={{
          display: "flex",
          height: 3,
          borderRadius: 99,
          overflow: "hidden",
          marginTop: 6,
          gap: 2,
        }}
      >
        {phases.map((phase, idx) => {
          const colors = ["#a78bfa", "#60a5fa", "#34d399"];
          const isSelected = phase.id === selectedPhaseId;
          return (
            <div
              key={`${phase.id}-${idx}`}
              style={{
                flex: phase.totalDays,
                height: "100%",
                background: isSelected
                  ? colors[idx % colors.length]
                  : "var(--surface-container)",
                borderRadius: 99,
                transition: "background 0.2s",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── Re-sim overlay ─────────────────────── */

function ReSimToast({ phaseId }: { phaseId: string | null }) {
  if (!phaseId) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 70,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 8,
        border: "1px solid rgba(167,139,250,0.4)",
        background: "rgba(167,139,250,0.12)",
        backdropFilter: "blur(12px)",
        pointerEvents: "none",
      }}
    >
      <span className="thinking-dot" style={{ width: 5, height: 5 }} />
      <span className="thinking-dot" style={{ width: 5, height: 5 }} />
      <span className="thinking-dot" style={{ width: 5, height: 5 }} />
      <span
        style={{
          fontSize: 10,
          color: "var(--primary)",
          fontFamily: MONO,
          marginLeft: 4,
        }}
      >
        Re-running agents for {phaseId} phase…
      </span>
    </div>
  );
}

/* ─────────────────────── Main export ─────────────────────── */

export function BuildPlanPage({
  ideaPrompt,
  synthetics,
  edges,
  outputsBySyntheticId,
  summaryReport,
  appliedDecisions = [],
  appliedStructuredClarifications = [],
  onClose,
  onChatWithAgent,
  initialPhaseId,
  completedTaskIds,
  onToggleTaskComplete,
}: {
  ideaPrompt: string;
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  summaryReport: RunSummaryReport;
  appliedDecisions?: SyntheticPreparedDecision[];
  appliedStructuredClarifications?: SyntheticPreparedClarification[];
  onClose: () => void;
  /** Called when user clicks "Chat ↗" — passes the currently-selected phase ID so the caller can restore it on re-open */
  onChatWithAgent: (agentId: string, fromPhaseId: string) => void;
  /** Phase to open on mount — used to restore position after "Chat ↗" and back */
  initialPhaseId?: string;
  completedTaskIds: Set<string>;
  onToggleTaskComplete: (taskId: string) => void;
}) {
  const phases = makeBuildPlan(
    synthetics,
    outputsBySyntheticId,
    summaryReport,
    ideaPrompt,
  );
  const buildPlanUiState = deriveBuildPlanUiState(outputsBySyntheticId);
  const specBlocked = buildPlanUiState.specBlocked;
  const specNeedsClarification = buildPlanUiState.specNeedsClarification;
  const [selectedPhaseId, setSelectedPhaseId] = useState(
    initialPhaseId ?? phases[0]?.id ?? "design",
  );
  const hasAppliedContext =
    appliedDecisions.length > 0 || appliedStructuredClarifications.length > 0;
  const [reSimPhase, setReSimPhase] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exportToJson = useCallback(() => {
    const payload = buildBuildPlanExportPayload({
      ideaPrompt,
      phases,
      appliedDecisions,
      appliedStructuredClarifications,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "promptfarm-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [appliedDecisions, appliedStructuredClarifications, phases, ideaPrompt]);

  const phase = phases.find((p) => p.id === selectedPhaseId) ?? phases[0];

  const handleReSimulate = useCallback((phaseId: string) => {
    setReSimPhase(phaseId);
    setTimeout(() => setReSimPhase(null), 2200);
  }, []);

  const title =
    ideaPrompt.length > 60
      ? `${ideaPrompt.slice(0, 60)}…`
      : ideaPrompt || "Build Plan";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "var(--panel-bg-solid)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Top bar ── */}
      <header
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid var(--surface-container)",
          flexShrink: 0,
          background: "var(--panel-bg)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Back button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              padding: "5px 10px",
              borderRadius: 5,
              border: "1px solid var(--surface-container)",
              background: "transparent",
              color: "var(--on-surface-variant)",
              cursor: "pointer",
              fontFamily: MONO,
            }}
          >
            ← Back to graph
          </button>

          <div
            style={{
              width: 1,
              height: 18,
              background: "var(--surface-container)",
            }}
          />

          <div>
            <p
              style={{
                fontSize: 8,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "var(--t3)",
                fontFamily: MONO,
                marginBottom: 2,
              }}
            >
              Build Plan
            </p>
            <h1
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--on-surface)",
                fontFamily: SANS,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h1>
          </div>
        </div>

        {/* Right side: export + summary pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={exportToJson}
            disabled={buildPlanUiState.exportDisabled}
            style={{
              fontSize: 9,
              padding: "4px 12px",
              borderRadius: 5,
              cursor: "pointer",
              border: "1px solid rgba(167,139,250,0.4)",
              background: "rgba(167,139,250,0.08)",
              color: "var(--primary)",
              fontFamily: MONO,
              fontWeight: 600,
              whiteSpace: "nowrap",
              opacity: buildPlanUiState.exportDisabled ? 0.45 : 1,
            }}
          >
            ↓ Export JSON
          </button>
          <span
            style={{
              fontSize: 9,
              padding: "3px 10px",
              borderRadius: 20,
              background: "var(--primary-container)",
              border: "1px solid var(--primary-border)",
              color: "var(--primary)",
              fontFamily: MONO,
            }}
          >
            {phases.length} phases
          </span>
          <span
            style={{
              fontSize: 9,
              padding: "3px 10px",
              borderRadius: 20,
              background: "var(--surface-container)",
              color: "var(--on-surface-variant)",
              fontFamily: MONO,
            }}
          >
            {(() => {
              const total = phases.reduce((acc, p) => acc + p.tasks.length, 0);
              const done = phases.reduce(
                (acc, p) =>
                  acc +
                  p.tasks.filter((t) => completedTaskIds.has(t.id)).length,
                0,
              );
              return done > 0
                ? `${done}/${total} tasks done`
                : `${total} tasks`;
            })()}
          </span>
          <span
            style={{
              fontSize: 9,
              padding: "3px 10px",
              borderRadius: 20,
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.3)",
              color: "#f87171",
              fontFamily: MONO,
            }}
          >
            {phases.reduce(
              (acc, p) => acc + p.tasks.filter((t) => t.risk).length,
              0,
            )}{" "}
            risks flagged
          </span>
          {specBlocked && (
            <span
              style={{
                fontSize: 9,
                padding: "3px 10px",
                borderRadius: 20,
                background: "rgba(251,191,36,0.12)",
                border: "1px solid rgba(251,191,36,0.3)",
                color: "#fbbf24",
                fontFamily: MONO,
              }}
            >
              context blocked
            </span>
          )}
          {specNeedsClarification && (
            <span
              style={{
                fontSize: 9,
                padding: "3px 10px",
                borderRadius: 20,
                background: "rgba(96,165,250,0.12)",
                border: "1px solid rgba(96,165,250,0.3)",
                color: "#60a5fa",
                fontFamily: MONO,
              }}
            >
              needs input
            </span>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Main content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {hasAppliedContext && (
            <section
              style={{
                borderRadius: 10,
                border: "1px solid rgba(96,165,250,0.22)",
                background: "rgba(96,165,250,0.06)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p
                style={{
                  fontSize: 9,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: MONO,
                }}
              >
                Plan Context
              </p>
              {appliedDecisions.length > 0 && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--on-surface-variant)",
                      lineHeight: 1.6,
                      fontFamily: SANS,
                    }}
                  >
                    Decisions
                  </p>
                  {appliedDecisions.map((decision) => (
                    <p
                      key={`plan-decision-${decision.syntheticId}-${decision.optionId}`}
                      style={{
                        fontSize: 11,
                        color: "var(--on-surface-variant)",
                        lineHeight: 1.6,
                        fontFamily: SANS,
                        margin: 0,
                      }}
                    >
                      {formatPreparedDecisionInline(decision)}
                    </p>
                  ))}
                </div>
              )}
              {appliedStructuredClarifications.length > 0 && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--on-surface-variant)",
                      lineHeight: 1.6,
                      fontFamily: SANS,
                    }}
                  >
                    Clarifications
                  </p>
                  {appliedStructuredClarifications.map((clarification) => (
                    <div
                      key={`plan-clarification-${clarification.syntheticId}`}
                      style={{
                        borderRadius: 8,
                        border: "1px solid rgba(251,146,60,0.18)",
                        background: "rgba(251,146,60,0.04)",
                        padding: "8px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--on-surface)",
                          fontFamily: MONO,
                        }}
                      >
                        {formatPreparedClarificationHeader(clarification)}
                      </p>
                      {clarification.answers.map((answer) => (
                        <p
                          key={`${clarification.syntheticId}-${answer.questionId}`}
                          style={{
                            fontSize: 11,
                            color: "var(--on-surface-variant)",
                            lineHeight: 1.6,
                            fontFamily: SANS,
                          }}
                        >
                          <strong>{answer.questionLabel}:</strong>{" "}
                          {answer.answer}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {(specBlocked || specNeedsClarification) && (
            <section
              style={{
                borderRadius: 10,
                border: `1px solid ${specBlocked ? "rgba(248,113,113,0.3)" : "rgba(96,165,250,0.3)"}`,
                background: specBlocked
                  ? "rgba(248,113,113,0.08)"
                  : "rgba(96,165,250,0.08)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: specBlocked ? "#f87171" : "#60a5fa",
                  fontFamily: MONO,
                }}
              >
                {buildPlanUiState.bannerText}
              </p>
              {buildPlanUiState.bannerItems.map((item) => (
                <p
                  key={item}
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--on-surface-variant)",
                    fontFamily: SANS,
                    lineHeight: 1.5,
                  }}
                >
                  {item}
                </p>
              ))}
            </section>
          )}
          {/* Phase timeline selector */}
          <PhaseTimeline
            phases={phases}
            selectedPhaseId={selectedPhaseId}
            onSelect={setSelectedPhaseId}
            startDate={new Date()}
          />

          {phase && (
            <>
              {/* Phase goal */}
              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--surface-container)",
                  background: "var(--surface-low)",
                  padding: "12px 16px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  🎯
                </span>
                <div>
                  <p
                    style={{
                      fontSize: 8,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      fontFamily: MONO,
                      marginBottom: 5,
                    }}
                  >
                    Phase Goal
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--on-surface)",
                      lineHeight: 1.65,
                      fontFamily: SANS,
                    }}
                  >
                    {phase.goal}
                  </p>
                </div>
              </div>

              {/* Tasks */}
              <section>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <p
                      style={{
                        fontSize: 8,
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        color: "var(--t3)",
                        fontFamily: MONO,
                      }}
                    >
                      Tasks · {phase.tasks.length}
                    </p>
                    {(() => {
                      const doneCount = phase.tasks.filter((t) =>
                        completedTaskIds.has(t.id),
                      ).length;
                      return doneCount > 0 ? (
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 6px",
                            borderRadius: 10,
                            background: "rgba(52,211,153,0.12)",
                            border: "1px solid rgba(52,211,153,0.3)",
                            color: "#34d399",
                            fontFamily: MONO,
                          }}
                        >
                          {doneCount}/{phase.tasks.length} done
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <p
                    style={{
                      fontSize: 8,
                      color: "var(--t3)",
                      fontFamily: MONO,
                    }}
                  >
                    Click ☐ to mark done · Chat ↗ to talk to the owning
                    agent
                  </p>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {phase.tasks.map((task) => (
                    <GanttRow
                      key={task.id}
                      task={task}
                      phaseTotal={phase.totalDays}
                      onChatWithAgent={(agentId) =>
                        onChatWithAgent(agentId, selectedPhaseId)
                      }
                      hoveredTaskId={hoveredTaskId}
                      setHoveredTaskId={setHoveredTaskId}
                      isCompleted={completedTaskIds.has(task.id)}
                      onToggleComplete={onToggleTaskComplete}
                      isExpanded={expandedTaskIds.has(task.id)}
                      onToggleExpand={toggleExpand}
                    />
                  ))}
                </div>
              </section>

              {/* Agent conflict warnings */}
              {phase.conflicts.length > 0 && (
                <section>
                  <p
                    style={{
                      fontSize: 8,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      fontFamily: MONO,
                      marginBottom: 10,
                    }}
                  >
                    Flagged by agents
                  </p>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {phase.conflicts.map((conflict, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 6,
                          border: "1px solid rgba(251,191,36,0.25)",
                          background: "rgba(251,191,36,0.05)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: `${agentColor(conflict.agentCode)}18`,
                            border: `1px solid ${agentColor(conflict.agentCode)}44`,
                            color: agentColor(conflict.agentCode),
                            fontFamily: MONO,
                            flexShrink: 0,
                          }}
                        >
                          {conflict.agentCode}
                        </span>
                        <div>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: "#fbbf24",
                              fontFamily: MONO,
                              marginRight: 6,
                            }}
                          >
                            ⚠ {conflict.agent}:
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--on-surface-variant)",
                              fontFamily: SANS,
                              lineHeight: 1.55,
                            }}
                          >
                            {conflict.flag}
                          </span>
                        </div>
                        {synthetics.find(
                          (s) => s.code === conflict.agentCode,
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              const agentId = synthetics.find(
                                (s) => s.code === conflict.agentCode,
                              )?.id;
                              if (agentId)
                                onChatWithAgent(agentId, selectedPhaseId);
                            }}
                            style={{
                              marginLeft: "auto",
                              fontSize: 8,
                              padding: "3px 8px",
                              borderRadius: 4,
                              border: "1px solid rgba(251,191,36,0.4)",
                              background: "transparent",
                              color: "#fbbf24",
                              fontFamily: MONO,
                              cursor: "pointer",
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Resolve ↗
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* ── Right sidebar: Phase overview ── */}
        <aside
          style={{
            width: "17rem",
            borderLeft: "1px solid var(--surface-container)",
            background: "var(--panel-bg-solid)",
            overflowY: "auto",
            padding: "24px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flexShrink: 0,
          }}
        >
          {/* All phases at a glance */}
          <div>
            <p
              style={{
                fontSize: 8,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "var(--t3)",
                fontFamily: MONO,
                marginBottom: 12,
              }}
            >
              All Phases
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {phases.map((p, i) => {
                const phaseColors = ["#a78bfa", "#60a5fa", "#34d399"];
                const color = phaseColors[i % phaseColors.length];
                const isSelected = p.id === selectedPhaseId;
                return (
                  <button
                    key={`${p.id}-${i}`}
                    type="button"
                    onClick={() => setSelectedPhaseId(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "9px 10px",
                      borderRadius: 6,
                      border: isSelected
                        ? `1px solid ${color}55`
                        : "1px solid var(--surface-container)",
                      background: isSelected ? `${color}10` : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.12s",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                        marginTop: 4,
                        boxShadow: isSelected ? `0 0 6px ${color}88` : "none",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: isSelected
                            ? "var(--on-surface)"
                            : "var(--on-surface-variant)",
                          fontFamily: SANS,
                          lineHeight: 1.2,
                          marginBottom: 2,
                        }}
                      >
                        {p.name}
                      </p>
                      {(() => {
                        const done = p.tasks.filter((t) =>
                          completedTaskIds.has(t.id),
                        ).length;
                        return (
                          <p
                            style={{
                              fontSize: 8,
                              color: "var(--t3)",
                              fontFamily: MONO,
                            }}
                          >
                            {p.totalDuration} ·{" "}
                            {done > 0
                              ? `${done}/${p.tasks.length} done`
                              : `${p.tasks.length} tasks`}
                          </p>
                        );
                      })()}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active agents on this plan */}
          {synthetics.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: MONO,
                  marginBottom: 12,
                }}
              >
                Active Agents
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                }}
              >
                {synthetics.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChatWithAgent(s.id, selectedPhaseId)}
                    title={`Chat with ${s.name}`}
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 4,
                      background: `${agentColor(s.code)}18`,
                      border: `1px solid ${agentColor(s.code)}44`,
                      color: agentColor(s.code),
                      fontFamily: MONO,
                      cursor: "pointer",
                    }}
                  >
                    {s.code}
                  </button>
                ))}
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 8,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  lineHeight: 1.6,
                }}
              >
                Click any agent badge to chat about their role in this plan.
              </p>
            </div>
          )}

          {/* Re-simulate phase */}
          {phase && (
            <div>
              <p
                style={{
                  fontSize: 8,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: MONO,
                  marginBottom: 10,
                }}
              >
                Actions
              </p>
              <button
                type="button"
                onClick={() => handleReSimulate(phase.name)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--surface-container)",
                  background: "transparent",
                  fontSize: 10,
                  color: "var(--on-surface-variant)",
                  fontFamily: MONO,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  textAlign: "left",
                  transition: "border-color 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(167,139,250,0.4)";
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "var(--surface-container)";
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--on-surface-variant)";
                }}
              >
                ↺ Re-simulate this phase
              </button>
              <p
                style={{
                  marginTop: 6,
                  fontSize: 8,
                  color: "var(--t3)",
                  fontFamily: MONO,
                  lineHeight: 1.6,
                }}
              >
                Re-runs only the agents relevant to this phase with updated
                context.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* ── Bottom bar ── */}
      <footer
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          borderTop: "1px solid var(--surface-container)",
          background: "var(--surface-low)",
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: 9, color: "var(--t3)", fontFamily: MONO }}>
          The plan shifts from understanding to doing — chat with any agent to
          refine a phase.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{
              fontSize: 9,
              padding: "5px 14px",
              borderRadius: 5,
              border: "1px solid var(--surface-container)",
              background: "transparent",
              color: "var(--on-surface-variant)",
              fontFamily: MONO,
              cursor: "pointer",
            }}
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 9,
              padding: "5px 14px",
              borderRadius: 5,
              border: "1px solid var(--surface-container)",
              background: "transparent",
              color: "var(--on-surface-variant)",
              fontFamily: MONO,
              cursor: "pointer",
            }}
          >
            Back to graph
          </button>
        </div>
      </footer>

      <ReSimToast phaseId={reSimPhase} />
    </div>
  );
}
