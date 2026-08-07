"use client";

import { useState, useEffect } from "react";
import { X, Search, Plus, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamPresetMemberSummary } from "@/lib/db-client";
import { avatarColor, avatarLetters } from "@/app/projects/new/utils";

type LibraryPersona = {
  id: string;
  title: string;
  description: string;
  domain: string;
};

const DOMAIN_LABELS: Record<string, string> = {
  gamedev: "Game Dev",
  business_startup: "Startup",
  health_fitness: "Health",
  education: "Education",
};

const DOMAIN_COLORS: Record<string, string> = {
  gamedev: "#34d399",
  business_startup: "#a78bfa",
  health_fitness: "#60a5fa",
  education: "#fb923c",
};

const DOMAIN_OPTIONS = Object.entries(DOMAIN_LABELS).map(([id, label]) => ({ id, label }));

type Tab = "library" | "custom";

type Props = {
  teamMembers: TeamPresetMemberSummary[];
  initialTab?: Tab;
  onAdd: (data: { personaId: string | null; name: string; domain: string; skillDescription: string }) => Promise<void>;
  onClose: () => void;
};

export function AddMemberModal({ teamMembers, initialTab = "library", onAdd, onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--surface-lowest)] border border-[var(--surface-container)] rounded-2xl w-[560px] max-h-[80vh] shadow-[0_24px_64px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <h2 className="text-[15px] font-bold text-[var(--on-surface)] font-sans m-0">Add Member</h2>
          <button onClick={onClose} className="text-[var(--t3)] bg-transparent border-none cursor-pointer flex items-center hover:text-[var(--on-surface)]">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 shrink-0 border-b border-[var(--surface-container)]">
          <button
            onClick={() => setTab("library")}
            className={cn(
              "px-3 py-[6px] rounded-lg text-[12px] font-mono border transition-colors cursor-pointer",
              tab === "library"
                ? "border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)]"
                : "border-transparent text-[var(--t3)] hover:text-[var(--on-surface-variant)]",
            )}
          >
            From Library
          </button>
          <button
            onClick={() => setTab("custom")}
            className={cn(
              "px-3 py-[6px] rounded-lg text-[12px] font-mono border transition-colors cursor-pointer",
              tab === "custom"
                ? "border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)]"
                : "border-transparent text-[var(--t3)] hover:text-[var(--on-surface-variant)]",
            )}
          >
            Create Custom
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {tab === "library" ? (
            <LibraryTab teamMembers={teamMembers} onAdd={onAdd} onClose={onClose} />
          ) : (
            <CustomTab onAdd={onAdd} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Library tab ───────────────────────────────────────────────────────────────

function LibraryTab({
  teamMembers,
  onAdd,
  onClose,
}: {
  teamMembers: TeamPresetMemberSummary[];
  onAdd: Props["onAdd"];
  onClose: () => void;
}) {
  const [personas, setPersonas] = useState<LibraryPersona[]>([]);
  const [search, setSearch] = useState("");
  const [activeDomain, setActiveDomain] = useState("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json() as Promise<{ personas?: LibraryPersona[] }>)
      .then((d) => setPersonas(d.personas ?? []))
      .catch(() => {});
  }, []);

  const addedIds = new Set(teamMembers.map((m) => m.personaId).filter(Boolean));

  const filtered = personas.filter((p) => {
    if (activeDomain !== "all" && p.domain !== activeDomain) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return true;
  });

  const domains = Object.keys(DOMAIN_LABELS);
  const grouped = domains.reduce<Record<string, LibraryPersona[]>>((acc, d) => {
    acc[d] = filtered.filter((p) => p.domain === d);
    return acc;
  }, {});

  async function handleAdd(p: LibraryPersona) {
    if (addedIds.has(p.id)) return;
    await onAdd({ personaId: p.id, name: p.title, domain: p.domain, skillDescription: p.description });
  }

  return (
    <>
      <div className="px-4 pt-3 pb-2 flex flex-col gap-2 shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--t3)] pointer-events-none" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search personas…"
            className="w-full bg-[var(--surface-low)] border border-[var(--surface-container)] rounded-lg pl-7 pr-3 py-[6px] text-[12px] text-[var(--on-surface)] font-sans outline-none focus:border-[var(--primary-border)]"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", ...domains].map((d) => (
            <button
              key={d}
              onClick={() => setActiveDomain(d)}
              className={cn(
                "px-2 py-[3px] rounded-full text-[10px] font-mono border cursor-pointer transition-colors",
                activeDomain === d
                  ? "border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)]"
                  : "border-[var(--surface-container)] bg-transparent text-[var(--t3)] hover:border-[var(--on-surface-variant)]",
              )}
            >
              {d === "all" ? "All" : DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        {activeDomain === "all" ? (
          domains.map((domain) => {
            const items = grouped[domain] ?? [];
            if (items.length === 0) return null;
            const isCollapsed = collapsed[domain];
            return (
              <div key={domain} className="mb-3">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [domain]: !isCollapsed }))}
                  className="w-full flex items-center justify-between py-1 bg-transparent border-none cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: DOMAIN_COLORS[domain] ?? "#888" }} />
                    <span className="text-[10px] font-bold tracking-[0.06em] uppercase font-mono" style={{ color: DOMAIN_COLORS[domain] ?? "var(--t3)" }}>
                      {DOMAIN_LABELS[domain] ?? domain}
                    </span>
                    <span className="text-[10px] text-[var(--t3)] font-mono">{items.length}</span>
                  </div>
                  {isCollapsed ? <ChevronDown size={11} className="text-[var(--t3)]" /> : <ChevronUp size={11} className="text-[var(--t3)]" />}
                </button>
                {!isCollapsed && (
                  <div className="flex flex-col gap-1 mt-1">
                    {items.map((p) => (
                      <PersonaRow key={p.id} persona={p} added={addedIds.has(p.id)} onAdd={() => void handleAdd(p)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : filtered.length === 0 ? (
          <div className="text-center text-[var(--t3)] text-[12px] py-8">No results</div>
        ) : (
          <div className="flex flex-col gap-1 mt-1">
            {filtered.map((p) => (
              <PersonaRow key={p.id} persona={p} added={addedIds.has(p.id)} onAdd={() => void handleAdd(p)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PersonaRow({ persona, added, onAdd }: { persona: LibraryPersona; added: boolean; onAdd: () => void }) {
  const [hov, setHov] = useState(false);
  const color = avatarColor(persona.id);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => !added && onAdd()}
      className={cn(
        "flex items-center gap-2.5 px-2 py-[7px] rounded-lg transition-colors",
        added ? "opacity-50 cursor-default" : "cursor-pointer hover:bg-[var(--surface-low)]",
      )}
    >
      <span
        style={{ background: color, width: 30, height: 30, fontSize: 9 }}
        className="rounded-full text-white flex items-center justify-center font-bold font-mono shrink-0"
      >
        {avatarLetters(persona.title)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[var(--on-surface)] truncate">{persona.title}</div>
        <div className="text-[10px] text-[var(--t3)] truncate">{persona.description.slice(0, 72)}…</div>
      </div>
      <div className="shrink-0 w-5 flex items-center justify-center">
        {added ? (
          <Check size={12} className="text-[var(--t3)]" />
        ) : hov ? (
          <Plus size={13} className="text-[var(--primary)]" />
        ) : null}
      </div>
    </div>
  );
}

// ── Custom tab ────────────────────────────────────────────────────────────────

function CustomTab({ onAdd, onClose }: { onAdd: Props["onAdd"]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("business_startup");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = name.trim().length > 0 && description.trim().length > 10;

  async function handleSave() {
    if (!valid || saving) return;
    setSaving(true);
    await onAdd({ personaId: null, name: name.trim(), domain, skillDescription: description.trim() });
    setSaving(false);
    onClose();
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
      <div>
        <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">Name / Role</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) void handleSave(); }}
          placeholder="e.g. Lead Designer"
          className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-[9px] px-3 text-[13px] font-sans outline-none focus:border-[var(--primary-border)]"
        />
      </div>
      <div>
        <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">Domain</label>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-[9px] px-3 text-[13px] font-sans outline-none focus:border-[var(--primary-border)] cursor-pointer"
        >
          {DOMAIN_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[9px] font-bold tracking-[1px] uppercase text-[var(--t3)] font-mono mb-1.5">Role & Expertise</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe this persona's role, expertise, and how they should review ideas…"
          rows={4}
          className="w-full rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] text-[var(--on-surface)] py-2 px-3 text-[13px] font-sans resize-none outline-none leading-relaxed focus:border-[var(--primary-border)]"
        />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onClose}
          className="px-4 py-[8px] rounded-lg border border-[var(--surface-container)] text-[var(--on-surface-variant)] text-[13px] cursor-pointer hover:bg-[var(--surface-low)] bg-transparent"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!valid || saving}
          className={cn(
            "flex items-center gap-1.5 px-4 py-[8px] rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] text-[var(--primary)] text-[13px] font-semibold",
            valid && !saving ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
          )}
        >
          <Plus size={13} />
          {saving ? "Adding…" : "Add to Team"}
        </button>
      </div>
    </div>
  );
}
