import type { Project as PlanningProject } from "@/lib/planning/types";
import type { SyntheticGraphPayload, SyntheticOutputJson } from "@/lib/thinking-graph/server/types";
import { calculateCostUsd, type TokenUsage } from "@/lib/thinking-graph/tokenPricing";
import {
  normalizeProjectDetail,
  normalizeProjectSummary,
} from "./projectMetadata";
import { getDb, nowIso, newId, toJson, fromJson, toBool, boolToInt, toPlain, toPlainRows } from "./sqlite/db";
import {
  asDraftProjectState,
  extractProjectDraftMetaForPersistence,
  mergeProjectStateWithDraftMeta,
} from "./sqlite/projectDraftMeta";
import {
  composeProjectIdeaPrompt,
  selectProjectIdeaForSessionSave,
  syncSessionPayloadIdeaPrompt,
} from "./sqlite/projectIdea";

// ─── Types (moved here from deleted store files) ──────────────────────────────

export type PromptProjectSummary = {
  id: string;
  name: string;
  idea: string;
  status: string;
  latestSessionId: string | null;
  hasLatestRun: boolean;
  createdAt: string;
  updatedAt: string;
  domainTags: string[];
  selectedTeamId: string | null;
};

export type DraftProjectState = {
  kind: "new_project_draft";
  selectedTeamId: string | null;
  domainTags: string[];
};

export type PromptProjectDetail = PromptProjectSummary & {
  projectState: PlanningProject | null;
  draftState: DraftProjectState | null;
};

