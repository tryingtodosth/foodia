# `/fuw`: recipe submission form for "Książka kucharska Wydziału Fizyki"

**Status:** 🎯 built (Session 29, 2026-11-09), verified locally. **Not live on foodia.net until
the production steps under "Going live" are done.**

## Goal

A public form at `foodia.net/fuw` where students, PhD students, professors and staff of the Physics Faculty submit a recipe
for the faculty cookbook, in Polish or English. Each submission is editorial material for the
book. The organiser reviews it before it goes anywhere.

## Decisions (founder, 2026-11-09)

| Question | Decision |
|---|---|
| Account needed? | **No.** Anonymous; the submitter types a name and email. |
| Where submissions land | **A staging table, reviewed in `/admin`.** Accepted ones can optionally be promoted into a real Foodia recipe. |
| Fields and photos | **Everything the Foodia composer offers, plus photo upload.** |
| Book output | **CSV/JSON export** from `/admin`. Layout is done outside Foodia. |

## What was built (the plan, as executed)

1. **Shared form component.** The form body of `/recipes/new` moves into
   `lib/components/recipe/RecipeComposerForm.svelte`. Both `/recipes/new` and `/fuw` use it, so
   the two forms never drift apart. It covers:
   - name, summary, description, hero image, tags and diet flags
   - required equipment, time, cost and macros
   - ingredients (amount, unit, name) with drag reordering
   - steps with duration and step↔ingredient links, also with drag reordering
   - a **recipe-language picker** (`sourceLocale`), which closes a gap noted in `recipeInput.ts`

   `/fuw` passes a mode where macros and cost are *optional*, since most contributors won't know their
   recipe's macros. `/recipes/new` keeps them as they are today.
2. **Cookbook-only fields**, rendered only on `/fuw`:
   - name as it should be printed
   - affiliation: student, PhD student, professor or other academic staff, non-academic staff, or alumni; plus year (students), or title and department (staff, e.g. "prof. dr hab., Zakład Fizyki Teoretycznej")
   - contact email (never shown publicly)
   - "the story behind this recipe"
   - extra photos beyond the hero image
   - a required consent checkbox for publication under that name in the book and on foodia.net
3. **`fuw_submissions` table** (migration `0004`): `id`, `status` (`pending | accepted | rejected`),
   `recipe` (JSON, a `CreateRecipeInput`), the person fields, `photo_keys` (JSON), `locale`,
   `submitted_at`, `reviewed_at`, `reviewed_by_id`, `promoted_recipe_id`, and `ip_hash` (for rate
   limiting only; a salted hash, never the raw IP).
4. **`POST /api/fuw/submissions`**, anonymous. Validation reuses `createRecipe`'s `validate()`,
   exported for the purpose, plus checks on the person fields. Abuse protection:
   - a honeypot field
   - a per-IP-hash rate limit counted in D1 (for example 5 per hour)
   - server-side length caps on every text field
5. **`POST /api/fuw/uploads`**, an anonymous upload gate just for this form. It reuses the
   existing MIME allowlist, 5 MB cap and magic-number sniff, writes under an R2 `fuw/` prefix, and
   is rate limited like submissions. `/api/media` must refuse `fuw/*` keys to anyone but an
   admin until the submission is accepted. Without that, an unreviewed upload becomes
   publicly hosted the moment it lands, which is what the private-bucket design exists to prevent.
6. **`/fuw` route.** It has its own cookbook header, follows the interface language with the
   existing switcher, uses `fuw.*` keys in both `pl` and `en`, sets `prerender = false`, and is
   excluded from the Capacitor build because it needs a server. A thank-you screen follows
   submission, with "submit another".
7. **"FUW" tab in `/admin`**, behind the existing `ADMIN_EMAILS` gate:
   - a list of submissions filterable by status, each one viewable in full with its photos
   - accept and reject
   - **export of accepted submissions as JSON and as CSV** (one row per recipe; ingredients and steps flattened into text columns)
   - **"Promote to Foodia recipe"**, which calls `createRecipe()`, defaults missing macros to 0 with a visible note, and needs an author account (see the open point below)
8. **Verification:**
   - `npm run check` at 0 errors and 0 warnings
   - a tsx script for validation and rate limiting
   - a headless-browser pass in both PL and EN covering an anonymous submit with a photo, the honeypot rejection, the rate limit, admin accept/export/promote, and the `fuw/*` media gate staying closed before acceptance
   - a regression check that `/recipes/new` still works after the extraction

## Decided during the build

- **Author of promoted recipes:** a dedicated `fuw-cookbook` account ("Książka kucharska FUW"),
  created on first promotion with an unparseable password hash so nobody can log in as it. The
  contributor's name, affiliation and story go into the recipe description; their email never
  leaves the staging table. Promoted recipes get the tag `fuw`.
- **Deleting a promoted submission is refused (409):** the Foodia recipe may be using its photo.
  Delete the recipe first.
- **No closing date.** The form stays open until the route is removed. Adding a deadline is a
  small change if it's wanted.
- **Abuse limits:** 5 submissions and 30 uploads per salted IP hash per rolling hour, a 200 KB
  body cap, per-field length caps, up to 6 extra photos.

## Known limits

- Photos uploaded but never submitted stay in R2 (private, never served) with no cleanup job.
- The IP salt falls back to a fixed local string when `FUW_IP_SALT` is unset. That is fine
  locally but **must be set in production**: an unsalted IPv4 hash can be brute-forced.
- Rate limiting is per IP, so a whole faculty NAT shares one allowance of 5 per hour. Raise
  `FUW_SUBMISSIONS_PER_HOUR` in `lib/server/fuw.ts` if that turns out to bite during a
  collection drive.

## Going live (needs Cloudflare access; not possible from the dev machine without a login)

1. `npx wrangler d1 migrations apply foodia-db --remote`, which applies `0002`, `0003` and `0004`
   if they're still pending (`0002`/`0003` were already listed as pending in Session 28).
2. `npx wrangler r2 bucket create foodia-media`, if it doesn't exist yet.
3. Pages secrets: `ADMIN_EMAILS` (if not set yet) and a new random `FUW_IP_SALT`, for example
   `openssl rand -hex 32 | npx wrangler pages secret put FUW_IP_SALT`.
4. Deploy (or let the GitHub-connected build pick up the push), then submit one test recipe on
   foodia.net/fuw and delete it from /admin/fuw.

## Verification

- `npm run check` reports 0 errors and 0 warnings.
- `scripts/verify-fuw-api.py` passes all 40 assertions.
- `scripts/verify-fuw-ui.mjs` passes all 26 assertions, with zero page errors.
