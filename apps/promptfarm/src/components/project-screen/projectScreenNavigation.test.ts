import assert from "node:assert/strict";
import {
  buildProjectScreenSearch,
  parseProjectScreenTab,
} from "./projectScreenNavigation";

assert.equal(parseProjectScreenTab("idea"), "idea");
assert.equal(parseProjectScreenTab("synthetics"), "synthetics");
assert.equal(parseProjectScreenTab("bad"), "report");
assert.equal(parseProjectScreenTab(null), "report");

assert.equal(
  buildProjectScreenSearch({
    currentSearch: "autostart=true&personas=a,b",
    tab: "report",
    runId: null,
  }),
  "?autostart=true&personas=a%2Cb",
);

assert.equal(
  buildProjectScreenSearch({
    currentSearch: "autostart=true",
    tab: "idea",
    runId: "run-123",
  }),
  "?autostart=true&tab=idea&run=run-123",
);

assert.equal(
  buildProjectScreenSearch({
    currentSearch: "tab=synthetics&run=run-1",
    tab: "report",
    runId: null,
  }),
  "",
);

console.log("projectScreenNavigation tests passed");
