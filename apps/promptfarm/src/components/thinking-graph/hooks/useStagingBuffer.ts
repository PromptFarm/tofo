"use client";

import { useCallback } from "react";
import { create } from "zustand";

import type { DecisionRequiredPayload } from "../thinkingGraphUtils";
import type { SyntheticPreparedInputSource } from "@/lib/thinking-graph/server/types";
import { toDecisionFamilyId } from "../OutcomeReport.utils";

export type StagedDecision = {
  /** Map key — stable identifier for this decision family. */
  familyId: string;
  syntheticId: string;
  decisionTitle: string;
  optionId: string;
  optionLabel: string;
};

export type StagedDecisionPayload = {
  decision: DecisionRequiredPayload;
  optionId: string;
  source?: SyntheticPreparedInputSource;
};

export type StagingBuffer = {
  stage: (
    familyId: string,
    syntheticId: string,
    optionId: string,
    optionLabel: string,
    decisionTitle: string,
  ) => void;
  unstage: (familyId: string) => void;
  unstageAll: () => void;
  /** Returns all staged items and clears the buffer. */
  flush: () => StagedDecision[];
  /** True when at least one decision is staged. */
  hasPending: boolean;
  /** Number of staged decisions. */
  stagedCount: number;
  /** Read-only snapshot of current staged items — stable reference. */
  staged: ReadonlyMap<string, StagedDecision>;
  /** Store full payload so directives can be built after navigation / remount. */
  stagePayload: (familyId: string, payload: StagedDecisionPayload) => void;
  getPayload: (familyId: string) => StagedDecisionPayload | undefined;
  deletePayload: (familyId: string) => void;
  clearPayloads: () => void;
};

type StagingBufferState = {
  map: Map<string, StagedDecision>;
  payloads: Map<string, StagedDecisionPayload>;
  stage: (familyId: string, syntheticId: string, optionId: string, optionLabel: string, decisionTitle: string) => void;
  unstage: (familyId: string) => void;
  unstageAll: () => void;
  flush: () => StagedDecision[];
  stagePayload: (familyId: string, payload: StagedDecisionPayload) => void;
  getPayload: (familyId: string) => StagedDecisionPayload | undefined;
  deletePayload: (familyId: string) => void;
  clearPayloads: () => void;
};

const useStagingBufferStore = create<StagingBufferState>((set, get) => ({
  map: new Map(),
  payloads: new Map(),

  stage: (familyId, syntheticId, optionId, optionLabel, decisionTitle) =>
    set((s) => {
      const next = new Map(s.map);
      next.set(familyId, { familyId, syntheticId, optionId, optionLabel, decisionTitle });
      return { map: next };
    }),

  unstage: (familyId) =>
    set((s) => {
      if (!s.map.has(familyId)) return s;
      const next = new Map(s.map);
      next.delete(familyId);
      return { map: next };
    }),

  unstageAll: () => set({ map: new Map(), payloads: new Map() }),

  flush: () => {
    const items = Array.from(get().map.values());
    set({ map: new Map() });
    return items;
  },

  stagePayload: (familyId, payload) =>
    set((s) => {
      const next = new Map(s.payloads);
      next.set(familyId, payload);
      return { payloads: next };
    }),

  getPayload: (familyId) => get().payloads.get(familyId),

  deletePayload: (familyId) =>
    set((s) => {
      if (!s.payloads.has(familyId)) return s;
      const next = new Map(s.payloads);
      next.delete(familyId);
      return { payloads: next };
    }),

  clearPayloads: () => set({ payloads: new Map() }),
}));

/**
 * Re-hydrates the staging buffer from persisted `preparedInputs.decisions` on page load.
 * Call once on workspace mount, before the graph renders.
 */
export function rehydrateStagingBuffer(
  decisions: { syntheticId: string; decisionTitle: string; optionId: string; optionLabel: string }[],
): void {
  const next = new Map<string, StagedDecision>();
  for (const d of decisions) {
    // Must use the same key as live staging: toDecisionFamilyId(title).
    // Using syntheticId here caused a mismatch so cards showed blank on reload.
    const familyId = d.decisionTitle?.trim().length
      ? toDecisionFamilyId(d.decisionTitle)
      : d.syntheticId;
    next.set(familyId, {
      familyId,
      syntheticId: d.syntheticId,
      decisionTitle: d.decisionTitle,
      optionId: d.optionId,
      optionLabel: d.optionLabel,
    });
  }
  useStagingBufferStore.setState({ map: next });
}

/**
 * Holds pending decisions staged by the user but not yet written to the prompt.
 * Backed by a Zustand store so staged picks survive navigation / component remount.
 *
 * ## Lifecycle
 * 1. `stage(familyId, ...)` — user picks an option; stored in the internal Map.
 * 2. `hasPending` / `stagedCount` become truthy; UI shows the staging bar.
 * 3. `flush()` — called at run-start; returns all staged items and clears the Map.
 *    The caller writes the returned directives to the prompt in a single pass.
 * 4. `unstage(familyId)` — user changes their mind; removes one entry.
 * 5. `unstageAll()` — user discards everything; clears the Map.
 */
export function useStagingBuffer(): StagingBuffer {
  const map = useStagingBufferStore((s) => s.map);
  const stage = useStagingBufferStore((s) => s.stage);
  const unstage = useStagingBufferStore((s) => s.unstage);
  const unstageAll = useStagingBufferStore((s) => s.unstageAll);
  const flush = useStagingBufferStore((s) => s.flush);
  const stagePayload = useStagingBufferStore((s) => s.stagePayload);
  const getPayload = useStagingBufferStore((s) => s.getPayload);
  const deletePayload = useStagingBufferStore((s) => s.deletePayload);
  const clearPayloads = useStagingBufferStore((s) => s.clearPayloads);

  const stableStage = useCallback(stage, [stage]);

  return {
    stage: stableStage,
    unstage,
    unstageAll,
    flush,
    hasPending: map.size > 0,
    stagedCount: map.size,
    staged: map,
    stagePayload,
    getPayload,
    deletePayload,
    clearPayloads,
  };
}
