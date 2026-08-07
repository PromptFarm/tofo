"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Search, X, Zap, Paperclip } from "lucide-react";
import { uploadProjectFile, saveThinkingGraphIntakeAnswers, saveProjectThinkingGraphSession } from "@/lib/thinking-graph/client";
import { buildThinkingGraphLaunchUrl } from "./launchConfig";
import type { SyntheticIntakeAnswer, SyntheticIntakeQuestion } from "@/lib/thinking-graph/server/types";
import { cn } from "@/lib/utils";
import type { PromptProjectSummary } from "@/lib/db-client";
import type { TeamPresetSummary } from "@/lib/db-client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { avatarColor, avatarLetters } from "./new/utils";
import { resolveProjectTeamBadge } from "./projectCardTeamBadge";
import creationFlow from "./creation-flow.json";
import { runFlow } from "./flow/runner";
import { useFlowWatchdog } from "./flow/useFlowWatchdog";
import type { FlowCtx, FlowStep, StepRecord } from "./flow/types";

// ── constants ─────────────────────────────────────────────────────────────────

const PRESET_TAGS = [
  "Business", "SaaS", "GameDev", "Health", "Education",
  "Mobile", "AI / ML", "Fintech", "E-commerce", "Social",
  "Marketplace", "B2B", "B2C", "Open Source",
];

const TAG_COLORS: Record<string, string> = {
  Business: "#a78bfa", SaaS: "#a78bfa", Startup: "#a78bfa", "B2B": "#a78bfa", "B2C": "#a78bfa",
  GameDev: "#34d399", "Open Source": "#34d399",
  Health: "#60a5fa", Mobile: "#38bdf8",
  Education: "#fb923c", "E-commerce": "#fb923c",
  "AI / ML": "#f472b6",
  Fintech: "#4ade80",
  Social: "#f59e0b", Marketplace: "#f59e0b",
};

function tagColor(tag: string) { return TAG_COLORS[tag] ?? "#a78bfa"; }

/** Convert a 6-char hex color + 0-1 alpha to rgba() string. */
function hexRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const STRIPE_PALETTE = ["#a78bfa", "#34d399", "#60a5fa", "#fb923c", "#f472b6", "#f59e0b"];
function stripeColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return STRIPE_PALETTE[Math.abs(h) % STRIPE_PALETTE.length]!;
}

function formatDate(v: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(v));
}

// ── ProjectCard ───────────────────────────────────────────────────────────────

type ProjectStatus = "draft" | "ready" | "analyzed" | "needs-rerun";

