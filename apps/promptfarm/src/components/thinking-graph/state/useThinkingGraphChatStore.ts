"use client";

import { create } from "zustand";

import type {
  AppliedDecisionSelection,
  AppliedStructuredClarification,
} from "../thinkingGraphUtils";

type ThinkingGraphChatState = {
  pendingAppliedDecisions: AppliedDecisionSelection[];
  pendingStructuredClarifications: AppliedStructuredClarification[];

  setPendingAppliedDecisions: (decisions: AppliedDecisionSelection[]) => void;
  setPendingStructuredClarifications: (
    clarifications: AppliedStructuredClarification[],
  ) => void;
  clearPendingInputs: () => void;
};

export const useThinkingGraphChatStore = create<ThinkingGraphChatState>(
  (set) => ({
    pendingAppliedDecisions: [],
    pendingStructuredClarifications: [],

    setPendingAppliedDecisions: (decisions) =>
      set({ pendingAppliedDecisions: decisions }),
    setPendingStructuredClarifications: (clarifications) =>
      set({ pendingStructuredClarifications: clarifications }),
    clearPendingInputs: () =>
      set({ pendingAppliedDecisions: [], pendingStructuredClarifications: [] }),
  }),
);
