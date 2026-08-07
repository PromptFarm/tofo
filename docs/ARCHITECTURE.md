# Architecture

TOFO is two pieces glued together: a native shell and the actual app.

```
apps/
  desktop/      Rust + Tauri — the window, the tray icon, spawning the server
  promptfarm/   Next.js — the graph UI, the simulation engine, the database
```

If you're only interested in the product logic (the graph, the simulation, the agents), you can ignore `apps/desktop` entirely and run `apps/promptfarm` as a normal web app: `pnpm --dir apps/promptfarm dev`. The desktop shell exists to make that same app installable and runnable without a terminal.

## Why a shell around a web app, not a "real" native app

`apps/promptfarm` is a full Next.js server — ~35 API routes, SSE streaming for live simulation progress, a SQLite-backed domain model. Rewriting that as native Rust would mean re-implementing the simulation engine (topological graph ordering, partial re-run, versioning, structured-output enforcement against an LLM) in a second language, permanently. That cost didn't buy anything the current setup doesn't already have, so it was a deliberate non-goal.

Instead: `apps/desktop`'s Rust code spawns `apps/promptfarm`'s compiled Next.js server as a background process on `127.0.0.1:3100`, waits for it to respond, and points the window at it. From the browser engine's perspective it's just a local website. The window chrome, tray icon, and native packaging are the only things Rust is responsible for.

## apps/desktop (the shell)

`src-tauri/src/lib.rs` is the whole thing. On startup it:

1. Extracts a bundled archive (`next-standalone.tar.gz`) into the OS's per-user app-data directory — this contains the built Next.js server, its `node_modules`, and a portable Node.js runtime. Extraction only happens once (or again if the app version changed); subsequent launches are near-instant.
2. Spawns the bundled `node` against the extracted `server.js`.
3. Waits (up to 30s) for the server to answer on port 3100, then points the window at it.
4. If that fails, replaces the loading screen with a plain-language error instead of hanging forever on a spinner — see `show_startup_error()`.

### Why bundled, not installed

Windows and macOS builds both ship as **portable, no-installer archives** — a `.zip` you extract and run on Windows, a `.dmg` you drag to Applications on macOS. Nothing needs admin rights, nothing writes to the registry.

The Windows path used to be an NSIS installer. It was dropped after `makensis.exe` (the NSIS compiler Tauri shells out to) turned out not to be long-path-aware: many of this app's file paths — deeply nested `node_modules` files, and Next.js's own `[dynamicSegment]` route folders — exceed Windows' classic 260-character `MAX_PATH` once combined with an absolute build path, and NSIS's per-file bundling silently failed to open them. Packaging the whole build as a single archive sidesteps the problem entirely (one short path, not thousands of long ones), which is also just a simpler, more transparent distribution model. See `apps/desktop/scripts/package-portable-zip.sh`.

Node.js itself is bundled the same way (`apps/promptfarm/scripts/fetch-portable-node.sh` downloads a portable, no-installer Node build at compile time) — an end user should never need to have installed anything to run TOFO.

## apps/promptfarm (the app)

Next.js 16, React 19, `@xyflow/react` for the graph canvas, Tailwind for styling.

