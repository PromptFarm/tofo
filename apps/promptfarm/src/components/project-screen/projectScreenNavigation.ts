export type ProjectScreenTab = "report" | "idea" | "synthetics";

const VALID_TABS = new Set<ProjectScreenTab>(["report", "idea", "synthetics"]);

export function parseProjectScreenTab(value: string | null | undefined): ProjectScreenTab {
  if (value && VALID_TABS.has(value as ProjectScreenTab)) {
    return value as ProjectScreenTab;
  }
  return "report";
}

type BuildProjectScreenSearchInput = {
  currentSearch: URLSearchParams | string;
  tab?: ProjectScreenTab;
  runId?: string | null;
};

export function buildProjectScreenSearch({
  currentSearch,
  tab = "report",
  runId,
}: BuildProjectScreenSearchInput): string {
  const params =
    typeof currentSearch === "string"
      ? new URLSearchParams(currentSearch)
      : new URLSearchParams(currentSearch.toString());

  if (tab === "report") {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }

  if (runId) {
    params.set("run", runId);
  } else {
    params.delete("run");
  }

  const next = params.toString();
  return next.length > 0 ? `?${next}` : "";
}
