"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { hexRgba } from "@/components/project-screen/tagColors";
import type { SimulationRun } from "@/components/thinking-graph/runtime/runtimeTypes";
import type { DomainVerdict, SyntheticReport } from "@/lib/thinking-graph/server/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const DIFF_ADD = "#10b981";
const DIFF_REM = "#f43f5e";
const SYNTH_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#f43f5e","#3b82f6","#ec4899"];
const VERDICT_COLOR: Record<DomainVerdict, string> = { go: "#10b981", conditional: "#f59e0b", no_go: "#f43f5e" };
const VERDICT_LABEL: Record<DomainVerdict, string> = { go: "GO", conditional: "COND.", no_go: "NO GO" };

// ── Types ──────────────────────────────────────────────────────────────────────

type DS = "added" | "removed" | "same";
type DiffLine = { text: string; status: DS };

// ── Helpers ────────────────────────────────────────────────────────────────────

function agentColorByCode(code: string): string {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SYNTH_COLORS[h % SYNTH_COLORS.length]!;
}

function statusColor(s: DS): string {
  return s === "added" ? DIFF_ADD : s === "removed" ? DIFF_REM : "var(--t3)";
}
function statusBg(s: DS): string {
  return s === "added" ? hexRgba(DIFF_ADD, 0.09) : s === "removed" ? hexRgba(DIFF_REM, 0.09) : "transparent";
}
function statusPrefix(s: DS): string {
  return s === "added" ? "+" : s === "removed" ? "−" : " ";
}

function splitIdea(text: string): string[] {
  return text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
}

function computeScore(run: SimulationRun): number {
  const agents = run.synthetics.filter((s) => s.nodeRole !== "advisor");
  if (!agents.length) return 0;
  const total = agents.reduce((sum, s) => {
    const out = run.outputsBySyntheticId[s.id];
    const rep = out && "details" in out ? (out as SyntheticReport) : null;
    return sum + Math.min(100, Math.round(rep?.concernLevels.feasibility ?? 0));
  }, 0);
  return Math.round(total / agents.length);
}

