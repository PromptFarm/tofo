export function buildThinkingGraphLaunchUrl(input: {
  projectId: string;
  autoPersonaIds?: string[];
  autostart: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.autostart) params.set("autostart", "true");
  if (input.autoPersonaIds?.length) params.set("personas", input.autoPersonaIds.join(","));
  const qs = params.toString();
  return `/tofo/projects/${input.projectId}${qs ? `?${qs}` : ""}`;
}
