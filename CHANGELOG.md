# Changelog

All notable changes to TOFO are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-08-07

Initial open-source release.

### Added
- Graph canvas: describe an idea, populate it with synthetic teammates (Manager, Designer, Engineer, QA, Marketing, Finance, Legal), connect them with dependency/conflict/influence/validation edges
- Simulation engine: dependency-ordered agent runs, partial re-run when you edit a node mid-conversation, run versioning/history
- Three model providers: local Ollama, Anthropic API key, or your `claude` CLI subscription — picked once in Settings, stored locally
- Local SQLite persistence, no cloud backend, no account
- Native desktop shell (Windows portable `.zip`, macOS `.dmg`) with a bundled portable Node.js runtime — no system dependencies required
- Final Report: executive brief, per-agent summaries, decision matrix, conflict map

[Unreleased]: https://github.com/PromptFarm/tofo/compare/desktop-v0.1.0...HEAD
[0.1.0]: https://github.com/PromptFarm/tofo/releases/tag/desktop-v0.1.0
