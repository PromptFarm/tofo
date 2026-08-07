import { AppSidebar } from "@/components/layout/AppSidebar";
import { requireAppUser } from "@/lib/auth";
import { getSidebarCollapsed } from "@/lib/sidebar";
import { getModelProviderSettings } from "@/lib/sqlite/appSettings";
import { SettingsPageClient } from "./SettingsPageClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [, sidebarCollapsed] = await Promise.all([requireAppUser(), getSidebarCollapsed()]);
  const settings = getModelProviderSettings();

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--on-surface)] flex overflow-hidden">
      <AppSidebar active="settings" defaultCollapsed={sidebarCollapsed} />
      <SettingsPageClient initialSettings={settings} />
    </div>
  );
}