export type ProjectFileSummary = {
  id: string;
  projectId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  includeInContext: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectFileContextRecord = ProjectFileSummary & {
  storageBucket: string;
  storagePath: string;
};

export type TeamPresetMemberSummary = {
  id: string;
  personaId: string | null;
  name: string;
  domain: string;
  skillDescription: string;
};

export type TeamPresetConnectionSummary = {
  id: string;
  fromId: string;
  toId: string;
  type: string;
};

export type TeamPresetSummary = {
  id: string;
  name: string;
  members: TeamPresetMemberSummary[];
  connections: TeamPresetConnectionSummary[];
};

// ─── Row mapping helpers ──────────────────────────────────────────────────────

type ProjectRow = {
  id: string;
  userId: string;
  name: string;
  idea: string;
  status: string;
  latestSessionId: string | null;
  projectState: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function hasRunHistoryInPayload(payloadJson: string | null | undefined): boolean {
  if (!payloadJson) {
    return false;
  }

  const payload = fromJson<Record<string, unknown> | null>(payloadJson, null);
  return Array.isArray(payload?.runHistory) && payload.runHistory.length > 0;
}

function resolveLatestSessionPayload(
  userId: string,
  row: ProjectRow,
): string | null {
  if (!row.latestSessionId) {
    return null;
  }

  const session = getDb()
    .prepare(
      `SELECT currentPayload FROM ThinkingGraphSession WHERE id = ? AND projectId = ? AND userId = ?`,
    )
    .get(row.latestSessionId, row.id, userId) as { currentPayload: string | null } | undefined;

  return session?.currentPayload ?? null;
}

function mapProjectSummary(row: ProjectRow): PromptProjectSummary {
  const projectState = fromJson<unknown>(row.projectState, null);
  const draft = asDraftProjectState(projectState);
  const meta = draft ?? extractProjectDraftMetaForPersistence(projectState);
  const latestSessionPayload = resolveLatestSessionPayload(row.userId, row);
  return {
    id: row.id,
    name: row.name,
    idea: row.idea,
    status: row.status,
    latestSessionId: row.latestSessionId,
    hasLatestRun: hasRunHistoryInPayload(latestSessionPayload),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    domainTags: meta?.domainTags ?? [],
    selectedTeamId: meta?.selectedTeamId ?? null,
  };
}

function mapProjectDetail(row: ProjectRow): PromptProjectDetail {
  const projectState = fromJson<unknown>(row.projectState, null);
  const draftState = asDraftProjectState(projectState);
  const meta = draftState ?? extractProjectDraftMetaForPersistence(projectState);
  const latestSessionPayload = resolveLatestSessionPayload(row.userId, row);
  return {
    id: row.id,
    name: row.name,
    idea: row.idea,
    status: row.status,
    latestSessionId: row.latestSessionId,
    hasLatestRun: hasRunHistoryInPayload(latestSessionPayload),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    domainTags: meta?.domainTags ?? [],
    selectedTeamId: meta?.selectedTeamId ?? null,
    projectState: (draftState ? null : (projectState as PlanningProject | null)) ?? null,
    draftState,
  };
}

function getProjectRow(userId: string, projectId: string): ProjectRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM PromptProject WHERE id = ? AND userId = ? AND deletedAt IS NULL`)
    .get(projectId, userId) as ProjectRow | undefined;
}

function syncLatestSessionIdeaPrompt(
  userId: string,
  projectId: string,
  latestSessionId: string,
  nextIdeaPrompt: string,
): void {
  const db = getDb();
  const session = db
    .prepare(`SELECT currentPayload FROM ThinkingGraphSession WHERE id = ? AND projectId = ? AND userId = ?`)
    .get(latestSessionId, projectId, userId) as { currentPayload: string | null } | undefined;

  const currentPayload = fromJson<unknown>(session?.currentPayload, null);
  const nextPayload = syncSessionPayloadIdeaPrompt(currentPayload, nextIdeaPrompt);

  db.prepare(
    `UPDATE ThinkingGraphSession SET ideaPrompt = ?, currentPayload = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND userId = ?`,
  ).run(nextIdeaPrompt, toJson(nextPayload), nowIso(), latestSessionId, projectId, userId);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function syncAppUser(userId: string, email: string): Promise<{ id: string; email: string }> {
  const db = getDb();
  const now = nowIso();

  // A plain SELECT-then-INSERT races: next build's parallel page-data-
  // collection workers (separate processes, separate connections) can both
  // see "no row yet" and both try to INSERT the same seed user, and the
  // loser hits a UNIQUE constraint on email. INSERT ... ON CONFLICT makes
  // this atomic at the database level instead of racing in application code.
  db.prepare(
    `INSERT INTO User (id, email, createdAt, updatedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, updatedAt = excluded.updatedAt`,
  ).run(userId, email, now, now);

  return { id: userId, email };
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<PromptProjectSummary[]> {
  const rows = getDb()
    .prepare(`SELECT * FROM PromptProject WHERE userId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC`)
    .all(userId) as ProjectRow[];
  return rows.map((row) => normalizeProjectSummary(mapProjectSummary(row)));
}

export async function createProject(
  userId: string,
  input: { name: string; idea: string },
): Promise<PromptProjectDetail> {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO PromptProject (id, userId, name, idea, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, userId, input.name.trim(), input.idea.trim(), now, now);
  return normalizeProjectDetail(mapProjectDetail(getProjectRow(userId, id)!));
}

export async function createDraftProject(
  userId: string,
  input: { idea: string; selectedTeamId?: string | null; domainTags?: string[] },
): Promise<PromptProjectDetail> {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  const projectState = {
    kind: "new_project_draft" as const,
    selectedTeamId: input.selectedTeamId ?? null,
    domainTags: (input.domainTags ?? []).slice(0, 3),
  };
  db.prepare(
    `INSERT INTO PromptProject (id, userId, name, idea, status, projectState, createdAt, updatedAt)
     VALUES (?, ?, 'Draft', ?, 'draft', ?, ?, ?)`,
  ).run(id, userId, input.idea.trim(), toJson(projectState), now, now);
  return normalizeProjectDetail(mapProjectDetail(getProjectRow(userId, id)!));
}

export async function findProjectByName(userId: string, name: string): Promise<boolean> {
  const row = getDb()
    .prepare(`SELECT id FROM PromptProject WHERE userId = ? AND name = ? AND deletedAt IS NULL`)
    .get(userId, name);
  return row !== undefined;
}

export async function getProjectById(
  userId: string,
  projectId: string,
): Promise<PromptProjectDetail | null> {
  const row = getDb()
    .prepare(`SELECT * FROM PromptProject WHERE id = ? AND userId = ?`)
    .get(projectId, userId) as ProjectRow | undefined;
  return row ? normalizeProjectDetail(mapProjectDetail(row)) : null;
}

// ─── Token usage / cost summaries ──────────────────────────────────────────────

export type SyntheticUsageSummary = {
  syntheticId: string;
  syntheticName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type UsageSummary = {
  bySynthetic: SyntheticUsageSummary[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
};

type UsageRow = {
  syntheticId: string;
  syntheticName: string;
  model: string | null;
  tokenUsage: string | null;
};

function summarizeUsageRows(rows: UsageRow[]): UsageSummary {
  const bySyntheticMap = new Map<string, SyntheticUsageSummary>();

  for (const row of rows) {
    const modelInfo = fromJson<{ model?: string } | null>(row.model, null);
    const usage = fromJson<TokenUsage | null>(row.tokenUsage, null);
    if (!usage) continue;

    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;
    const totalTokens = usage.totalTokens ?? promptTokens + completionTokens;
    const costUsd = calculateCostUsd(modelInfo?.model, usage) ?? 0;

    const existing = bySyntheticMap.get(row.syntheticId);
    if (existing) {
      existing.promptTokens += promptTokens;
      existing.completionTokens += completionTokens;
      existing.totalTokens += totalTokens;
      existing.costUsd += costUsd;
      existing.syntheticName = row.syntheticName;
    } else {
      bySyntheticMap.set(row.syntheticId, {
        syntheticId: row.syntheticId,
        syntheticName: row.syntheticName,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
      });
    }
  }

  const bySynthetic = [...bySyntheticMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const totals = bySynthetic.reduce(
    (acc, s) => ({
      totalPromptTokens: acc.totalPromptTokens + s.promptTokens,
      totalCompletionTokens: acc.totalCompletionTokens + s.completionTokens,
      totalTokens: acc.totalTokens + s.totalTokens,
      totalCostUsd: acc.totalCostUsd + s.costUsd,
    }),
    { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostUsd: 0 },
  );

  return { bySynthetic, ...totals };
}

// Reads directly from ThinkingGraphSyntheticOutput — every completed run's
// per-synthetic output, across every iteration, so this is the project's
// full lifetime usage, not just the latest run (see RunStats in
// run-context.tsx / useThinkingGraphRuntime.ts for the latest-run-only view).
export async function getProjectTokenUsage(userId: string, projectId: string): Promise<UsageSummary> {
  const rows = getDb()
    .prepare(
      `SELECT syntheticId, syntheticName, model, tokenUsage
       FROM ThinkingGraphSyntheticOutput
       WHERE projectId = ? AND userId = ?`,
    )
    .all(projectId, userId) as UsageRow[];
  return summarizeUsageRows(rows);
}

// Same as getProjectTokenUsage but across every project this user has —
// the app-wide lifetime total.
export async function getLifetimeTokenUsage(userId: string): Promise<UsageSummary> {
  const rows = getDb()
    .prepare(`SELECT syntheticId, syntheticName, model, tokenUsage FROM ThinkingGraphSyntheticOutput WHERE userId = ?`)
    .all(userId) as UsageRow[];
  return summarizeUsageRows(rows);
}

export async function updateProjectIdea(userId: string, projectId: string, idea: string): Promise<void> {
  const db = getDb();
  const project = getProjectRow(userId, projectId);
  const nextIdea = idea.trim();
  db.prepare(`UPDATE PromptProject SET idea = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL`).run(
    nextIdea,
    nowIso(),
    projectId,
    userId,
  );

  if (project?.latestSessionId) {
    const domainTags = extractProjectDraftMetaForPersistence(fromJson(project.projectState, null))?.domainTags ?? [];
    syncLatestSessionIdeaPrompt(userId, projectId, project.latestSessionId, composeProjectIdeaPrompt(nextIdea, domainTags));
  }
}

export async function updateProjectName(userId: string, projectId: string, name: string): Promise<void> {
  getDb()
    .prepare(`UPDATE PromptProject SET name = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL`)
    .run(name.trim(), nowIso(), projectId, userId);
}

export async function updateProjectStatus(
  userId: string,
  projectId: string,
  status: "draft" | "active",
): Promise<void> {
  getDb()
    .prepare(`UPDATE PromptProject SET status = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL`)
    .run(status, nowIso(), projectId, userId);
}

export async function updateProjectMetadata(
  userId: string,
  projectId: string,
  input: { idea?: string; selectedTeamId?: string | null; domainTags?: string[] },
): Promise<void> {
  const db = getDb();
  const record = getProjectRow(userId, projectId);
  if (!record) return;

  const nextIdea = input.idea === undefined ? record.idea : input.idea.trim();
  const projectState = fromJson<unknown>(record.projectState, null);
  const draftState = asDraftProjectState(projectState);
  const existingMeta = draftState ?? extractProjectDraftMetaForPersistence(projectState) ?? {
    selectedTeamId: null,
    domainTags: [],
  };
  const nextSelectedTeamId = input.selectedTeamId === undefined ? existingMeta.selectedTeamId : input.selectedTeamId;
  const nextDomainTags = input.domainTags === undefined ? existingMeta.domainTags : input.domainTags.slice(0, 3);

  const nextProjectState =
    record.status === "draft" || draftState
      ? { kind: "new_project_draft" as const, selectedTeamId: nextSelectedTeamId, domainTags: nextDomainTags }
      : {
          ...((projectState as Record<string, unknown> | null) ?? {}),
          _draftMeta: { selectedTeamId: nextSelectedTeamId, domainTags: nextDomainTags },
        };

  db.prepare(`UPDATE PromptProject SET idea = ?, projectState = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL`).run(
    nextIdea,
    toJson(nextProjectState),
    nowIso(),
    projectId,
    userId,
  );

  if (record.latestSessionId) {
    const nextIdeaPrompt = composeProjectIdeaPrompt(nextIdea, nextDomainTags);
    syncLatestSessionIdeaPrompt(userId, projectId, record.latestSessionId, nextIdeaPrompt);
  }
}

export async function updateDraftProjectState(
  userId: string,
  projectId: string,
  input: { selectedTeamId?: string | null; domainTags?: string[] },
): Promise<void> {
  const db = getDb();
  const record = getProjectRow(userId, projectId);
  if (!record) return;

  const projectState = fromJson<unknown>(record.projectState, null);
  const draftState = asDraftProjectState(projectState);
  const rawProjectState = projectState as Record<string, unknown> | null;

  if (record.status === "draft" || draftState) {
    const current = draftState ?? { kind: "new_project_draft" as const, selectedTeamId: null, domainTags: [] };
    const nextSelectedTeamId = input.selectedTeamId === undefined ? current.selectedTeamId : input.selectedTeamId;
    const nextDomainTags = input.domainTags === undefined ? current.domainTags : input.domainTags.slice(0, 3);

    db.prepare(`UPDATE PromptProject SET projectState = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL`).run(
      toJson({ ...current, selectedTeamId: nextSelectedTeamId, domainTags: nextDomainTags }),
      nowIso(),
      projectId,
      userId,
    );

    if (record.latestSessionId) {
      syncLatestSessionIdeaPrompt(
        userId,
        projectId,
        record.latestSessionId,
        composeProjectIdeaPrompt(record.idea, nextDomainTags),
      );
    }
  } else {
    const existingMeta = rawProjectState?._draftMeta as { selectedTeamId?: unknown; domainTags?: unknown } | undefined;
    const nextMeta = {
      selectedTeamId:
        input.selectedTeamId === undefined
          ? (typeof existingMeta?.selectedTeamId === "string" ? existingMeta.selectedTeamId : null)
          : input.selectedTeamId,
      domainTags:
        input.domainTags === undefined
          ? Array.isArray(existingMeta?.domainTags)
            ? (existingMeta.domainTags as unknown[]).filter((t): t is string => typeof t === "string")
            : []
          : input.domainTags.slice(0, 3),
    };

    db.prepare(`UPDATE PromptProject SET projectState = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deletedAt IS NULL`).run(
      toJson({ ...(rawProjectState ?? {}), _draftMeta: nextMeta }),
      nowIso(),
      projectId,
      userId,
    );

    if (record.latestSessionId) {
      syncLatestSessionIdeaPrompt(
        userId,
        projectId,
        record.latestSessionId,
        composeProjectIdeaPrompt(record.idea, nextMeta.domainTags),
      );
    }
  }
}

export async function softDeleteProject(userId: string, projectId: string): Promise<void> {
  const now = nowIso();
  getDb()
    .prepare(`UPDATE PromptProject SET deletedAt = ?, updatedAt = ? WHERE id = ? AND userId = ?`)
    .run(now, now, projectId, userId);
}

// ─── Files ────────────────────────────────────────────────────────────────────

type FileRow = {
  id: string;
  projectId: string;
  storageBucket: string;
  storagePath: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  includeInContext: number;
  createdAt: string;
  updatedAt: string;
};

function mapFile(row: FileRow): ProjectFileSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    originalName: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    includeInContext: toBool(row.includeInContext),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProjectFiles(userId: string, projectId: string): Promise<ProjectFileSummary[]> {
  const rows = getDb()
    .prepare(`SELECT * FROM ProjectFile WHERE projectId = ? AND userId = ? ORDER BY createdAt DESC`)
    .all(projectId, userId) as FileRow[];
  return rows.map(mapFile);
}

export async function listProjectFilesForContext(
  userId: string,
  projectId: string,
): Promise<ProjectFileContextRecord[]> {
  const rows = getDb()
    .prepare(`SELECT * FROM ProjectFile WHERE projectId = ? AND userId = ? AND includeInContext = 1 ORDER BY createdAt ASC`)
    .all(projectId, userId) as FileRow[];
  return rows.map((row) => ({ ...mapFile(row), storageBucket: row.storageBucket, storagePath: row.storagePath }));
}

export async function createProjectFile(
  userId: string,
  projectId: string,
  input: {
    storageBucket: string;
    storagePath: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    includeInContext?: boolean;
  },
): Promise<ProjectFileSummary> {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO ProjectFile (id, projectId, userId, storageBucket, storagePath, originalName, contentType, sizeBytes, includeInContext, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    userId,
    input.storageBucket,
    input.storagePath,
    input.originalName,
    input.contentType,
    input.sizeBytes,
    boolToInt(input.includeInContext, true),
    now,
    now,
  );
  return mapFile(db.prepare(`SELECT * FROM ProjectFile WHERE id = ?`).get(id) as FileRow);
}

export async function getProjectFileForUser(
  userId: string,
  projectId: string,
  fileId: string,
): Promise<ProjectFileContextRecord | null> {
  const row = getDb()
    .prepare(`SELECT * FROM ProjectFile WHERE id = ? AND projectId = ? AND userId = ?`)
    .get(fileId, projectId, userId) as FileRow | undefined;
  return row ? { ...mapFile(row), storageBucket: row.storageBucket, storagePath: row.storagePath } : null;
}

export async function deleteProjectFileRecord(userId: string, projectId: string, fileId: string): Promise<void> {
  getDb()
    .prepare(`DELETE FROM ProjectFile WHERE id = ? AND projectId = ? AND userId = ?`)
    .run(fileId, projectId, userId);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  projectId: string;
  currentPayload: string | null;
};

export async function getSessionPayload(sessionId: string): Promise<SyntheticGraphPayload | null> {
  const row = getDb()
    .prepare(`SELECT currentPayload FROM ThinkingGraphSession WHERE id = ?`)
    .get(sessionId) as { currentPayload: string | null } | undefined;
  return fromJson<SyntheticGraphPayload | null>(row?.currentPayload, null);
}

export async function getLatestProjectSession(
  userId: string,
  projectId: string,
): Promise<SyntheticGraphPayload | null> {
  const db = getDb();
  const project = getProjectRow(userId, projectId);
  if (!project?.latestSessionId) return null;

  const session = db
    .prepare(`SELECT * FROM ThinkingGraphSession WHERE id = ? AND projectId = ? AND userId = ?`)
    .get(project.latestSessionId, projectId, userId) as SessionRow | undefined;
  if (!session?.currentPayload) return null;

  const draftMeta = extractProjectDraftMetaForPersistence(fromJson(project.projectState, null));
  const payload = fromJson<Record<string, unknown>>(session.currentPayload, {});
  return {
    ...payload,
    ideaPrompt: composeProjectIdeaPrompt(project.idea, draftMeta?.domainTags ?? []),
  } as SyntheticGraphPayload;
}

export async function getProjectIdForSession(
  userId: string,
  sessionId: string | null | undefined,
): Promise<string | null> {
  if (!sessionId) return null;
  const row = getDb()
    .prepare(`SELECT projectId FROM ThinkingGraphSession WHERE id = ? AND userId = ?`)
    .get(sessionId, userId) as { projectId: string } | undefined;
  return row?.projectId ?? null;
}

export async function saveProjectSession(
  userId: string,
  projectId: string,
  payload: SyntheticGraphPayload,
): Promise<PromptProjectDetail | null> {
  const db = getDb();
  const sessionId = (payload as unknown as { sessionId: string }).sessionId;
  const project = getProjectRow(userId, projectId);
  if (!project) return null;

  const existingSession = db
    .prepare(`SELECT projectId, userId, currentPayload FROM ThinkingGraphSession WHERE id = ?`)
    .get(sessionId) as { projectId: string; userId: string; currentPayload: string | null } | undefined;

  if (existingSession && (existingSession.projectId !== projectId || existingSession.userId !== userId)) {
    throw new Error("Cannot save a thinking graph session from another project.");
  }

  const existingPayload = fromJson<Record<string, unknown> | null>(existingSession?.currentPayload, null);
  const rawPayload = payload as unknown as Record<string, unknown>;
  const mergedPayload: Record<string, unknown> = {
    ...rawPayload,
    ...(rawPayload.runHistory === undefined && existingPayload?.runHistory
      ? { runHistory: existingPayload.runHistory }
      : {}),
  };

  const synthetics = (mergedPayload.synthetics as Array<Record<string, unknown>>) ?? [];
  const edges = (mergedPayload.edges as Array<Record<string, unknown>>) ?? [];
  const runHistory = (mergedPayload.runHistory as Array<Record<string, unknown>>) ?? [];
  const transcript = (mergedPayload.transcript as Array<Record<string, unknown>>) ?? [];
  const outputsBySyntheticId =
    (mergedPayload.outputsBySyntheticId as Record<string, Record<string, unknown> | null>) ?? {};
  const conversationsBySyntheticId =
    (mergedPayload.conversationsBySyntheticId as Record<string, Array<Record<string, unknown>>>) ?? {};

  const latestRunId = (runHistory.at(-1)?.id as string | undefined) ?? null;
  const ideaPrompt = (mergedPayload.ideaPrompt as string) ?? "";
  const nextProjectIdea = selectProjectIdeaForSessionSave(project.idea, mergedPayload.ideaPrompt);
  const draftMeta = extractProjectDraftMetaForPersistence(fromJson(project.projectState, null));
  const synchronizedIdeaPrompt = composeProjectIdeaPrompt(nextProjectIdea, draftMeta?.domainTags ?? []);
  const synchronizedPayload: Record<string, unknown> = { ...mergedPayload, ideaPrompt: synchronizedIdeaPrompt };
  const now = nowIso();

  db.exec("BEGIN");
  try {
    // 1. Upsert session
    const sessionExists = db.prepare(`SELECT id FROM ThinkingGraphSession WHERE id = ?`).get(sessionId);
    if (sessionExists) {
      db.prepare(
        `UPDATE ThinkingGraphSession SET ideaPrompt = ?, provider = ?, orchestrator = ?, currentPayload = ?, projectSpec = ?, directorOutput = ?, runSummary = ?, updatedAt = ? WHERE id = ?`,
      ).run(
        synchronizedIdeaPrompt,
        toJson(mergedPayload.provider ?? null),
        toJson(mergedPayload.orchestrator ?? null),
        toJson(synchronizedPayload),
        toJson(mergedPayload.projectSpec ?? null),
        toJson(mergedPayload.directorOutput ?? null),
        toJson(mergedPayload.runSummary ?? null),
        now,
        sessionId,
      );
    } else {
      db.prepare(
        `INSERT INTO ThinkingGraphSession (id, projectId, userId, ideaPrompt, provider, orchestrator, currentPayload, projectSpec, directorOutput, runSummary, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sessionId,
        projectId,
        userId,
        synchronizedIdeaPrompt,
        toJson(mergedPayload.provider ?? null),
        toJson(mergedPayload.orchestrator ?? null),
        toJson(synchronizedPayload),
        toJson(mergedPayload.projectSpec ?? null),
        toJson(mergedPayload.directorOutput ?? null),
        toJson(mergedPayload.runSummary ?? null),
        now,
        now,
      );
    }

    // 2. Clear mutable relation tables for this session
    db.prepare(`DELETE FROM ThinkingGraphTranscriptEntry WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphConversationMessage WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphIntakeAnswer WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphIntakeQuestion WHERE sessionId = ?`).run(sessionId);
    db.prepare(
      `DELETE FROM ThinkingGraphClarificationAnswer WHERE preparedClarificationId IN (SELECT id FROM ThinkingGraphPreparedClarification WHERE sessionId = ?)`,
    ).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphPreparedClarification WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphPreparedDecision WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphResolvedDecision WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphEdge WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ThinkingGraphSynthetic WHERE sessionId = ?`).run(sessionId);

    // 3. Insert synthetics
    const insertSynthetic = db.prepare(
      `INSERT INTO ThinkingGraphSynthetic (id, sessionId, syntheticId, code, name, role, nodeRole, status, layoutX, layoutY, opinion, followUps, config, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of synthetics) {
      const layout = s.layout as Record<string, number>;
      insertSynthetic.run(
        newId(),
        sessionId,
        s.id as string,
        s.code as string,
        s.name as string,
        s.role as string,
        (s.nodeRole as string | undefined) ?? null,
        s.status as string,
        layout.x,
        layout.y,
        toJson(s.opinion ?? null),
        toJson(s.followUps ?? null),
        toJson(s.config ?? {}),
        now,
        now,
      );
    }

    // 4. Synthetic record IDs for FK references
    const syntheticRows = db
      .prepare(`SELECT id, syntheticId FROM ThinkingGraphSynthetic WHERE sessionId = ?`)
      .all(sessionId) as Array<{ id: string; syntheticId: string }>;
    const syntheticRecordIdBySyntheticId = new Map(syntheticRows.map((r) => [r.syntheticId, r.id]));

    // 5. Insert edges
    const insertEdge = db.prepare(
      `INSERT INTO ThinkingGraphEdge (id, sessionId, edgeId, fromSyntheticId, toSyntheticId, type, sourceHandle, targetHandle, waypoints, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of edges) {
      insertEdge.run(
        newId(),
        sessionId,
        e.id as string,
        e.from as string,
        e.to as string,
        e.type as string,
        (e.sourceHandle as string | undefined) ?? null,
        (e.targetHandle as string | undefined) ?? null,
        toJson(e.waypoints ?? null),
        now,
        now,
      );
    }

    // 6. Remove orphaned runs, upsert current runs
    const currentRunIds = runHistory.map((r) => r.id as string);
    if (currentRunIds.length > 0) {
      const placeholders = currentRunIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM ThinkingGraphRun WHERE sessionId = ? AND id NOT IN (${placeholders})`).run(
        sessionId,
        ...currentRunIds,
      );
    } else {
      db.prepare(`DELETE FROM ThinkingGraphRun WHERE sessionId = ?`).run(sessionId);
    }

    for (const run of runHistory) {
      const isLatest = run.id === latestRunId;
      const runId = run.id as string;
      const stats = run.stats as Record<string, unknown> | undefined;
      const completedAt = stats?.completedAt
        ? new Date(stats.completedAt as string).toISOString()
        : new Date(run.createdAt as string).toISOString();

      const exists = db.prepare(`SELECT id FROM ThinkingGraphRun WHERE id = ?`).get(runId);
      if (exists) {
        db.prepare(
          `UPDATE ThinkingGraphRun SET runSummary = ?, graphPayload = ?, updatedAt = ? WHERE id = ?`,
        ).run(toJson(run.summaryReport ?? null), isLatest ? toJson(mergedPayload) : null, now, runId);
      } else {
        db.prepare(
          `INSERT INTO ThinkingGraphRun (id, sessionId, projectId, userId, status, ideaPrompt, versionLabel, parentRunId, runReason, provider, orchestrator, projectSpec, directorOutput, runSummary, graphPayload, startedAt, completedAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          runId,
          sessionId,
          projectId,
          userId,
          (run.basePrompt as string | undefined) ?? ideaPrompt,
          (run.versionLabel as string | undefined) ?? null,
          (run.parentId as string | undefined) ?? null,
          (run.reason as string | undefined) ?? null,
          toJson(mergedPayload.provider ?? null),
          toJson(mergedPayload.orchestrator ?? null),
          toJson(mergedPayload.projectSpec ?? null),
          toJson(mergedPayload.directorOutput ?? null),
          toJson(run.summaryReport ?? null),
          isLatest ? toJson(mergedPayload) : null,
          now,
          completedAt,
          now,
          now,
        );
      }
    }

    // 7. Transcript (latest run only)
    if (latestRunId && transcript.length > 0) {
      const insertTranscript = db.prepare(
        `INSERT INTO ThinkingGraphTranscriptEntry (id, runId, sessionId, syntheticRecordId, syntheticId, entryIndex, type, text, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      transcript.forEach((entry, index) => {
        insertTranscript.run(
          newId(),
          latestRunId,
          sessionId,
          syntheticRecordIdBySyntheticId.get(entry.syntheticId as string) ?? null,
          entry.syntheticId as string,
          index,
          entry.type as string,
          entry.text as string,
          now,
        );
      });
    }

    // 8. Synthetic outputs (latest run only)
    const outputEntries = Object.entries(outputsBySyntheticId).filter(([, v]) => Boolean(v)) as [
      string,
      Record<string, unknown>,
    ][];
    if (latestRunId && outputEntries.length > 0) {
      const insertOutput = db.prepare(
        `INSERT OR IGNORE INTO ThinkingGraphSyntheticOutput
         (id, runId, sessionId, projectId, userId, syntheticRecordId, syntheticId, syntheticName, outputKind,
          summary, details, recommendation, topRecommendation, strategicOptions, conflictResolution,
          changesFromPrevious, appliedInputs, ignoredInputs, keyRisks, concernLevels, handoff, upstreamContext,
          directedHandoffs, operational, outputQuality, model, tokenUsage, raw, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const [syntheticId, output] of outputEntries) {
        const isAdvisor = "kind" in output;
        insertOutput.run(
          newId(),
          latestRunId,
          sessionId,
          projectId,
          userId,
          syntheticRecordIdBySyntheticId.get(syntheticId) ?? null,
          syntheticId,
          output.syntheticName as string,
          isAdvisor ? "advisor" : "synthetic",
          isAdvisor ? null : ((output.summary as string | null) ?? null),
          isAdvisor ? null : ((output.details as string | null) ?? null),
          isAdvisor ? null : ((output.recommendation as string | null) ?? null),
          isAdvisor ? ((output.topRecommendation as string | null) ?? null) : null,
          isAdvisor ? toJson(output.strategicOptions ?? null) : null,
          isAdvisor ? toJson(output.conflictResolution ?? null) : null,
          !isAdvisor ? toJson(output.changesFromPrevious ?? null) : null,
          !isAdvisor ? toJson(output.appliedInputs ?? null) : null,
          !isAdvisor ? toJson(output.ignoredInputs ?? null) : null,
          !isAdvisor ? toJson(output.keyRisks ?? null) : null,
          !isAdvisor ? toJson(output.concernLevels ?? null) : null,
          !isAdvisor ? ((output.handoff as string | null) ?? null) : null,
          !isAdvisor ? toJson(output.upstreamContext ?? null) : null,
          !isAdvisor ? toJson(output.directedHandoffs ?? null) : null,
          !isAdvisor ? toJson(output.operational ?? null) : null,
          !isAdvisor ? toJson(output.outputQuality ?? null) : null,
          toJson(output.model ?? null),
          toJson(output.tokenUsage ?? null),
          toJson(output.raw ?? null),
          now,
          now,
        );
      }
    }

    // 9. Conversation messages
    const insertMessage = db.prepare(
      `INSERT INTO ThinkingGraphConversationMessage (id, sessionId, projectId, userId, syntheticRecordId, syntheticId, messageId, role, text, includeInNextIteration, createdAt, insertedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [syntheticId, messages] of Object.entries(conversationsBySyntheticId)) {
      for (const message of messages) {
        insertMessage.run(
          newId(),
          sessionId,
          projectId,
          userId,
          syntheticRecordIdBySyntheticId.get(syntheticId) ?? null,
          syntheticId,
          message.id as string,
          message.role as string,
          message.text as string,
          boolToInt(message.includeInNextIteration as boolean | undefined, true),
          new Date(message.createdAt as string).toISOString(),
          now,
        );
      }
    }

    // 14. Update project
    db.prepare(
      `UPDATE PromptProject SET idea = ?, latestSessionId = ?, projectState = ?, updatedAt = ? WHERE id = ?`,
    ).run(
      nextProjectIdea,
      sessionId,
      toJson(mergeProjectStateWithDraftMeta(fromJson(project.projectState, null), synchronizedPayload)),
      now,
      projectId,
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const updated = getProjectRow(userId, projectId);
  if (!updated) return null;
  return mapProjectDetail(updated);
}

export async function getRunOutputs(
  userId: string,
  runId: string,
): Promise<Record<string, SyntheticOutputJson | null>> {
  const rows = getDb()
    .prepare(`SELECT * FROM ThinkingGraphSyntheticOutput WHERE runId = ? AND userId = ? ORDER BY createdAt ASC`)
    .all(runId, userId) as Array<Record<string, unknown>>;

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const isAdvisor = row.outputKind === "advisor";
    result[row.syntheticId as string] = isAdvisor
      ? {
          kind: "advisor",
          syntheticId: row.syntheticId,
          syntheticName: row.syntheticName,
          topRecommendation: row.topRecommendation ?? "",
          strategicOptions: fromJson(row.strategicOptions, []),
          conflictResolution: fromJson(row.conflictResolution, []),
          model: fromJson(row.model, { provider: "unknown", model: "unknown" }),
          tokenUsage: fromJson(row.tokenUsage, null),
          raw: fromJson(row.raw, null),
        }
      : {
          syntheticId: row.syntheticId,
          syntheticName: row.syntheticName,
          summary: row.summary ?? "",
          details: row.details ?? "",
          recommendation: row.recommendation ?? "",
          changesFromPrevious: fromJson(row.changesFromPrevious, []),
          appliedInputs: fromJson(row.appliedInputs, []),
          ignoredInputs: fromJson(row.ignoredInputs, []),
          keyRisks: fromJson(row.keyRisks, []),
          concernLevels: fromJson(row.concernLevels, {}),
          handoff: row.handoff,
          upstreamContext: fromJson(row.upstreamContext, []),
          directedHandoffs: fromJson(row.directedHandoffs, null),
          operational: fromJson(row.operational, null),
          outputQuality: fromJson(row.outputQuality, null),
          model: fromJson(row.model, null),
          tokenUsage: fromJson(row.tokenUsage, null),
          raw: fromJson(row.raw, null),
        };
  }
  return result as Record<string, SyntheticOutputJson | null>;
}

// ─── Chat messages ────────────────────────────────────────────────────────────

export async function persistChatMessage(
  sessionId: string,
  message: {
    syntheticId: string;
    messageId: string;
    role: "user" | "synthetic" | "system";
    text: string;
    includeInNextIteration: boolean;
    createdAt: string;
  },
): Promise<void> {
  const db = getDb();
  const session = db
    .prepare(`SELECT projectId, userId FROM ThinkingGraphSession WHERE id = ?`)
    .get(sessionId) as { projectId: string; userId: string } | undefined;
  if (!session) return;

  const syntheticRow = db
    .prepare(`SELECT id FROM ThinkingGraphSynthetic WHERE sessionId = ? AND syntheticId = ?`)
    .get(sessionId, message.syntheticId) as { id: string } | undefined;

  db.prepare(
    `INSERT OR IGNORE INTO ThinkingGraphConversationMessage (id, sessionId, projectId, userId, syntheticRecordId, syntheticId, messageId, role, text, includeInNextIteration, createdAt, insertedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    sessionId,
    session.projectId,
    session.userId,
    syntheticRow?.id ?? null,
    message.syntheticId,
    message.messageId,
    message.role,
    message.text,
    boolToInt(message.includeInNextIteration, true),
    new Date(message.createdAt).toISOString(),
    nowIso(),
  );
}

export async function getChatMessagesFromDb(
  sessionId: string,
  syntheticId: string,
): Promise<Array<{ id: string; role: string; text: string; includeInNextIteration: boolean; createdAt: string }>> {
  const rows = getDb()
    .prepare(
      `SELECT messageId, role, text, includeInNextIteration, createdAt FROM ThinkingGraphConversationMessage
       WHERE sessionId = ? AND syntheticId = ? ORDER BY createdAt ASC`,
    )
    .all(sessionId, syntheticId) as Array<{
    messageId: string;
    role: string;
    text: string;
    includeInNextIteration: number;
    createdAt: string;
  }>;

  return rows.map((r) => ({
    id: r.messageId,
    role: r.role,
    text: r.text,
    includeInNextIteration: toBool(r.includeInNextIteration),
    createdAt: r.createdAt,
  }));
}

// ─── Teams ────────────────────────────────────────────────────────────────────

function buildTeamSummary(teamId: string): { members: TeamPresetMemberSummary[]; connections: TeamPresetConnectionSummary[] } {
  const db = getDb();
  const members = toPlainRows(
    db.prepare(`SELECT id, personaId, name, domain, skillDescription FROM TeamPresetMember WHERE teamId = ?`).all(teamId) as TeamPresetMemberSummary[],
  );
  const connections = toPlainRows(
    db.prepare(`SELECT id, fromId, toId, type FROM TeamPresetConnection WHERE teamId = ?`).all(teamId) as TeamPresetConnectionSummary[],
  );
  return { members, connections };
}

export async function listTeamPresets(userId: string): Promise<TeamPresetSummary[]> {
  const teams = getDb()
    .prepare(`SELECT id, name, createdAt, updatedAt FROM TeamPreset WHERE userId = ? ORDER BY createdAt`)
    .all(userId) as Array<{ id: string; name: string; createdAt: string; updatedAt: string }>;

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    ...buildTeamSummary(team.id),
  }));
}

export async function hasTeamPresets(userId: string): Promise<boolean> {
  const row = getDb().prepare(`SELECT id FROM TeamPreset WHERE userId = ? LIMIT 1`).get(userId);
  return row !== undefined;
}

export async function createTeamPreset(userId: string, name: string): Promise<TeamPresetSummary> {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(`INSERT INTO TeamPreset (id, userId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    userId,
    name,
    now,
    now,
  );
  return { id, name, members: [], connections: [] };
}

export async function deleteTeamPreset(userId: string, teamId: string): Promise<void> {
  getDb().prepare(`DELETE FROM TeamPreset WHERE id = ? AND userId = ?`).run(teamId, userId);
}

export async function updateTeamPresetName(userId: string, teamId: string, name: string): Promise<void> {
  getDb()
    .prepare(`UPDATE TeamPreset SET name = ?, updatedAt = ? WHERE id = ? AND userId = ?`)
    .run(name, nowIso(), teamId, userId);
}

export async function addTeamMember(
  userId: string,
  teamId: string,
  input: {
    personaId?: string | null;
    name: string;
    domain: string;
    skillDescription: string;
  },
): Promise<TeamPresetMemberSummary> {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO TeamPresetMember (id, teamId, personaId, name, domain, skillDescription) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, teamId, input.personaId ?? null, input.name, input.domain, input.skillDescription);
  return toPlain(
    db.prepare(`SELECT id, personaId, name, domain, skillDescription FROM TeamPresetMember WHERE id = ?`).get(id) as TeamPresetMemberSummary,
  );
}

export async function removeTeamMember(userId: string, teamId: string, memberId: string): Promise<void> {
  getDb().prepare(`DELETE FROM TeamPresetMember WHERE id = ?`).run(memberId);
}

export async function updateTeamMember(
  userId: string,
  teamId: string,
  memberId: string,
  input: { name?: string; domain?: string; skillDescription?: string },
): Promise<TeamPresetMemberSummary> {
  const db = getDb();
  const current = db
    .prepare(`SELECT * FROM TeamPresetMember WHERE id = ?`)
    .get(memberId) as { name: string; domain: string; skillDescription: string };
  db.prepare(
    `UPDATE TeamPresetMember SET name = ?, domain = ?, skillDescription = ? WHERE id = ?`,
  ).run(
    input.name ?? current.name,
    input.domain ?? current.domain,
    input.skillDescription ?? current.skillDescription,
    memberId,
  );
  return toPlain(
    db.prepare(`SELECT id, personaId, name, domain, skillDescription FROM TeamPresetMember WHERE id = ?`).get(memberId) as TeamPresetMemberSummary,
  );
}

export async function seedDefaultTeams(userId: string): Promise<void> {
  const db = getDb();
  const has = db.prepare(`SELECT id FROM TeamPreset WHERE userId = ? LIMIT 1`).get(userId);
  if (has) return;

  const now = nowIso();
  // Members map to real persona ids in src/personas/business-startup.md — the
  // previous default (Product Manager/Backend/Frontend Engineer/Designer) used
  // names with no matching persona anywhere in the catalog, so personaId was
  // always null and launching a simulation with this team always failed.
  const defaultTeam = {
    name: "Startup Core Team",
    members: [
      { personaId: "founder", name: "Founder / CEO", domain: "Strategy", skillDescription: "Evaluates ideas from a first-principles founder lens — vision clarity, market fit, execution speed" },
      { personaId: "cto", name: "CTO", domain: "Engineering", skillDescription: "Reviews technical strategy, feasibility, and engineering org design" },
      { personaId: "product_manager", name: "Product Manager", domain: "Product", skillDescription: "Reviews product scope, prioritisation, and roadmap sequencing" },
      { personaId: "cmo", name: "CMO", domain: "Marketing", skillDescription: "Evaluates go-to-market strategy, brand positioning, and channel selection" },
    ],
  };

  const teamId = newId();
  db.prepare(`INSERT INTO TeamPreset (id, userId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`).run(
    teamId,
    userId,
    defaultTeam.name,
    now,
    now,
  );
  for (const m of defaultTeam.members) {
    db.prepare(
      `INSERT INTO TeamPresetMember (id, teamId, personaId, name, domain, skillDescription) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(newId(), teamId, m.personaId, m.name, m.domain, m.skillDescription);
  }
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export type PlanRecord = {
  id: string;
  projectId: string;
  runId: string;
  format: string;
  title: string;
  rawJson: unknown;
  generatedAt: string;
};

export type PlanExportRecord = {
  id: string;
  planId: string;
  destination: string;
  exportedAt: string;
  externalIds: string[];
  metadata: Record<string, unknown>;
};

function mapPlanRow(row: Record<string, unknown>): PlanRecord {
  return {
    id: row.id as string,
    projectId: row.projectId as string,
    runId: row.runId as string,
    format: row.format as string,
    title: row.title as string,
    rawJson: fromJson(row.rawJson, null),
    generatedAt: row.generatedAt as string,
  };
}

function mapPlanExportRow(row: Record<string, unknown>): PlanExportRecord {
  return {
    id: row.id as string,
    planId: row.planId as string,
    destination: row.destination as string,
    exportedAt: row.exportedAt as string,
    externalIds: fromJson(row.externalIds, []),
    metadata: fromJson(row.metadata, {}),
  };
}

export async function savePlan(
  userId: string,
  runId: string,
  format: string,
  title: string,
  rawJson: unknown,
): Promise<PlanRecord> {
  const db = getDb();
  const run = db
    .prepare(`SELECT id, projectId FROM ThinkingGraphRun WHERE id = ? AND userId = ?`)
    .get(runId, userId) as { id: string; projectId: string } | undefined;
  if (!run) throw new Error("Run not found");

  const id = newId();
  const generatedAt = nowIso();
  db.prepare(
    `INSERT INTO ThinkingGraphPlan (id, projectId, runId, format, title, rawJson, generatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, run.projectId, runId, format, title, toJson(rawJson), generatedAt);

  return { id, projectId: run.projectId, runId, format, title, rawJson, generatedAt };
}

export async function getPlansForRun(userId: string, runId: string): Promise<Record<string, unknown>> {
  const db = getDb();
  const run = db.prepare(`SELECT id FROM ThinkingGraphRun WHERE id = ? AND userId = ?`).get(runId, userId);
  if (!run) return {};

  const rows = db
    .prepare(`SELECT * FROM ThinkingGraphPlan WHERE runId = ? ORDER BY generatedAt DESC`)
    .all(runId) as Array<Record<string, unknown>>;

  const byFormat: Record<string, unknown> = {};
  for (const row of rows) {
    const format = row.format as string;
    if (!(format in byFormat)) byFormat[format] = fromJson(row.rawJson, null);
  }
  return byFormat;
}

export async function getLatestPlanForRun(
  userId: string,
  runId: string,
  format: string,
): Promise<PlanRecord | null> {
  const db = getDb();
  const run = db.prepare(`SELECT id FROM ThinkingGraphRun WHERE id = ? AND userId = ?`).get(runId, userId);
  if (!run) return null;

  const row = db
    .prepare(`SELECT * FROM ThinkingGraphPlan WHERE runId = ? AND format = ? ORDER BY generatedAt DESC LIMIT 1`)
    .get(runId, format) as Record<string, unknown> | undefined;
  return row ? mapPlanRow(row) : null;
}

export async function getLatestPlanExport(
  userId: string,
  planId: string,
  destination: string,
): Promise<PlanExportRecord | null> {
  const db = getDb();
  const plan = db.prepare(`SELECT id, runId FROM ThinkingGraphPlan WHERE id = ?`).get(planId) as
    | { id: string; runId: string }
    | undefined;
  if (!plan) return null;
  const run = db.prepare(`SELECT id FROM ThinkingGraphRun WHERE id = ? AND userId = ?`).get(plan.runId, userId);
  if (!run) return null;

  const row = db
    .prepare(
      `SELECT * FROM ThinkingGraphPlanExport WHERE planId = ? AND destination = ? ORDER BY exportedAt DESC LIMIT 1`,
    )
    .get(planId, destination) as Record<string, unknown> | undefined;
  return row ? mapPlanExportRow(row) : null;
}

export async function recordPlanExport(
  userId: string,
  planId: string,
  destination: string,
  externalIds: string[],
  metadata?: Record<string, unknown>,
): Promise<PlanExportRecord> {
  const db = getDb();
  const id = newId();
  const exportedAt = nowIso();
  db.prepare(
    `INSERT INTO ThinkingGraphPlanExport (id, planId, destination, exportedAt, externalIds, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, planId, destination, exportedAt, toJson(externalIds ?? []), toJson(metadata ?? {}));
  return { id, planId, destination, exportedAt, externalIds: externalIds ?? [], metadata: metadata ?? {} };
}
