# Working on TOFO — agent guide

This file is for AI agents (Claude Code or otherwise) working in this repo. Read it before making changes — most of it exists because a real bug or a wasted round-trip taught it to us.

For product/architecture context, read [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/SYNTHETICS_GUIDE.md](docs/SYNTHETICS_GUIDE.md) first. Don't guess at how a subsystem works when it's already written down — several of the mistakes below happened because old, stale descriptions (in this repo's own history, and in unrelated project notes) got trusted instead of the actual code.

## Standing rule: docs move with the code

If a change alters user-visible behavior, a documented API/CLI flag, the build/release process, or a documented architectural claim, **update the relevant doc in the same PR** — not "later." Candidates, check every PR against this list:

- `README.md` — user-facing behavior, install/build instructions, badges
- `CHANGELOG.md` — add to `## [Unreleased]` for anything user-visible
- `docs/ARCHITECTURE.md` — anything about how the system is built, its known-bugs section
- `docs/SYNTHETICS_GUIDE.md` — anything about how synthetics/personas/edges work
- `docs/RELEASING.md` — anything about the release process itself
- This file — a new gotcha worth saving for the next agent

A PR that changes behavior without touching docs should be the exception you can justify, not the default.

## Hard-won gotchas

**SQLite (`apps/promptfarm/src/lib/sqlite/db.ts`, `db-client.ts`)**
- `PRAGMA busy_timeout` must be set *before* `PRAGMA journal_mode = WAL` on every connection open — the reverse order still races, because `journal_mode` itself touches the file and can lose a lock race before `busy_timeout` takes effect.
- Never do check-then-act (`SELECT` then `INSERT`) for anything that could run from multiple processes at once — `next build`'s parallel page-data-collection workers are real concurrent callers, not a hypothetical. Use `INSERT ... ON CONFLICT(...) DO UPDATE` instead.
- `next build` needs the DB file + schema to exist *before* its parallel workers start, or they race to create it. `scripts/warm-db.ts` (a `prebuild` npm hook) handles this — but only for callers that go through `pnpm run build`. `build-desktop.sh` calls `next build` directly and needs its own explicit call to the same script.

**Spawning subprocesses from Node (`modelProvider.ts`, the Claude CLI provider)**
- Never spawn `"claude"` (or any npm-global CLI) with plain `node:child_process`. On Windows it's installed as a `.cmd` shim, which `spawn()` can't execute without `shell: true` — and `shell: true` isn't safe here because CLI args carry user-authored text. Use `cross-spawn`, which resolves this without a shell.
- On macOS/Linux, GUI-launched apps (Tauri via Finder/Dock) don't inherit the PATH from the user's shell profile, where CLI tools actually live. Resolve the binary's real path through a login shell first (see `resolveClaudeCliPath` in `modelProvider.ts`, and `resolve_node_path` in `lib.rs` for the same pattern in Rust).
- Windows caps a process's whole command line at ~32K chars. Anything that can grow with accumulated context (a prompt, a system prompt, conversation history) goes over `stdin` or a temp file, never as an inline argv string — `spawn ENAMETOOLONG` is the symptom when this is missed. Check *every* argv-bound field for this, not just the obvious one — `--system-prompt` was missed on a first pass because only the main prompt looked user-sized at a glance.

**Tauri desktop shell (`apps/desktop/src-tauri/src/lib.rs`)**
- `.setup()` runs on the main UI thread. Anything slow (extracting the bundled archive, spawning the server, polling for it to come up) belongs on a background thread, or the window can't repaint and looks hung. Use `AppHandle::run_on_main_thread` to hand only the actual window mutation back to the main thread.
- A successful TCP connect does not mean the HTTP server can answer a request yet — do a real HTTP round-trip before navigating the webview to it, or you can hit "site can't be reached" on a fast machine.
- Nothing kills the spawned Node child on quit unless you explicitly wire a `RunEvent::Exit` handler — `Child` isn't killed on drop, and `app.exit()` tears the process down without dropping managed state. An orphaned server survives holding the SQLite lock and the port, breaking the next launch.
- Windows path APIs (`resource_dir()`, etc.) return `\\?\`-prefixed verbatim paths that Node's module resolution mishandles. Strip the prefix (`strip_verbatim_prefix`) before handing a path to `node`.

**CI (`.github/workflows/ci.yml`)**
- PR titles are checked against Conventional Commits with a specific allowed-types list: `feat fix docs style refactor perf test chore ci`. `build` is **not** in that list (a Dependabot-style `build(deps): ...` title will fail `lint-pr-title`) — use `chore` instead.
- `typecheck`, `lint`, `build`, and `test` are all required status checks — this repo learned the hard way that "the test suite is green" doesn't mean `next build` still works. Don't skip local verification of all four before opening a PR just because tests pass.
- Dependabot PRs bundling major-version bumps need to be verified locally (a Next.js 15→16 group bump broke the build silently before `typecheck`/`build` were wired into CI) — don't merge on green alone if the diff includes a major bump; check what actually changed.

**Releasing** — see [docs/RELEASING.md](docs/RELEASING.md). The short version: tag `desktop-vX.Y.Z`, the workflow builds and drafts a release, you publish it manually. Re-running the workflow against an already-published release silently resets it back to draft (hardcoded in `release.yml`) — republish after.

## Workflow conventions

- One concern per PR. A bug fix doesn't ride along with a refactor or a docs pass unless they're genuinely the same change.
- PR titles follow Conventional Commits (see the allowed-types list above); CI enforces this.
- Verify locally before opening a PR: `pnpm --dir apps/promptfarm exec tsc --noEmit`, `pnpm --dir apps/promptfarm run lint`, `pnpm --dir apps/promptfarm run build`, `pnpm --dir apps/promptfarm test`.
- Don't invent product facts from memory or from stale docs — grep the actual code. Several fixes this session existed only because an assumption ("the default team is Manager/Designer/Engineer/QA...") turned out to not match what the code actually does.
