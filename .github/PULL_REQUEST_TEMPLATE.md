## What & why

<!-- What changed, and why — the diff already shows *what*, so focus this on the reasoning a reviewer can't get from the code alone. -->

## Type of change

<!-- Match your PR title's Conventional Commits type (see CONTRIBUTING.md) -->

- [ ] `feat` — new functionality
- [ ] `fix` — bug fix
- [ ] `docs` — documentation only
- [ ] `refactor` — no behavior change
- [ ] `perf` — performance improvement
- [ ] `test` — adding or fixing tests
- [ ] `chore` / `ci` — tooling, dependencies, CI

## Testing

<!-- How did you verify this? "Ran pnpm --dir apps/promptfarm test" is fine for logic changes — for UI or desktop-shell changes, say what you clicked through and on which OS. -->

## Checklist

- [ ] PR title follows Conventional Commits (`type(scope): description`)
- [ ] `pnpm --dir apps/promptfarm test` passes locally
- [ ] Tests added/updated for non-UI changes in `apps/promptfarm/src`
- [ ] Docs updated if this changes user-visible behavior, a documented API/flag, or the build/release process (README, CHANGELOG, docs/ARCHITECTURE.md, docs/SYNTHETICS_GUIDE.md, docs/RELEASING.md, or CLAUDE.md — see CLAUDE.md's "docs move with the code" rule)