function getProjectStatus(project: PromptProjectSummary): ProjectStatus {
  if (project.status === "draft") return "draft";
  if (project.status === "needs-rerun") return "needs-rerun";
  if (project.hasLatestRun) return "analyzed";
  return "ready";
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:        { label: "Draft",          color: "rgb(251,191,36)",       bg: "rgba(251,191,36,0.08)",       border: "rgba(251,191,36,0.3)" },
  ready:        { label: "Ready",          color: "rgb(96,165,250)",        bg: "rgba(96,165,250,0.08)",        border: "rgba(96,165,250,0.3)" },
  analyzed:     { label: "Analyzed",       color: "var(--primary)",         bg: "var(--primary-container)",     border: "var(--primary-border)" },
  "needs-rerun":{ label: "Needs rerun",    color: "rgb(251,146,60)",        bg: "rgba(251,146,60,0.08)",        border: "rgba(251,146,60,0.3)" },
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-block shrink-0 rounded px-[6px] py-px text-[9px] font-mono uppercase tracking-widest"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

function ProjectCard({ project, teamName, onDelete, onOpenDraft }: { project: PromptProjectSummary; teamName: string | null; onDelete: (id: string) => void; onOpenDraft: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const isDraft = project.status === "draft";
  const status = getProjectStatus(project);
  // Strip the "\n\nProject domain tags: ..." suffix that may have been appended to the idea prompt
  const displayIdea = project.idea.replace(/\n\nProject domain tags:[\s\S]*$/, "").trim();

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onDelete(project.id);
  }

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-2 mb-[10px]">
        <div className="text-[15px] font-bold text-[var(--on-surface)] font-sans leading-snug truncate flex-1 min-w-0">
          {project.name}
        </div>
        <StatusBadge status={status} />
      </div>
      {displayIdea && (
        <p className="text-[12px] text-[var(--on-surface-variant)] leading-[1.6] mb-[10px] line-clamp-2">{displayIdea}</p>
      )}
      {(project.domainTags.length > 0 || teamName !== null || !isDraft) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-[10px]">
          {project.domainTags.map((t) => {
            const c = tagColor(t);
            return (
              <span key={t}
                className="inline-flex items-center rounded-full px-[7px] py-[2px] text-[9px] font-mono border border-solid"
                style={{ color: c, borderColor: hexRgba(c, 0.35), background: hexRgba(c, 0.1) }}>
                {t}
              </span>
            );
          })}
          {teamName ? (
            <span className="inline-flex items-center rounded-full px-[7px] py-[2px] text-[9px] font-mono border border-solid border-[var(--surface-container)] text-[var(--t3)]">
              {teamName}
            </span>
          ) : !isDraft ? (
            <span className="inline-flex items-center rounded-full px-[7px] py-[2px] text-[9px] font-mono border border-solid border-[var(--surface-container)] text-[var(--t3)] opacity-60">
              Auto team
            </span>
          ) : null}
        </div>
      )}
      <div className="flex items-center justify-between pt-[10px] border-t border-[var(--surface-container)]">
        <span className="text-[11px] text-[var(--t3)]">{formatDate(project.updatedAt)}</span>
        {/* Spacer keeps the layout consistent; the delete button is rendered outside */}
        <div className="w-6 h-6" />
      </div>
    </>
  );

  return (
    <div className="group relative rounded-xl border border-[var(--surface-container)] bg-[var(--surface-lowest)] overflow-hidden hover:border-[var(--primary-border)] hover:bg-[var(--surface-low)] transition-colors">
      <div className="h-[3px] w-full" style={{ background: stripeColor(project.id) }} />
      {isDraft ? (
        <button type="button" onClick={() => onOpenDraft(project.id)} className="block w-full p-[18px] text-left bg-transparent border-none cursor-pointer">
          {cardContent}
        </button>
      ) : (
        <Link href={`/tofo/projects/${project.id}`} className="block p-[18px] no-underline">
          {cardContent}
        </Link>
      )}
      {/* Delete button rendered outside the <button>/<a> to avoid nested interactive elements */}
      <AlertDialog>
        <AlertDialogTrigger
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 absolute bottom-[14px] right-[14px] flex items-center justify-center w-6 h-6 rounded-md text-[var(--on-surface-variant)] hover:text-[#f87171] hover:bg-[rgba(248,113,113,0.08)] transition-all cursor-pointer bg-transparent border-0 p-0 z-10"
        >
          <Trash2 size={12} />
        </AlertDialogTrigger>
        <AlertDialogContent className="border-[var(--surface-container)] bg-[var(--surface-lowest)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--on-surface)]">Delete project?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--on-surface-variant)]">
              <span className="text-[var(--on-surface)] font-medium">{project.name}</span> will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--surface-container)] bg-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-low)] hover:text-[var(--on-surface)]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting} className="bg-[#ef4444] text-white hover:bg-[#b91c1c] disabled:opacity-60 cursor-pointer">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── CreateProjectModal ────────────────────────────────────────────────────────

type ModalPhase = "form" | "thinking" | "questions" | "assembling";

function ModalSpinner() {
  return <div className="w-7 h-7 rounded-full border-2 border-[rgba(167,139,250,0.15)] [border-top-color:#a78bfa] animate-spin shrink-0" />;
}

