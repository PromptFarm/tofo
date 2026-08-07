export function isHistoricalIterationView(input: {
  selectedRunId: string | null;
  latestRunId: string | null;
}): boolean {
  if (!input.selectedRunId || !input.latestRunId) {
    return false;
  }

  return input.selectedRunId !== input.latestRunId;
}
