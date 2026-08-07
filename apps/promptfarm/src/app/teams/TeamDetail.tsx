"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamPresetSummary, TeamPresetMemberSummary } from "@/lib/db-client";
import { AddMemberModal } from "./AddMemberModal";
import { avatarColor, avatarLetters } from "@/app/projects/new/utils";

const DOMAIN_LABELS: Record<string, string> = {
  gamedev: "Game Dev",
  business_startup: "Startup",
  health_fitness: "Health",
  education: "Education",
};

const DOMAIN_OPTIONS = Object.entries(DOMAIN_LABELS).map(([id, label]) => ({ id, label }));

// ── Inline member edit form ───────────────────────────────────────────────────

type EditFormProps = {
  member: TeamPresetMemberSummary;
  onSave: (data: { name: string; domain: string; skillDescription: string }) => Promise<void>;
  onCancel: () => void;
};

function MemberEditForm({ member, onSave, onCancel }: EditFormProps) {
  const [name, setName] = useState(member.name);
  const [domain, setDomain] = useState(member.domain);
  const [skillDescription, setSkillDescription] = useState(member.skillDescription);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), domain, skillDescription });
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 bg-[var(--surface-low)] rounded-xl border border-[var(--primary-border)]">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-lowest)] text-[var(--on-surface)] py-[7px] px-3 text-[12px] font-sans outline-none focus:border-[var(--primary-border)]"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-lowest)] text-[var(--on-surface)] py-[7px] px-3 text-[12px] font-sans outline-none focus:border-[var(--primary-border)] cursor-pointer"
          >
            {DOMAIN_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1">Role & Expertise</label>
        <textarea
          value={skillDescription}
          onChange={(e) => setSkillDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-lowest)] text-[var(--on-surface)] py-2 px-3 text-[12px] font-sans resize-none outline-none leading-relaxed focus:border-[var(--primary-border)]"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-[6px] rounded-lg border border-[var(--surface-container)] text-[var(--on-surface-variant)] text-[12px] cursor-pointer hover:bg-[var(--surface-container)] bg-transparent">
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !name.trim()}
          className={cn(
            "flex items-center gap-1.5 px-3 py-[6px] rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[12px] font-semibold",
            saving || !name.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <Check size={12} />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── SyntheticRow ──────────────────────────────────────────────────────────────

type RowProps = {
  member: TeamPresetMemberSummary;
  onEdit: () => void;
  onDelete: () => void;
};

function SyntheticRow({ member, onEdit, onDelete }: RowProps) {
  const [hov, setHov] = useState(false);
  const color = avatarColor(member.personaId ?? member.name);
  const isCustom = !member.personaId;
  const domainLabel = DOMAIN_LABELS[member.domain] ?? member.domain.replace(/_/g, " ");

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={cn(
        "flex items-center gap-3 px-4 py-[10px] rounded-xl border transition-all duration-[120ms]",
        hov ? "border-[var(--surface-container)] bg-[var(--surface-low)]" : "border-[var(--surface-container)] bg-[var(--surface-lowest)]",
      )}
    >
      <span
        style={{ background: color, width: 34, height: 34, fontSize: 11 }}
        className="rounded-full text-white flex items-center justify-center font-bold font-mono shrink-0"
      >
        {avatarLetters(member.name)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-[var(--on-surface)] font-sans">{member.name}</span>
          <span
            className="text-[9px] font-mono px-1.5 py-px rounded border"
            style={{ color: isCustom ? "var(--primary)" : "var(--t3)", borderColor: isCustom ? "var(--primary-border)" : "var(--surface-container)", background: isCustom ? "var(--primary-container)" : "transparent" }}
          >
            {isCustom ? "Custom" : domainLabel}
          </span>
        </div>
        <div className="text-[11px] text-[var(--t3)] truncate max-w-[400px]">
          {member.skillDescription ? member.skillDescription.slice(0, 100) : domainLabel}
        </div>
      </div>
      <div className={cn("flex gap-1.5 transition-opacity duration-[120ms]", hov ? "opacity-100" : "opacity-0")}>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2 py-[5px] rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] text-[11px] cursor-pointer hover:border-[var(--on-surface-variant)]"
        >
          <Pencil size={11} /> Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center p-[5px] rounded-lg border border-[var(--surface-container)] bg-transparent text-[#f87171] cursor-pointer hover:border-[rgba(248,113,113,0.4)] hover:bg-[rgba(248,113,113,0.08)]"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── TeamDetail ────────────────────────────────────────────────────────────────

type Props = {
  team: TeamPresetSummary;
  onBack: () => void;
  onUpdate: (team: TeamPresetSummary) => void;
};

export function TeamDetail({ team, onBack, onUpdate }: Props) {
  const [members, setMembers] = useState<TeamPresetMemberSummary[]>(team.members);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ open: boolean; tab: "library" | "custom" }>({ open: false, tab: "library" });
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState(team.name);
  const [editingName, setEditingName] = useState(false);

  function syncUpdate(next: TeamPresetMemberSummary[]) {
    setMembers(next);
    onUpdate({ ...team, name: teamName, members: next });
  }

  function openAddModal(tab: "library" | "custom" = "library") {
    setAddModal({ open: true, tab });
  }

  async function handleAddMember(data: { personaId: string | null; name: string; domain: string; skillDescription: string }) {
    if (data.personaId && members.some((m) => m.personaId === data.personaId)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/teams/${team.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = (await res.json()) as { member: TeamPresetMemberSummary };
        syncUpdate([...members, json.member]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(memberId: string) {
    setBusy(true);
    try {
      await fetch(`/api/teams/${team.id}/members?memberId=${memberId}`, { method: "DELETE" });
      syncUpdate(members.filter((m) => m.id !== memberId));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(
    memberId: string,
    data: { name: string; domain: string; skillDescription: string },
  ) {
    await fetch(`/api/teams/${team.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, ...data }),
    });
    syncUpdate(members.map((m) => (m.id === memberId ? { ...m, ...data } : m)));
    setEditingId(null);
  }

  async function handleRenameTeam() {
    if (!teamName.trim() || teamName.trim() === team.name) { setEditingName(false); return; }
    await fetch(`/api/teams/${team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName.trim() }),
    });
    onUpdate({ ...team, name: teamName.trim(), members });
    setEditingName(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--surface-container)] flex items-center gap-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[var(--t3)] text-[12px] font-mono bg-transparent border-none cursor-pointer hover:text-[var(--on-surface)] p-0 mr-1"
        >
          <ArrowLeft size={14} />
          Teams
        </button>
        <div className="w-px h-4 bg-[var(--surface-container)]" />
        {editingName ? (
          <input
            autoFocus
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onBlur={() => void handleRenameTeam()}
            onKeyDown={(e) => { if (e.key === "Enter") void handleRenameTeam(); if (e.key === "Escape") { setTeamName(team.name); setEditingName(false); } }}
            className="text-[18px] font-bold text-[var(--on-surface)] font-sans bg-transparent border-b border-[var(--primary-border)] outline-none min-w-[120px]"
          />
        ) : (
          <h2
            className="text-[18px] font-bold text-[var(--on-surface)] font-sans cursor-pointer hover:text-[var(--primary)] transition-colors"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {teamName}
          </h2>
        )}
        <span className="text-[12px] text-[var(--t3)] font-mono ml-1">{members.length} member{members.length !== 1 ? "s" : ""}</span>

        <button
          onClick={() => openAddModal("library")}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 px-3 py-[8px] rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] text-[12px] font-mono hover:border-[var(--primary-border)] hover:text-[var(--primary)] transition-colors cursor-pointer disabled:opacity-50"
        >
          <Plus size={13} />
          Add Member
        </button>
      </div>

      {/* Members list */}
      <div className="flex-1 overflow-y-auto p-6">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[240px] text-[var(--t3)] gap-3">
            <div className="text-[36px] opacity-20">◎</div>
            <div className="text-[13px]">No members yet</div>
            <button
              onClick={() => openAddModal("library")}
              className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface-variant)] text-[12px] cursor-pointer"
            >
              <Plus size={12} />
              Add Member
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-[700px]">
            {members.map((m) => (
              <div key={m.id}>
                {editingId === m.id ? (
                  <MemberEditForm
                    member={m}
                    onSave={(data) => handleSaveEdit(m.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SyntheticRow
                    member={m}
                    onEdit={() => setEditingId(m.id)}
                    onDelete={() => void handleDelete(m.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {addModal.open && (
        <AddMemberModal
          teamMembers={members}
          initialTab={addModal.tab}
          onAdd={handleAddMember}
          onClose={() => setAddModal({ open: false, tab: "library" })}
        />
      )}
    </div>
  );
}
