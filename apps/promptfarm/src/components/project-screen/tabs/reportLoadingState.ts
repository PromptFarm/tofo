type ReportLoadingStateInput = {
  hasInitialSessionPayload: boolean;
  hasActiveRun: boolean;
  reportHydrationSettled: boolean;
};

export function shouldShowReportLoading({
  hasInitialSessionPayload,
  hasActiveRun,
  reportHydrationSettled,
}: ReportLoadingStateInput): boolean {
  return hasInitialSessionPayload && !hasActiveRun && !reportHydrationSettled;
}
