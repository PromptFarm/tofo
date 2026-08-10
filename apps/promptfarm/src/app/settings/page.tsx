import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAppUser } from "@/lib/auth";
import { getLifetimeTokenUsage } from "@/lib/db-client";
import { getSidebarCollapsed } from "@/lib/sidebar";
import { getModelProviderSettings } from "@/lib/sqlite/appSettings";
import { SettingsPageClient } from "./SettingsPageClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, sidebarCollapsed] = await Promise.all([requireAppUser(), getSidebarCollapsed()]);
  const settings = getModelProviderSettings();
  const lifetimeUsage = await getLifetimeTokenUsage(user.id);

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--on-surface)] flex overflow-hidden">
      <AppSidebar active="settings" defaultCollapsed={sidebarCollapsed} />
      <SettingsPageClient initialSettings={settings} lifetimeUsage={lifetimeUsage} />
    </div>
  );
}
