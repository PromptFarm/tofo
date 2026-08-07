"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Paperclip, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESET_TAGS, tagColor, hexRgba } from "@/components/project-screen/tagColors";
import { ProposedImprovement } from "@/lib/thinking-graph/server/types";

type ContextMessage = {
  id: string;
  syntheticId: string;
  syntheticName: string;
  role: string;
  text: string;
};

type IdeaTabProps = {
  projectId: string;
  sessionId?: string | null;
  synthetics?: { id: string; name: string }[];
  idea: string;
  onIdeaChange: (v: string) => void;
  tags: string[];
  onTagsChange: (v: string[]) => void;
  isReadOnly?: boolean;
  questionFragments?: { question: string; answer: string }[];
  onRemoveFragment?: (index: number) => void;
  proposedImprovements?: ProposedImprovement[];
  onRemoveImprovement?: (id: string) => void;
};

export function IdeaTab({
  projectId,
  sessionId,
  synthetics = [],
  idea,
  onIdeaChange,
  tags,
  onTagsChange,
  isReadOnly = false,
  questionFragments = [],
  onRemoveFragment,
  proposedImprovements = [],
  onRemoveImprovement,
}: IdeaTabProps) {
  const [tagInput, setTagInput]       = useState("");
  const [tagDropOpen, setTagDropOpen] = useState(false);
  const [files, setFiles]             = useState<string[]>([]);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [contextMessages, setContextMessages] = useState<ContextMessage[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load all chat messages marked includeInNextIteration from DB
  useEffect(() => {
    if (!sessionId || synthetics.length === 0) return;
    let cancelled = false;
    async function load() {
      const results: ContextMessage[] = [];
      await Promise.all(
        synthetics.map(async (s) => {
          try {
            const r = await fetch(`/api/thinking-graph/chat?sessionId=${sessionId}&syntheticId=${s.id}`);
            if (!r.ok) return;
            const data = (await r.json()) as { messages?: { id: string; role: string; text: string; includeInNextIteration: boolean }[] };
            for (const m of data.messages ?? []) {
              if (m.includeInNextIteration) {
                results.push({ id: m.id, syntheticId: s.id, syntheticName: s.name, role: m.role, text: m.text });
              }
            }
          } catch { /* ignore */ }
        }),
      );
      if (!cancelled) setContextMessages(results);
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId, synthetics.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const tagInputRef = useRef<HTMLInputElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const savedTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function addTag(t: string) {
    const v = t.trim();
    if (isReadOnly || !v || tags.includes(v) || tags.length >= 3) return;
    onTagsChange([...tags, v]);
    setTagInput("");
    setTagDropOpen(false);
  }

  async function handleSave() {
    if (saving || isReadOnly) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea,
          domainTags: tags,
        }),
      });
      if (!response.ok) {
        return;
      }

      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.currentTarget.files ?? []).map((f) => f.name);
    setFiles((prev) => [...new Set([...prev, ...picked])]);
    e.currentTarget.value = "";
  }

  return (
    <div className="flex-1 overflow-auto px-8 py-7">
      <div className="max-w-[640px] flex flex-col gap-5">

        {/* ── Question fragments ────────────────────────────────────── */}
        {questionFragments.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">From questions</span>
              <span className="text-[9px] text-[var(--t3)] font-mono">· included in the next run context</span>
            </div>
            {questionFragments.map((f, i) => (
              <div key={i} className="rounded-[9px] border border-[var(--border-solid)] bg-[var(--surface-low)] px-[14px] py-[11px] flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[var(--t3)] mb-[4px] leading-[1.4]">{f.question}</p>
                  <p className="text-[12px] text-[var(--on-surface)] leading-[1.6]">{f.answer}</p>
                </div>
                {onRemoveFragment && (
                  <button
                    type="button"
                    onClick={() => onRemoveFragment(i)}
                    className="shrink-0 text-[var(--t3)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer p-0 mt-[1px] flex items-center"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Chat context (marked messages) ───────────────────────── */}
        {contextMessages.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">Chat context</span>
              <span className="text-[9px] text-[var(--t3)] font-mono">· {contextMessages.length} message{contextMessages.length !== 1 ? "s" : ""} included in next run</span>
            </div>
            {contextMessages.map((m) => (
              <div key={m.id} className="rounded-[9px] border border-[var(--border-solid)] bg-[var(--surface-low)] px-[14px] py-[11px] flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[var(--t3)] mb-[4px] leading-[1.4] font-mono">{m.syntheticName} · {m.role === "synthetic" ? "agent" : "you"}</p>
                  <p className="text-[12px] text-[var(--on-surface)] leading-[1.6] whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Proposed Improvements ──────────────────────────────────── */}
        {proposedImprovements.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">Proposed Improvements</span>
              <span className="text-[9px] text-[var(--t3)] font-mono">· included in the next run context</span>
            </div>
            {proposedImprovements.map((p) => {
              const delta = p.priorRisk - p.expectedTargetRisk;
              const preview = p.proposal.length > 60 ? p.proposal.substring(0, 60) + "…" : p.proposal;
              return (
                <div key={p.id} className="rounded-[9px] border border-[var(--border-solid)] bg-[var(--surface-low)] px-[14px] py-[11px] flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[var(--t3)] mb-[4px] leading-[1.4] font-mono">
                      {p.syntheticName} · <span className="text-[var(--color-success-text)]">−{delta} pts</span>
                    </p>
                    <p className="text-[12px] text-[var(--on-surface)] leading-[1.6]">{preview}</p>
                  </div>
                  {onRemoveImprovement && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(p.id)}
                      className="shrink-0 text-[var(--t3)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer p-0 mt-[1px] flex items-center"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Idea description ──────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">
            Idea Description
          </label>
          <textarea
            value={idea}
            onChange={(e) => onIdeaChange(e.target.value)}
            readOnly={isReadOnly}
            rows={9}
            placeholder="Describe your idea — problem, solution, target users, unique angle…"
            className={cn(
              "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-low)] text-[var(--on-surface)] py-3 px-3 text-[13px] font-sans resize-none outline-none leading-relaxed transition-colors",
              isReadOnly
                ? "opacity-85 cursor-default"
                : "focus:border-[var(--primary-border)]",
            )}
          />
          <p className="text-[11px] text-[var(--t3)]">
            {isReadOnly
              ? "Historical iteration: idea and tags are view-only."
              : "All synthetics will analyze this description during simulation."}
          </p>
        </div>

        {/* ── Tags ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">
              Tags
            </label>
            <span className={cn("text-[9px] font-mono", tags.length >= 3 ? "text-[var(--danger-text)]" : "text-[var(--t3)]")}>
              {tags.length} / 3
            </span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-[6px]">
              {tags.map((t) => {
                const c = tagColor(t);
                return (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full py-[3px] px-2 border border-solid text-[10px] font-mono"
                    style={{ color: c, borderColor: hexRgba(c, 0.35), background: hexRgba(c, 0.1) }}
                  >
                    {t}
                    {!isReadOnly ? (
                      <button
                        type="button"
                        onClick={() => onTagsChange(tags.filter((x) => x !== t))}
                        className="bg-transparent border-none cursor-pointer p-0 leading-none flex items-center opacity-70"
                      >
                        <X size={9} />
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}

          {!isReadOnly && tags.length < 3 && (
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
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-low)] text-[var(--on-surface)] py-[7px] px-3 text-[11px] font-mono outline-none focus:border-[var(--primary-border)] transition-colors"
              />
              {tagDropOpen && (() => {
                const q = tagInput.toLowerCase().trim();
                const suggestions = PRESET_TAGS.filter((t) => !tags.includes(t) && (q === "" || t.toLowerCase().includes(q)));
                const showCustom = q.length > 0 && !PRESET_TAGS.some((t) => t.toLowerCase() === q) && !tags.includes(tagInput.trim());
                if (!suggestions.length && !showCustom) return null;
                return (
                  <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_4px_16px_rgba(0,0,0,0.18)] overflow-hidden max-h-[160px] overflow-y-auto">
                    {suggestions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onMouseDown={() => addTag(t)}
                        className="w-full text-left py-[7px] px-3 bg-transparent border-none cursor-pointer text-[11px] font-mono text-[var(--on-surface)] hover:bg-[var(--surface-low)]"
                      >
                        {t}
                      </button>
                    ))}
                    {showCustom && (
                      <button
                        type="button"
                        onMouseDown={() => addTag(tagInput)}
                        className={cn(
                          "w-full text-left py-[7px] px-3 bg-transparent border-none cursor-pointer text-[11px] font-mono text-[var(--t3)] hover:bg-[var(--surface-low)]",
                          suggestions.length > 0 && "border-t border-[var(--border)]",
                        )}
                      >
                        Add &quot;{tagInput.trim()}&quot;
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Attachments (cosmetic) ─────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono">
            Attachments <span className="normal-case tracking-normal font-normal">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => {
              if (!isReadOnly) fileRef.current?.click();
            }}
            disabled={isReadOnly}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-transparent px-[14px] py-[10px] text-[12px] text-[var(--t3)] cursor-pointer hover:border-[var(--primary-border)] hover:text-[var(--on-surface-variant)] transition-colors"
          >
            <Upload size={14} />
            Attach files — PDF, DOCX, images
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileChange} />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-[5px]">
              {files.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-[5px] px-[8px] py-[3px] rounded-full border border-[var(--border)] bg-[var(--surface-low)] text-[11px] text-[var(--on-surface-variant)] font-mono"
                >
                  <Paperclip size={10} />
                  <span className="max-w-[160px] truncate">{f}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                    disabled={isReadOnly}
                    className="bg-transparent border-none cursor-pointer text-[var(--t3)] hover:text-[var(--on-surface)] p-0 flex items-center"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || isReadOnly}
            className={cn(
              "flex items-center gap-1.5 px-4 py-[8px] rounded-lg border text-[13px] font-semibold font-sans cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed",
              saved
                ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                : "border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] hover:opacity-90",
            )}
          >
            {saved && <Check size={13} />}
            {isReadOnly ? "Historical iteration" : saved ? "Saved" : saving ? "Saving…" : "Save Changes"}
          </button>
        </div>

      </div>

      {/* ── Delete confirmation dialog ────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--surface-high)] rounded-[12px] border border-[var(--surface-container)] p-6 max-w-[400px] w-[90%] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[var(--on-surface)] font-bold text-[16px] mb-2">Delete proposed improvement?</h3>
            <p className="text-[var(--on-surface-variant)] text-[13px] mb-6 leading-relaxed">This will remove the proposal from the idea context. The risk will not be reconsidered unless you manually add another proposal.</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] text-[12px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onRemoveImprovement) {
                    onRemoveImprovement(deleteConfirmId);
                  }
                  setDeleteConfirmId(null);
                }}
                className="px-4 py-2 rounded-lg border-none bg-[var(--color-error-bg)] text-[var(--color-error-text)] text-[12px] font-bold cursor-pointer hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
