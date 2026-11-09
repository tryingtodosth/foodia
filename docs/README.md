# Foodia docs

The long-form project record. `CLAUDE.md` at the repo root is the short working guide that loads
every session; everything here is read on demand.

## Where the old `CLAUDE.md` sections went

Section numbers were kept as-is, so a reference like "CLAUDE.md 4.5", "Section 7 item 3" or
"8B" in a code comment, `FUTURES.md`, `STORIES.md` or `QA.md` still points at the right place.

| Section | Topic | File |
|---|---|---|
| 0 | What Foodia is | [product.md](product.md) |
| 1 | Tech stack & architecture decisions | [architecture.md](architecture.md) |
| 2 | Phasing (P1/P2/P3) | [product.md](product.md) |
| 3 | Core data model (Recipe Graph types) | [architecture.md](architecture.md) |
| 4.1–4.13 | Module specs (context engine, recipe graph, cooking mode, comments, pantry, i18n, search, accounts, equipment alternatives, units, recipe table, ingredient sheet, photos/stories) | [modules.md](modules.md) |
| 5 | Mocking strategy / API clients | [architecture.md](architecture.md) |
| 6.1–6.6 | Phase 2/3 designs (Capacitor, AI wizard, D3, creator economy, translation, pantry sharing) | [roadmap.md](roadmap.md) |
| 7 | Known issues & brainstorm list (numbered items) | [issues.md](issues.md) |
| 8A/8B | Working assumptions / open questions | [product.md](product.md) |
| 9 | Build log, Sessions 1–28 | [build-log.md](build-log.md) |

## Other documents

- [fuw.md](fuw.md) — plan for the `/fuw` Physics Faculty cookbook submission form (not built yet).
- [`../FUTURES.md`](../FUTURES.md) — research-driven feature ideas (Reddit competitive pass, Section 9 social-layer design picks).
- [`../STORIES.md`](../STORIES.md) — 20 user stories used as the browser QA suite.
- [`../QA.md`](../QA.md) — results of the live QA passes.
- [`../CLOUDFLARE_SETUP.md`](../CLOUDFLARE_SETUP.md) — how the Cloudflare Pages/D1/R2 side is wired.

## Status legend (used throughout)

| Mark | Meaning |
|---|---|
| 🎯 P1 | MVP — built / building now |
| 🧩 P2 | Next slice — designed, not started |
| 🔮 P3 | Later — brainstorm-grade, needs its own design pass before building |
| ⚠️ | Open question — a working assumption, flagged so it can be redirected |
| ❓ | Needs the founder's explicit call — listed in Section 8B |
