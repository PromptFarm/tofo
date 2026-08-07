import assert from "node:assert/strict";
import { getPendingOperationState } from "./pendingOperationState";

assert.deepEqual(
  getPendingOperationState({
    active: false,
    message: "Saving changes. Please wait before reloading the page.",
  }),
  {
    active: false,
    message: null,
    shouldBlockUnload: false,
  },
);

assert.deepEqual(
  getPendingOperationState({
    active: true,
    message: "Saving changes. Please wait before reloading the page.",
  }),
  {
    active: true,
    message: "Saving changes. Please wait before reloading the page.",
    shouldBlockUnload: true,
  },
);

console.log("pendingOperationState tests passed");
