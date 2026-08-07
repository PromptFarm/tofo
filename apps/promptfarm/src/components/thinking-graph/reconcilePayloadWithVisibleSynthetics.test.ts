import assert from "node:assert/strict";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";
import type { SyntheticNode } from "@/lib/planning/types";
import { reconcilePayloadWithVisibleSynthetics } from "./reconcilePayloadWithVisibleSynthetics";

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
  return {
    sessionId: "session-1",
    ideaPrompt: "Idea",
    synthetics: syntheticIds.map(synthetic),
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
  const incoming = payload(["syn-a", "syn-b", "syn-c", "syn-d"]);
  const visible = [synthetic("syn-a"), synthetic("syn-b"), synthetic("syn-c")];
  const reconciled = reconcilePayloadWithVisibleSynthetics(incoming, visible);

  assert.deepEqual(
    reconciled.synthetics.map((item) => item.id),
    ["syn-a", "syn-b", "syn-c"],
  );
}

{
  const incoming = payload(["syn-a", "syn-b"]);
  const reconciled = reconcilePayloadWithVisibleSynthetics(incoming, []);
  assert.deepEqual(
    reconciled.synthetics.map((item) => item.id),
    ["syn-a", "syn-b"],
  );
}

console.log("reconcilePayloadWithVisibleSynthetics tests passed");
