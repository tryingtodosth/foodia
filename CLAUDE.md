# Foodia

A cooking assistant (SvelteKit + Svelte 5 + TypeScript + SCSS) for time-poor, budget-conscious
cooks: profile → weekly plan → shopping list → pantry → cooking mode. Its central idea is that
**a recipe is a graph, not a document**: ingredients, steps, substitutions and step alternatives
are nodes, each addressable by comments, reactions and links. Live at https://foodia.net (and
https://foodia.pages.dev, the same deployment).

The long-form record lives in [`docs/`](docs/README.md). Read the part you need, not all of it:

- `docs/architecture.md`: stack decisions (§1), the full type model (§3), API clients (§5)
- `docs/modules.md`: per-module specs and design decisions (§4.1–4.13)
- `docs/issues.md`: known gaps and limits, numbered (§7 items 1–29)
- `docs/roadmap.md`, `docs/product.md`: P2/P3 designs, phasing, open questions (§6, §0/§2/§8)
- `docs/build-log.md`: what each session did and found (§9). **Append to it** when you finish a session's work.

When a code comment says "CLAUDE.md 4.5" or "Section 7 item 3", look in `docs/`. Section numbers
were kept when the docs were split, and `docs/README.md` maps each one to its file.

## Commands

```bash
npm run dev                 # Vite dev server; local D1/R2 come from wrangler's platform proxy
npm run check               # svelte-check. Baseline is 0 errors, 0 warnings; keep it there
npm run build               # Cloudflare Pages target (adapter-cloudflare)
npm run build:capacitor     # static target (adapter-static, BUILD_TARGET=capacitor) -> build-capacitor/
npx tsx scripts/verify-units.ts            # logic checks; also verify-recipe-matrix.ts, verify-cooking-session.ts
npx drizzle-kit generate                   # schema.ts -> new SQL migration in drizzle/
npx wrangler d1 migrations apply foodia-db --local    # use --remote for production
npm run deploy              # build + wrangler pages deploy. Ask before running it.
```

## Layout

- `src/lib/types/`: domain types (`recipe.ts`, `pantry.ts`, `user.ts`, `cooking.ts`, `units.ts`, `recipeInput.ts`)
- `src/lib/utils/`: **pure, framework-agnostic** logic (no Svelte imports). Pass dependencies in as arguments (e.g. `densityFor`) instead of importing stores
- `src/lib/state/*.svelte.ts`: rune stores (an object of getters and methods over module-level `$state`)
- `src/lib/server/`: D1 schema (`db/schema.ts`), write paths (`api/create*.ts`), auth (`auth/`), admin gate
- `src/lib/api/`: `RecipeApiClient` interface, `mock/` fixtures, `http.ts` client
- `src/lib/i18n/`: hand-rolled PL/EN (`messages.ts`, `t()`, `tPlural()`)
- `src/routes/api/*`: JSON endpoints. `drizzle/`: migrations plus `seed.sql`. `scripts/`: seed and verify scripts

## Rules that have bitten before

**Two build targets, one codebase.** The Capacitor build has no server at runtime, ever.
- In server loads, call `getRecipeApiClient(platform)`. It returns D1 when `platform.env.DB` exists and falls back to mock otherwise.
- In client-only code, branch on the compile-time `__IS_CAPACITOR__`.
- A route that reads `page.url.searchParams` needs `export const prerender = false`, or the Capacitor build fails.
- A server-gated route (`/admin`) must opt out of prerendering.

**Hydration.** Stores that read `localStorage` hydrate lazily, from the root `+layout.svelte`
`$effect`. A **new store must be added there**; leaving it out produced a bug that only showed up
on a full reload (Session 28). Pages must gate on `store.hydrated` and not read store data into a
plain `const` at init (Session 15 lost profile data this way).

**i18n.** New UI ships with both `pl` and `en` keys from the start. `en` is type-checked against
`pl`'s keys. Call `t()` in templates or `$derived`; a top-level `const` won't follow a language
switch. Recipes carry `sourceLocale` (absent means `'pl'`), and the feed shows only recipes in the
interface language.

**Server and auth.**
- `hooks.server.ts` resolves `locals.user` and `locals.isAdmin` on each request.
- Every write endpoint checks the session itself; a page layout gate doesn't protect `/api/*`.
- Admin access comes only from the `ADMIN_EMAILS` env var (`.dev.vars` locally, a Cloudflare secret in production); no code writes to it.
- `/admin` returns 404, not 403, to anyone else.

**Data safety.**
- Every substitution list passes through `filterSafeSubstitutions` (the allergy guardrail) before it reaches any UI or macro math.
- Private comments are filtered in the SQL query.
- Removed comments are blanked in `toNodeComment`. Never trust client-sent denormalized fields: derive them on the server.

**D1/Workers limits.**
- Chunk multi-row inserts (around 10 rows) to stay under the bound-parameter cap.
- Use bulk assembly (`assembleAllRecipeDetails`) for lists, never one query per recipe.
- PBKDF2 is capped at 100k iterations on Workers.
- An R2 binding under `vite dev` can't take a `Headers` object.

**Deploying.**
- Clear the build caches first (`rm -rf .svelte-kit build-capacitor node_modules/.vite`) to avoid stale chunk 404s.
- Expect a short propagation window after a deploy.
- Scripts that call production need a browser `User-Agent`, or Cloudflare's WAF returns 403/1010.
- Remote D1 lags local: migrations `0002` and `0003` are applied locally only, as of Session 28.

**Shared host.** Builds can be OOM-killed by unrelated processes. Retry before debugging, and stop
the dev server's `workerd` before a production build.

## How to work here

- Verify in a real browser for anything stateful: reloads, hydration, client navigation. `npm run check` passing is not enough. Headless Playwright is borrowed from the sibling `personali` checkout by absolute path. After a client-side route change, wait on real DOM state, not `networkidle`.
- Be honest about scope. State what wasn't built or tested, in the build log and in `docs/issues.md`, and don't present a stub as a feature. This is the house style throughout `docs/`.
- Keep this file short. New detail goes in `docs/`; add a line here only for a rule that applies to every session.
- Demo accounts (seeded, local and production): `piotr@foodia.net` (moderator), `marc@foodia.net`, `ania.gotuje@foodia.net`, and others. Password: `foodiaFan2026`.
- The working pattern (Card/Detail split, mock-first behind an interface, node-based comments) comes from the `2do` project.