- **`src/components/thinking-graph/`** — the graph canvas itself: nodes, edges, the role palette, the simulation run panel, the Final Report modal. State lives in Zustand stores and dedicated hooks, not in the top-level component.
- **`src/lib/thinking-graph/server/`** — the simulation engine (`orchestrator.ts` and friends): resolves the graph's dependency order, runs each synthetic agent's turn, enforces structured JSON output against a schema, handles partial re-runs when you edit a node mid-conversation.
- **`src/lib/sqlite/`** — persistence. A single local SQLite file (via Node's built-in `node:sqlite`, no ORM) under the OS app-data directory in the desktop build, or `.promptfarm/promptfarm.db` when run as a plain web app. No cloud database, no external service.
- **`src/app/settings/`** — the model provider picker (below).

### Model providers

Three backends, one interface (`ModelProvider` in `modelProvider.ts`):

| Provider | What it does | Setup |
|---|---|---|
| `ollama` | Calls a local Ollama server (`http://localhost:11434` by default) | Install Ollama, pull a model |
| `claude` | Direct `fetch` to `api.anthropic.com`, pay-per-token | Anthropic API key |
| `claude-cli` | Spawns your installed `claude` CLI as a subprocess | `claude` CLI logged into a Claude subscription |

The choice is made once, in Settings, and stored in a single-row `AppSetting` SQLite table — not an environment variable. First launch redirects here until something is picked (`isModelProviderConfigured()` in `src/app/projects/page.tsx`).

**The `claude-cli` provider is the trickiest of the three**, because it shells out to another CLI rather than calling an HTTP API directly:

- The prompt is written to the child process's **stdin**, not passed as a command-line argument. A synthetic agent's accumulated conversation context routinely exceeds Windows' ~32K character command-line limit; stdin has no such limit. (`system-prompt` and the JSON schema are still passed as arguments — smaller, and the CLI doesn't offer a file-based alternative for them.)
- `stdio` must explicitly set stdin to a pipe (not inherited/ignored) — otherwise the CLI waits ~3 seconds for stdin input that will never come before giving up and proceeding anyway, adding needless latency to every call.
- On failure, the CLI's structured error (e.g. an account/org policy restriction) arrives as JSON on **stdout** with a non-zero exit code, not on stderr — code that only surfaces `stderr` on failure will show a useless bare exit code instead of the actual reason. See `describeClaudeCliFailure()`.
- Structured output uses `--json-schema` (`{"type":"object", ...}` matching the schema built in `orchestrator.ts`) — the CLI returns a `structured_output` field on success, no manual JSON-parsing-and-retry needed.

## Logs & data location

TOFO keeps everything in the OS's per-user app-data directory, under the identifier `com.tofo.desktop`:

| | Windows | macOS |
|---|---|---|
| Logs (`next-server.log`, app log) | `%LOCALAPPDATA%\com.tofo.desktop\logs\` | `~/Library/Logs/com.tofo.desktop/` |
| Extracted server (Node runtime, `next-standalone.tar.gz` unpacked) | `%LOCALAPPDATA%\com.tofo.desktop\next-standalone\` | `~/Library/Application Support/com.tofo.desktop/next-standalone/` |
| SQLite database | `...\next-standalone\apps\promptfarm\.promptfarm\promptfarm.db` (under the path above) | same, under the path above |

Deleting that folder resets TOFO to a clean first-run state (equivalent to a fresh install).

## What's mocked, honestly

See the README's status table. The graph, simulation ordering, persistence, all three model providers, agent opinions, and the Final Report are real — driven by actual model output through typed data structures (`SyntheticOutputJson`, `RunSummaryReport` in `src/lib/thinking-graph/server/types.ts`), not hardcoded placeholder strings.

Two exceptions, both scoped and identifiable:

- `src/lib/planning/mock-project.ts` seeds fake data for the `/idea-builder` and `/plan-builder` pages — earlier prototypes that predate the main `/projects` → graph → simulation flow and aren't wired to it. If you're working on the main flow, this file is irrelevant.
- The re-run-after-clarification path doesn't reliably instruct the model to revise its prior output — see the open issue.

## Known bugs (fixed and open)

**Fixed (2026-08-07):** the simulation engine used to stagger each agent's start by a fixed `agentIndex * 5000ms` delay as a stand-in for real dependency ordering. With 3+ agents this routinely raced the "upstream readiness" check — an agent still waiting out its own artificial delay looked identical to one that would never run, so a later agent could get a "waiting for upstream" placeholder instead of running for real. Fixed by starting all agents in the same tick instead of staggering them (see the comment above the `Promise.all` in `orchestrator.ts` for the full explanation).

**Open:** re-running a synthetic after answering a clarification question in chat sends the model a generic "describe your role" prompt instead of an instruction to revise its previous output in light of the clarification. The prompt-construction path for this case needs to actually branch on "is this a clarification-triggered re-run" rather than falling through to the default prompt. See the failing `runThinkingGraphRerunUsesChatClarificationTest` in `thinkingGraphServer.integration.test.ts` for a reproduction.
