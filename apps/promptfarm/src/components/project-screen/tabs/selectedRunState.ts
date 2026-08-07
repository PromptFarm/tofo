export function shouldResetSelectedRun(input: {
  selectedRunId: string | null;
  simulationHistoryIds: string[];
}): boolean {
  if (!input.selectedRunId) {
    return false;
  }

  if (input.simulationHistoryIds.length === 0) {
    return false;
  }

  return !input.simulationHistoryIds.includes(input.selectedRunId);
}
