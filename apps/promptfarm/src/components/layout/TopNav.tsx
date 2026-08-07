"use client";

import Link from "next/link";
import { Play, Square } from "lucide-react";
import { useRunContext } from "@/lib/run-context";
import { cn } from "@/lib/utils";

export function TopNav() {
  const {
    isRunning, canRun, pendingChatNodes,
    hasBuildPlan, openBuildPlan, openReport,
    start, stop,
    hasIdea, agentCount, completedAgentCount, elapsedSecs, runStatus,
  } = useRunContext();

  const outcomeReady = runStatus === "done";

  const hint = !hasIdea
    ? null
    : isRunning
      ? null
      : outcomeReady
        ? null
        : agentCount === 0
          ? "Drag a role onto the canvas to get started"
          : null;

  return (
    <>
      <style>{`
        @keyframes run-btn-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); }
          50%       { box-shadow: 0 0 0 5px rgba(167,139,250,0.22); }
        }
        .run-btn-glow { animation: run-btn-glow 2s ease-in-out infinite; }
      `}</style>

      <header className="h-12 flex items-center px-4 gap-0 sticky top-0 z-10 border-b border-[var(--surface-container)] bg-transparent">

        {/* ── Logo ── */}
        <div className="flex items-center gap-[10px] pr-4 mr-4 border-r border-[var(--surface-container)] shrink-0">
          <img src="/logo-horizontal.svg" alt="TOFO" style={{ height: 24, width: "auto" }} />
          <span className="text-[10px] text-[var(--t3)] font-mono bg-[var(--surface-high)] border border-[var(--surface-container)] rounded px-[6px] py-px leading-[1.6]">
            beta
          </span>
        </div>

        {/* ── Back to projects ── */}
        <Link
          href="/tofo/projects"
          className="text-[11px] text-[var(--t3)] font-mono no-underline px-2 py-[3px] rounded-[5px] border border-[var(--surface-container)] mr-2 shrink-0 transition-colors hover:text-[var(--on-surface-variant)]"
        >
          ← projects
        </Link>

        {/* ── Center ── */}
        <div className="flex-1 flex items-center justify-center min-w-0">

          {hint && (
            <span className="text-[12px] text-[var(--on-surface-variant)] font-sans whitespace-nowrap overflow-hidden text-ellipsis">
              {hint}
            </span>
          )}

          {isRunning && (
            <div className="flex items-center gap-3">
              <div className="w-[140px] h-1 rounded-full bg-[var(--surface-container)] overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full bg-[#a78bfa] transition-[width] duration-[400ms] ease-linear"
                  style={{
                    width: agentCount > 0
                      ? `${Math.round((completedAgentCount / agentCount) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="text-[12px] font-sans text-[var(--on-surface-variant)] whitespace-nowrap">
                {completedAgentCount >= agentCount && agentCount > 0
                  ? "Synthesizing…"
                  : `${completedAgentCount} of ${agentCount} agents`}
                <span className="font-mono ml-2 text-[var(--t3)]">{elapsedSecs}s</span>
              </span>
            </div>
          )}

          {outcomeReady && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openReport}
                className="flex items-center gap-2 px-[14px] py-[6px] rounded-lg bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.4)] cursor-pointer transition-colors hover:bg-[rgba(52,211,153,0.15)]"
              >
                <span className="w-[7px] h-[7px] rounded-full bg-[#34d399] shrink-0 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]" />
                <span className="text-[12px] font-semibold text-[#34d399] font-sans whitespace-nowrap">
                  Report ready — view results
                </span>
                <span className="text-[12px] text-[rgba(52,211,153,0.6)] font-mono">→</span>
              </button>

              {hasBuildPlan && (
                <button
                  type="button"
                  onClick={openBuildPlan}
                  className="flex items-center gap-[6px] px-3 py-[6px] rounded-lg bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.3)] cursor-pointer transition-colors hover:bg-[rgba(167,139,250,0.13)]"
                >
                  <span className="text-[12px] font-semibold text-[#a78bfa] font-sans whitespace-nowrap">Build plan</span>
                  <span className="text-[12px] text-[rgba(167,139,250,0.6)] font-mono">↗</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right actions ── */}
        <div className="flex items-center gap-2 shrink-0">

          {!isRunning && !outcomeReady && (
            <button
              type="button"
              onClick={start}
              disabled={!canRun}
              className={cn(
                "flex items-center gap-[7px] h-[34px] px-4 rounded-lg text-[13px] font-semibold font-sans whitespace-nowrap transition-[background,opacity] duration-150",
                canRun
                  ? "text-[#a78bfa] bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.4)] cursor-pointer run-btn-glow"
                  : "text-[var(--on-surface-variant)] bg-[var(--surface-high)] border border-[var(--surface-container)] opacity-50 cursor-not-allowed",
              )}
            >
              <Play size={12} />
              {pendingChatNodes > 0 ? `Re-run (${pendingChatNodes} affected)` : "Run Simulation"}
            </button>
          )}

          {isRunning && (
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-[7px] h-[34px] px-4 rounded-lg text-[13px] font-semibold font-sans text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.35)] cursor-pointer whitespace-nowrap transition-colors hover:bg-[rgba(248,113,113,0.13)]"
            >
              <Square size={12} />
              Stop
            </button>
          )}

          {outcomeReady && pendingChatNodes > 0 && (
            <button
              type="button"
              onClick={start}
              className="flex items-center gap-[7px] h-[34px] px-4 rounded-lg text-[13px] font-semibold font-sans text-[#fb923c] bg-[rgba(251,146,60,0.08)] border border-[rgba(251,146,60,0.35)] cursor-pointer whitespace-nowrap transition-colors hover:bg-[rgba(251,146,60,0.13)]"
            >
              <Play size={12} />
              Re-run ({pendingChatNodes})
            </button>
          )}

        </div>
      </header>
    </>
  );
}
