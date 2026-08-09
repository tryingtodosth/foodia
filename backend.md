# Foodia — Backend & Deployment Notes

Operational companion to `CLAUDE.md`. That document explains *what the app is and why*;
this one records *what actually runs in production, what doesn't yet, and every platform
constraint that cost real time to discover.* Written at the end of Session 28's deployment
work, when local `main` was several sessions ahead of the live site.

Keep it current: if a step here turns out to be wrong, fix the step rather than working
around it in the moment — the whole value of this file is that the next person doesn't
rediscover the same thing.

---

## 1. What runs where

| Thing | Value |
|---|---|
| Live site | `https://foodia.net` and `https://foodia.pages.dev` — same Cloudflare Pages project |
| Pages project name | `foodia` |
| Cloudflare account | tied to `piotr.putylo96@gmail.com`, account id `b2ad13bba470b05f81a03d996dbb96ea` |
| Database | D1 `foodia-db`, id `6bacf9d0-b5c2-4643-9e14-e1bf39ceee84`, region EEUR |
| Migrations dir | `drizzle/` (set via `migrations_dir` in `wrangler.jsonc`) |
| Bindings | declared in `wrangler.jsonc`, **not** in the dashboard — the dashboard says so explicitly |
| Deploy trigger | Git integration: a push to the production branch builds and deploys automatically |
| Object storage | R2 binding declared, bucket deliberately **not created** — see §6 |

Local dev (`npm run dev`) uses wrangler's miniflare proxy: D1 and R2 are simulated on disk
under `.wrangler/` and **never** call Cloudflare's API. That is why local can be perfectly
healthy while production is broken, and vice versa. Never treat a passing local run as
evidence about production.

---

## 2. The drift problem, and how to check for it

The single most expensive recurring issue: **the deployed build, the deployed schema, and
the repo can each be at a different version.** All three have to move together.

Cheap ways to tell what production is actually running, without dashboard access:

