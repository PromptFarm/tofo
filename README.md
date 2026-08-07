# TOFO — Thousand Opinions For One

TOFO is a simulated team for solo builders. You describe an idea, populate a graph canvas with synthetic teammates — Manager, Designer, Engineer, QA, Marketing, Finance, Legal — connect them with dependencies and conflicts, and run a simulation. Each agent reasons through your idea from its own domain, in dependency order, and produces an opinion: summary, risks, recommendation. You can chat with any individual agent to push back or dig deeper, and TOFO regenerates the affected part of the graph. At the end you get a Final Report: executive brief, per-agent summaries, a decision matrix, and a map of where your agents disagree.

It runs as a native desktop app on your own machine, talking to Claude (your subscription or an API key) or a local Ollama model — no account, no cloud backend.

[![CI](https://github.com/PromptFarm/tofo/actions/workflows/ci.yml/badge.svg)](https://github.com/PromptFarm/tofo/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/PromptFarm/tofo)](https://github.com/PromptFarm/tofo/releases/latest)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
[![Downloads](https://img.shields.io/github/downloads/PromptFarm/tofo/total)](https://github.com/PromptFarm/tofo/releases)

## Download

**macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/PromptFarm/tofo/main/install.sh | sh
```

**Windows** (PowerShell):
```powershell
irm https://raw.githubusercontent.com/PromptFarm/tofo/main/install.ps1 | iex
```

Or grab it manually from [the latest release](https://github.com/PromptFarm/tofo/releases/latest):

- **Windows** — `TOFO-<version>-windows-x64.zip`. Extract it anywhere and run `TOFO.exe`. No installer, no admin rights.
- **macOS** — `TOFO-<version>.dmg`. Open it and drag TOFO to Applications.
- **Linux** — `TOFO-<version>.AppImage`. Make it executable (`chmod +x`) and run it. No installation.

On first launch, TOFO asks which model to use: a local Ollama model, an Anthropic API key, or your `claude` CLI subscription. Nothing is sent anywhere until you choose.

## Building from source

Requirements: [pnpm](https://pnpm.io) 9, [Rust](https://rustup.rs), Node.js 24.

```bash
pnpm install
pnpm --dir apps/desktop tauri dev      # run in dev mode
bash apps/desktop/scripts/package-portable-zip.sh   # build a portable Windows zip
```

macOS builds go through `pnpm --dir apps/desktop exec tauri build --bundles dmg`, Linux through `--bundles appimage` — see [.github/workflows/release.yml](.github/workflows/release.yml) for the exact CI steps.

## How it's built

- `apps/desktop` — the native shell (Tauri + Rust). Spawns the app below as a background server and shows it in a window.
- `apps/promptfarm` — the actual app (Next.js). The graph canvas, the simulation engine, the local SQLite database — everything lives here. It also runs standalone as a normal web app (`pnpm --dir apps/promptfarm dev`) if you don't want the desktop shell.

More detail, including why it's structured this way, in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Building a graph and want your agents to actually disagree with each other instead of echoing the same generic opinion? See [docs/SYNTHETICS_GUIDE.md](docs/SYNTHETICS_GUIDE.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs welcome.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