function diffLines(a: string[], b: string[]): DiffLine[] {
  const setA = new Set(a), setB = new Set(b);
  return [...new Set([...a, ...b])].map((text) => ({
    text,
    status: (setA.has(text) && setB.has(text) ? "same" : setB.has(text) ? "added" : "removed") as DS,
  }));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DiffDot({ status, size = 7 }: { status: DS; size?: number }) {
  return (
    <span
      className="rounded-full shrink-0"
      style={{ display: "inline-block", width: size, height: size, background: statusColor(status), marginTop: 2 }}
    />
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-[var(--t3)] font-[var(--font-head)]">
        {title}
      </span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}

function SummaryChip({ count, status }: { count: number; status: DS }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1 px-[10px] py-[3px] rounded-full border text-[11px] font-semibold"
      style={{ color, borderColor: hexRgba(color, 0.4), background: hexRgba(color, 0.09) }}
    >
      <span className="text-[13px] leading-none">{statusPrefix(status)}</span>
      {count} {status === "added" ? "added" : status === "removed" ? "removed" : "unchanged"}
    </span>
  );
}

function RunSelector({
  label,
  allRuns,
  selected,
  onChange,
}: {
  label: string;
  allRuns: SimulationRun[];
  selected: SimulationRun;
  onChange: (r: SimulationRun) => void;
}) {
  const verdict = selected.summaryReport?.overallVerdict ?? "conditional";
  const vColor = VERDICT_COLOR[verdict];
  const score = computeScore(selected);
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <span className="text-[9px] font-bold tracking-[0.08em] uppercase text-[var(--t3)]">{label}</span>
      <div
        className="flex items-center gap-3 px-3 py-[9px] rounded-[10px] border border-[var(--border-solid)] bg-[var(--surface-2)] cursor-default"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-[2px]">
            <span className="font-bold text-[13px] text-[var(--on-surface)] font-[var(--font-head)]">
              {selected.versionLabel}
            </span>
            <span
              className="text-[10px] font-bold px-[6px] py-[1px] rounded-full border"
              style={{ color: vColor, borderColor: hexRgba(vColor, 0.35), background: hexRgba(vColor, 0.12) }}
            >
              {VERDICT_LABEL[verdict]} · {score}
            </span>
          </div>
          <div className="text-[10px] text-[var(--t3)]">
            {new Date(selected.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex flex-col gap-[3px]">
          {allRuns.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { if (r.id !== selected.id) onChange(r); }}
              className="w-[7px] h-[7px] rounded-full border-none cursor-pointer p-0 transition-colors"
              style={{ background: r.id === selected.id ? "var(--primary)" : "var(--border-solid)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type IterationDiffProps = {
  runA: SimulationRun;
  runB: SimulationRun;
  allRuns: SimulationRun[];
  onBack: () => void;
};

export function IterationDiff({ runA: initA, runB: initB, allRuns, onBack }: IterationDiffProps) {
  const [runA, setRunA] = useState(initA);
  const [runB, setRunB] = useState(initB);

  const agentsA = runA.synthetics.filter((s) => s.nodeRole !== "advisor");
  const agentsB = runB.synthetics.filter((s) => s.nodeRole !== "advisor");

  // Name lookup for edge display
  const nameMap: Record<string, string> = {};
  [...runA.synthetics, ...runB.synthetics].forEach((s) => { nameMap[s.id] = s.name; });

  // ── Diffs ──────────────────────────────────────────────────────────────────
  const ideaLines = diffLines(splitIdea(runA.basePrompt ?? ""), splitIdea(runB.basePrompt ?? ""));

  const idsA = new Set(agentsA.map((s) => s.id));
  const idsB = new Set(agentsB.map((s) => s.id));
  const teamDiff = [
    ...agentsA.filter((s) => idsB.has(s.id)).map((s) => ({ ...s, status: "same" as DS })),
    ...agentsB.filter((s) => !idsA.has(s.id)).map((s) => ({ ...s, status: "added" as DS })),
    ...agentsA.filter((s) => !idsB.has(s.id)).map((s) => ({ ...s, status: "removed" as DS })),
  ];

  const edgeKey = (e: { from: string; to: string }) => `${e.from}→${e.to}`;
  const keysA = new Set(runA.edges.map(edgeKey));
  const keysB = new Set(runB.edges.map(edgeKey));
  const connDiff = [
    ...runA.edges.filter((e) => keysB.has(edgeKey(e))).map((e) => ({ ...e, status: "same" as DS })),
    ...runB.edges.filter((e) => !keysA.has(edgeKey(e))).map((e) => ({ ...e, status: "added" as DS })),
    ...runA.edges.filter((e) => !keysB.has(edgeKey(e))).map((e) => ({ ...e, status: "removed" as DS })),
  ];

  const questionLines = diffLines(runA.summaryReport?.actionItems ?? [], runB.summaryReport?.actionItems ?? []);

  // Applied clarifications as flat Q&A list
  const flatClarif = (run: SimulationRun) =>
    (run.appliedStructuredClarifications ?? []).flatMap((c) =>
      c.answers.map((a) => ({ id: a.questionId, label: a.questionLabel, answer: a.answer, synthName: c.syntheticName })),
    );
  const clarifA = flatClarif(runA);
  const clarifB = flatClarif(runB);
  const clarifIds = new Set([...clarifA.map((c) => c.id), ...clarifB.map((c) => c.id)]);
  const clarifDiff = [...clarifIds].map((id) => {
    const a = clarifA.find((c) => c.id === id);
    const b = clarifB.find((c) => c.id === id);
    if (a && b) return { ...b, status: a.answer !== b.answer ? ("added" as DS) : ("same" as DS), prevAnswer: a.answer };
    if (b) return { ...b, status: "added" as DS, prevAnswer: null };
    return { ...a!, status: "removed" as DS, prevAnswer: null };
  });

  // Summary
  const allItems = [...ideaLines, ...teamDiff, ...connDiff, ...questionLines];
  const totalAdded = allItems.filter((x) => x.status === "added").length;
  const totalRemoved = allItems.filter((x) => x.status === "removed").length;
  const totalSame = allItems.filter((x) => x.status === "same").length;

  const verdictA = runA.summaryReport?.overallVerdict ?? "conditional";
  const verdictB = runB.summaryReport?.overallVerdict ?? "conditional";
  const verdictChanged = verdictA !== verdictB;
  const addedAgents = teamDiff.filter((m) => m.status === "added").map((m) => m.name);
  const removedAgents = teamDiff.filter((m) => m.status === "removed").map((m) => m.name);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--background)]">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="h-[50px] shrink-0 flex items-center gap-3 px-4 border-b border-[var(--border-solid)] bg-[var(--surface-low)]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer px-2 py-1.5 rounded-[7px] hover:bg-[var(--surface-2)] transition-colors"
        >
          <ArrowLeft size={13} /> Report
        </button>
        <div className="w-px h-[18px] bg-[var(--border-solid)]" />
        <span className="font-bold text-[13px] text-[var(--on-surface)] font-[var(--font-head)]">
          Iteration Diff
        </span>
        <span className="text-[12px] text-[var(--t3)]">
          {runA.versionLabel} → {runB.versionLabel}
        </span>
        <div className="flex-1" />
        {/* Legend */}
        <div className="flex items-center gap-3">
          {(["added", "removed", "same"] as DS[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <DiffDot status={s} size={6} />
              <span className="text-[10px] text-[var(--t3)] capitalize">{s === "same" ? "unchanged" : s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Selector bar ─────────────────────────────────────────── */}
      <div className="shrink-0 flex items-end gap-4 px-6 py-4 border-b border-[var(--border-solid)] bg-[var(--surface-low)]">
        <RunSelector label="From" allRuns={allRuns} selected={runA} onChange={(r) => { if (r.id !== runB.id) setRunA(r); }} />
        <div className="pb-3 text-[var(--t3)]">
          <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
            <path d="M2 5h20M18 1l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <RunSelector label="To" allRuns={allRuns} selected={runB} onChange={(r) => { if (r.id !== runA.id) setRunB(r); }} />
        <div className="flex-1" />
        <div className="flex items-center gap-2 pb-1">
          <SummaryChip count={totalAdded} status="added" />
          <SummaryChip count={totalRemoved} status="removed" />
          <SummaryChip count={totalSame} status="same" />
        </div>
      </div>

      {/* ── Scrollable diff body ──────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-7 py-6">
        <div className="max-w-[820px] mx-auto flex flex-col gap-8">

          {/* Idea text */}
          <div>
            <SectionHeader title="Idea text" />
            <div className="flex flex-col gap-[3px]">
              {ideaLines.map((line, i) => (
                <div
                  key={i}
                  className="flex items-start gap-[10px] px-[10px] py-[7px] rounded-[7px]"
                  style={{ background: statusBg(line.status), border: line.status !== "same" ? `0.5px solid ${hexRgba(statusColor(line.status), 0.28)}` : "0.5px solid transparent" }}
                >
                  <span
                    className="font-mono text-[11px] w-[10px] text-center shrink-0 mt-[1px] select-none"
                    style={{ color: statusColor(line.status) }}
                  >{statusPrefix(line.status)}</span>
                  <span
                    className="text-[13px] leading-[1.65]"
                    style={{
                      color: line.status === "same" ? "var(--on-surface-variant)" : "var(--on-surface)",
                      textDecoration: line.status === "removed" ? "line-through" : "none",
                      opacity: line.status === "removed" ? 0.55 : 1,
                    }}
                  >{line.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Applied clarifications */}
          {clarifDiff.length > 0 && (
            <div>
              <SectionHeader title="Applied Q&A context" />
              <div className="flex flex-col gap-2">
                {clarifDiff.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-[9px] border overflow-hidden"
                    style={{ borderColor: hexRgba(statusColor(c.status), 0.25), background: statusBg(c.status) }}
                  >
                    <div className="px-3 py-[8px] flex items-start gap-2 border-b border-[var(--border-solid)]">
                      <DiffDot status={c.status} />
                      <span className="text-[12px] text-[var(--on-surface-variant)] leading-[1.55]">{c.label}</span>
                    </div>
                    {c.answer && (
                      <div className="px-3 py-[7px] flex items-start gap-2">
                        <span className="text-[10px] text-[var(--t3)] mt-[2px] shrink-0">{c.synthName}</span>
                        <div className="flex flex-col gap-1">
                          {c.prevAnswer && c.status === "added" && (
                            <span className="text-[12px] line-through opacity-50" style={{ color: DIFF_REM }}>{c.prevAnswer}</span>
                          )}
                          <span
                            className="text-[12px] font-medium leading-[1.55]"
                            style={{ color: c.status !== "same" ? "var(--on-surface)" : "var(--on-surface-variant)" }}
                          >{c.answer}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orchestrator questions */}
          <div>
            <SectionHeader title="Orchestrator questions" />
            {questionLines.length === 0 ? (
              <div className="text-[12px] text-[var(--t3)] py-2">No questions in either run.</div>
            ) : (
              <div className="flex flex-col gap-[3px]">
                {questionLines.map((line, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-[10px] px-[10px] py-[7px] rounded-[7px]"
                    style={{ background: statusBg(line.status), border: line.status !== "same" ? `0.5px solid ${hexRgba(statusColor(line.status), 0.28)}` : "0.5px solid transparent" }}
                  >
                    <span className="font-mono text-[11px] w-[10px] text-center shrink-0 mt-[1px] select-none" style={{ color: statusColor(line.status) }}>{statusPrefix(line.status)}</span>
                    <span className="text-[12px] leading-[1.6]" style={{ color: line.status === "same" ? "var(--on-surface-variant)" : "var(--on-surface)", opacity: line.status === "removed" ? 0.55 : 1, textDecoration: line.status === "removed" ? "line-through" : "none" }}>
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team */}
          <div>
            <SectionHeader title="Synthetics team" />
            <div className="flex flex-wrap gap-2">
              {teamDiff.map((m, i) => {
                const color = agentColorByCode(m.code);
                return (
                  <div
                    key={i}
                    className="inline-flex items-center gap-2 px-[10px] py-[6px] rounded-full border"
                    style={{ background: statusBg(m.status), borderColor: hexRgba(statusColor(m.status), 0.35) }}
                  >
                    <DiffDot status={m.status} size={6} />
                    <div
                      className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ background: hexRgba(color, 0.18), color }}
                    >{m.code}</div>
                    <div>
                      <div
                        className="text-[12px] font-semibold leading-[1.2]"
                        style={{ color: m.status === "same" ? "var(--on-surface-variant)" : "var(--on-surface)" }}
                      >{m.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connections */}
          {connDiff.length > 0 && (
            <div>
              <SectionHeader title="Connections between synthetics" />
              <div className="flex flex-col gap-[5px]">
                {connDiff.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-[8px] rounded-[8px] border"
                    style={{ background: statusBg(e.status), borderColor: e.status !== "same" ? hexRgba(statusColor(e.status), 0.25) : "var(--border-solid)" }}
                  >
                    <DiffDot status={e.status} size={7} />
                    <span className="text-[12px] font-medium text-[var(--on-surface)] min-w-[110px]">{nameMap[e.from] ?? e.from}</span>
                    <svg width="24" height="9" viewBox="0 0 24 9" fill="none" className="text-[var(--t3)] shrink-0">
                      <path d="M1 4.5h18M15 1l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[12px] font-medium text-[var(--on-surface)] min-w-[110px]">{nameMap[e.to] ?? e.to}</span>
                    <span className="text-[10px] text-[var(--t3)] px-[7px] py-[2px] rounded-full bg-[var(--surface-2)] border border-[var(--border-solid)]">{e.type}</span>
                    <span
                      className="ml-auto text-[10px] font-bold tracking-[0.06em] uppercase"
                      style={{ color: statusColor(e.status) }}
                    >{e.status === "same" ? "unchanged" : e.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verdict change block */}
          <div className="rounded-[12px] px-[18px] py-[15px] border border-[var(--primary-border)] bg-[var(--primary-container)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-[13px] bg-[var(--primary-fixed-dim)]">⚡</div>
              <span className="text-[11px] font-bold tracking-[0.07em] uppercase text-[var(--primary)]">
                Why the verdict changed
              </span>
            </div>
            <p className="text-[13px] leading-[1.75] text-[var(--on-surface)]">
              {verdictChanged
                ? `Verdict moved from ${VERDICT_LABEL[verdictA]} to ${VERDICT_LABEL[verdictB]}.`
                : `Verdict remained ${VERDICT_LABEL[verdictB]}.`}
              {addedAgents.length > 0 && ` Added synthetics: ${addedAgents.join(", ")}.`}
              {removedAgents.length > 0 && ` Removed synthetics: ${removedAgents.join(", ")}.`}
              {ideaLines.filter((l) => l.status !== "same").length > 0 && " The idea description was updated."}
              {clarifDiff.filter((c) => c.status !== "same").length > 0 && " New answers were provided to orchestrator questions."}
            </p>
          </div>

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
