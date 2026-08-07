"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Moon, Play, Square, Sun } from "lucide-react";
import { ConfigureConnectionsModal } from "@/components/project-screen/ConfigureConnectionsModal";
import { cn } from "@/lib/utils";
import { RunProvider, useRunContext } from "@/lib/run-context";
import { useTheme } from "@/lib/theme-context";
import { ThinkingGraphWorkspace } from "@/components/thinking-graph/ThinkingGraphWorkspace";
import { IdeaTab } from "@/components/project-screen/tabs/IdeaTab";
import { ReportTab } from "@/components/project-screen/tabs/ReportTab";
import { SyntheticsTab } from "@/components/project-screen/tabs/SyntheticsTab";
import { tagColor, hexRgba } from "@/components/project-screen/tagColors";
import {
  buildProjectScreenSearch,
  parseProjectScreenTab,
  type ProjectScreenTab,
} from "@/components/project-screen/projectScreenNavigation";
import { isHistoricalIterationView } from "@/components/project-screen/projectIterationMode";
import type { SyntheticGraphPayload, ProposedImprovement } from "@/lib/thinking-graph/server/types";
import { useThinkingGraphVersionStore } from "@/components/thinking-graph/state/useThinkingGraphVersionStore";

const TABS: { id: ProjectScreenTab; label: string; icon: string }[] = [
  { id: "report",     label: "Report",     icon: "📋" },
  { id: "idea",       label: "Idea",       icon: "💡" },
  { id: "synthetics", label: "Synthetics", icon: "⚗️" },
];

type ProjectScreenProps = {
  projectId: string;
  projectName: string | null;
  domainTags?: string[];
  initialIdeaPrompt: string;
  initialSessionPayload: SyntheticGraphPayload | null;
  autostart?: boolean;
  autoPersonaIds?: string[];
};

function stripLegacyProjectDomainTagsSuffix(value: string): string {
  return value.replace(/\n\nProject domain tags:[\s\S]*$/, "").trim();
}

