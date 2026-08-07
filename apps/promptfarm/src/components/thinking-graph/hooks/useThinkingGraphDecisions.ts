import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { SyntheticPreparedInputSource, RunSummaryConflict } from "@/lib/thinking-graph/server/types";
import {
  composeConflictDirective,
  composeDecisionSelectionDirective,
  composeIterationDraft,
  composeStructuredClarificationDirective,
  getDownstreamNodes,
  mergePromptDraftWithIdea,
  mergePromptSections,
  normalizeDecisionDirectivesInPrompt,
  type AppliedDecisionSelection,
  type AppliedStructuredClarification,
  type DecisionRequiredPayload,
} from "../thinkingGraphUtils";
import type { SyntheticEdge } from "@/lib/planning/types";
import { useThinkingGraphUiStore } from "../state/useThinkingGraphUiStore";
import { useThinkingGraphChatStore } from "../state/useThinkingGraphChatStore";
import { useStagingBuffer } from "./useStagingBuffer";
import type { RuntimeNodeStatus } from "../runtime/runtimeTypes";

export function useThinkingGraphDecisions(params: {
  createIterationPromptFromActiveRun: (() => string | null) | null;
  currentRecommendationDigest: string[];
  appliedChatDigest: string[];
  syntheticNodeIds: string[];
  revisionEdges: SyntheticEdge[];
  rootPrompt: string;
  persistPreparedInputs: (input: {
    decisions: AppliedDecisionSelection[];
    clarifications: AppliedStructuredClarification[];
  }) => Promise<void>;
  setChatUpdatedNodeIds: (ids: Set<string>) => void;
  setRuntimeByNodeId: (updater: ((prev: Record<string, RuntimeNodeStatus>) => Record<string, RuntimeNodeStatus>) | Record<string, RuntimeNodeStatus>) => void;
}) {
  const thinkingInput = useThinkingGraphUiStore((s) => s.thinkingInput);
  const setThinkingInput = useThinkingGraphUiStore((s) => s.setThinkingInput);
  const setIdeaPrompt = useThinkingGraphUiStore((s) => s.setIdeaPrompt);
  const setPreviousExpanded = useThinkingGraphUiStore((s) => s.setPreviousExpanded);
  const pendingAppliedDecisions = useThinkingGraphChatStore(
    (s) => s.pendingAppliedDecisions,
  );
  const setPendingAppliedDecisions = useThinkingGraphChatStore(
    (s) => s.setPendingAppliedDecisions,
  );
  const pendingStructuredClarifications = useThinkingGraphChatStore(
    (s) => s.pendingStructuredClarifications,
  );
  const setPendingStructuredClarifications = useThinkingGraphChatStore(
    (s) => s.setPendingStructuredClarifications,
  );

  // ── Staging buffers ──────────────────────────────────────────────────────
  // Decisions staged for next run (no prompt writes until flush).
  const decisionBuffer = useStagingBuffer();
  // Full decision payloads are stored in decisionBuffer (Zustand) so they survive navigation.
  // Conflict directives staged for next run, keyed by conflict title.
  const stagedConflictsRef = useRef<Map<string, RunSummaryConflict>>(new Map());
  const [conflictVersion, setConflictVersion] = useState(0);
  // Adopted next-move actions staged for next run: action text → directive string.
  const adoptedActionsRef = useRef<Map<string, string>>(new Map());
  const [actionsVersion, setActionsVersion] = useState(0);

  // Combined pending state exposed to the UI.
  void conflictVersion; // consumed only for reactivity
  void actionsVersion;
  const hasPending =
    decisionBuffer.hasPending ||
    stagedConflictsRef.current.size > 0 ||
    adoptedActionsRef.current.size > 0;
  const stagedCount =
    decisionBuffer.stagedCount +
    stagedConflictsRef.current.size +
    adoptedActionsRef.current.size;

  // ── Helper: build a working prompt base ─────────────────────────────────
  function buildWorkingPrompt(currentThinkingInput: string): string | null {
    const basePromptFromRun =
      params.createIterationPromptFromActiveRun?.() ??
      (params.rootPrompt.trim() || useThinkingGraphUiStore.getState().ideaPrompt
        ? composeIterationDraft({
            basePrompt:
              params.rootPrompt.trim() ||
              useThinkingGraphUiStore.getState().ideaPrompt,
            recommendationDigest: params.currentRecommendationDigest,
            appliedChatDigest: params.appliedChatDigest,
          })
        : null);
    return mergePromptDraftWithIdea({
      ideaPrompt: useThinkingGraphUiStore.getState().ideaPrompt,
      draftPrompt: currentThinkingInput.trim() || basePromptFromRun || "",
    });
  }

  // ── applyConflictDirective — now stages instead of writing immediately ───
  const applyConflictDirective = useCallback(
    (conflict: RunSummaryConflict) => {
      // Use conflict title as the stable map key.
      const key = conflict.title;
      stagedConflictsRef.current.set(key, conflict);
      setConflictVersion((v) => v + 1);
      toast.success("Conflict resolution staged — will apply on next run.");
    },
    // conflictVersion intentionally excluded — it's the trigger, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── applyDecisionOption — now stages instead of writing immediately ──────
  const applyDecisionOption = useCallback(
    (input: {
      decision: DecisionRequiredPayload;
      optionId: string;
      source?: SyntheticPreparedInputSource;
    }) => {
      const decisionDirective = composeDecisionSelectionDirective(input);
      if (!decisionDirective) {
        toast.error("Selected decision option is invalid.");
        return;
      }

      const selectedOption = input.decision.options.find(
        (option) => option.id === input.optionId,
      );
      if (!selectedOption) {
        toast.error("Selected decision option is invalid.");
        return;
      }

      const familyKey =
        input.decision.familyId?.trim().length
          ? input.decision.familyId
          : input.decision.syntheticId;

      // Stage — no prompt writes, no orange nodes.
      decisionBuffer.stage(
        familyKey,
        input.decision.syntheticId,
        input.optionId,
        selectedOption.label,
        input.decision.title,
      );
      decisionBuffer.stagePayload(familyKey, {
        decision: input.decision,
        optionId: input.optionId,
        source: input.source,
      });

      // Persist immediately so the staged pick survives page reload via currentPayload.
      const stagedAsApplied: AppliedDecisionSelection = {
        syntheticId: input.decision.syntheticId,
        decisionTitle: input.decision.title,
        optionId: input.optionId,
        optionLabel: selectedOption.label,
        optionDescription: selectedOption.description,
        appliedAt: new Date().toISOString(),
        source: input.source ?? "manual_edit",
        ...(input.decision.relatedEdgeId ? { relatedEdgeId: input.decision.relatedEdgeId } : {}),
        ...(input.decision.relatedNodeName ? { relatedNodeName: input.decision.relatedNodeName } : {}),
      };
      const nextPending = [...pendingAppliedDecisions, stagedAsApplied];
      setPendingAppliedDecisions(nextPending);
      void params.persistPreparedInputs({
        decisions: nextPending,
        clarifications: pendingStructuredClarifications,
      });

      // Mark the decision's node + downstream dependents as dirty.
      // Use oversight+amplification edges for dependency traversal (same as run scheduler).
      const dependencyEdges = params.revisionEdges
        .filter((e) => e.type === "oversight" || e.type === "amplification")
        .map((e) => ({ from: e.from, to: e.to }));

      // Build the initial seed: always include the decision's own node.
      // If this decision was triggered by a specific tension edge (relatedEdgeId), also seed
      // the counterpart node immediately so both sides enter a single combined BFS traversal.
      // Track the direct counterpart id so it can receive the "needs_rerun_conflict" visual.
      let tensionCounterpartId: string | undefined;
      const seed = new Set([input.decision.syntheticId]);
      if (input.decision.relatedEdgeId) {
        const relatedEdge = params.revisionEdges.find((e) => e.id === input.decision.relatedEdgeId);
        if (relatedEdge?.type === "tension") {
          tensionCounterpartId =
            relatedEdge.from === input.decision.syntheticId ? relatedEdge.to : relatedEdge.from;
          seed.add(tensionCounterpartId);
        }
      }

      // Expand seed to full downstream set.
      const dirtySet = getDownstreamNodes(params.syntheticNodeIds, seed, dependencyEdges);

      // Also catch any other tension edges involving this node that weren't captured by relatedEdgeId.
      const tensionCounterparts = params.revisionEdges
        .filter(
          (e) =>
            e.type === "tension" &&
            (e.from === input.decision.syntheticId || e.to === input.decision.syntheticId) &&
            e.id !== input.decision.relatedEdgeId,
        )
        .map((e) =>
          e.from === input.decision.syntheticId ? e.to : e.from,
        );
      for (const counterpartId of tensionCounterparts) {
        const counterpartDownstream = getDownstreamNodes(
          params.syntheticNodeIds,
          new Set([counterpartId]),
          dependencyEdges,
        );
        for (const id of counterpartDownstream) dirtySet.add(id);
      }

      params.setChatUpdatedNodeIds(dirtySet);
      params.setRuntimeByNodeId((prev) => {
        const next = { ...prev };
        for (const id of dirtySet) {
          next[id] = id === tensionCounterpartId ? "needs_rerun_conflict" : "needs_rerun";
        }
        return next;
      });

      toast.success("Decision staged — will apply on next run.");
    },
    // decisionBuffer methods are stable (Zustand actions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisionBuffer.stage, decisionBuffer.stagePayload, pendingAppliedDecisions, pendingStructuredClarifications, setPendingAppliedDecisions, params.persistPreparedInputs, params.syntheticNodeIds, params.revisionEdges],
  );

  // ── flushStagedDecisions — write everything in one pass ─────────────────
  const flushStagedDecisions = useCallback(() => {
    const workingPrompt = buildWorkingPrompt(thinkingInput);
    if (!workingPrompt) {
      toast.error("Run the graph first before flushing staged changes.");
      return;
    }

    const stagedDecisions = decisionBuffer.flush();
    const stagedConflicts = Array.from(stagedConflictsRef.current.values());
    stagedConflictsRef.current.clear();
    setConflictVersion((v) => v + 1);
    const adoptedActions = Array.from(adoptedActionsRef.current.entries());
    adoptedActionsRef.current.clear();
    setActionsVersion((v) => v + 1);

    if (stagedDecisions.length === 0 && stagedConflicts.length === 0 && adoptedActions.length === 0) return;

    const directives: string[] = [];
    // Use a Map keyed by syntheticId so staged entries overwrite any already-persisted
    // duplicates that arrived via the sessionPayload → useEffect restore path.
    const nextByKey = new Map(
      pendingAppliedDecisions.map((d) => [d.syntheticId, d]),
    );

    // Build directives for each staged decision.
    for (const staged of stagedDecisions) {
      const payload = decisionBuffer.getPayload(staged.familyId);
      if (payload) {
        const directive = composeDecisionSelectionDirective(payload);
        if (directive) directives.push(directive);

        nextByKey.set(staged.syntheticId, {
          syntheticId: staged.syntheticId,
          decisionTitle: staged.decisionTitle,
          optionId: staged.optionId,
          optionLabel: staged.optionLabel,
          optionDescription:
            payload.decision.options.find((o) => o.id === staged.optionId)
              ?.description ?? "",
          appliedAt: new Date().toISOString(),
          source: payload.source ?? "manual_edit",
          ...(payload.decision.relatedEdgeId ? { relatedEdgeId: payload.decision.relatedEdgeId } : {}),
          ...(payload.decision.relatedNodeName ? { relatedNodeName: payload.decision.relatedNodeName } : {}),
        });
        decisionBuffer.deletePayload(staged.familyId);
      }
    }

    const nextPendingAppliedDecisions = Array.from(nextByKey.values());

    // Build directives for each staged conflict.
    for (const conflict of stagedConflicts) {
      directives.push(composeConflictDirective(conflict));
    }

    // Build directives for each adopted next-move action.
    for (const [, directive] of adoptedActions) {
      directives.push(directive);
    }

    if (directives.length === 0) return;

    const syncedPrompt = normalizeDecisionDirectivesInPrompt(
      mergePromptSections(workingPrompt, directives),
    );
    setThinkingInput(syncedPrompt);
    setIdeaPrompt(syncedPrompt);
    setPendingAppliedDecisions(nextPendingAppliedDecisions);
    void params.persistPreparedInputs({
      decisions: nextPendingAppliedDecisions,
      clarifications: pendingStructuredClarifications,
    });
    params.setChatUpdatedNodeIds(new Set(params.syntheticNodeIds));

    toast.success(
      `${directives.length} staged change${directives.length !== 1 ? "s" : ""} applied — nodes marked for re-run.`,
    );
  }, [
    thinkingInput,
    decisionBuffer.flush,
    pendingAppliedDecisions,
    pendingStructuredClarifications,
    setThinkingInput,
    setIdeaPrompt,
    setPendingAppliedDecisions,
    params.persistPreparedInputs,
    params.setChatUpdatedNodeIds,
    params.syntheticNodeIds,
    params.createIterationPromptFromActiveRun,
    params.currentRecommendationDigest,
    params.appliedChatDigest,
    params.rootPrompt,
  ]);

  // ── adoptNextMove — stages the action, writes to prompt at flush time ────
  const adoptNextMove = useCallback(
    (input: { action: string; mode: "self" | "assistant" | "defer" }) => {
      if (input.mode === "defer") {
        toast.success("Skipped — move dismissed, draft unchanged.");
        return;
      }

      const directive =
        input.mode === "self"
          ? `User-owned next move:\n- ${input.action}`
          : `Next move to execute with the assistant:\n- ${input.action}`;

      adoptedActionsRef.current.set(input.action, directive);
      setActionsVersion((v) => v + 1);
      toast.success("Staged — will apply on the next run.");
    },
    [],
  );

  const applyStructuredClarifications = useCallback(
    (input: {
      syntheticId: string;
      syntheticName: string;
      answers: {
        questionId: string;
        questionLabel: string;
        answer: string;
      }[];
      source?: SyntheticPreparedInputSource;
    }) => {
      const normalizedAnswers = input.answers
        .map((item) => ({ ...item, answer: item.answer.trim() }))
        .filter((item) => item.answer.length > 0);

      if (normalizedAnswers.length === 0) {
        toast.error("Provide at least one clarification answer.");
        return;
      }

      const workingPrompt = buildWorkingPrompt(thinkingInput);
      if (!workingPrompt) {
        toast.error("Run the graph first to apply structured answers.");
        return;
      }

      const clarificationDirective = composeStructuredClarificationDirective({
        syntheticId: input.syntheticId,
        syntheticName: input.syntheticName,
        answers: normalizedAnswers,
        appliedAt: new Date().toISOString(),
      });

      const syncedPrompt = normalizeDecisionDirectivesInPrompt(
        mergePromptSections(workingPrompt, [clarificationDirective]),
      );
      setThinkingInput(syncedPrompt);
      setIdeaPrompt(syncedPrompt);
      const nextPendingStructuredClarifications = [
        ...pendingStructuredClarifications.filter(
          (item) => item.syntheticId !== input.syntheticId,
        ),
        {
          syntheticId: input.syntheticId,
          syntheticName: input.syntheticName,
          answers: normalizedAnswers,
          appliedAt: new Date().toISOString(),
          source: input.source ?? "manual_edit",
        },
      ];
      setPendingStructuredClarifications(nextPendingStructuredClarifications);
      void params.persistPreparedInputs({
        decisions: pendingAppliedDecisions,
        clarifications: nextPendingStructuredClarifications,
      });
      params.setChatUpdatedNodeIds(new Set(params.syntheticNodeIds));
      params.setRuntimeByNodeId((prev) => {
        const next = { ...prev };
        for (const id of params.syntheticNodeIds) next[id] = "needs_rerun";
        return next;
      });
      setPreviousExpanded(false);
      toast.success("Answers staged — will apply on the next run.");
    },
    [
      params.createIterationPromptFromActiveRun,
      params.currentRecommendationDigest,
      params.appliedChatDigest,
      params.rootPrompt,
      params.persistPreparedInputs,
      params.setChatUpdatedNodeIds,
      params.syntheticNodeIds,
      thinkingInput,
      setThinkingInput,
      setIdeaPrompt,
      pendingAppliedDecisions,
      pendingStructuredClarifications,
      setPendingStructuredClarifications,
      setPreviousExpanded,
    ],
  );

  return {
    applyConflictDirective,
    applyDecisionOption,
    adoptNextMove,
    applyStructuredClarifications,
    flushStagedDecisions,
    hasPending,
    stagedCount,
    stagedDecisions: decisionBuffer.staged,
    stagedActionKeys: Array.from(adoptedActionsRef.current.keys()),
    unstageDecision: (familyId: string) => decisionBuffer.unstage(familyId),
    unstageAction: (action: string) => {
      if (adoptedActionsRef.current.has(action)) {
        adoptedActionsRef.current.delete(action);
        setActionsVersion((v) => v + 1);
      }
    },
    unstageAll: () => {
      decisionBuffer.unstageAll();
      stagedConflictsRef.current.clear();
      setConflictVersion((v) => v + 1);
      adoptedActionsRef.current.clear();
      setActionsVersion((v) => v + 1);
    },
    unstageConflict: (conflictTitle: string) => {
      if (stagedConflictsRef.current.has(conflictTitle)) {
        stagedConflictsRef.current.delete(conflictTitle);
        setConflictVersion((v) => v + 1);
      }
    },
  };
}
