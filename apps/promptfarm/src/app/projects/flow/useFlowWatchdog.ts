"use client";

import { useEffect } from "react";
import type { StepRecord } from "./types";

export function useFlowWatchdog(queue: Map<string, StepRecord>): void {
  useEffect(() => {
    const timer = setInterval(() => {
      for (const [, record] of queue) {
        if (
          record.status === "running" &&
          record.timeoutMs > 0 &&
          Date.now() - record.startedAt > record.timeoutMs
        ) {
          console.error(
            `[flow] STUCK: step "${record.stepId}" has been running for ${Date.now() - record.startedAt}ms (timeout: ${record.timeoutMs}ms)`,
          );
        }
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [queue]);
}
