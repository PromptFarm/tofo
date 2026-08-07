import assert from "node:assert/strict";
import { shouldResetSelectedRun } from "./selectedRunState";

assert.equal(
  shouldResetSelectedRun({
    selectedRunId: "run-1",
    simulationHistoryIds: [],
  }),
  false,
);

assert.equal(
  shouldResetSelectedRun({
    selectedRunId: null,
    simulationHistoryIds: ["run-1"],
  }),
  false,
);

assert.equal(
  shouldResetSelectedRun({
    selectedRunId: "run-2",
    simulationHistoryIds: ["run-1", "run-2"],
  }),
  false,
);

assert.equal(
  shouldResetSelectedRun({
    selectedRunId: "run-3",
    simulationHistoryIds: ["run-1", "run-2"],
  }),
  true,
);

console.log("selectedRunState tests passed");
