"use client";

import Link from "next/link";
import {
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AppSection = "projects" | "teams" | "settings";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
};

const STORAGE_KEY = "pf-sidebar-collapsed";

export function AppSidebar({ active, defaultCollapsed = false }: { active: AppSection; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, String(next));
      document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }

  const navItems: NavItem[] = [
    {
      label: "Projects",
      href: "/tofo/projects",
      icon: FolderKanban,
      active: active === "projects",
    },
    {
      label: "Teams",
      href: "/tofo/teams",
      icon: Users,
      active: active === "teams",
    },
    {
      label: "Settings",
      href: "/tofo/settings",
      icon: Settings,
      active: active === "settings",
    },
  ];

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "sticky top-0 h-screen shrink-0 border-r border-[var(--surface-container)] bg-[var(--surface-lowest)] transition-[width] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-[200px]",
        )}
      >
        <div className="flex h-full flex-col px-3 py-5">
          <div className="mb-8 min-h-9">
            {collapsed ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex h-9 w-full items-center justify-center rounded-md text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-low)] hover:text-[var(--on-surface)]"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen size={16} />
              </button>
            ) : (
              <div className="relative">
                <Link
                  href="/tofo/projects"
                  className="inline-flex h-9 items-center rounded-md px-1 pr-10 text-[18px] font-semibold font-serif tracking-[0.08em] text-[var(--on-surface)] transition-colors hover:text-[var(--primary)]"
                  aria-label="TOFO home"
                >
                  TOFO
                </Link>

                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-md border border-[var(--surface-container)] bg-white text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-low)] hover:text-[var(--on-surface)]"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
            )}
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {navItems.map((item) => (
              <SidebarNavLink
                key={item.label}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </nav>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function SidebarNavLink({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "relative flex h-9 items-center rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0" : "gap-2.5 px-3",
        item.active
          ? "bg-[var(--primary-container)] text-[var(--primary)]"
          : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-low)] hover:text-[var(--on-surface)]",
      )}
    >
      {item.active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--primary)]" />
      )}
      <Icon size={16} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
