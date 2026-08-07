import { STEPS } from "./registry";
import type { FlowCtx, FlowStep, StepRecord, StepTick } from "./types";

function withTimeout<T>(promise: Promise<T>, ms: number, stepId: string): Promise<T> {
  if (ms === 0) return promise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[flow] Step "${stepId}" timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function* runFlow(
  steps: FlowStep[],
  initialCtx: FlowCtx,
  queue: Map<string, StepRecord>,
): AsyncGenerator<StepTick> {
  let ctx = initialCtx;

  for (const step of steps) {
    // Шаг отключён в JSON — пропускаем без UI-обновления
    if (!step.enabled) {
      yield { stepId: step.id, title: step.title, ctx, durationMs: 0, skipped: true, phase: "done" };
      continue;
    }

    // Проверяем зависимости
    const missing = step.requires.filter((key) => !ctx[key]);
    if (missing.length > 0) {
      throw new Error(
        `[flow] Step "${step.id}" requires [${missing.join(", ")}] but they are missing. Check step order in creation-flow.json`,
      );
    }

    // Сигналим старт ДО вызова функции — лейбл в UI обновляется сразу
    yield { stepId: step.id, title: step.title, ctx, durationMs: 0, skipped: false, phase: "start" };

    const record: StepRecord = {
      stepId: step.id,
      startedAt: Date.now(),
      timeoutMs: step.timeoutMs,
      status: "running",
    };
    queue.set(step.id, record);

    const startedAt = Date.now();

    try {
      if (step.type === "user") {
        ctx = await withTimeout(
          ctx.onIntakeReady().then((answers) => ({ ...ctx, intakeAnswers: answers })),
          step.timeoutMs,
          step.id,
        );
      } else {
        const fn = STEPS[step.id];
        if (!fn) throw new Error(`[flow] No function registered for step "${step.id}"`);
        ctx = await withTimeout(fn(ctx), step.timeoutMs, step.id);
      }

      record.status = "done";
      queue.set(step.id, record);
      yield { stepId: step.id, title: step.title, ctx, durationMs: Date.now() - startedAt, skipped: false, phase: "done" };

    } catch (err) {
      record.status = "failed";
      queue.set(step.id, record);

      if (step.onError === "throw") throw err;

      const msg = err instanceof Error ? err.message : String(err);
      if (step.onError === "warn") console.warn(`[flow] Step "${step.id}" failed (continuing):`, msg);

      yield { stepId: step.id, title: step.title, ctx, durationMs: Date.now() - startedAt, skipped: true, phase: "done" };
    }
  }
}
