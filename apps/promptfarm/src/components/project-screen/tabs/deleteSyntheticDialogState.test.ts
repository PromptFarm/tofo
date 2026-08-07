import assert from "node:assert/strict";
import { getDeleteSyntheticDialogDescription } from "./deleteSyntheticDialogState";

assert.equal(
  getDeleteSyntheticDialogDescription("Research Lead"),
  'Remove "Research Lead" from the simulation team?',
);

assert.equal(
  getDeleteSyntheticDialogDescription(null),
  "Remove this synthetic from the simulation team?",
);

console.log("deleteSyntheticDialogState tests passed");
