import assert from "node:assert/strict";
import { shouldShowReportLoading } from "./reportLoadingState";

assert.equal(
  shouldShowReportLoading({
    hasInitialSessionPayload: true,
    hasActiveRun: false,
    reportHydrationSettled: false,
  }),
  true,
);

assert.equal(
  shouldShowReportLoading({
    hasInitialSessionPayload: true,
    hasActiveRun: false,
    reportHydrationSettled: true,
  }),
  false,
);

assert.equal(
  shouldShowReportLoading({
    hasInitialSessionPayload: true,
    hasActiveRun: true,
    reportHydrationSettled: false,
  }),
  false,
);

assert.equal(
  shouldShowReportLoading({
    hasInitialSessionPayload: false,
    hasActiveRun: false,
    reportHydrationSettled: false,
  }),
  false,
);

console.log("reportLoadingState tests passed");
