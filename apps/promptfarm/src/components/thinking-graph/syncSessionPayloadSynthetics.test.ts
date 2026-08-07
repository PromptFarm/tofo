import assert from "node:assert/strict";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";
import type { SyntheticNode } from "@/lib/planning/types";
import { syncSessionPayloadSynthetics } from "./syncSessionPayloadSynthetics";

const baseSynthetic = (id: string, code: string): SyntheticNode => ({
  id,
  code,
  name: `Synthetic ${code}`,
  role: `Role ${code}`,
  status: "active",
  layout: { x: 0, y: 0 },
  config: {
    enabled: true,
    temperature: 0.3,
    strictness: 70,
    engagementPercent: 70,
  },
});

const payload: SyntheticGraphPayload = {
  sessionId: "session-1",
  ideaPrompt: "Idea",
  synthetics: [baseSynthetic("syn-a", "AA"), baseSynthetic("syn-b", "BB")],
  edges: [],
  transcript: [],
  outputsBySyntheticId: {
    "syn-a": null,
    "syn-b": null,
  },
  conversationsBySyntheticId: {
    "syn-a": [],
    "syn-b": [],
  },
  preparedInputs: {
    decisions: [],
    clarifications: [],
  },
  provider: { kind: "test", label: "Test" },
  orchestrator: { kind: "test", label: "Test" },
  projectSpec: null,
  intakeQuestions: [],
  intakeAnswers: [],
  pendingIntakeQuestions: [],
  runSummary: null,
};

{
  const nextVisible = [baseSynthetic("syn-a", "AA"), baseSynthetic("syn-c", "CC")];
  const nextPayload = syncSessionPayloadSynthetics(payload, nextVisible);

  assert.deepEqual(
    nextPayload.synthetics.map((synthetic) => synthetic.id),
    ["syn-a", "syn-c"],
  );
  assert.deepEqual(Object.keys(nextPayload.outputsBySyntheticId), ["syn-a"]);
  assert.deepEqual(Object.keys(nextPayload.conversationsBySyntheticId), ["syn-a"]);
}

{
  const nextVisible = [
    baseSynthetic("syn-a", "AA"),
    baseSynthetic("syn-c", "CC"),
    baseSynthetic("syn-c", "CC"),
  ];
  const nextPayload = syncSessionPayloadSynthetics(payload, nextVisible);

  assert.deepEqual(
    nextPayload.synthetics.map((synthetic) => synthetic.id),
    ["syn-a", "syn-c"],
  );
}

{
  const nextVisible = [baseSynthetic("syn-a", "AA"), baseSynthetic("syn-b", "BB")];
  const nextPayload = syncSessionPayloadSynthetics(payload, nextVisible);

  assert.notEqual(nextPayload.synthetics, nextVisible);
  assert.deepEqual(
    nextPayload.synthetics.map((synthetic) => synthetic.id),
    ["syn-a", "syn-b"],
  );
}

console.log("syncSessionPayloadSynthetics tests passed");
