export type PendingOperationState = {
  active: boolean;
  message: string | null;
  shouldBlockUnload: boolean;
};

export function getPendingOperationState(input: {
  active: boolean;
  message: string;
}): PendingOperationState {
  if (!input.active) {
    return {
      active: false,
      message: null,
      shouldBlockUnload: false,
    };
  }

  return {
    active: true,
    message: input.message,
    shouldBlockUnload: true,
  };
}
