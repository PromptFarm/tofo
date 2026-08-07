"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  href?: string;
}

export interface SidebarProps {
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
  navItems: NavItem[];
  bottomItems?: NavItem[];
  bottomAction?: React.ReactNode;
}

export function Sidebar({
  logo,
  title,
  subtitle,
  navItems,
  bottomItems,
  bottomAction,
}: SidebarProps) {
  return (
    <aside className="w-60 shrink-0 bg-surface-low h-screen sticky top-0 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        {logo ? (
          logo
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[linear-gradient(135deg,#005ac2,#004fab)]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-on-primary"
              >
                <path
                  d="M8 1l2.1 4.3L15 6.2l-3.5 3.4.8 4.9L8 12.3 3.7 14.5l.8-4.9L1 6.2l4.9-.9L8 1z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <div>
              <span className="font-display font-bold text-on-surface text-sm leading-tight block">
                PromptFarm
              </span>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant leading-tight">
                The Serene Architect
              </span>
            </div>
          </div>
        )}

        {title && (
          <div className="mt-5">
            <h2 className="font-display font-bold text-on-surface text-base">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-on-surface-variant mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-1 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href || "#"}
              className={`relative flex items-center gap-2.5 px-4 py-2 rounded-md transition-all duration-200 ease-out ${
                item.active
                  ? "bg-primary-container/30 text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {item.active && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-full" />
              )}
              <Icon size={16} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-5 space-y-1">
        {bottomAction && <div className="px-1 mb-3">{bottomAction}</div>}

        {bottomItems?.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href || "#"}
              className="flex items-center gap-2.5 px-4 py-2 rounded-md text-on-surface-variant hover:bg-surface-container transition-all duration-200 ease-out"
            >
              <Icon size={16} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
