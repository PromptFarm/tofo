import assert from "node:assert/strict";
import { getTeamSaveLabel } from "./teamSaveIndicator";

assert.equal(getTeamSaveLabel("idle"), null);
assert.equal(getTeamSaveLabel("saving"), "Saving team...");
assert.equal(getTeamSaveLabel("saved"), "Team saved");
assert.equal(getTeamSaveLabel("error"), "Team save failed");

console.log("teamSaveIndicator tests passed");
