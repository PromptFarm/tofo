import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { DemoPlaybackProvider } from "@/lib/planning/demo-playback-store";
import { ThemeProvider } from "@/lib/theme-context";
import { Toaster } from "sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TOFO — Thousand Opinions For One",
    template: "%s · TOFO",
  },
  description:
    "Describe your idea. Get a team of AI experts who analyze it from every angle, debate each other, and give you a structured Go/No-Go in minutes.",
  keywords: [
    "AI product validation",
    "idea validation",
    "multi-agent AI",
    "startup advisor",
    "go no-go decision",
    "product team simulation",
    "AI experts",
    "solo founder tool",
    "product decision",
    "synthetic team",
  ],
  authors: [{ name: "TOFO" }],
  creator: "TOFO",
  metadataBase: new URL("https://tofo.app"),
  openGraph: {
    title: "TOFO — Thousand Opinions For One",
    description:
      "Describe your idea. Get a team of AI experts who analyze it from every angle, debate each other, and give you a structured Go/No-Go in minutes.",
    url: "https://tofo.app",
    siteName: "TOFO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TOFO — Thousand Opinions For One",
    description:
      "Describe your idea. Get a team of AI experts who analyze it from every angle, debate each other, and give you a structured Go/No-Go in minutes.",
  },
};

// Inline script: apply saved theme before React hydrates to prevent flash.
const themeScript = `
  try {
    var t = localStorage.getItem('pf-theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
`;

const rootFontVars = {
  "--font-manrope": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--font-inter": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--font-jetbrains-mono":
    '"SFMono-Regular", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace',
} as CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className="h-full antialiased"
      style={rootFontVars}
    >
      <head>
        {/* Runs before React hydrates — prevents theme flash */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme FOUC prevention */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <DemoPlaybackProvider>
            {children}
            <Toaster position="top-right" richColors />
          </DemoPlaybackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
