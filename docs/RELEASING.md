# Cutting a release

This is the maintainer-facing process for publishing a new TOFO desktop release. If you're looking for how to build from source yourself, see the [README](../README.md#building-from-source) instead — this doc is about producing the actual tagged release artifacts.

## The short version

```bash
git checkout main
git pull
# bump versions in apps/desktop/package.json, apps/desktop/src-tauri/tauri.conf.json,
# apps/promptfarm/package.json, and add a new section to CHANGELOG.md first — see below

git tag -a desktop-vX.Y.Z -m "TOFO X.Y.Z"
git push origin desktop-vX.Y.Z
```

Pushing the tag triggers `.github/workflows/release.yml`, which builds Windows/macOS/Linux in parallel and, once all three succeed, creates a **draft** GitHub Release with the three artifacts attached. Review it, then publish it manually — the workflow never publishes for you.

## Before tagging

- Bump the version number in all three places it's duplicated: `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/promptfarm/package.json`.
- Move the `## [Unreleased]` section in `CHANGELOG.md` into a new `## [X.Y.Z] — YYYY-MM-DD` section, and add the compare/tag links at the bottom (see existing entries for the pattern).
- Merge that as a normal PR through CI first — **don't tag a commit that hasn't been through the required checks.**

## Gotchas learned the hard way

- **The tag has to point at a commit that's already on `main`.** Tagging a local, unmerged commit means the release build runs code nobody's reviewed.
- **If the build fails and you fix it, you have to move the tag, not just push a new commit.** `git tag -d desktop-vX.Y.Z && git push origin :refs/tags/desktop-vX.Y.Z`, fix + merge the actual bug via a normal PR, then re-tag from the updated `main` and push again. The release workflow only ever looks at the exact commit the tag points to.
- **`softprops/action-gh-release` resets the release to `draft: true` on every run**, because that's hardcoded in `release.yml`. If you already published a release and then re-trigger the workflow against the same tag (e.g. to pick up a late fix), it flips back to draft — you have to publish it again afterward. Don't assume "the workflow ran successfully" means "the release is still public."
- **A transient `429` from GitHub's binary-releases host during the Linux AppImage bundling step isn't a real failure** — Tauri's linuxdeploy tooling downloads a few binaries at build time, and hammering the release workflow repeatedly in a short window can trip GitHub's rate limiting. Re-run just the failed job (`gh run rerun <run-id> --failed` or the Actions UI's "Re-run failed jobs") rather than moving the tag again — no code changed, no reason to rebuild what already succeeded.
- **Only bother re-tagging for a fix that actually matters to users** (a real bug, not a comment typo) — every re-tag is a full 3-platform rebuild, and each publish/unpublish cycle is a visible flip on the public releases page.

## After publishing

Update `README.md`'s badges/links only if the URL scheme changed (it shouldn't, `releases/latest` always resolves correctly) — no manual edits needed there for a routine version bump.