function ProjectScreenContent({
  projectId,
  projectName,
  domainTags = [],
  initialIdeaPrompt,
  initialSessionPayload,
  autostart = false,
  autoPersonaIds = [],
}: ProjectScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<ProjectScreenTab>(() =>
    parseProjectScreenTab(searchParams.get("tab")),
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() =>
    searchParams.get("run"),
  );
  const [graphOpen, setGraphOpen] = useState(false);

  // Lifted so state survives tab switches (prevents auto-save timer cancellation on unmount)
  const normalizedInitialIdea = stripLegacyProjectDomainTagsSuffix(initialIdeaPrompt);
  const [idea, setIdea] = useState(() => normalizedInitialIdea);
  const [tags, setTags] = useState<string[]>(domainTags);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last-saved values so we don't fire on mount with unchanged data
  const lastSavedIdeaRef = useRef(normalizedInitialIdea);
  const lastSavedTagsRef = useRef(JSON.stringify(domainTags));

  const {
    visibleSynthetics,
    graphRegistered,
    addRole,
    removeRole,
    addCustomRole,
    start,
    stop,
    canRun,
    isRunning,
    revisionEdges,
    setRevisionEdges,
    runStats,
  } = useRunContext();
  const simulationHistory = useThinkingGraphVersionStore((state) => state.simulationHistory);
  const ssKey = `pf-ctx-${projectId}`;
  const [questionFragments, setQuestionFragments] = useState<{ question: string; answer: string }[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`${ssKey}-frags`) ?? "[]"); } catch { return []; }
  });
  const [expertAnswers, setExpertAnswers] = useState<Record<string, string>>(() => {
    try { return JSON.parse(sessionStorage.getItem(`${ssKey}-answers`) ?? "{}"); } catch { return {}; }
  });
  const [savedAnswerKeys, setSavedAnswerKeys] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(`${ssKey}-saved`) ?? "[]")); } catch { return new Set(); }
  });
  const [proposedImprovements, setProposedImprovements] = useState<ProposedImprovement[]>(
    () => {
      const initial = initialSessionPayload?.proposedImprovements ?? [];
      console.log("[ProjectScreen] Init proposedImprovements:", initial);
      return initial;
    }
  );
  const latestRunId = simulationHistory.at(-1)?.id ?? null;
  const isHistoricalView = isHistoricalIterationView({
    selectedRunId,
    latestRunId,
  });
  const canRunCurrentView = canRun && !isHistoricalView;

  useEffect(() => {
    console.log("[ProjectScreen] proposedImprovements updated:", proposedImprovements);
  }, [proposedImprovements]);

  useEffect(() => { sessionStorage.setItem(`${ssKey}-frags`, JSON.stringify(questionFragments)); }, [questionFragments, ssKey]);
  useEffect(() => { sessionStorage.setItem(`${ssKey}-answers`, JSON.stringify(expertAnswers)); }, [expertAnswers, ssKey]);
  useEffect(() => { sessionStorage.setItem(`${ssKey}-saved`, JSON.stringify([...savedAnswerKeys])); }, [savedAnswerKeys, ssKey]);

  useEffect(() => {
    setTags(domainTags);
    lastSavedTagsRef.current = JSON.stringify(domainTags);
  }, [domainTags]);

  useEffect(() => {
    const normalizedIdea = stripLegacyProjectDomainTagsSuffix(idea);
    const serialized = JSON.stringify(tags);
    if (
      normalizedIdea === lastSavedIdeaRef.current &&
      serialized === lastSavedTagsRef.current
    ) {
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea: normalizedIdea,
            domainTags: tags,
          }),
        });
        if (!response.ok) {
          return;
        }

        lastSavedIdeaRef.current = normalizedIdea;
        lastSavedTagsRef.current = serialized;
      })();
    }, 1200);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [idea, tags, projectId]);

  // Use live synthetics from canvas if available, fall back to initial payload
  const synthetics = graphRegistered
    ? visibleSynthetics
    : (initialSessionPayload?.synthetics ?? []);

  useEffect(() => {
    setTab(parseProjectScreenTab(searchParams.get("tab")));
    setSelectedRunId(searchParams.get("run"));
  }, [searchParams]);

  const replaceProjectNavigation = useCallback(
    (input: { tab?: ProjectScreenTab; runId?: string | null }) => {
      const nextTab = input.tab ?? tab;
      const nextRunId = input.runId !== undefined ? input.runId : selectedRunId;
      const nextSearch = buildProjectScreenSearch({
        currentSearch: searchParams,
        tab: nextTab,
        runId: nextRunId,
      });

      setTab(nextTab);
      setSelectedRunId(nextRunId);

      if (typeof window !== "undefined") {
        const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", nextUrl);
      }
    },
    [searchParams, selectedRunId, tab],
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--background)] text-[var(--on-surface)]">

      {/* ── Topbar ───────────────────────────────────────────────── */}
      <div className="h-[50px] shrink-0 flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--surface)]">

        <button
          onClick={() => router.push("/tofo/projects")}
          className="flex items-center gap-1.5 text-xs text-[var(--text-2)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer px-2 py-1.5 rounded-[7px] hover:bg-[var(--surface-2)] transition-colors shrink-0"
        >
          <ChevronLeft size={13} />
          Projects
        </button>

        <div className="w-px h-[18px] bg-[var(--border)] shrink-0" />

        <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-[440px]">
          <span className="font-bold text-sm text-[var(--on-surface)] truncate shrink-0 font-[var(--font-head)]">
            {projectName ?? "Project"}
          </span>
          {tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tags.map((t) => {
                const c = tagColor(t);
                return (
                  <span
                    key={t}
                    className="shrink-0 text-[10px] font-mono px-[7px] py-[2px] rounded-full border border-solid whitespace-nowrap"
                    style={{ color: c, borderColor: hexRgba(c, 0.35), background: hexRgba(c, 0.1) }}
                  >
                    {t}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Tab pill switcher — pushed to the right */}
        <div className="flex-1 flex justify-end mr-2">
          <div className="flex bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] p-[3px]">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => replaceProjectNavigation({ tab: id })}
                className={cn(
                  "flex items-center gap-[5px] px-[11px] py-[5px] rounded-[7px] text-xs cursor-pointer border-none transition-all font-[var(--font-body)]",
                  tab === id
                    ? "bg-[var(--surface)] font-semibold text-[var(--on-surface)]"
                    : "bg-transparent font-normal text-[var(--t3)] hover:text-[var(--on-surface-variant)]",
                )}
                style={{ boxShadow: tab === id ? "0 1px 3px rgba(0,0,0,0.15)" : "none" }}
              >
                <span className="text-[11px]">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-[7px] border border-[var(--border)] bg-transparent text-[var(--t3)] hover:text-[var(--on-surface)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        {runStats && (
          <div className="shrink-0 flex items-center gap-[5px] text-[10px] font-mono text-[var(--t3)] border border-[var(--border)] rounded-[7px] px-2 py-[5px]">
            {runStats.tokenUsage.promptTokens !== null && (
              <span>{runStats.tokenUsage.promptTokens?.toLocaleString()} in</span>
            )}
            {runStats.tokenUsage.completionTokens !== null && (
              <>
                <span className="opacity-30">/</span>
                <span>{runStats.tokenUsage.completionTokens?.toLocaleString()} out</span>
              </>
            )}
            {runStats.costUsd !== null && (
              <>
                <span className="opacity-30">·</span>
                <span className="text-[var(--on-surface-variant)] font-semibold">${runStats.costUsd.toFixed(4)}</span>
              </>
            )}
          </div>
        )}

        {isRunning ? (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.12)] text-[#f87171] text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity shrink-0"
          >
            <Square size={10} />
            Stop
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!canRunCurrentView}
            title={isHistoricalView ? "Switch to the latest iteration to run a new simulation." : undefined}
            className={cn(
              "flex items-center gap-1.5 px-3 py-[7px] rounded-lg border text-xs font-semibold shrink-0 transition-opacity",
              canRunCurrentView
                ? "border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] cursor-pointer hover:opacity-90"
                : "border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] opacity-40 cursor-not-allowed",
            )}
          >
            <Play size={11} />
            Run Simulation
          </button>
        )}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {tab === "report" && (
          <ReportTab
            synthetics={synthetics}
            hasInitialSessionPayload={Boolean(initialSessionPayload)}
            sessionId={initialSessionPayload?.sessionId ?? null}
            projectId={projectId}
            selectedRunId={selectedRunId}
            onSelectedRunChange={(runId) => replaceProjectNavigation({ runId })}
            onRunSim={start}
            onSubmitAnswers={(frags) => setQuestionFragments((prev) => [...prev, ...frags])}
            expertAnswers={expertAnswers}
            onExpertAnswersChange={setExpertAnswers}
            savedAnswerKeys={savedAnswerKeys}
            onSavedAnswerKeysChange={setSavedAnswerKeys}
            proposedImprovements={proposedImprovements}
            onProposedImprovementsChange={setProposedImprovements}
          />
        )}
        {tab === "idea" && (
          <IdeaTab
            projectId={projectId}
            sessionId={initialSessionPayload?.sessionId ?? null}
            synthetics={synthetics.map((s) => ({ id: s.id, name: s.name }))}
            idea={idea}
            onIdeaChange={setIdea}
            tags={tags}
            onTagsChange={setTags}
            isReadOnly={isHistoricalView}
            questionFragments={questionFragments}
            onRemoveFragment={
              isHistoricalView
                ? undefined
                : (i) => setQuestionFragments((prev) => prev.filter((_, idx) => idx !== i))
            }
            proposedImprovements={proposedImprovements}
            onRemoveImprovement={
              isHistoricalView
                ? undefined
                : (id) => {
                    const filteredImprovements = proposedImprovements.filter((p) => p.id !== id);
                    setProposedImprovements(filteredImprovements);
                    // Persist deletion to API/DB
                    if (initialSessionPayload?.sessionId) {
                      import("@/lib/thinking-graph/client").then(({ deleteProposedImprovement }) => {
                        void deleteProposedImprovement({
                          sessionId: initialSessionPayload.sessionId,
                          improvementId: id,
                        }).catch(console.error);
                      });
                    }
                  }
            }
          />
        )}
        {tab === "synthetics" && (
          <SyntheticsTab
            synthetics={synthetics}
            edges={revisionEdges}
            isReadOnly={isHistoricalView}
            hasRun={simulationHistory.length > 0}
            onOpenGraph={() => setGraphOpen(true)}
            onNavigateTo={(nextTab) => replaceProjectNavigation({ tab: nextTab })}
            onAdd={addRole}
            onRemove={removeRole}
            onAddCustom={addCustomRole}
          />
        )}
      </div>

      {/* ── Simulation engine — always mounted but hidden ──────── */}
      <div className="hidden absolute">
        <ThinkingGraphWorkspace
          projectId={projectId}
          projectName={projectName}
          initialIdeaPrompt={initialIdeaPrompt}
          initialSessionPayload={initialSessionPayload}
          autostart={autostart}
          autoPersonaIds={autoPersonaIds}
          withRunProvider={false}
        />
      </div>

      {/* ── Configure connections modal ──────────────────────────── */}
      {graphOpen && (
        <ConfigureConnectionsModal
          synthetics={visibleSynthetics}
          edges={revisionEdges}
          onUpdateEdges={setRevisionEdges}
          onClose={() => setGraphOpen(false)}
        />
      )}

    </div>
  );
}

export function ProjectScreen(props: ProjectScreenProps) {
  return (
    <RunProvider>
      <ProjectScreenContent {...props} />
    </RunProvider>
  );
}
