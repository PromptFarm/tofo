import assert from "node:assert/strict";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";
import type { SyntheticNode } from "@/lib/planning/types";
import { mergeIncomingSessionPayload } from "./mergeIncomingSessionPayload";

function synthetic(id: string): SyntheticNode {
  return {
    id,
    code: id.slice(-2).toUpperCase(),
    name: id,
    role: `${id} role`,
    status: "active",
    layout: { x: 0, y: 0 },
    config: {
      enabled: true,
      temperature: 0.3,
      strictness: 70,
      engagementPercent: 70,
    },
  };
}

function payload(syntheticIds: string[]): SyntheticGraphPayload {
  const synthetics = syntheticIds.map(synthetic);
  return {
    sessionId: "session-1",
    ideaPrompt: "Idea",
    synthetics,
    edges: [],
    transcript: [],
    outputsBySyntheticId: Object.fromEntries(syntheticIds.map((id) => [id, null])),
    conversationsBySyntheticId: Object.fromEntries(syntheticIds.map((id) => [id, []])),
    preparedInputs: { decisions: [], clarifications: [] },
    provider: { kind: "test", label: "Test" },
    orchestrator: { kind: "test", label: "Test" },
    projectSpec: null,
    intakeQuestions: [],
    intakeAnswers: [],
    pendingIntakeQuestions: [],
    runSummary: null,
  };
}

{
  const prev = payload([
    "syn-game-designer",
    "syn-ux-designer",
    "syn-game-programmer",
    "syn-custom-1",
  ]);
  const incoming = payload([
    "syn-game-designer",
    "syn-ux-designer",
    "syn-game-programmer",
  ]);

  const merged = mergeIncomingSessionPayload(prev, incoming, []);

  assert.deepEqual(
    merged.synthetics.map((item) => item.id),
    [
      "syn-game-designer",
      "syn-ux-designer",
      "syn-game-programmer",
      "syn-custom-1",
    ],
  );
  assert.deepEqual(Object.keys(merged.outputsBySyntheticId), [
    "syn-game-designer",
    "syn-ux-designer",
    "syn-game-programmer",
    "syn-custom-1",
  ]);
}

{
  const prev = payload(["syn-a", "syn-b"]);
  const incoming = payload(["syn-a", "syn-b", "syn-c"]);

  const merged = mergeIncomingSessionPayload(prev, incoming, []);

  assert.deepEqual(
    merged.synthetics.map((item) => item.id),
    ["syn-a", "syn-b", "syn-c"],
  );
}

console.log("mergeIncomingSessionPayload tests passed");
