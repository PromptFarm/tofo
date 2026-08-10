# Changelog

All notable changes to TOFO are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Token usage and cost tracking: per-synthetic and per-project totals (persisted across sessions, in the Report tab), plus a lifetime total across every project in Settings
- Startup progress indicator (replaces the static "Starting…" placeholder) on desktop launch

### Fixed
- Desktop app could hang on launch (server startup ran on the main UI thread) and could leave an orphaned server process running after quit
- "Site can't be reached" could appear on a fast first launch — the app now waits for a real HTTP response, not just an open port
- Claude CLI provider could fail with `spawn ENOENT` (Windows npm `.cmd` shims, macOS/Linux PATH) or `spawn ENAMETOOLONG` on re-runs with a lot of accumulated context
- SQLite "database is locked" and a `User.email` constraint race, both only reproducible under `next build`'s parallel workers

## [0.1.0] — 2026-08-07

Initial open-source release.

### Added
- Graph canvas: describe an idea, a Director agent proposes a team from a ~90-persona catalog (business/startup, game dev, education, health/fitness), connect them with structural/tension/oversight/amplification edges
- Simulation engine: dependency-ordered agent runs, partial re-run when you edit a node mid-conversation, run versioning/history
- Three model providers: local Ollama, Anthropic API key, or your `claude` CLI subscription — picked once in Settings, stored locally
- Local SQLite persistence, no cloud backend, no account
- Native desktop shell (Windows portable `.zip`, macOS `.dmg`, Linux `.AppImage`) with a bundled portable Node.js runtime — no system dependencies required
- Final Report: executive brief, per-agent summaries, decision matrix, conflict map

[Unreleased]: https://github.com/PromptFarm/tofo/compare/desktop-v0.1.0...HEAD
[0.1.0]: https://github.com/PromptFarm/tofo/releases/tag/desktop-v0.1.0
