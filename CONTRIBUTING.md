# Contributing to TOFO

Thanks for taking a look. TOFO is early — the fastest way to help right now is usually a good bug report, not a big PR.

## Before you write code

For anything more than a small fix, open an issue first describing what you want to change and why. This repo moves fast and the "what's real vs mocked" line (see the README) shifts often — a quick check avoids work that collides with something already in progress.

## Development setup

```bash
pnpm install
pnpm --dir apps/desktop tauri dev
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Making a PR

- Keep it focused — one change, one PR. Large refactors mixed with feature work are hard to review and easy to get wrong.
- Add or update tests for anything in `apps/promptfarm/src` that isn't UI-only.
- Run `pnpm --dir apps/promptfarm test` before opening the PR.
- Describe *why*, not just *what*, in the PR description — the reviewer can read the diff.
- **PR title must follow [Conventional Commits](https://www.conventionalcommits.org/):** `type(scope): description`, e.g. `fix(desktop): handle missing Node.js gracefully` or `feat(settings): add Gemini provider`. CI checks this automatically. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`. Scope is optional but encouraged (`desktop`, `promptfarm`, `settings`, `ci`, ...).

## Cutting a release

Maintainer-only process for publishing a new desktop build — see [docs/RELEASING.md](docs/RELEASING.md).

## Reporting bugs

Include: what you did, what you expected, what happened instead, and your platform (Windows/macOS, TOFO version). If it's a simulation/model issue, mention which provider (Ollama / Claude API / Claude CLI) — behavior differs meaningfully between them.

## Code style

- TypeScript, Tailwind utility classes (no inline `style={}` except for runtime-computed values — see `apps/promptfarm/CLAUDE.md` if you use an AI coding assistant, the conventions are documented there too)
- Keep files under ~1000 lines; split before you hit the limit, not after
- No unnecessary comments — code should read clearly on its own; comment only non-obvious *why*

## License

By contributing, you agree your contributions are licensed under the project's [MIT License](LICENSE).
