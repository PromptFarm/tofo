import assert from "node:assert/strict";
import { isHistoricalIterationView } from "./projectIterationMode";

assert.equal(
  isHistoricalIterationView({ selectedRunId: null, latestRunId: "run-2" }),
  false,
);

assert.equal(
  isHistoricalIterationView({ selectedRunId: "run-2", latestRunId: null }),
  false,
);

assert.equal(
  isHistoricalIterationView({ selectedRunId: "run-2", latestRunId: "run-2" }),
  false,
);

assert.equal(
  isHistoricalIterationView({ selectedRunId: "run-1", latestRunId: "run-2" }),
  true,
);

console.log("projectIterationMode tests passed");