function CreateProjectModal({ open, draftId, onClose }: { open: boolean; draftId?: string | null; onClose: () => void }) {
  const router = useRouter();

  // form state
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagDropOpen, setTagDropOpen] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [teams, setTeams] = useState<TeamPresetSummary[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamDropOpen, setTeamDropOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // launch / intake state
  const [phase, setPhase] = useState<ModalPhase>("form");
  const [launchStep, setLaunchStep] = useState("");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const [intakeQuestions, setIntakeQuestions] = useState<SyntheticIntakeQuestion[]>([]);
  const [intakeIndex, setIntakeIndex] = useState(0);
  const [intakeAnswer, setIntakeAnswer] = useState("");
  const [intakeAnswers, setIntakeAnswers] = useState<SyntheticIntakeAnswer[]>([]);
  const [dots, setDots] = useState(".");

  const tagInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const teamDropRef = useRef<HTMLDivElement>(null);
  const flowQueueRef = useRef(new Map<string, StepRecord>());
  useFlowWatchdog(flowQueueRef.current);

  // animated dots during thinking/assembling
  useEffect(() => {
    if (phase !== "thinking" && phase !== "assembling") return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!teamDropOpen) return;
    function onDown(e: MouseEvent) {
      if (teamDropRef.current && !teamDropRef.current.contains(e.target as Node)) setTeamDropOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [teamDropOpen]);

  useEffect(() => {
    if (!open) return;
    setTeamsLoading(true);
    const teamsP = fetch("/api/teams")
      .then((r) => r.json() as Promise<{ teams?: TeamPresetSummary[] }>)
      .then((d) => d.teams ?? [])
      .catch(() => [] as TeamPresetSummary[]);

    const draftP = draftId
      ? fetch(`/api/projects/${draftId}`)
          .then((r) => r.json() as Promise<{ project?: {
            idea: string;
            name: string;
            selectedTeamId?: string | null;
            domainTags?: string[];
            draftState?: { selectedTeamId?: string | null; domainTags?: string[] };
          } }>)
          .then((d) => d.project)
          .catch(() => null)
      : Promise.resolve(null);

    void Promise.all([teamsP, draftP]).then(([loadedTeams, draft]) => {
      setTeams(loadedTeams);
      setTeamsLoading(false);
      if (draft) {
        setIdea(draft.idea ?? "");
        setName(draft.name ?? "");
        setTags(draft.draftState?.domainTags ?? draft.domainTags ?? []);
        setTeamId(draft.draftState?.selectedTeamId ?? draft.selectedTeamId ?? null);
      }
    });
  }, [open, draftId]);

  function reset() {
    setIdea(""); setName(""); setTags([]); setTagInput(""); setTeamId(null); setPendingFiles([]);
    setPhase("form"); setLaunchStep(""); setLaunchError(null); setBusy(false);
    setSessionId(null); projectIdRef.current = null;
    setIntakeQuestions([]); setIntakeIndex(0); setIntakeAnswer(""); setIntakeAnswers([]);
  }
  function handleClose() { if (busy && phase !== "form") return; reset(); onClose(); }

  const valid = idea.trim().length > 10;

  function addTag(t: string) {
    const v = t.trim();
    if (!v || tags.includes(v) || tags.length >= 3) return;
    setTags((p) => [...p, v]);
    setTagInput("");
    setTagDropOpen(false);
  }

  function selectedTeamPersonas(): string {
    if (!teamId) return "";
    const team = teams.find((t) => t.id === teamId);
    if (!team) return "";
    return team.members.map((m) => m.personaId).filter(Boolean).join(",");
  }

  async function handleLaunch() {
    if (!valid || busy) return;

    const trimmedIdea = idea.trim();
    const ideaPrompt = tags.length > 0
      ? `${trimmedIdea}\n\nProject domain tags: ${tags.join(", ")}.`
      : trimmedIdea;
    const autoPersonaIds = selectedTeamPersonas().split(",").filter(Boolean);

    setBusy(true);
    setLaunchError(null);

    const queue = flowQueueRef.current;
    queue.clear();

    const initialCtx: FlowCtx = {
      ideaPrompt,
      userProvidedName: name.trim() || null,
      selectedTeamId: teamId,
      domainTags: tags,
      autoPersonaIds,
      autostart: autostartEnabled,
      pendingFiles,
      draftProjectId: projectIdRef.current ?? draftId ?? null,
      router,
      onIntakeReady: () => Promise.resolve([]),
      projectId: null,
      projectName: null,
      sessionId: null,
      synthetics: [],
      intakeQuestions: [],
      intakeAnswers: [],
      runId: null,
    };

    try {
      const flow = creationFlow.flows["create-project"];
      for await (const tick of runFlow(flow.steps as FlowStep[], initialCtx, queue)) {
        if (tick.skipped) continue;
        if (tick.phase === "start") {
          setLaunchStep(tick.title);
        }
        if (tick.phase === "done") {
          if (tick.stepId === "draft" && tick.ctx.projectId) {
            // Remember the draft as soon as it's created so a retry after a
            // later step fails (e.g. no personas selected) reuses it instead
            // of creating a fresh duplicate draft on every click.
            projectIdRef.current = tick.ctx.projectId;
          }
          if (tick.stepId === "session" && tick.ctx.sessionId) {
            setSessionId(tick.ctx.sessionId);
            projectIdRef.current = tick.ctx.projectId;
          }
          if (tick.stepId === "activate") {
            setPhase("assembling");
          }
        }
      }
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("form");
    } finally {
      setBusy(false);
    }
  }

  async function handleIntakeContinue() {
    const q = intakeQuestions[intakeIndex]!;
    const trimmed = intakeAnswer.trim();
    const newAnswers: SyntheticIntakeAnswer[] = trimmed
      ? [...intakeAnswers, { questionId: q.id, answer: trimmed, answeredAt: new Date().toISOString() }]
      : intakeAnswers;

    if (intakeIndex < intakeQuestions.length - 1) {
      setIntakeAnswers(newAnswers);
      const next = intakeIndex + 1;
      setIntakeIndex(next);
      setIntakeAnswer(intakeQuestions[next]?.suggestedAnswer ?? "");
      return;
    }

    setPhase("assembling");
    try {
      if (sessionId) {
        const payload = await saveThinkingGraphIntakeAnswers({ sessionId, answers: newAnswers });
        const pid = projectIdRef.current;
        if (pid) await saveProjectThinkingGraphSession(pid, payload);
      }
    } catch {}
    router.push(buildThinkingGraphLaunchUrl({
      projectId: projectIdRef.current ?? "",
      autoPersonaIds: selectedTeamPersonas().split(",").filter(Boolean),
      autostart: autostartEnabled,
    }));
  }

  function handleIntakeSkip() {
    if (intakeIndex < intakeQuestions.length - 1) {
      const next = intakeIndex + 1;
      setIntakeIndex(next);
      setIntakeAnswer(intakeQuestions[next]?.suggestedAnswer ?? "");
      return;
    }
    setPhase("assembling");
    if (sessionId) {
      saveThinkingGraphIntakeAnswers({ sessionId, answers: intakeAnswers })
        .then((payload) => { const pid = projectIdRef.current; if (pid) return saveProjectThinkingGraphSession(pid, payload); })
        .catch(() => {});
    }
    router.push(buildThinkingGraphLaunchUrl({
      projectId: projectIdRef.current ?? "",
      autoPersonaIds: selectedTeamPersonas().split(",").filter(Boolean),
      autostart: autostartEnabled,
    }));
  }

  async function handleSaveDraft() {
    if (!valid || busy) return;
    setBusy(true);
    setLaunchStep("Saving…");
    try {
      let pid = draftId ?? null;
      if (pid) {
        await fetch(`/api/projects/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: idea.trim(), selectedTeamId: teamId, domainTags: tags }),
        });
      } else {
        const res = await fetch("/api/projects/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: idea.trim(), selectedTeamId: teamId, domainTags: tags }),
        });
        if (res.ok) { const data = (await res.json()) as { projectId: string }; pid = data.projectId; }
      }
      if (pid && name.trim()) await fetch(`/api/projects/${pid}/name`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      if (pid) await Promise.all(pendingFiles.map((f) => uploadProjectFile(pid!, f)));
      reset();
      onClose();
      router.refresh();
    } catch {}
    finally { setBusy(false); setLaunchStep(""); }
  }

  if (!open) return null;

  const progress = intakeQuestions.length > 0 ? ((intakeIndex + 1) / intakeQuestions.length) * 100 : 0;
  const currentQ = intakeQuestions[intakeIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div
        className="bg-[var(--surface-lowest)] border border-[var(--surface-container)] rounded-2xl w-[800px] max-h-[100vh] overflow-y-auto shadow-[0_24px_64px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── FORM PHASE ── */}
        {phase === "form" && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h2 className="text-[16px] font-bold text-[var(--on-surface)] font-sans m-0">New Project</h2>
              <button onClick={handleClose} className="text-[var(--t3)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer flex items-center">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-4 flex gap-5">
              {/* Left: name + idea + attachments */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                <div>
                  <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">
                    Name <span className="normal-case tracking-normal font-normal text-[var(--t3)]">(auto-generated if empty)</span>
                  </label>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. RetroQuest, MedFlow…"
                    className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-[9px] px-3 text-[13px] font-sans outline-none focus:border-[var(--primary-border)]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">
                    Idea / Prompt <span className="text-[var(--primary)] normal-case tracking-normal font-normal">*</span>
                  </label>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
                    placeholder="Describe your idea — problem, solution, target users, unique angle…"
                    rows={6}
                    className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-3 px-3 text-[13px] font-sans resize-none outline-none leading-relaxed focus:border-[var(--primary-border)]"
                  />
                </div>
                {/* Attachments */}
                <div>
                  <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">
                    Attachments <span className="normal-case tracking-normal font-normal">(optional)</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,text/csv,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const picked = Array.from(e.currentTarget.files ?? []);
                      setPendingFiles((prev) => {
                        const existing = new Set(prev.map((f) => f.name));
                        return [...prev, ...picked.filter((f) => !existing.has(f.name))];
                      });
                      e.currentTarget.value = "";
                    }}
                  />
                  {pendingFiles.length > 0 && (
                    <div className="flex flex-wrap gap-[5px] mb-2">
                      {pendingFiles.map((f) => (
                        <span key={f.name} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] py-[3px] px-2 text-[10px] font-mono">
                          <Paperclip size={10} />
                          <span className="max-w-[120px] truncate">{f.name}</span>
                          <button type="button" onClick={() => setPendingFiles((p) => p.filter((x) => x.name !== f.name))} className="bg-transparent border-none cursor-pointer p-0 text-[var(--t3)] flex items-center">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 py-[7px] px-3 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] text-[11px] font-mono cursor-pointer hover:border-[var(--on-surface-variant)]">
                    <Paperclip size={12} /> Attach files
                  </button>
                </div>
              </div>

              {/* Right: tags + team */}
              <div className="w-[200px] shrink-0 flex flex-col gap-4">
                {/* Domain tags */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">Domain Tags</label>
                    <span className={cn("text-[9px] font-mono", tags.length >= 3 ? "text-[#f87171]" : "text-[var(--t3)]")}>{tags.length} / 3</span>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-[5px] mb-2">
                      {tags.map((t) => {
                        const c = tagColor(t);
                        return (
                          <span key={t} className="inline-flex items-center gap-1 rounded-full py-[3px] px-2 border border-solid text-[10px] font-mono"
                            style={{ color: c, borderColor: hexRgba(c, 0.35), background: hexRgba(c, 0.1) }}>
                            {t}
                            <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))} className="bg-transparent border-none cursor-pointer p-0 leading-none flex items-center opacity-70">
                              <X size={9} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {tags.length < 3 && (
                    <div className="relative">
                      <input
                        ref={tagInputRef}
                        value={tagInput}
                        onChange={(e) => { setTagInput(e.target.value); setTagDropOpen(true); }}
                        onFocus={() => setTagDropOpen(true)}
                        onBlur={() => setTimeout(() => setTagDropOpen(false), 150)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                          if (e.key === "Escape") setTagDropOpen(false);
                        }}
                        placeholder="Add tag…"
                        className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-[7px] px-3 text-[11px] font-mono outline-none focus:border-[var(--primary-border)]"
                      />
                      {tagDropOpen && (() => {
                        const q = tagInput.toLowerCase().trim();
                        const suggestions = PRESET_TAGS.filter((t) => !tags.includes(t) && (q === "" || t.toLowerCase().includes(q)));
                        const showCustom = q.length > 0 && !PRESET_TAGS.some((t) => t.toLowerCase() === q) && !tags.includes(tagInput.trim());
                        if (!suggestions.length && !showCustom) return null;
                        return (
                          <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-lowest)] shadow-[0_4px_16px_rgba(0,0,0,0.18)] overflow-hidden max-h-[160px] overflow-y-auto">
                            {suggestions.map((t) => (
                              <button key={t} type="button" onMouseDown={() => addTag(t)} className="w-full text-left py-[7px] px-3 bg-transparent border-none cursor-pointer text-[11px] font-mono text-[var(--on-surface)] hover:bg-[var(--surface-low)]">{t}</button>
                            ))}
                            {showCustom && (
                              <button type="button" onMouseDown={() => addTag(tagInput)} className={cn("w-full text-left py-[7px] px-3 bg-transparent border-none cursor-pointer text-[11px] font-mono text-[var(--t3)] hover:bg-[var(--surface-low)]", suggestions.length > 0 && "border-t border-[var(--surface-container)]")}>
                                Add "{tagInput.trim()}"
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Team */}
                <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                  <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">
                    Team <span className="normal-case tracking-normal font-normal">(optional)</span>
                  </label>
                  <div ref={teamDropRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setTeamDropOpen((o) => !o)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 py-[8px] px-3 rounded-lg border text-left transition-colors cursor-pointer bg-[var(--surface-low)]",
                        teamDropOpen ? "border-[var(--primary-border)]" : "border-[var(--surface-container)]",
                      )}
                    >
                      <span className="text-[12px] font-mono text-[var(--on-surface)] truncate">
                        {teamId === null ? "Auto" : (teams.find((t) => t.id === teamId)?.name ?? "Auto")}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 10 10" className={cn("shrink-0 text-[var(--t3)] transition-transform", teamDropOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5l3 3 3-3"/></svg>
                    </button>
                    {teamDropOpen && (
                      <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-lowest)] shadow-[0_8px_24px_rgba(0,0,0,0.25)] overflow-hidden">
                        <button type="button" onClick={() => { setTeamId(null); setTeamDropOpen(false); }}
                          className={cn("w-full flex items-center gap-2 py-[8px] px-3 text-left cursor-pointer border-none transition-colors",
                            teamId === null ? "bg-[var(--primary-container)] text-[var(--primary)]" : "bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-low)]")}>
                          <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold font-mono shrink-0", teamId === null ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)]")}>A</span>
                          <div>
                            <p className="text-[12px] font-semibold font-mono m-0">Auto</p>
                            <p className="text-[9px] text-[var(--t3)] font-mono m-0">Director picks the team</p>
                          </div>
                        </button>
                        {teamsLoading && <p className="text-[10px] text-[var(--t3)] font-mono py-2 px-3">Loading…</p>}
                        {teams.map((team) => {
                          const sel = teamId === team.id;
                          return (
                            <button key={team.id} type="button" onClick={() => { setTeamId(team.id); setTeamDropOpen(false); }}
                              className={cn("w-full flex items-center gap-2 py-[8px] px-3 text-left cursor-pointer border-none border-t border-[var(--surface-container)] transition-colors",
                                sel ? "bg-[var(--primary-container)] text-[var(--primary)]" : "bg-transparent text-[var(--on-surface)] hover:bg-[var(--surface-low)]")}>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-[12px] font-semibold font-mono m-0 truncate", sel ? "text-[var(--primary)]" : "text-[var(--on-surface)]")}>{team.name}</p>
                                <p className="text-[9px] text-[var(--t3)] font-mono m-0">{team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                <div className="flex-1 overflow-y-auto rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] min-h-[80px] max-h-[180px]">
                    {teamId === null ? (
                      <div className="flex items-center justify-center h-full py-4 text-[10px] text-[var(--t3)] font-mono text-center px-3">
                        Director will auto-select<br />the best team for your idea
                      </div>
                    ) : (() => {
                      const team = teams.find((t) => t.id === teamId);
                      if (!team) return null;
                      return team.members.length === 0 ? (
                        <div className="flex items-center justify-center h-full py-4 text-[10px] text-[var(--t3)] font-mono">No members</div>
                      ) : (
                        <div className="p-2 flex flex-col gap-1">
                          {team.members.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 px-1 py-[5px]">
                              <span style={{ background: avatarColor(m.personaId ?? m.name), width: 22, height: 22, fontSize: 7 }}
                                className="rounded-full text-white flex items-center justify-center font-bold font-mono shrink-0">{avatarLetters(m.name)}</span>
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-[var(--on-surface)] font-mono m-0 truncate">{m.name}</p>
                                <p className="text-[9px] text-[var(--t3)] font-mono m-0 truncate">{m.skillDescription?.slice(0, 40) ?? m.domain.replace(/_/g, " ")}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">
                    Autostart
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] px-3 py-[8px] cursor-pointer">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--on-surface)] font-sans m-0">
                        Start simulation automatically
                      </p>
                      <p className="text-[9px] text-[var(--t3)] font-mono m-0">
                        If off, open the project without autorun
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autostartEnabled}
                      onChange={(e) => setAutostartEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Error */}
            {launchError && (
              <div className="mx-6 mb-3 rounded-lg border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] py-[9px] px-3 text-[11px] text-[#f87171] font-mono">
                {launchError}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--surface-container)] flex items-center justify-end gap-2">
              <button onClick={handleClose} className="px-4 py-[8px] rounded-lg border border-[var(--surface-container)] text-[var(--on-surface-variant)] text-[13px] cursor-pointer hover:bg-[var(--surface-low)] bg-transparent">
                Cancel
              </button>
              <button onClick={() => void handleSaveDraft()} disabled={!valid || busy}
                className={cn("px-4 py-[8px] rounded-lg border border-[var(--surface-container)] bg-transparent text-[var(--on-surface-variant)] text-[13px]",
                  valid && !busy ? "cursor-pointer hover:bg-[var(--surface-low)]" : "opacity-50 cursor-not-allowed")}>
                Save Draft
              </button>
              <button onClick={() => void handleLaunch()} disabled={!valid || busy}
                className={cn("flex items-center gap-1.5 px-4 py-[8px] rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[13px] font-semibold",
                  valid && !busy ? "cursor-pointer" : "opacity-50 cursor-not-allowed")}>
                <Zap size={13} />
                Launch Simulation →
              </button>
            </div>
          </>
        )}

        {/* ── LAUNCHING (step progress before thinking phase) ── */}
        {phase === "form" && busy && (
          /* covered by footer state — launchStep shown in footer */
          null
        )}

        {/* ── INTAKE: THINKING ── */}
        {phase === "thinking" && (
          <div className="px-7 pt-8 pb-7 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <ModalSpinner />
              <div>
                <p className="text-[16px] font-semibold text-[var(--on-surface)] font-sans m-0">Reading the idea{dots}</p>
                <p className="text-[10px] text-[var(--t3)] font-mono m-0 mt-1">Gathering clarifying questions</p>
              </div>
            </div>
            <button type="button" onClick={handleIntakeSkip}
              className="self-start bg-transparent border-none cursor-pointer text-[11px] text-[var(--t3)] font-mono underline underline-offset-[3px]">
              Skip questions →
            </button>
          </div>
        )}

        {/* ── INTAKE: QUESTIONS ── */}
        {phase === "questions" && currentQ && (
          <div className="overflow-hidden">
            <div className="h-[3px] bg-[var(--surface-container)]">
              <div className="h-full bg-[var(--primary)] transition-[width] duration-300 ease-in-out" style={{ width: `${progress}%` }} />
            </div>
            <div className="pt-6 px-7 pb-7 flex flex-col gap-4">
              <p className="text-[9px] text-[var(--t3)] font-mono tracking-[1px] uppercase m-0">
                Question {intakeIndex + 1} of {intakeQuestions.length}
              </p>
              <div>
                <p className="text-[15px] font-semibold text-[var(--on-surface)] font-sans leading-[1.5] m-0 mb-1">{currentQ.question}</p>
                <p className="text-[10px] text-[var(--t3)] font-mono leading-[1.6] m-0">{currentQ.whyItMatters}</p>
              </div>
              <textarea
                autoFocus
                rows={3}
                value={intakeAnswer}
                onChange={(e) => setIntakeAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleIntakeContinue(); }}
                placeholder={currentQ.suggestedAnswer ? `Suggestion: ${currentQ.suggestedAnswer}` : "Enter your answer or skip…"}
                className="w-full rounded-lg border border-[var(--surface-container)] bg-white text-[var(--on-surface)] py-3 px-[14px] text-[13px] font-sans resize-none outline-none leading-[1.6] box-border"
              />
              <div className="flex justify-between items-center">
                <button type="button" onClick={handleIntakeSkip}
                  className="bg-transparent border-none cursor-pointer text-[11px] text-[var(--t3)] font-mono underline underline-offset-[3px]">
                  Skip
                </button>
                <button type="button" onClick={() => void handleIntakeContinue()}
                  className="flex items-center gap-[6px] py-[10px] px-5 rounded-lg border border-[rgba(167,139,250,0.4)] bg-[rgba(167,139,250,0.12)] text-[#a78bfa] text-[12px] font-mono cursor-pointer font-semibold">
                  {intakeIndex < intakeQuestions.length - 1 ? "Next →" : "Done →"}
                </button>
              </div>
              <p className="text-[9px] text-[rgba(0,0,0,0.2)] font-mono text-right m-0">⌘ Enter to proceed</p>
            </div>
          </div>
        )}

        {/* ── INTAKE: ASSEMBLING ── */}
        {phase === "assembling" && (
          <div className="py-10 px-7 flex items-center gap-4">
            <ModalSpinner />
            <div>
              <p className="text-[16px] font-semibold text-[var(--on-surface)] font-sans m-0">Launching simulation{dots}</p>
              <p className="text-[10px] text-[var(--t3)] font-mono m-0 mt-1">Setting up your synthetic team</p>
            </div>
          </div>
        )}

        {/* Step label during pre-thinking launch */}
        {phase === "form" && busy && launchStep && (
          <div className="px-6 py-3 border-t border-[var(--surface-container)] flex items-center gap-2 text-[11px] text-[var(--t3)] font-mono">
            <ModalSpinner />
            {launchStep}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ProjectsPageClient ─────────────────────────────────────────────────────────

export function ProjectsPageClient({ initialProjects, initialTeams }: { initialProjects: PromptProjectSummary[]; initialTeams: TeamPresetSummary[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [search, setSearch] = useState("");

  useEffect(() => { setProjects(initialProjects); }, [initialProjects]);
  const [createOpen, setCreateOpen] = useState(false);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.idea.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="px-7 py-5 border-b border-[var(--surface-container)] flex items-center gap-4 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-bold text-[var(--on-surface)] font-sans m-0">Projects</h1>
          <p className="text-[12px] text-[var(--t3)] font-mono m-0 mt-0.5">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t3)] pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="bg-[var(--surface-low)] border border-[var(--surface-container)] rounded-lg pl-8 pr-3 py-[7px] text-[13px] text-[var(--on-surface)] font-sans outline-none focus:border-[var(--primary-border)] w-[200px]" />
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-[8px] rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[13px] font-semibold font-sans cursor-pointer hover:opacity-90 transition-opacity">
          <Plus size={13} />
          New Project
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-7">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-[var(--t3)] gap-3">
            <div className="text-[40px] opacity-20">◎</div>
            <div className="text-[14px]">{search ? "No matching projects" : "No projects yet"}</div>
            {!search && (
              <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] text-[12px] cursor-pointer">
                <Plus size={12} /> Create your first project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                teamName={resolveProjectTeamBadge(p, initialTeams)}
                onDelete={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))}
                onOpenDraft={(id) => setOpenDraftId(id)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectModal
        open={createOpen || openDraftId !== null}
        draftId={openDraftId}
        onClose={() => { setCreateOpen(false); setOpenDraftId(null); }}
      />
    </div>
  );
}
