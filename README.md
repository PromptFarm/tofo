# TOFO — Thousand Opinions For One

TOFO is a simulated team for solo builders. You describe an idea, and a Director agent reads it and proposes a small team of synthetic teammates suited to it — pulled from a catalog spanning business/startup, game dev, education, and health/fitness roles, each with a visible reason and confidence score. Populate the graph canvas with them (or add your own), connect them with dependencies and conflicts, and run a simulation. Each agent reasons through your idea from its own domain, in dependency order, and produces an opinion: summary, risks, recommendation. You can chat with any individual agent to push back or dig deeper, and TOFO regenerates the affected part of the graph. At the end you get a Final Report: executive brief, per-agent summaries, a decision matrix, and a map of where your agents disagree.

It runs as a native desktop app on your own machine, talking to Claude (your subscription or an API key) or a local Ollama model — no account, no cloud backend.

TOFO simulates a team so you can find blind spots fast — it's not a replacement for evidence from real users, customers, or domain experts. Treat a run as a starting hypothesis to go validate, not a verdict.

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

### First-launch warning (unsigned build)

TOFO isn't code-signed or notarized — that requires a paid Apple/Microsoft developer account, which this project doesn't have. Your OS will warn you the first time you run it. This is expected; it's not a sign anything is wrong with the download.

- **Windows:** SmartScreen shows "Windows protected your PC." Click **More info**, then **Run anyway**.
- **macOS:** Gatekeeper says the app "is damaged and can't be opened" if you downloaded it via a browser (this is Gatekeeper's message for "not notarized," not an actual corrupt file). The `install.sh` one-liner above avoids this. If you downloaded the `.dmg` manually instead, run this once after moving TOFO to Applications:
  ```bash
  xattr -cr /Applications/tofo-desktop.app
  ```

## Building from source

Requirements: [pnpm](https://pnpm.io) 9, [Rust](https://rustup.rs), Node.js 24, and each OS's native webview toolchain (WebView2 on Windows — usually already installed; Xcode Command Line Tools on macOS; `libwebkit2gtk-4.1-dev` and friends on Linux, see [.github/workflows/release.yml](.github/workflows/release.yml) for the exact package list).

`main` is where active development happens — it's required to pass CI (typecheck, lint, build, full test suite) before anything merges, but it's a moving target and isn't necessarily what any given release was built from. **To reproduce a specific release exactly, build from its tag** (releases are tagged `desktop-vX.Y.Z`, e.g. `desktop-v0.1.0`), not from `main`:

```bash
git clone https://github.com/PromptFarm/tofo.git
cd tofo
git checkout desktop-v0.1.0   # or: git tag --list "desktop-v*"  to see all releases
pnpm install
pnpm --dir apps/desktop tauri dev      # run in dev mode, live-reloading
```

A build from a release's exact tag runs the exact same code as that release's binaries, just without hitting the [unsigned-build OS warning](#first-launch-warning-unsigned-build) — your OS generally trusts something it watched get compiled locally more than something downloaded from the internet.

Production builds, one command per platform:

```bash
# Windows — portable .zip
bash apps/desktop/scripts/package-portable-zip.sh

# macOS — .dmg
pnpm --dir apps/desktop exec tauri build --bundles dmg

# Linux — .AppImage
pnpm --dir apps/desktop exec tauri build --bundles appimage
```

Windows goes through its own script instead of plain `tauri build` because of a Windows-specific `MAX_PATH` issue with NSIS bundling — see the comments in `package-portable-zip.sh` for why. macOS/Linux output lands under `apps/desktop/src-tauri/target/release/bundle/`.

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
