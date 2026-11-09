# `/fuw`: recipe submission form for "Książka kucharska Wydziału Fizyki"

**Status:** 🧩 planned and decided (2026-11-09). Not built yet.

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

## Build plan

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

## Still open (small, can be decided during the build)

- **Author of promoted recipes.** Recipes need an `author_id`. The proposal is one dedicated
  "Książka kucharska FUW" account, with the student's printed name and affiliation kept in the
  recipe description.
- **Closing date.** Should the form close itself on a deadline, or stay open until you turn it off?
- **Production.** Remote D1 still lacks migrations `0002` and `0003`, so `0004` has to go out
  after them, and the R2 bucket and `ADMIN_EMAILS` secret need to exist before `/fuw` can work on
  foodia.net.