- `curl -s -o /dev/null -w '%{http_code}' https://foodia.net/api/uploads` — a 404 means the
  build predates Session 26 (that route didn't exist yet).
- `curl -s https://foodia.net/api/recipes/r1 | grep -o '"kind"'` — silence means the build
  predates Session 27's `comments.kind` column.
- `npx wrangler d1 migrations list foodia-db --remote` — anything listed is *pending*, i.e.
  the remote schema is behind the repo.

**Drizzle enumerates columns explicitly**, so a schema that is behind the code does not
degrade gracefully — every query touching a missing column throws, and the page 500s. This
is why migrations must be applied *before* the code that needs them is deployed, never after.

### Known state at the time of writing

- Remote D1 has `0000` + the original `seed.sql` applied (Session 21). `0001`'s status was
  never confirmed. `0002` (`comments.removed_at`/`removed_by_id`) and `0003`
  (`comments.image_url`/`kind`) are applied **locally only**.
- Production serves a Session-25-era build. `main` (`98a29ae`) carries Sessions 26–28 plus
  the allergy-filter work, and **will 500 on login and recipe pages until `0002`/`0003` land**.
- `ADMIN_EMAILS` has never been set as a production secret, so `/admin` fails closed there.
  That is the intended failure direction, not a bug.

---

## 3. Deploy checklist

In this order. Steps 1–3 need Cloudflare credentials; see §4.

1. **Check for pending migrations first.**
   ```bash
   npx wrangler d1 migrations list foodia-db --remote
   ```
   If `seed.sql`, `0000` or `0001` appear pending, **stop** — that means you are pointed at a
   different database than you think, and applying would double-seed or fail on existing tables.
   Only `0002`/`0003`-and-later showing pending is the expected, safe case.

2. **Apply them.**
   ```bash
   npx wrangler d1 migrations apply foodia-db --remote
   ```

3. **Set any new secrets** (only needed once per secret):
   ```bash
   npx wrangler pages secret put ADMIN_EMAILS --project-name foodia
   ```
   `ADMIN_EMAILS` is deliberately an environment secret rather than a database column: no code
   path in this repo writes it, so becoming an admin requires access to the Cloudflare account,
   not to the app. Don't "simplify" it into a `users` column.

4. **Build from a cleared cache before deploying.** Interleaving `npm run build` and
   `npm run build:capacitor` shares Vite's intermediate cache even though the output dirs
   differ, and that has produced a real site-wide breakage (Session 24 — up to 19 `_app/immutable`
   chunks 404ing, so *every* interactive feature died while the HTML still rendered fine).
   ```bash
   rm -rf .svelte-kit build-capacitor node_modules/.vite
   npm run build
   ```

5. **Push to the production branch** (Git integration deploys it), or `npx wrangler pages deploy`.
   A Git-integrated project can still be deployed with the CLI — the documented restriction runs
   the other way (a Git-integrated project can't be switched to Direct Upload).

6. **Verify, and give it a minute.** Right after a deploy, expect 20–30s where things look
   broken that aren't: per-deployment preview subdomains serve Cloudflare's "Deployment Not
   Found" page, individual asset chunks 404, and — observed once — the **Worker script itself**
   briefly served a pre-deploy version, which silently wrote two rows with the wrong
   `source_locale`. Re-verify data written immediately after a deploy; don't trust the write
   script's own success output.

**A failed build cannot take the site down.** Pages keeps serving the last successful
deployment. Rollback is Deployments → previous → Rollback, and it is instant. This bounds the
risk of any deploy attempt, and is why "try it and see" is a legitimate strategy here.

---

## 4. Auth for wrangler, and the token trap

`wrangler login`'s interactive OAuth **times out in this VM** — the `localhost:8976` callback
never reaches the CLI. Use a scoped API token instead:

```bash
export CLOUDFLARE_API_TOKEN=...
```

The **"Edit Cloudflare Workers" template does not include D1**. With it, both `d1 create` and
`d1 list` fail with a generic `Authentication error [code: 10000]`, which reads like a bad token
rather than a missing permission. Add **D1 Edit** and **Pages Edit** explicitly.

Demo accounts: all 26 seeded accounts share the password `foodiaFan2026` (e.g.
`piotr@foodia.net` — a moderator, `marc@foodia.net`, `ania.gotuje@foodia.net`). The original
plaintext for two of them was never recorded anywhere, which is why they were all reset to one
documented value. If you add seeded accounts, record the password here at the same time.

---

## 5. Platform constraints learned the hard way

- **PBKDF2 is capped at 100,000 iterations** in the Workers runtime
  (`crypto.subtle.deriveBits` throws `NotSupportedError` above it). `DEFAULT_ITERATIONS` is set
  to exactly that. Raising it silently breaks every register and login in production while
  working fine locally — miniflare enforces no such cap. `verifyPassword` re-derives using the
  per-row stored count, so changing the default doesn't invalidate existing hashes, but existing
  rows hashed *above* the cap become permanently unloginnable and must be re-hashed.
- **Subrequest count, not query complexity, is the D1 limit that bites.** A per-recipe assembly
  loop (~7 queries × 67 recipes ≈ 469 subrequests) is free against local SQLite and simply
  *hangs* past 35s against real D1 — no error, just no response. Fixed by
  `assembleAllRecipeDetails()`, which loads each table once and groups in memory. Any new
  list-shaped endpoint must follow that pattern; the per-recipe path is only safe for a handful
  of known ids.
- **Cloudflare's WAF blocks plain `urllib`/`curl`** against production (`403`, `error code: 1010`).
  Import and verification scripts need a real browser `User-Agent`. Local dev has no equivalent,
  so scripts that work locally will fail against production for reasons unrelated to the app.
- **Miniflare can't serialize `Headers`.** `object.writeHttpMetadata(headers)` and
  `get(key, { onlyIf: request.headers })` both 500 under `vite dev` ("Cannot stringify arbitrary
  non-POJOs"), even though both are valid against real R2. Also, R2's `etagDoesNotMatch` rejects
  a *quoted* ETag — which is exactly the form browsers send — and accepts only one value where
  `If-None-Match` may list several. Conditional GET is therefore handled in the route itself.
- **A route that reads `page.url.searchParams` cannot be prerendered.** It needs
  `export const prerender = false` (`/plan`, `/shopping-list`, `/login` all do). Routes with a
  `+page.server.ts` can't take that escape hatch, because the static build would then have no way
  to load their data — pass state through a store instead of the URL.
- **`.gitignore`'s `node_modules/` does not match a `node_modules` symlink.** Worktrees that
  symlink dependencies will happily commit the link. Check before pushing.

---

## 6. Why R2 is bound but not created

`wrangler.jsonc` declares `MEDIA → foodia-media`; the bucket does not exist. This is a
deliberate cost decision, recorded here because it looks like an oversight.

`wrangler r2 bucket create` returns `code: 10042` — R2 is not enabled on the account. Enabling
it means taking on a subscription, and **Cloudflare has no hard spend cap**: it offers usage
notifications, but nothing that stops a service at the free tier. So the binding stays as a
placeholder — the same arrangement the D1 `database_id` had before the database was real.

Nothing regresses meanwhile: both `POST /api/uploads` and `GET /api/media/[...key]` check
`platform?.env?.MEDIA` and return 503, uploads have never been deployed to production, the
feature is gated behind a `can_upload` flag that is false for every account including the
admin's, and no comment row carries an `image_url`. The upload code is untouched and still
works locally, where miniflare simulates the bucket on disk.

**Open question, unresolved:** whether a Pages build *succeeds* while a declared binding names a
nonexistent bucket. A preview branch was pushed to test exactly this and produced eight minutes
of "deployment not found" — which is equally consistent with a failed build and with branch
deployments being switched off, and there was no dashboard access to tell them apart. The
disambiguation is one glance at **Workers & Pages → foodia → Deployments**: an entry for the
test branch in red means the binding really does break builds; no entry at all means previews
are off and the test proved nothing.

If it does break builds, branch **`drop-r2-binding`** is already pushed and unmerged for exactly
that case — it removes the block and documents the snippet to restore. To go the other way and
enable R2 properly: `npx wrangler r2 bucket create foodia-media`, and nothing in the code needs
to change.

---

## 7. Open items

- **Migrations `0002`/`0003` not applied to remote D1.** Blocks deploying `main` at all.
- **`ADMIN_EMAILS` not set in production**, so `/admin` is unreachable there.
- **No atomic transactions in `createRecipe.ts`.** Ingredient ids are needed to build step rows
  before a `batch()` could group everything, so a mid-write failure leaves an orphaned recipe
  row. This is demonstrated, not theoretical — it happened during the 50-recipe import. Fine at
  one-known-author volume; close it before this path takes untrusted input.
- **D1 rejects a statement once its bound-parameter count gets too high.** `createRecipe.ts`
  chunks inserts in groups of 10 for this reason. Any new bulk insert needs the same treatment —
  a 27-ingredient recipe was enough to trigger it.
- **No per-user upload quota, and no R2 cleanup when a recipe is deleted** (the hero image
  outlives its recipe). Both moot while R2 is unbound; both real the moment it isn't.
- **Pantry, MealPlan, Profile and cooking sessions are `localStorage`-only.** No cross-device
  sync, no server tables. See `CLAUDE.md` Section 7 items 13/24/29.
- **Recipe editing does not exist** — creation only, no `PUT`/`PATCH`, and `recipe_versions` is
  read but never written. Nor is there any review step between publish and appearing live.
