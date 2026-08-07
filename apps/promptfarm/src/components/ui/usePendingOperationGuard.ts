"use client";

import { useEffect } from "react";

type UsePendingOperationGuardInput = {
  active: boolean;
  onBeforeUnload?: () => void;
};

export function usePendingOperationGuard({
  active,
  onBeforeUnload,
}: UsePendingOperationGuardInput) {
  useEffect(() => {
    if (!active) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      onBeforeUnload?.();
      event.preventDefault();
      event.returnValue = "";
      return "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active, onBeforeUnload]);
}
