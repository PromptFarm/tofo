"use client";

import {
  fetchThinkingGraphSession,
  saveProjectThinkingGraphSession,
  streamThinkingGraphIntakeQuestions,
  saveThinkingGraphIntakeAnswers,
  uploadProjectFile,
} from "@/lib/thinking-graph/client";
import { buildThinkingGraphLaunchUrl } from "../launchConfig";
import type { FlowCtx } from "./types";

// ── draft ──────────────────────────────────────────────────────────────────────

export async function draftStep(ctx: FlowCtx): Promise<FlowCtx> {
  if (ctx.draftProjectId) {
    await fetch(`/api/projects/${ctx.draftProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: ctx.ideaPrompt,
        selectedTeamId: ctx.selectedTeamId,
        domainTags: ctx.domainTags,
      }),
    });
    return { ...ctx, projectId: ctx.draftProjectId };
  }

  const res = await fetch("/api/projects/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idea: ctx.ideaPrompt,
      selectedTeamId: ctx.selectedTeamId,
      domainTags: ctx.domainTags,
    }),
  });
  if (!res.ok) throw new Error("Failed to create project");
  const data = (await res.json()) as { projectId: string };
  return { ...ctx, projectId: data.projectId };
}

// ── upload-files ───────────────────────────────────────────────────────────────

export async function uploadFilesStep(ctx: FlowCtx): Promise<FlowCtx> {
  if (ctx.pendingFiles.length === 0) return ctx;
  await Promise.all(ctx.pendingFiles.map((f) => uploadProjectFile(ctx.projectId!, f)));
  return ctx;
}

// ── name ───────────────────────────────────────────────────────────────────────

export async function nameStep(ctx: FlowCtx): Promise<FlowCtx> {
  let resolvedName = ctx.userProvidedName;

  if (!resolvedName) {
    const res = await fetch("/api/projects/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: ctx.ideaPrompt }),
    });
    if (!res.ok) return ctx;
    resolvedName = ((await res.json()) as { name: string }).name;
  }

  await fetch(`/api/projects/${ctx.projectId}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: resolvedName }),
  });
  return { ...ctx, projectName: resolvedName };
}

// ── session ────────────────────────────────────────────────────────────────────

export async function sessionStep(ctx: FlowCtx): Promise<FlowCtx> {
  const payload = await fetchThinkingGraphSession({
    ideaPrompt: ctx.ideaPrompt,
    selectedPersonaIds: ctx.autoPersonaIds.length > 0 ? ctx.autoPersonaIds : undefined,
  });
  await saveProjectThinkingGraphSession(ctx.projectId!, payload);
  return { ...ctx, sessionId: payload.sessionId, synthetics: payload.synthetics };
}

// ── activate ───────────────────────────────────────────────────────────────────

export async function activateStep(ctx: FlowCtx): Promise<FlowCtx> {
  await fetch(`/api/projects/${ctx.projectId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });
  return ctx;
}

// ── intake-stream ──────────────────────────────────────────────────────────────

export async function intakeStreamStep(ctx: FlowCtx): Promise<FlowCtx> {
  const questions = await streamThinkingGraphIntakeQuestions(
    { sessionId: ctx.sessionId!, ideaPrompt: ctx.ideaPrompt },
    () => {},
  );
  return { ...ctx, intakeQuestions: questions };
}

// ── intake-ui — type: "user", runner не вызывает эту функцию напрямую ──────────
// Runner ждёт ctx.onIntakeReady() который резолвится когда пользователь ответил.
// Эта функция существует для валидации реестра.
export async function intakeUiStep(ctx: FlowCtx): Promise<FlowCtx> {
  const answers = await ctx.onIntakeReady();
  return { ...ctx, intakeAnswers: answers };
}

// ── intake-save ────────────────────────────────────────────────────────────────

export async function intakeSaveStep(ctx: FlowCtx): Promise<FlowCtx> {
  const payload = await saveThinkingGraphIntakeAnswers({
    sessionId: ctx.sessionId!,
    answers: ctx.intakeAnswers,
  });
  await saveProjectThinkingGraphSession(ctx.projectId!, payload);
  return ctx;
}

// ── director-confirm ───────────────────────────────────────────────────────────

export async function directorConfirmStep(ctx: FlowCtx): Promise<FlowCtx> {
  const res = await fetch("/api/thinking-graph/director", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: ctx.sessionId,
      confirmedPersonaIds: ctx.autoPersonaIds,
    }),
  });
  if (!res.ok) throw new Error("Director confirmation failed.");
  const payload = (await res.json()) as { synthetics?: typeof ctx.synthetics };
  return { ...ctx, synthetics: payload.synthetics ?? ctx.synthetics };
}

// ── run-simulation ─────────────────────────────────────────────────────────────

export async function runSimulationStep(ctx: FlowCtx): Promise<FlowCtx> {
  if (!ctx.startRun) throw new Error("startRun not provided in FlowCtx");
  ctx.startRun();
  return ctx;
}

// ── redirect ───────────────────────────────────────────────────────────────────

export async function redirectStep(ctx: FlowCtx): Promise<FlowCtx> {
  ctx.router.push(buildThinkingGraphLaunchUrl({
    projectId: ctx.projectId!,
    autoPersonaIds: ctx.autoPersonaIds,
    autostart: ctx.autostart,
  }));
  return ctx;
}
