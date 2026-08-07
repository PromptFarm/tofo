@AGENTS.md

# Development rules

## Styling
Always use Tailwind utility classes. Never write `style={{}}` props except for three cases where the value is computed at runtime and cannot be expressed statically:
- Dynamic percentages: `style={{ width: \`${pct}%\` }}`
- JS-calculated pixel positions (popup coordinates): `style={{ top: px, left: px }}`
- Hex colors produced by a hash function: `style={{ background: color }}`
Everything else — including CSS variables, rgba, arbitrary sizes — goes into `className` as Tailwind arbitrary values: `text-[var(--primary)]`, `bg-[rgba(0,0,0,0.1)]`, `w-[280px]`.

## File size
Keep every file under 1000 lines. Split into sub-components or modules proactively — before hitting the limit, not after. When adding new code to an existing file, check its current size first; if the addition would push it past ~800 lines, extract existing self-contained sections into separate files first.

## Graph ↔ DB state integrity
When touching anything in the thinking-graph area (canvas, nodes, edges, sessions, run state), the DB must stay in sync with what's on screen. Before refactoring graph-related code, trace the full persistence path and verify that save calls (`saveProjectThinkingGraphSession` etc.) still trigger correctly after the change. Never short-circuit or remove save calls.
