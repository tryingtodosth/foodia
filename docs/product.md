# Foodia — Product: vision, phasing, open questions

> Split out of the original monolithic `CLAUDE.md` (2026-11-09). Section numbers are unchanged, so references like "CLAUDE.md 4.5" or "Section 7 item 3" in code comments and other docs still resolve — see [`docs/README.md`](README.md) for the map.

## 0. What Foodia is

A cooking assistant for a time-poor, budget-conscious cook (core persona: women 25–35) that (1) understands their kitchen and constraints before they start, (2) plans a realistic week around real budget/time/context limits, (3) turns a plan into a shopping list that closes the loop with e-grocery, (4) gets out of the way while they're actually cooking with dirty hands, and (5) treats every recipe as a living, forkable, commentable graph rather than a static block of text — the same shape a real kitchen conversation ("use 4 cloves, not 2") actually has.

The single biggest architectural bet in this whole document: **a recipe is a graph, not a document.** Ingredients, steps, and substitutions are addressable nodes with their own comments, reactions, and relationships — not fields inside one text blob. Everything else (node-based comments, D3 relationship graphs, substitution voting, versioning) falls out of that one decision instead of needing its own bespoke mechanism.

---

## 2. Phasing (my proposed cut — redirectable, see Section 8)

The founder's brain-dump is roughly 3x MVP scope by itself — five core modules is already a lot, and the three "further develop" rounds (D3 graphs, creator economy/royalties, live translation, neighbor pantry-sharing, voice commands) are each their own project. Rather than build breadth-first across all five modules at brainstorm depth, this phases depth-first through the two modules that are Foodia's actual differentiators, then widens.

- **🎯 P1 — done:** the Recipe Graph Engine (Module 2) and Cooking Mode (Module 3) — the two ideas that don't exist anywhere else and that everything downstream depends on. Read-only browsing + a minimal onboarding profile + a client-only Pantry checklist, all against mock fixtures. Node-based comments (public/private) and substitution upvote/downvote (Module 4's write-side) pulled forward from P2 and built too, since neither needs a backend — see 4.4. A manual weekly meal planner (`/plan`) pulled forward too, honestly distinct from the real AI Wizard — see 6.2.
- **🎯 P1 — also done (Session 6):** interface localization (PL/EN, a real switcher in both the navbar and footer, SSR-correct) and a community content-translation system for recipes (view-original, submit a translation or a same-language revision suggestion, vote among competing submissions) — see 4.6. Neither needed a backend, same reasoning that pulled the rest of Module 4 and the manual planner forward early.
- **🎯 P1 — also done (Session 6):** the Capacitor web-shell (a second, static build target from the same codebase) — see 6.1. Native platform scaffolding (`npx cap add android/ios`) deliberately not run — no Android SDK/Xcode in this environment to verify a real native build against, flagged rather than faked.
- **🎯 P1 — also done (Session 7 research + Session 8 build):** a 47-Reddit-thread competitive research pass (`FUTURES.md`, new) surfaced Search & Filtering (4.7, speced but not built) and User Accounts (4.8, **built** Session 8) as the two most concrete, buildable-now gaps — a real login/register/logout system, deliberately not gating anything, since this app's own Progressive Profiling principle (4.1) predates and outranks it.
- **🎯 P1 — also done (Session 12):** Search & Filtering (4.7) — AND-by-default multi-select tag/dietFlag filtering with an explicit per-facet AND/OR toggle and a real click-driven exclusion control, plus the small, already-identified Pantry `add()` duplicate-row bug fix (Section 7 item 12/`FUTURES.md` Section 1) — merges into an existing `(name, unit)` row instead of always appending.
- **🎯 P1 — also done (Session 13):** comment moderation (report/review/remove) and substitution "recognized" graduation (community substitutions crossing a reaction threshold, explicitly promoted by a moderator) — see 4.4's own updated writeup.
- **🧩 P2 — next:** running the native platform setup on a machine that actually has the SDKs, wiring real Capacitor plugins (camera barcode scan, Wake Lock/Local Notifications native fallbacks) once a platform exists to test them against, a real e-grocery API partnership (the copy-to-clipboard export built in Session 5 is the honest MVP stand-in, see 4.5), full-text/query search (a name/description search box — Section 4.7's own structural tag/dietFlag filtering doesn't cover this). The Pantry-vs-`MealPlan` aggregation itself is **done** (Session 5) — see 4.5.
- **🔮 P3 — the real AI Meal Planning Wizard**, blocked on a real backend/LLM (unchanged assessment, 6.2).
- **🔮 P3:** D3 relationship graphs, the Creator Economy (tips, royalty split, "Plemiona" community hubs, shareable presets/deep-linking), live **AI** translation of community threads + AI-driven unit conversion (6.5 — distinct from Session 6's manual community translation, which is a real, non-AI system already built), neighbor pantry-sharing, "Cook Along" presence, voice commands, rescue-protocol menus.

---

## 8. Open questions

### A. My working assumptions (stated, not asked — redirect anytime)

- Mock-first frontend, no real Django backend wired up yet (Section 1).
- Phasing order in Section 2 — Recipe Graph + Cooking Mode first, since they're the actual differentiators; onboarding/pantry are minimal stubs in P1, not full builds.
- Single frontend repo. Capacitor's *web shell* was pulled forward and built in Session 6 (see 6.1) once the app had enough real pages to be worth wrapping — the native platform scaffolding itself (`npx cap add android/ios`) is still deferred, this time for a concrete reason (no SDK in this environment), not a scheduling choice.
- P1's onboarding profile and Pantry checklist persist to `localStorage` only (`lib/state/*.svelte.ts`, `lib/utils/storage.ts`) — no session, no cross-device sync, single browser only. Flagged honestly as a real limitation in Section 7 item 13, not presented as real sync.
- The interface ships **both** Polish and English symmetrically (Session 6, 4.6) rather than picking one as primary — this makes 8B's own still-open "which language is primary" question lower-stakes than originally framed, though the literal fallback-locale order (cookie → Accept-Language → `'pl'`) is still just an assumption, not a decision (Section 7 item 17).

### B. ❓ Needs your call, not decided here

- **Monetization sequencing** — which lever ships first once P2 starts: e-grocery affiliate, subscription (AI planning/translation), or tips/royalties? This affects what backend infrastructure (payments, ledger) gets prioritized, so worth deciding before P2 planning, not blocking P1. **New data point (Session 7, `FUTURES.md` Section 8):** real, community-sourced research names subscription-model fatigue and "Enshittification" (features paywalled after building a loyal free userbase) as a genuine, actively-discussed source of user distrust in this exact product category — a real signal *against* leading with a subscription, worth weighing alongside whatever else informs this decision, not treated as the deciding factor on its own.
- ~~**Is there an existing Django project this should eventually point at**, or is backend work fully greenfield too?~~ **Answered, Session 16**: no Django — greenfield, all-Cloudflare (D1/R2/Drizzle/Lucia/Durable Objects/AI Gateway), see Section 1's own updated entry. `httpApiClient` (Section 5) now has a real, decided target to eventually implement against.
- ~~**Primary UI language for the interface itself**~~ — **Largely resolved by Session 6** (4.6): the interface now ships both Polish and English as real, symmetric, switchable options (navbar + footer switcher), not one primary with a secondary bolted on, and mock recipe content is genuinely Polish-authored with a real English translation available (not a placeholder split anymore). What's still technically an assumption, not a decision: the exact fallback order when neither a cookie nor a clear `Accept-Language` signal exists (`'pl'` wins — Section 7 item 17) — low-stakes now that both languages are first-class, but flagged rather than silently finalized.
