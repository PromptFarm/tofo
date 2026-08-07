"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import type {
  IterationNode,
  SyntheticMock,
  SyntheticSettings,
} from "@/lib/planning/types";

interface NodeDetailPanelProps {
  selectedRevision: IterationNode | null;
  activeSynthetics: SyntheticMock[];
  availableSynthetics: SyntheticMock[];
  onToggleSynthetic: (syntheticId: string, nextEnabled: boolean) => void;
  onSaveSyntheticSettings: (
    syntheticId: string,
    nextSettings: SyntheticSettings
  ) => void;
}

type DetailTab = "overview" | "synthetics";

export function NodeDetailPanel({
  selectedRevision,
  activeSynthetics,
  availableSynthetics,
  onToggleSynthetic,
  onSaveSyntheticSettings,
}: NodeDetailPanelProps) {
  const animationMs = 180;
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [settingsSyntheticId, setSettingsSyntheticId] = useState<string | null>(
    null
  );
  const [isSettingsSheetMounted, setIsSettingsSheetMounted] = useState(false);
  const [isSettingsSheetVisible, setIsSettingsSheetVisible] = useState(false);
  const [sheetSynthetic, setSheetSynthetic] = useState<SyntheticMock | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SyntheticSettings>({
    temperature: 0,
    strictness: 0,
    engagementPercent: 0,
  });

  useEffect(() => {
    setSettingsSyntheticId(null);
  }, [selectedRevision?.id]);

  const settingsSynthetic = useMemo(
    () =>
      settingsSyntheticId
        ? [...activeSynthetics, ...availableSynthetics].find(
            (synthetic) => synthetic.id === settingsSyntheticId
          ) ?? null
        : null,
    [activeSynthetics, availableSynthetics, settingsSyntheticId]
  );

  useEffect(() => {
    if (settingsSynthetic) {
      setSheetSynthetic(settingsSynthetic);
      setSettingsDraft({ ...settingsSynthetic.settings });
    }
  }, [settingsSynthetic]);

  useEffect(() => {
    if (settingsSyntheticId) {
      setIsSettingsSheetMounted(true);
      const frame = window.requestAnimationFrame(() => {
        setIsSettingsSheetVisible(true);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    if (isSettingsSheetMounted) {
      setIsSettingsSheetVisible(false);
      const timer = window.setTimeout(() => {
        setIsSettingsSheetMounted(false);
        setSheetSynthetic(null);
      }, animationMs);

      return () => window.clearTimeout(timer);
    }
  }, [settingsSyntheticId, isSettingsSheetMounted]);

  const closeSettingsSheet = () => {
    setSettingsSyntheticId(null);
  };

  if (!selectedRevision) {
    return (
      <aside className="w-[40rem] shrink-0 bg-surface h-[calc(100svh-3.5rem)] sticky top-0 px-6 py-6 border-l border-surface-container">
        <p className="text-sm text-on-surface-variant">
          Select a revision node to inspect graph details.
        </p>
      </aside>
    );
  }

  const graph = selectedRevision.graph;

  return (
    <aside className="w-[40rem] shrink-0 bg-surface h-[calc(100svh-3.5rem)] sticky top-0 border-l border-surface-container relative overflow-hidden">
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="flex items-center gap-1.5 mb-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        <span className="text-[10px] uppercase tracking-widest text-primary font-medium">
          Selected Revision
        </span>
        </div>

        <h1 className="font-display text-2xl font-bold text-on-surface leading-tight">
          {selectedRevision.version}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">{selectedRevision.summary}</p>

        <div className="flex gap-5 mt-5 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`text-sm font-medium pb-1.5 transition-all duration-200 ease-out ${
              activeTab === "overview"
                ? "text-primary border-b-2 border-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("synthetics")}
            className={`text-sm font-medium pb-1.5 transition-all duration-200 ease-out ${
              activeTab === "synthetics"
                ? "text-primary border-b-2 border-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Synthetics
          </button>
        </div>

        {activeTab === "overview" ? (
          <div className="space-y-6 pb-6">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
              Core Problem
            </span>
            <div className="bg-surface-lowest rounded-xl p-4 mt-2">
              <p className="text-sm text-on-surface leading-relaxed">
                {graph.coreProblem}
              </p>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
              Solution
            </span>
            <div className="bg-surface-low rounded-xl p-4 mt-2 border-l-2 border-primary">
              <p className="text-sm text-on-surface leading-relaxed">
                {graph.solution}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
                Roadmap
              </span>
              <span className="text-xs font-medium text-primary">
                {graph.roadmap.length} TOTAL
              </span>
            </div>
            <div className="space-y-3">
              {graph.roadmap.map((item, index) => (
                <div
                  key={`${selectedRevision.id}-roadmap-${index}`}
                  className="flex items-center gap-3 bg-surface-lowest rounded-xl px-4 py-3"
                >
                  <div className="w-7 h-7 shrink-0 rounded-full bg-primary-fixed-dim text-primary flex items-center justify-center text-xs font-semibold">
                    {index + 1}
                  </div>
                  <span className="text-sm text-on-surface">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
                Risks
              </span>
              <span className="text-xs font-medium text-red-500">
                {graph.risks.length} TOTAL
              </span>
            </div>
            <div className="space-y-2">
              {graph.risks.map((risk, index) => (
                <div
                  key={`${selectedRevision.id}-risk-${index}`}
                  className="rounded-xl bg-surface-lowest px-4 py-3"
                >
                  <p className="text-sm text-on-surface">{risk}</p>
                </div>
              ))}
            </div>
          </div>
          </div>
        ) : (
          <div className="space-y-7 pb-6">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
              Active
            </span>
            <div className="space-y-3 mt-3">
              {activeSynthetics.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No active synthetics for this revision.
                </p>
              ) : (
                activeSynthetics.map((synthetic) => (
                  <SyntheticRow
                    key={`${selectedRevision.id}-active-${synthetic.id}`}
                    synthetic={synthetic}
                    enabled
                    onToggle={() => onToggleSynthetic(synthetic.id, false)}
                    onOpenSettings={() => setSettingsSyntheticId(synthetic.id)}
                  />
                ))
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
              Available
            </span>
            <div className="space-y-3 mt-3">
              {availableSynthetics.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No available synthetics for this revision.
                </p>
              ) : (
                availableSynthetics.map((synthetic) => (
                  <SyntheticRow
                    key={`${selectedRevision.id}-available-${synthetic.id}`}
                    synthetic={synthetic}
                    enabled={false}
                    onToggle={() => onToggleSynthetic(synthetic.id, true)}
                    onOpenSettings={() => setSettingsSyntheticId(synthetic.id)}
                  />
                ))
              )}
            </div>
          </div>
          </div>
        )}
      </div>

      {isSettingsSheetMounted && sheetSynthetic ? (
        <div
          className="absolute inset-0 z-20 bg-black/10"
          onClick={closeSettingsSheet}
        >
          <div
            className={`absolute top-0 right-0 h-full w-[22rem] bg-surface-lowest border-l border-surface-container shadow-[-8px_0_24px_rgba(15,23,42,0.08)] p-5 overflow-y-auto transition-transform duration-200 ease-out ${
              isSettingsSheetVisible ? "translate-x-0" : "translate-x-full"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-on-surface">
                {sheetSynthetic.name} Settings
              </h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Revision {selectedRevision.version}
              </p>
            </div>
            <button
              type="button"
              onClick={closeSettingsSheet}
              className="text-on-surface-variant hover:text-on-surface text-sm"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <SettingInput
              label="Temperature"
              hint="Controls creativity: 0 = deterministic, 1 = highly varied. Lower values (0.2–0.4) suit analytical roles; higher values (0.5–0.7) suit creative roles."
              value={settingsDraft.temperature}
              step={0.01}
              onChange={(value) =>
                setSettingsDraft((prev) => ({ ...prev, temperature: value }))
              }
            />
            <SettingInput
              label="Strictness"
              hint="How strictly this agent enforces quality gates (0–100). Higher values flag more issues and trigger more retries."
              value={settingsDraft.strictness}
              step={1}
              onChange={(value) =>
                setSettingsDraft((prev) => ({ ...prev, strictness: value }))
              }
            />
            <SettingInput
              label="Engagement %"
              hint="Effort level (0–100). Higher values produce more detailed analysis at the cost of longer runs."
              value={settingsDraft.engagementPercent}
              step={1}
              onChange={(value) =>
                setSettingsDraft((prev) => ({
                  ...prev,
                  engagementPercent: value,
                }))
              }
            />
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => {
                onSaveSyntheticSettings(sheetSynthetic.id, settingsDraft);
                closeSettingsSheet();
              }}
              className="h-9 px-4 rounded-md text-on-primary text-sm font-medium transition-all duration-200 ease-out hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #005ac2, #004fab)",
              }}
            >
              Save
            </button>
          </div>
        </div>
        </div>
      ) : null}
    </aside>
  );
}

function SyntheticRow({
  synthetic,
  enabled,
  onToggle,
  onOpenSettings,
}: {
  synthetic: SyntheticMock;
  enabled: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="bg-surface-lowest rounded-xl p-4 border border-surface-container">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-on-surface">{synthetic.name}</h4>
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
            {synthetic.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className={`h-7 px-3 rounded-full text-xs font-medium transition-all duration-200 ease-out ${
              enabled
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {enabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-7 h-7 rounded-md border border-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-all duration-200 ease-out"
            aria-label={`Open ${synthetic.name} settings`}
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingInput({
  label,
  value,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2 border border-surface-container">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">
        {label}
      </span>
      {hint && (
        <p className="text-[10px] text-on-surface-variant opacity-60 mt-0.5 leading-snug">{hint}</p>
      )}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full bg-transparent text-sm font-semibold text-on-surface focus:outline-none"
      />
    </div>
  );
}
