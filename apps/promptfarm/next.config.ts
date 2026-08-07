import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Desktop packaging: Tauri spawns this as a self-contained Node server
  // (see apps/desktop/src-tauri), not a static export — API routes need a
  // real server. `standalone` bundles server.js + a pruned node_modules.
  output: "standalone",
  outputFileTracingRoot: path.join(appDir, "../.."),
  serverExternalPackages: ["axios"],
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: false },
      { source: "/projects", destination: "/tofo/projects", permanent: false },
      { source: "/projects/:path*", destination: "/tofo/projects/:path*", permanent: false },
      { source: "/teams", destination: "/tofo/teams", permanent: false },
      { source: "/teams/:path*", destination: "/tofo/teams/:path*", permanent: false },
      { source: "/thinking-graph", destination: "/tofo/thinking-graph", permanent: false },
      { source: "/thinking-graph/:path*", destination: "/tofo/thinking-graph/:path*", permanent: false },
      { source: "/settings", destination: "/tofo/settings", permanent: false },
      { source: "/settings/:path*", destination: "/tofo/settings/:path*", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/tofo/settings", destination: "/settings" },
      { source: "/tofo/settings/:path*", destination: "/settings/:path*" },
      { source: "/tofo/projects", destination: "/projects" },
      { source: "/tofo/projects/:path*", destination: "/projects/:path*" },
      { source: "/tofo/teams", destination: "/teams" },
      { source: "/tofo/teams/:path*", destination: "/teams/:path*" },
      { source: "/tofo/thinking-graph", destination: "/thinking-graph" },
      { source: "/tofo/thinking-graph/:path*", destination: "/thinking-graph/:path*" },
    ];
  },
};

export default nextConfig;
