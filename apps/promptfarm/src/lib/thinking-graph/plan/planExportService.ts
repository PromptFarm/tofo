import "server-only";
import { getCurrentAppUser } from "@/lib/auth";
import {
  getLatestPlanExport,
  recordPlanExport,
  type PlanExportRecord,
} from "@/lib/db-client";

export type ExportDestination = "jira" | "notion" | "salesforce" | "pdf";

type PreviousExportInfo =
  | { hasPrevious: false }
  | { hasPrevious: true; exportedAt: string; externalIds: string[]; itemCount: number };

type ExportResult =
  | { requiresConfirmation: true; previousExport: PlanExportRecord }
  | { requiresConfirmation: false; externalIds: string[] };

export async function checkPreviousExport(
  planId: string,
  destination: ExportDestination,
): Promise<PreviousExportInfo> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Unauthorized");

  const previous = await getLatestPlanExport(user.id, planId, destination);
  if (!previous) return { hasPrevious: false };

  return {
    hasPrevious: true,
    exportedAt: previous.exportedAt,
    externalIds: previous.externalIds,
    itemCount: previous.externalIds.length,
  };
}

export async function exportPlan(
  planId: string,
  destination: ExportDestination,
  force = false,
): Promise<ExportResult> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Unauthorized");

  const previous = await getLatestPlanExport(user.id, planId, destination);
  if (previous && !force) {
    return { requiresConfirmation: true, previousExport: previous };
  }

  const externalIds = await doExport(planId, destination);
  await recordPlanExport(user.id, planId, destination, externalIds);
  return { requiresConfirmation: false, externalIds };
}

// Dispatcher for destination-specific integrations (not yet implemented).
async function doExport(_planId: string, destination: ExportDestination): Promise<string[]> {
  switch (destination) {
    case "jira":
    case "notion":
    case "salesforce":
    case "pdf":
      throw new Error(`Export to ${destination} is not yet implemented`);
  }
}
