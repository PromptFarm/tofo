import type { DraftProjectState, PromptProjectDetail, PromptProjectSummary } from "./db-client";

export function normalizeDomainTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string").slice(0, 3)
    : [];
}

export function normalizeSelectedTeamId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function extractDraftMeta(value: unknown): {
  domainTags: string[];
  selectedTeamId: string | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as {
    selectedTeamId?: unknown;
    domainTags?: unknown;
    _draftMeta?: unknown;
  };

  if (raw._draftMeta && typeof raw._draftMeta === "object" && !Array.isArray(raw._draftMeta)) {
    const meta = raw._draftMeta as {
      selectedTeamId?: unknown;
      domainTags?: unknown;
    };

    return {
      selectedTeamId: normalizeSelectedTeamId(meta.selectedTeamId),
      domainTags: normalizeDomainTags(meta.domainTags),
    };
  }

  return {
    selectedTeamId: normalizeSelectedTeamId(raw.selectedTeamId),
    domainTags: normalizeDomainTags(raw.domainTags),
  };
}

export function normalizeProjectSummary<T extends PromptProjectSummary>(project: T): T {
  const draftState = (project as T & { draftState?: DraftProjectState | null }).draftState;
  const projectState = (project as T & { projectState?: unknown }).projectState;
  const rawDomainTags = (project as T & { domainTags?: unknown }).domainTags;
  const rawSelectedTeamId = (project as T & { selectedTeamId?: unknown }).selectedTeamId;
  const meta =
    draftState
      ? {
          selectedTeamId: normalizeSelectedTeamId(draftState.selectedTeamId),
          domainTags: normalizeDomainTags(draftState.domainTags),
        }
      : extractDraftMeta(projectState);

  return {
    ...project,
    selectedTeamId:
      normalizeSelectedTeamId(rawSelectedTeamId) ??
      meta?.selectedTeamId ??
      null,
    domainTags:
      normalizeDomainTags(rawDomainTags).length > 0
        ? normalizeDomainTags(rawDomainTags)
        : meta?.domainTags ?? [],
  };
}

export function normalizeProjectDetail(project: PromptProjectDetail): PromptProjectDetail {
  return normalizeProjectSummary(project);
}
