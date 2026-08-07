export function stripLegacyProjectDomainTagsSuffix(value: string | null | undefined): string {
  return (value ?? "").replace(/\n\nProject domain tags:[\s\S]*$/, "").trim();
}

export function composeProjectIdeaPrompt(idea: string | null | undefined, domainTags: string[]): string {
  const cleanedIdea = stripLegacyProjectDomainTagsSuffix(idea);
  if (!cleanedIdea) return "";
  if (domainTags.length === 0) return cleanedIdea;
  return `${cleanedIdea}\n\nProject domain tags: ${domainTags.join(", ")}.`;
}

export function syncSessionPayloadIdeaPrompt(
  currentPayload: unknown,
  ideaPrompt: string,
): Record<string, unknown> | null {
  if (!currentPayload || typeof currentPayload !== "object" || Array.isArray(currentPayload)) {
    return null;
  }
  return { ...(currentPayload as Record<string, unknown>), ideaPrompt };
}

export function selectProjectIdeaForSessionSave(
  existingProjectIdea: string,
  payloadIdeaPrompt: unknown,
): string {
  const cleanedExistingIdea = stripLegacyProjectDomainTagsSuffix(existingProjectIdea ?? "").trim();
  if (cleanedExistingIdea) return cleanedExistingIdea;
  if (typeof payloadIdeaPrompt !== "string") return "";
  return stripLegacyProjectDomainTagsSuffix(payloadIdeaPrompt).trim();
}
