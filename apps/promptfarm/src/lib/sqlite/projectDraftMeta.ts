export type DraftMeta = { selectedTeamId: string | null; domainTags: string[] };

export function asDraftProjectState(
  value: unknown,
): (DraftMeta & { kind: "new_project_draft" }) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "new_project_draft") return null;
  return {
    kind: "new_project_draft",
    selectedTeamId:
      typeof record.selectedTeamId === "string" && record.selectedTeamId.trim()
        ? record.selectedTeamId
        : null,
    domainTags: Array.isArray(record.domainTags)
      ? (record.domainTags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 3)
      : [],
  };
}

export function extractProjectDraftMetaForPersistence(projectState: unknown): DraftMeta | null {
  const draftState = asDraftProjectState(projectState);
  if (draftState) {
    return { selectedTeamId: draftState.selectedTeamId, domainTags: draftState.domainTags };
  }

  if (!projectState || typeof projectState !== "object" || Array.isArray(projectState)) {
    return null;
  }

  const raw = projectState as Record<string, unknown>;
  const meta = raw._draftMeta as { selectedTeamId?: unknown; domainTags?: unknown } | undefined;
  if (meta) {
    return {
      selectedTeamId:
        typeof meta.selectedTeamId === "string" && meta.selectedTeamId.trim()
          ? meta.selectedTeamId
          : null,
      domainTags: Array.isArray(meta.domainTags)
        ? (meta.domainTags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 3)
        : [],
    };
  }

  const selectedTeamId =
    typeof raw.selectedTeamId === "string" && raw.selectedTeamId.trim() ? raw.selectedTeamId : null;
  const domainTags = Array.isArray(raw.domainTags)
    ? (raw.domainTags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 3)
    : [];

  if (selectedTeamId !== null || domainTags.length > 0) {
    return { selectedTeamId, domainTags };
  }

  return null;
}

export function mergeProjectStateWithDraftMeta(
  existingProjectState: unknown,
  nextProjectState: Record<string, unknown>,
): Record<string, unknown> {
  const draftMeta = extractProjectDraftMetaForPersistence(existingProjectState);
  if (!draftMeta) {
    return nextProjectState;
  }

  return { ...nextProjectState, _draftMeta: draftMeta };
}
