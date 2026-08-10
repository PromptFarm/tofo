"use client";

import { useEffect, useRef, useState } from "react";
import { AnswerExpertQuestionModal } from "@/components/thinking-graph/tabs/AnswerExpertQuestionModal";
import { Play, Check, MessageSquare, X, Send, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRunContext } from "@/lib/run-context";
import { useThinkingGraphVersionStore } from "@/components/thinking-graph/state/useThinkingGraphVersionStore";
import { useThinkingGraphUiStore } from "@/components/thinking-graph/state/useThinkingGraphUiStore";
import { hexRgba } from "@/components/project-screen/tagColors";
import { streamThinkingGraphChat, saveProjectThinkingGraphSession, setThinkingGraphChatMessageIterationUsage, appendThinkingGraphClarification } from "@/lib/thinking-graph/client";
import type { SyntheticNode } from "@/lib/planning/types";
import type { DomainVerdict, SyntheticReport, ProposedImprovement, SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";
import { computeDomainGate, generatePathToGo } from "@/lib/thinking-graph/reportSummary";
import type { SimulationRun } from "@/components/thinking-graph/runtime/runtimeTypes";
import { IterationDiff } from "./IterationDiff";
import { PlanTab } from "./PlanTab";
import { shouldShowReportLoading } from "./reportLoadingState";
import { shouldResetSelectedRun } from "./selectedRunState";
import { RecommendSolutionModal } from "@/components/thinking-graph/tabs/RecommendSolutionModal";
import { ProjectUsageSummary } from "./ProjectUsageSummary";

// ── Color helpers ─────────────────────────────────────────────────────────────

const SYNTH_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#3b82f6", "#ec4899"];
const agentColor = (_code: string, index: number) => SYNTH_COLORS[index % SYNTH_COLORS.length]!;

const VERDICT_COLOR: Record<DomainVerdict, string> = {
  go:          "#10b981",
  conditional: "#f59e0b",
  no_go:       "#f43f5e",
};
const VERDICT_LABEL: Record<DomainVerdict, string> = { go: "GO", conditional: "COND.", no_go: "NO GO" };
const VERDICT_BADGE: Record<DomainVerdict, string> = {
  go: "✓ Recommended", conditional: "⚠ Conditional", no_go: "✗ Not Recommended",
};
const RISK_COLORS = { high: "#f43f5e", medium: "#f59e0b", low: "#10b981" } as const;

const HERO_TINT: Record<DomainVerdict, string> = {
  go:          "oklch(0.65 0.18 160 / 0.14)",
  conditional: "oklch(0.72 0.18 75 / 0.13)",
  no_go:       "oklch(0.58 0.22 25 / 0.13)",
};

// ── Sub-components ────────────────────────────────────────────────────────────

const VERDICT_ICON: Record<DomainVerdict, string> = {
  go: "✓",
  conditional: "⚠",
  no_go: "✗",
};

function VerdictIcon({ verdict, color, size = 58 }: { verdict: DomainVerdict; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center border-2 shrink-0"
      style={{
        width: size, height: size,
        borderColor: hexRgba(color, 0.4),
        background: hexRgba(color, 0.1),
        fontSize: size * 0.36,
        color,
        fontWeight: 700,
      }}
    >
      {VERDICT_ICON[verdict]}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-semibold px-[7px] py-[2px] rounded-full border"
      style={{ color, borderColor: hexRgba(color, 0.35), background: hexRgba(color, 0.12) }}
    >
      {children}
    </span>
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function formatTokens(n: number | null) {
  if (n === null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── Main component ────────────────────────────────────────────────────────────

type ReportTabProps = {
  synthetics: SyntheticNode[];
  hasInitialSessionPayload: boolean;
  sessionId: string | null;
  projectId: string;
  selectedRunId?: string | null;
  onSelectedRunChange?: (runId: string | null) => void;
  onRunSim: () => void;
  onSubmitAnswers?: (fragments: { question: string; answer: string }[]) => void;
  expertAnswers?: Record<string, string>;
  onExpertAnswersChange?: (answers: Record<string, string>) => void;
  savedAnswerKeys?: Set<string>;
  onSavedAnswerKeysChange?: (keys: Set<string>) => void;
  proposedImprovements?: ProposedImprovement[];
  onProposedImprovementsChange?: (improvements: ProposedImprovement[]) => void;
};

export function ReportTab({
  synthetics,
  hasInitialSessionPayload,
  sessionId,
  projectId,
  selectedRunId = null,
  onSelectedRunChange,
  onRunSim,
  onSubmitAnswers,
  expertAnswers: answers = {},
  onExpertAnswersChange,
  savedAnswerKeys = new Set(),
  onSavedAnswerKeysChange,
  proposedImprovements = [],
  onProposedImprovementsChange,
}: ReportTabProps) {
  const { isRunning, elapsedSecs, runStats } = useRunContext();
  const { simulationHistory, activeRunId } = useThinkingGraphVersionStore((s) => ({
    simulationHistory: s.simulationHistory,
    activeRunId: s.activeRunId,
  }));
  const nodeRunStatus = useThinkingGraphUiStore((s) => s.nodeRunStatus);
  const streamingTextByNodeId = useThinkingGraphUiStore((s) => s.streamingTextByNodeId);
  const [streamingPanelNodeId, setStreamingPanelNodeId] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<"experts" | "risks" | "questions" | "plan">("experts");

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffRunA, setDiffRunA] = useState<SimulationRun | null>(null);
  const [diffRunB, setDiffRunB] = useState<SimulationRun | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<string, { role: "user" | "assistant"; text: string; id?: string; includeInNextIteration?: boolean }[]>>({});
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatTyping, setChatTyping] = useState(false);
  const [reportHydrationSettled, setReportHydrationSettled] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState<{ syntheticId: string; syntheticName: string; risk: string; priorRisk: number } | null>(null);
  const [showAnswerModal, setShowAnswerModal] = useState<{ syntheticId: string; syntheticName: string; questionId: string; question: string; whyItMatters?: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistories, openChatId]);

  // Load chat history from session when opening a chat for the first time
  useEffect(() => {
    if (!openChatId || !sessionId) return;
    if (chatHistories[openChatId] !== undefined) return; // already loaded
    fetch(`/api/thinking-graph/chat?sessionId=${sessionId}&syntheticId=${openChatId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { messages?: { role: string; text: string; id: string; includeInNextIteration: boolean }[] } | null) => {
        const msgs = data?.messages ?? [];
        setChatHistories((prev) => ({
          ...prev,
          [openChatId]: msgs.map((m) => ({
            role: m.role === "synthetic" ? "assistant" : "user",
            text: m.text,
            id: m.id,
            includeInNextIteration: m.includeInNextIteration,
          })),
        }));
      })
      .catch(() => {
        setChatHistories((prev) => ({ ...prev, [openChatId]: [] }));
      });
  }, [openChatId, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAnswerChange(key: string, value: string) {
    onExpertAnswersChange?.({ ...answers, [key]: value });
  }

  const agents = synthetics.filter((s) => s.nodeRole !== "advisor");
  const latestRun = simulationHistory.find((r) => r.id === activeRunId) ?? simulationHistory[simulationHistory.length - 1];
  const activeRun =
    (selectedRunId ? simulationHistory.find((r) => r.id === selectedRunId) : null) ?? latestRun;

  useEffect(() => {
    setReportHydrationSettled(false);
  }, [hasInitialSessionPayload]);

  useEffect(() => {
    setReportHydrationSettled(true);
  }, []);

  useEffect(() => {
    if (
      shouldResetSelectedRun({
        selectedRunId,
        simulationHistoryIds: simulationHistory.map((run) => run.id),
      })
    ) {
      onSelectedRunChange?.(null);
    }
  }, [onSelectedRunChange, selectedRunId, simulationHistory]);

  // When a new simulation completes (activeRunId changes), jump to the new run
  // and clear stale answer/saved-key state so old positional keys don't carry over.
  const prevActiveRunIdRef = useRef(activeRunId);
  useEffect(() => {
    if (prevActiveRunIdRef.current === activeRunId) return;
    prevActiveRunIdRef.current = activeRunId;
    if (activeRunId == null) return;
    // Switch view to the newest run regardless of which run was selected before.
    if (selectedRunId != null) onSelectedRunChange?.(null);
    // Positional answer keys (eq-0, eq-1…) from the previous run are no longer
    // meaningful — clear them so the new run's questions start fresh.
    onSavedAnswerKeysChange?.(new Set());
  }, [activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Running state ───────────────────────────────────────────────────────────
  if (isRunning) {
    const panelAgent = agents.find((s) => s.id === streamingPanelNodeId) ?? null;
    const panelColor = panelAgent ? agentColor(panelAgent.code, agents.indexOf(panelAgent)) : "#6366f1";
    const panelText = streamingPanelNodeId ? (streamingTextByNodeId[streamingPanelNodeId] ?? "") : "";

    return (
      <div className="flex-1 flex overflow-hidden bg-[var(--background)]">
        {/* Center — circles */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-8 max-w-[500px] text-center">
            <div className="flex flex-wrap justify-center gap-5">
              {agents.map((s, i) => {
                const color = agentColor(s.code, i);
                const status = nodeRunStatus[s.id] ?? "idle";
                const isActive = status === "active";
                const isDone = status === "done";
                const isSelected = streamingPanelNodeId === s.id;
                return (
                  <div key={s.id} className="flex flex-col items-center gap-2">
                    <div className="relative">
                      {isActive && (
                        <div className="absolute inset-[-4px] rounded-full border-2 animate-pulse pointer-events-none"
                          style={{ borderColor: color }} />
                      )}
                      {isSelected && (
                        <div className="absolute inset-[-6px] rounded-full border-2 pointer-events-none"
                          style={{ borderColor: color }} />
                      )}
                      <button
                        type="button"
                        onClick={() => setStreamingPanelNodeId(isSelected ? null : s.id)}
                        className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-[11px] font-bold transition-opacity duration-300 cursor-pointer border-0 p-0"
                        style={{ background: hexRgba(color, isSelected ? 0.35 : 0.18), color, opacity: isDone || isActive ? 1 : 0.3 }}
                      >
                        {s.code}
                      </button>
                      {isDone && (
                        <div className="absolute bottom-[-2px] right-[-2px] w-[15px] h-[15px] rounded-full bg-[var(--accent-go)] border-2 border-[var(--background)] flex items-center justify-center">
                          <Check size={8} strokeWidth={3} className="text-black" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--t3)] max-w-[60px] truncate">{s.name}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-[13px] text-[var(--on-surface-variant)]">
                <span className="w-[10px] h-[10px] rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin inline-block" />
                Synthetics are analyzing your idea…
              </div>
              <span className="text-[11px] text-[var(--t3)] font-mono tabular-nums">{elapsedSecs}s</span>
            </div>
          </div>
        </div>

        {/* Right panel — live stream */}
        {streamingPanelNodeId && (
          <div className="w-[380px] shrink-0 border-l border-[var(--border)] flex flex-col bg-[var(--surface-low)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: hexRgba(panelColor, 0.18), color: panelColor }}>
                  {panelAgent?.code}
                </div>
                <span className="text-[13px] font-semibold text-[var(--on-surface)] truncate">{panelAgent?.name}</span>
              </div>
              <button type="button" onClick={() => setStreamingPanelNodeId(null)}
                className="text-[var(--t3)] hover:text-[var(--on-surface)] bg-transparent border-0 cursor-pointer p-1 flex items-center">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {panelText ? (
                <pre className="text-[11px] text-[var(--on-surface-variant)] font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {panelText}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-[12px] text-[var(--t3)]">
                  <span className="w-[8px] h-[8px] rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin inline-block" />
                  Waiting for output…
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Idle / empty state ──────────────────────────────────────────────────────
  if (
    shouldShowReportLoading({
      hasInitialSessionPayload,
      hasActiveRun: Boolean(activeRun),
      reportHydrationSettled,
    })
  ) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4 max-w-[380px] text-center">
          <span className="w-[20px] h-[20px] rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin inline-block" />
          <div>
            <div className="text-[14px] font-medium text-[var(--on-surface-variant)] mb-1">Loading report</div>
            <p className="text-[12px] text-[var(--t3)] leading-relaxed">
              We are loading the report for this project.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!activeRun) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-5 max-w-[380px] text-center">
          <div className="w-[60px] h-[60px] rounded-2xl bg-[var(--surface-low)] border border-[var(--border)] flex items-center justify-center text-[26px]">📋</div>
          <div>
            <div className="text-[14px] font-medium text-[var(--on-surface-variant)] mb-1">No report yet</div>
            <p className="text-[12px] text-[var(--t3)] leading-relaxed max-w-[300px]">
              Run a simulation to generate your first Go/No-Go analysis report.
            </p>
          </div>
          <button type="button" onClick={onRunSim}
            className="flex items-center gap-2 px-4 py-[8px] rounded-[9px] border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity">
            <Play size={12} />Run Simulation
          </button>
        </div>
      </div>
    );
  }

  // ── Done — derive report data ───────────────────────────────────────────────
  const { summaryReport, outputsBySyntheticId, synthetics: runSynthetics } = activeRun;
  // Only show agents from current active team (Synthetics tab), excludes excluded/removed agents
  const currentTeamIds = new Set(synthetics.filter(s => s.nodeRole !== "advisor").map(s => s.id));
  const runAgents = runSynthetics.filter(
    (s) => s.nodeRole !== "advisor" && currentTeamIds.has(s.id)
  );
  const verdict = summaryReport.overallVerdict;
  const verdictColor = VERDICT_COLOR[verdict];

  const summaryText = summaryReport.executiveBrief.map((b) => b.sentence).join(" ");

  const synthResults = runAgents.map((s, idx) => {
    const output = outputsBySyntheticId[s.id];
    const report = output && "details" in output ? (output as SyntheticReport) : null;
    const gate = summaryReport.domainGates.find((g) => g.syntheticId === s.id);
    // Recompute gate live from the actual output so that old stored runs
    // (which may have effectiveRisk=100 / verdict="no_go" baked in) reflect
    // the current logic instead of the stale persisted values.
    const liveGate = report ? computeDomainGate(s, report) : null;
    const gateVerdict = liveGate?.verdict ?? gate?.verdict ?? "conditional";
    const risk = liveGate?.effectiveRisk ?? gate?.effectiveRisk ?? 0;
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      role: s.role,
      color: agentColor(s.code, idx),
      summary: report?.summary ?? "",
      verdict: gateVerdict,
      condition: liveGate?.condition ?? gate?.condition ?? null,
      risk,
      gate: liveGate,
      output: report,
    };
  });


  const risks: { level: "high" | "medium" | "low"; text: string; syntheticId: string; syntheticName: string; syntheticColor: string }[] = [];
  runAgents.forEach((s, idx) => {
    const output = outputsBySyntheticId[s.id];
    if (!output || !("details" in output)) return;
    const rep = output as SyntheticReport;
    const riskVal = rep.concernLevels.risk;
    const level = riskVal >= 70 ? "high" : riskVal >= 40 ? "medium" : "low";
    rep.keyRisks.forEach((text) => {
      risks.push({ level, text, syntheticId: s.id, syntheticName: s.name, syntheticColor: agentColor(s.code, idx) });
    });
  });

  const priorityQuestions = summaryReport.actionItems.slice(0, 5);

  const additionalQuestions: { id: string; question: string; whyItMatters: string; syntheticId: string; syntheticName: string; syntheticColor: string }[] = [];
  runAgents.forEach((s, idx) => {
    const output = outputsBySyntheticId[s.id];
    if (!output || !("details" in output)) return;
    const rep = output as SyntheticReport;
    rep.operational?.clarificationRequests.forEach((cr) => {
      additionalQuestions.push({
        id: cr.id,
        question: cr.question,
        whyItMatters: cr.whyItMatters,
        syntheticId: s.id,
        syntheticName: s.name,
        syntheticColor: agentColor(s.code, idx),
      });
    });
  });

  const openChatAgent = synthResults.find((r) => r.id === openChatId) ?? null;

  async function sendChatMessage() {
    if (!openChatId || !chatDraft.trim() || chatLoading || !sessionId) return;
    const msg = chatDraft.trim();
    const syntheticId = openChatId;
    setChatDraft("");
    setChatHistories((prev) => ({
      ...prev,
      [syntheticId]: [...(prev[syntheticId] ?? []), { role: "user", text: msg }],
    }));
    setChatLoading(true);
    setChatTyping(true);
    try {
      const payload = await streamThinkingGraphChat(
        { sessionId, syntheticId, userMessage: msg },
        (event) => {
          if (event.type === "assistant_chunk") {
            setChatTyping(false);
            setChatHistories((prev) => {
              const history = prev[syntheticId] ?? [];
              const last = history[history.length - 1];
              if (last?.role === "assistant") {
                return {
                  ...prev,
                  [syntheticId]: [...history.slice(0, -1), { ...last, text: last.text + event.textDelta }],
                };
              }
              return {
                ...prev,
                [syntheticId]: [...history, { role: "assistant", text: event.textDelta }],
              };
            });
          }
        },
      );
      // Backfill the message ID from the saved payload so the ⭐ toggle works
      const savedMsg = payload.conversationsBySyntheticId[syntheticId]?.at(-1);
      if (savedMsg?.role === "synthetic") {
        setChatHistories((prev) => {
          const history = prev[syntheticId] ?? [];
          const last = history[history.length - 1];
          if (!last || last.role !== "assistant") return prev;
          return {
            ...prev,
            [syntheticId]: [
              ...history.slice(0, -1),
              { ...last, id: savedMsg.id, includeInNextIteration: savedMsg.includeInNextIteration },
            ],
          };
        });
      }
      void saveProjectThinkingGraphSession(projectId, payload);
    } catch {
      setChatHistories((prev) => {
        const history = prev[syntheticId] ?? [];
        const last = history[history.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return {
          ...prev,
          [syntheticId]: [
            ...history.slice(0, -1),
            { role: "assistant", text: "Failed to get response. Please try again." },
          ],
        };
      });
    } finally {
      setChatLoading(false);
      setChatTyping(false);
    }
  }

  // ── Diff view ───────────────────────────────────────────────────────────────
  if (diffOpen && diffRunA && diffRunB) {
    return (
      <IterationDiff
        runA={diffRunA}
        runB={diffRunB}
        allRuns={[...simulationHistory]}
        onBack={() => setDiffOpen(false)}
      />
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--background)]">

      {/* ── Main scroll area ─────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* Verdict hero */}
        <div
          className="px-7 pt-[22px] pb-5 border-b border-[var(--border)]"
          style={{ background: `linear-gradient(135deg, ${HERO_TINT[verdict]}, var(--background))` }}
        >
          <div className="flex items-start gap-5 mb-4">
            <VerdictIcon verdict={verdict} color={verdictColor} size={58} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge color={verdictColor}>{VERDICT_BADGE[verdict]}</Badge>
                {runStats && (
                  <span className="text-[10px] text-[var(--t3)] font-mono flex items-center gap-[6px]">
                    <span>{formatDuration(runStats.durationMs)}</span>
                    <span className="opacity-40">·</span>
                    <span>{formatTokens(runStats.tokenUsage.totalTokens)} tokens</span>
                    {runStats.tokenUsage.promptTokens !== null && (
                      <span className="opacity-60">
                        ({formatTokens(runStats.tokenUsage.promptTokens)} in / {formatTokens(runStats.tokenUsage.completionTokens)} out)
                      </span>
                    )}
                    {runStats.costUsd !== null && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="text-[var(--on-surface-variant)]">${runStats.costUsd.toFixed(4)}</span>
                        {runStats.model && (
                          <span className="opacity-50">{runStats.model}</span>
                        )}
                      </>
                    )}
                  </span>
                )}
              </div>
              {summaryText && (
                <p className="text-[12px] leading-[1.75] text-[var(--on-surface-variant)] max-w-[500px]">
                  {summaryText}
                </p>
              )}
            </div>
          </div>
        </div>

        <ProjectUsageSummary projectId={projectId} refreshKey={simulationHistory.length} />

        {/* Section tabs */}
        <div className="flex border-b border-[var(--border)] px-7 bg-[var(--surface-low)] sticky top-0 z-10">
          {([
            ["experts", "By Expert"],
            ["risks", `Risks (${risks.length})`],
            ["questions", `Next Steps (${priorityQuestions.length + additionalQuestions.length})`],
            ["plan", "Plan"],
          ] as [typeof activeSection, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setActiveSection(id)}
              className={cn(
                "px-[14px] py-[11px] bg-transparent border-none text-[12px] cursor-pointer font-[var(--font-body)] transition-colors border-b-2 -mb-px",
                activeSection === id
                  ? "border-b-[var(--primary)] text-[var(--on-surface)] font-semibold"
                  : "border-b-transparent text-[var(--t3)] font-normal hover:text-[var(--on-surface-variant)]",
              )}>
              {label}
            </button>
          ))}
        </div>

        {/* Section content */}
        {activeSection === "plan" && (
          <PlanTab
            activeRun={activeRun ?? null}
          />
        )}
        {activeSection !== "plan" && <div className="px-7 py-[18px] flex flex-col gap-2">

          {/* ── Experts ── */}
          {activeSection === "experts" && synthResults.map((r) => {
            const pathToGo = r.verdict !== "go" && r.output ? generatePathToGo(r.gate ?? null, r.output) : null;
            return (
            <div key={r.id} className="rounded-[10px] border border-[var(--border-solid)] bg-[var(--surface-low)] px-4 py-[14px] flex items-start gap-3">
              <div className="w-[34px] h-[34px] rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
                style={{ background: hexRgba(r.color, 0.18), color: r.color }}>
                {r.code}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-[6px] flex-wrap">
                  <span className="font-bold text-[13px] text-[var(--on-surface)] font-[var(--font-head)]">{r.name}</span>
                  <Badge color={VERDICT_COLOR[r.verdict]}>{VERDICT_LABEL[r.verdict]}</Badge>
                </div>
                {r.condition && (
                  <p className="text-[12px] leading-[1.6] mb-2 font-medium" style={{ color: VERDICT_COLOR[r.verdict] }}>
                    {r.condition}
                  </p>
                )}
                {r.summary && (
                  <p className="text-[12px] leading-[1.7] mb-3 text-[var(--on-surface-variant)]">{r.summary}</p>
                )}

                {/* Path to GO recommendations */}
                {pathToGo && (() => {
                  const risks = r.output && "keyRisks" in r.output ? (r.output as SyntheticReport).keyRisks : [];
                  return (
                    <div className="mb-3 p-3 rounded-lg bg-[var(--surface-high)]">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-[11px] font-semibold" style={{ color: VERDICT_COLOR[r.verdict] }}>
                          🎯 {pathToGo.summary}
                        </p>
                        {risks.length > 0 && (
                          <button
                            onClick={() => setShowRecommendModal({
                              syntheticId: r.id,
                              syntheticName: r.name,
                              risk: risks[0] || "addressing risks",
                              priorRisk: r.risk,
                            })}
                            className="shrink-0 text-[10px] font-semibold px-[6px] py-[2px] rounded bg-[var(--color-info-bg)] text-[var(--color-info-text)] hover:opacity-80 transition-opacity"
                          >
                            💡 Recommend
                          </button>
                        )}
                      </div>
                      <ul className="text-[11px] leading-[1.5] space-y-2">
                        {pathToGo.steps.slice(0, 2).map((step, idx) => (
                          <li key={idx} style={{ color: VERDICT_COLOR[r.verdict] }}>
                            <span className="font-semibold">{step.action}</span>
                            <div className="text-[10px] opacity-75 italic">{step.why}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-[var(--t3)] shrink-0 w-[26px]">Risk</span>
                  <div className="flex-1 h-[5px] rounded-full bg-[var(--surface-high)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${r.risk}%`,
                        background: r.risk >= 70 ? RISK_COLORS.high : r.risk >= 40 ? RISK_COLORS.medium : RISK_COLORS.low,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums shrink-0 w-[26px] text-right"
                    style={{ color: r.risk >= 70 ? RISK_COLORS.high : r.risk >= 40 ? RISK_COLORS.medium : RISK_COLORS.low }}>
                    {r.risk}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenChatId(openChatId === r.id ? null : r.id)}
                    className={cn(
                      "flex items-center gap-[5px] text-[11px] font-medium bg-transparent border-none cursor-pointer px-0 py-0 transition-opacity shrink-0",
                      openChatId === r.id ? "opacity-100" : "hover:opacity-80",
                    )}
                    style={{ color: openChatId === r.id ? r.color : "var(--t3)" }}
                  >
                    <MessageSquare size={11} />
                    {openChatId === r.id ? "Chatting" : "Ask"}
                  </button>
                </div>
              </div>
            </div>
            );
          })}

          {/* ── Risks ── */}
          {activeSection === "risks" && (
            risks.length > 0 ? risks.map((risk, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--border-solid)] bg-[var(--surface-low)] px-[18px] py-[13px] flex gap-3"
                style={{ borderLeft: `3px solid ${RISK_COLORS[risk.level]}` }}>
                <span className="shrink-0 self-start mt-[2px] text-[10px] font-semibold px-[7px] py-[2px] rounded-full border capitalize"
                  style={{ color: RISK_COLORS[risk.level], borderColor: hexRgba(RISK_COLORS[risk.level], 0.35), background: hexRgba(RISK_COLORS[risk.level], 0.12) }}>
                  {risk.level}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] leading-[1.7] text-[var(--on-surface)] mb-[7px]">{risk.text}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--t3)]">
                      Raised by{" "}
                      <span className="font-medium" style={{ color: risk.syntheticColor }}>{risk.syntheticName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenChatId(openChatId === risk.syntheticId ? null : risk.syntheticId)}
                      className={cn(
                        "flex items-center gap-[5px] text-[11px] font-medium bg-transparent border-none cursor-pointer px-0 py-0 transition-opacity",
                        openChatId === risk.syntheticId ? "opacity-100" : "hover:opacity-80",
                      )}
                      style={{ color: openChatId === risk.syntheticId ? risk.syntheticColor : "var(--t3)" }}
                    >
                      <MessageSquare size={11} />
                      {openChatId === risk.syntheticId ? "Chatting" : "Ask expert"}
                    </button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-8 text-center text-[12px] text-[var(--t3)]">No risks identified.</div>
            )
          )}

          {/* ── Questions ── */}
          {activeSection === "questions" && (
            priorityQuestions.length === 0 && additionalQuestions.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--t3)]">No open questions.</div>
            ) : (
              <>
                {/* ── Expert Questions (interactive) ── */}
                {additionalQuestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold tracking-[0.07em] uppercase text-[var(--t3)] px-1 mb-1">Expert Questions</div>
                    {additionalQuestions.map((aq) => {
                      const key = `eq-${aq.id}`;
                      const answer = answers[key] ?? "";
                      const isSaved = savedAnswerKeys.has(key);
                      return (
                        <div
                          key={aq.id}
                          className="rounded-[10px] border px-4 py-[14px] transition-colors duration-300"
                          style={{
                            borderColor: isSaved ? "rgba(52,211,153,0.5)" : "var(--border-solid)",
                            background: isSaved ? "rgba(52,211,153,0.06)" : "var(--surface-low)",
                          }}
                        >
                          <div className="flex flex-col gap-[10px]">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-[20px] h-[20px] shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold"
                                style={{ background: `color-mix(in srgb, ${aq.syntheticColor} 18%, transparent)`, color: aq.syntheticColor }}
                              >
                                {aq.syntheticName?.[0] ?? "?"}
                              </div>
                              <span className="text-[10px] font-medium" style={{ color: aq.syntheticColor }}>{aq.syntheticName}</span>
                              {isSaved && (
                                <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-[#34d399]">
                                  <Check size={10} strokeWidth={2.5} />
                                  Added to next run
                                </span>
                              )}
                            </div>
                            <p className="text-[13px] leading-[1.6] text-[var(--on-surface)]">{aq.question}</p>
                            {aq.whyItMatters && (
                              <p className="text-[11px] leading-[1.5] text-[var(--t3)]">
                                <span className="font-semibold">Why it matters: </span>{aq.whyItMatters}
                              </p>
                            )}
                            <textarea
                              rows={2}
                              value={answer}
                              onChange={(e) => {
                                handleAnswerChange(key, e.target.value);
                                if (isSaved) { const n = new Set(savedAnswerKeys); n.delete(key); onSavedAnswerKeysChange?.(n); }
                              }}
                              placeholder="Your answer…"
                              className="w-full resize-none rounded-[7px] border border-[var(--border-solid)] bg-[var(--surface-2)] text-[12px] text-[var(--on-surface)] placeholder:text-[var(--t3)] px-3 py-[8px] leading-[1.6] outline-none focus:border-[var(--primary)] transition-colors"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-[5px]">
                                <button
                                  type="button"
                                  onClick={() => setShowAnswerModal({ syntheticId: aq.syntheticId, syntheticName: aq.syntheticName, questionId: aq.id, question: aq.question, whyItMatters: aq.whyItMatters })}
                                  className="flex items-center gap-[5px] text-[11px] font-medium bg-transparent border-none cursor-pointer px-0 py-0 transition-opacity text-[var(--t3)] hover:opacity-80"
                                >
                                  ✨
                                  Answer from expert
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOpenChatId(openChatId === aq.syntheticId ? null : aq.syntheticId)}
                                  className={cn(
                                    "flex items-center gap-[5px] text-[11px] font-medium bg-transparent border-none cursor-pointer px-0 py-0 transition-opacity",
                                    openChatId === aq.syntheticId ? "opacity-100" : "hover:opacity-80",
                                  )}
                                  style={{ color: openChatId === aq.syntheticId ? aq.syntheticColor : "var(--t3)" }}
                                >
                                  <MessageSquare size={11} />
                                  {openChatId === aq.syntheticId ? "Chatting" : "Ask in chat"}
                                </button>
                              </div>
                              {answer.trim().length > 0 && !isSaved && (
                                <button
                                  type="button"
                                  disabled={!sessionId}
                                  onClick={() => {
                                    if (!sessionId) return;
                                    // Submit as a structured clarification answer so the answer
                                    // flows through accumulateIntakeAnswersFromClarifications →
                                    // intakeAnswers → buildIntakeContextBlock on the next run.
                                    // This makes the answer permanent across runs rather than
                                    // relying on the ephemeral includeInNextIteration flag.
                                    void appendThinkingGraphClarification({
                                      sessionId,
                                      syntheticId: aq.syntheticId,
                                      syntheticName: aq.syntheticName,
                                      questionId: aq.id,
                                      questionLabel: aq.question,
                                      answer: answer.trim(),
                                    });
                                    onSubmitAnswers?.([{ question: aq.question, answer: answer.trim() }]);
                                    onSavedAnswerKeysChange?.(new Set(savedAnswerKeys).add(key));
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-[6px] rounded-[7px] border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[11px] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40"
                                >
                                  <Check size={11} />
                                  Add to next run
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}


                {/* ── Action Items (readonly, informational) ── */}
                {priorityQuestions.length > 0 && (
                  <div className="flex flex-col gap-2 mt-3">
                    <div className="text-[10px] font-bold tracking-[0.07em] uppercase text-[var(--t3)] px-1 mb-1">Action Items</div>
                    {priorityQuestions.map((q, i) => (
                      <div key={i} className="rounded-[10px] border border-[var(--border-solid)] bg-[var(--surface-low)] px-4 py-[12px] flex items-start gap-3">
                        <div className="w-[20px] h-[20px] shrink-0 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border-solid)] flex items-center justify-center text-[10px] font-bold text-[var(--t3)] mt-[2px]">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] leading-[1.6] text-[var(--on-surface)]">{q}</p>
                          <div className="flex items-center gap-[6px] mt-2">
                            <span className="text-[10px] text-[var(--t3)]">From all experts</span>
                            <div className="flex items-center gap-[3px]">
                              {synthResults.map((r) => (
                                <div key={r.id} className="w-[7px] h-[7px] rounded-full" style={{ background: r.color }} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          )}

        </div>}
      </div>

      {/* ── Right panel: chat XOR iterations ─────────────────────── */}
      {openChatId && openChatAgent ? (

        // Chat side panel
        <div className="w-[340px] shrink-0 border-l border-[var(--border-solid)] bg-[var(--surface-low)] flex flex-col">
          <div className="flex items-center gap-3 px-4 py-[11px] border-b border-[var(--border-solid)] shrink-0">
            <div className="w-[28px] h-[28px] rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
              style={{ background: hexRgba(openChatAgent.color, 0.18), color: openChatAgent.color }}>
              {openChatAgent.code}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-[var(--on-surface)] font-[var(--font-head)]">{openChatAgent.name}</div>
              <div className="text-[10px] text-[var(--t3)] truncate">{openChatAgent.role}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpenChatId(null)}
              className="shrink-0 text-[var(--t3)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer p-1 flex items-center"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-3">
            {(chatHistories[openChatId] ?? []).length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[11px] text-[var(--t3)] text-center max-w-[200px]">
                  Ask {openChatAgent.name} anything about this analysis
                </p>
              </div>
            )}
            {(chatHistories[openChatId] ?? []).map((msg, i) => (
              <div
                key={i}
                className={cn("max-w-[88%] flex flex-col gap-[4px]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}
              >
                <div
                  className={cn(
                    "px-3 py-[8px] rounded-[10px] text-[12px] leading-[1.6]",
                    msg.role === "user"
                      ? "bg-[var(--primary-container)] text-[var(--primary)] rounded-br-[3px]"
                      : "bg-[var(--surface-2)] text-[var(--on-surface)] rounded-bl-[3px]",
                  )}
                >
                  {msg.text}
                </div>
                {msg.role === "assistant" && msg.id && sessionId && (
                  <button
                    type="button"
                    title={msg.includeInNextIteration ? "Remove from next run context" : "Add to next run context"}
                    onClick={async () => {
                      const next = !msg.includeInNextIteration;
                      setChatHistories((prev) => {
                        const history = prev[openChatId] ?? [];
                        return { ...prev, [openChatId]: history.map((m, j) => j === i ? { ...m, includeInNextIteration: next } : m) };
                      });
                      await setThinkingGraphChatMessageIterationUsage({ sessionId, syntheticId: openChatId, messageId: msg.id!, includeInNextIteration: next });
                      // Mark this agent dirty so the next run knows to partially re-run it.
                      if (next) {
                        useThinkingGraphUiStore.getState().addReportTabChatUpdatedSyntheticId(openChatId);
                      } else {
                        // Only remove the dirty marker if no other message for this agent is still starred.
                        const stillHasStarred = (chatHistories[openChatId] ?? []).some((m, j) => j !== i && m.includeInNextIteration);
                        if (!stillHasStarred) {
                          useThinkingGraphUiStore.getState().removeReportTabChatUpdatedSyntheticId(openChatId);
                        }
                      }
                    }}
                    className={cn(
                      "text-[10px] px-2 py-[2px] rounded-full border transition-colors cursor-pointer",
                      msg.includeInNextIteration
                        ? "border-[rgba(251,191,36,0.5)] bg-[rgba(251,191,36,0.12)] text-[#f59e0b]"
                        : "border-[var(--border)] bg-transparent text-[var(--t3)] hover:text-[var(--on-surface)]",
                    )}
                  >
                    {msg.includeInNextIteration ? "★ in context" : "☆ add to context"}
                  </button>
                )}
              </div>
            ))}
            {chatTyping && (
              <div className="flex items-center gap-2 px-1 py-2">
                <div className="flex items-center gap-[3px]">
                  <span className="w-[5px] h-[5px] rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-[5px] h-[5px] rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-[5px] h-[5px] rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-[11px] text-[var(--t3)]">{openChatAgent?.name ?? "Agent"} is thinking…</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-3 py-3 border-t border-[var(--border-solid)] shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChatMessage(); } }}
                placeholder="Ask a question…"
                disabled={chatLoading}
                className="flex-1 resize-none rounded-[8px] border border-[var(--border-solid)] bg-[var(--surface-2)] text-[12px] text-[var(--on-surface)] placeholder:text-[var(--t3)] px-3 py-[8px] leading-[1.5] outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void sendChatMessage()}
                disabled={!chatDraft.trim() || chatLoading}
                className="shrink-0 w-[32px] h-[32px] rounded-[8px] border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>

      ) : simulationHistory.length > 0 ? (

        // Iterations sidebar
        <div className="w-[196px] shrink-0 border-l border-[var(--border-solid)] bg-[var(--surface-low)] flex flex-col">
          <div className="px-[14px] py-[10px] border-b border-[var(--border-solid)] flex items-center justify-between gap-2">
            {compareMode ? (
              <>
                <span className="text-[10px] font-bold tracking-[0.07em] uppercase text-[var(--primary)]">Select 2 runs</span>
                <button
                  type="button"
                  onClick={() => { setCompareMode(false); setDiffRunA(null); setDiffRunB(null); }}
                  className="flex items-center gap-1 px-[8px] py-[4px] rounded-[6px] border border-[var(--border-solid)] bg-transparent text-[10px] text-[var(--t3)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer font-medium"
                >
                  <X size={10} /> Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-[10px] font-bold tracking-[0.07em] uppercase text-[var(--t3)]">Iterations</span>
                {simulationHistory.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => { setCompareMode(true); setDiffRunA(null); setDiffRunB(null); }}
                    className="flex items-center gap-1 px-[8px] py-[4px] rounded-[6px] border border-[var(--border-solid)] bg-transparent text-[10px] text-[var(--t3)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer font-medium"
                  >
                    <GitCompare size={10} /> Compare
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex-1 overflow-auto p-2 flex flex-col gap-[3px]">
            {[...simulationHistory].reverse().map((v, i) => {
              const isLatest = v.id === activeRunId || (i === 0 && !activeRunId);
              const isViewed = v.id === activeRun?.id;
              const vVerdict = v.summaryReport?.overallVerdict ?? "conditional";
              const vColor = VERDICT_COLOR[vVerdict];

              const isA = compareMode && diffRunA?.id === v.id;
              const isB = compareMode && diffRunB?.id === v.id;

              const handleClick = () => {
                if (compareMode) {
                  if (isA) { setDiffRunA(null); return; }
                  if (isB) { setDiffRunB(null); return; }
                  if (!diffRunA) { setDiffRunA(v); return; }
                  if (!diffRunB) { setDiffRunB(v); return; }
                  setDiffRunB(v);
                } else {
                  onSelectedRunChange?.(isLatest ? null : v.id);
                  setOpenChatId(null);
                }
              };

              return (
                <div key={v.id}
                  onClick={handleClick}
                  className={cn(
                    "px-[10px] py-[9px] rounded-[9px] transition-all cursor-pointer",
                    compareMode
                      ? isA
                        ? "border border-[var(--primary-border)] bg-[var(--primary-container)]"
                        : isB
                          ? "border border-[var(--color-success-border)] bg-[var(--color-success-bg)]"
                          : "border border-[var(--border-solid)] bg-transparent hover:bg-[var(--surface-2)]"
                      : isViewed
                        ? "border border-[var(--primary-border)] bg-[var(--primary-container)]"
                        : "border border-[var(--border-solid)] bg-transparent hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="flex items-center justify-between mb-[3px]">
                    <div className="flex items-center gap-1.5">
                      {compareMode && (isA || isB) && (
                        <span className="text-[9px] font-bold rounded-[4px] px-[5px] py-[1px]"
                          style={{ background: isA ? "var(--primary-container)" : "var(--color-success-bg)", color: isA ? "var(--primary)" : "var(--color-success-text)" }}>
                          {isA ? "A" : "B"}
                        </span>
                      )}
                      <span className={cn("text-[12px] font-bold font-[var(--font-head)]",
                        compareMode
                          ? isA ? "text-[var(--primary)]" : isB ? "text-[var(--color-success-text)]" : "text-[var(--on-surface)]"
                          : isViewed ? "text-[var(--primary)]" : "text-[var(--on-surface)]")}>
                        {v.versionLabel}
                      </span>
                    </div>
                    <span
                      className="text-[9px] font-semibold px-[5px] py-[1px] rounded-full border"
                      style={{ color: vColor, borderColor: hexRgba(vColor, 0.35), background: hexRgba(vColor, 0.12) }}
                    >
                      {VERDICT_LABEL[vVerdict]}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--t3)]">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </div>
                  {!compareMode && isLatest && (
                    <div className="text-[9px] text-[var(--t3)] mt-[2px]">● latest</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Compare mode footer */}
          {compareMode && (
            <div className="shrink-0 px-3 py-3 border-t border-[var(--border-solid)] flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--t3)]">
                <span className={cn("font-bold", diffRunA ? "text-[var(--primary)]" : "")}>
                  {diffRunA ? diffRunA.versionLabel : "A: —"}
                </span>
                <svg width="16" height="8" viewBox="0 0 16 8" fill="none" className="shrink-0 text-[var(--t3)]">
                  <path d="M1 4h11M9 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={cn("font-bold", diffRunB ? "text-[var(--color-success-text)]" : "")}>
                  {diffRunB ? diffRunB.versionLabel : "B: —"}
                </span>
              </div>
              <button
                type="button"
                disabled={!diffRunA || !diffRunB}
                onClick={() => { setCompareMode(false); setDiffOpen(true); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-[7px] rounded-[8px] border text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] hover:opacity-90"
              >
                <GitCompare size={11} /> View Diff
              </button>
            </div>
          )}
        </div>

      ) : null}

      {/* Recommend Solution Modal */}
      {showRecommendModal && sessionId && (
        <RecommendSolutionModal
          synthetic={{ id: showRecommendModal.syntheticId, name: showRecommendModal.syntheticName }}
          risk={showRecommendModal.risk}
          priorRisk={showRecommendModal.priorRisk}
          sessionId={sessionId}
          proposedImprovements={proposedImprovements}
          onSubmit={(payload) => {
            const newImprovements = payload.proposedImprovements ?? []
            console.log("Modal submit - new improvements:", newImprovements)
            onProposedImprovementsChange?.(newImprovements)
            setShowRecommendModal(null)
          }}
          onClose={() => setShowRecommendModal(null)}
        />
      )}

      {/* Answer Expert Question Modal */}
      {showAnswerModal && sessionId && (
        <AnswerExpertQuestionModal
          question={showAnswerModal.question}
          whyItMatters={showAnswerModal.whyItMatters}
          syntheticName={showAnswerModal.syntheticName}
          sessionId={sessionId}
          onAnswerGenerated={(answer, improvement) => {
            const key = `eq-${showAnswerModal.questionId}`;
            // Populate the textarea
            handleAnswerChange(key, answer.trim());
            // Save to DB
            void appendThinkingGraphClarification({
              sessionId,
              syntheticId: showAnswerModal.syntheticId,
              syntheticName: showAnswerModal.syntheticName,
              questionId: showAnswerModal.questionId,
              questionLabel: showAnswerModal.question,
              answer: answer.trim(),
            });
            // Notify parent
            onSubmitAnswers?.([{ question: showAnswerModal.question, answer }]);
            // Mark as saved
            onSavedAnswerKeysChange?.(new Set(savedAnswerKeys).add(key));
            setShowAnswerModal(null);
          }}
          onClose={() => setShowAnswerModal(null)}
        />
      )}
    </div>
  );
}
