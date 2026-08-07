"use client";

import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamPresetSummary } from "@/lib/db-client";
import { avatarColor, avatarLetters } from "@/app/projects/new/utils";
import { TeamDetail } from "./TeamDetail";

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({
  team,
  active,
  onSelect,
  onDelete,
}: {
  team: TeamPresetSummary;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-3 py-[10px] rounded-xl border cursor-pointer transition-all duration-[120ms] group",
        active
          ? "border-[var(--primary-border)] bg-[var(--primary-container)]"
          : "border-[var(--surface-container)] bg-[var(--surface-lowest)] hover:border-[var(--surface-container)] hover:bg-[var(--surface-low)]",
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          active ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)]",
        )}
      >
        <Users size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("text-[13px] font-semibold truncate font-sans", active ? "text-[var(--primary)]" : "text-[var(--on-surface)]")}>
          {team.name}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {team.members.slice(0, 4).map((m, i) => (
            <span
              key={m.id}
              title={m.name}
              style={{ background: avatarColor(m.personaId ?? m.name), width: 16, height: 16, fontSize: 6, marginLeft: i > 0 ? -4 : 0 }}
              className="rounded-full text-white flex items-center justify-center font-bold font-mono border border-[var(--surface-lowest)]"
            >
              {avatarLetters(m.name)}
            </span>
          ))}
          <span className="text-[10px] text-[var(--t3)] font-mono ml-1">{team.members.length}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className={cn(
          "flex items-center p-1.5 rounded-lg border border-transparent text-[#f87171] transition-opacity",
          hov ? "opacity-100" : "opacity-0",
          "hover:border-[rgba(248,113,113,0.3)] hover:bg-[rgba(248,113,113,0.07)] bg-transparent cursor-pointer",
        )}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Create Team modal ─────────────────────────────────────────────────────────

function CreateTeamModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    await onCreate(name.trim());
    setName("");
    setBusy(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--surface-lowest)] border border-[var(--surface-container)] rounded-2xl w-[400px] shadow-[0_24px_64px_rgba(0,0,0,0.4)] p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-bold text-[var(--on-surface)] font-sans m-0">New Team</h2>
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-2">Team Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); if (e.key === "Escape") onClose(); }}
            placeholder="e.g. Startup Core, GameDev Studio…"
            className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-[9px] px-3 text-[13px] font-sans outline-none focus:border-[var(--primary-border)]"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-[8px] rounded-lg border border-[var(--surface-container)] text-[var(--on-surface-variant)] text-[13px] cursor-pointer hover:bg-[var(--surface-low)] bg-transparent">
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || busy}
            className={cn(
              "flex items-center gap-1.5 px-4 py-[8px] rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[13px] font-semibold",
              name.trim() && !busy ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
            )}
          >
            <Plus size={13} />
            {busy ? "Creating…" : "Create Team"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TeamsPageClient ───────────────────────────────────────────────────────────

export function TeamsPageClient({ initialTeams }: { initialTeams: TeamPresetSummary[] }) {
  const [teams, setTeams] = useState<TeamPresetSummary[]>(initialTeams);
  const [selectedId, setSelectedId] = useState<string | null>(initialTeams[0]?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = teams.find((t) => t.id === selectedId) ?? null;

  async function handleCreate(name: string) {
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const json = (await res.json()) as { team: TeamPresetSummary };
      setTeams((prev) => [...prev, json.team]);
      setSelectedId(json.team.id);
      setCreateOpen(false);
    }
  }

  async function handleDelete(teamId: string) {
    await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
    if (selectedId === teamId) setSelectedId(teams.find((t) => t.id !== teamId)?.id ?? null);
  }

  function handleUpdate(updated: TeamPresetSummary) {
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <div className="flex-1 flex overflow-hidden min-w-0">
      {/* ── Left: team list ── */}
      <div className="w-[240px] shrink-0 border-r border-[var(--surface-container)] flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-[var(--surface-container)] flex items-center justify-between shrink-0">
          <h1 className="text-[14px] font-bold text-[var(--on-surface)] font-sans m-0">Teams</h1>
          <span className="text-[11px] text-[var(--t3)] font-mono">{teams.length}</span>
        </div>
        <div className="p-3 border-b border-[var(--surface-container)] shrink-0">
          <button
            onClick={() => setCreateOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-[8px] rounded-lg border border-dashed border-[var(--surface-container)] text-[var(--t3)] text-[12px] font-mono cursor-pointer hover:border-[var(--primary-border)] hover:text-[var(--primary)] transition-colors bg-transparent"
          >
            <Plus size={12} />
            New Team
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
          {teams.length === 0 && (
            <div className="text-center text-[var(--t3)] text-[12px] py-8 font-mono">No teams yet</div>
          )}
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              active={selectedId === team.id}
              onSelect={() => setSelectedId(team.id)}
              onDelete={() => void handleDelete(team.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Right: team detail ── */}
      {selected ? (
        <TeamDetail
          key={selected.id}
          team={selected}
          onBack={() => setSelectedId(null)}
          onUpdate={handleUpdate}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--t3)] gap-3">
          <Users size={40} className="opacity-20" />
          <div className="text-[14px]">Select a team to manage it</div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] text-[12px] cursor-pointer"
          >
            <Plus size={12} />
            Create a team
          </button>
        </div>
      )}

      <CreateTeamModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
    </div>
  );
}
