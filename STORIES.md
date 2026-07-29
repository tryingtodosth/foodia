# Foodia — User Stories for Interface QA

**Status:** a companion document to `CLAUDE.md`/`FUTURES.md`, but a different kind of artifact than either — not research, not a design-options pass, a **live test plan**. 20 concrete people, each with one real goal, each walked through the actual running app (`npm run dev`) via a live browser session, not read off the code. Findings from that pass live in `QA.md` (new), one entry per story, cross-referenced back here by ID.

**Why 20, and why these 20.** Chosen to cover essentially every module that's actually `🎯 built` in `CLAUDE.md` (4.1 through 4.9, plus accounts and moderation) at least once, weighted toward the modules with real safety/correctness stakes (the allergy guardrail, S03; the AND-vs-OR filter bug this app was specifically built to avoid, S13) rather than an even spread. One story (S19) is deliberately built to test for an **absence** — the already-documented "no way to create a recipe" gap — not a new discovery, a verification that the documentation is still accurate against the live app.

**How to read a story:** Goal is the one thing this person is trying to accomplish, not a script. Primary flow names the routes/actions a tester should actually touch. Success looks like is the bar QA checks the live app against. Traces to points back at the `CLAUDE.md` section that specs the feature being exercised, so a failure has an obvious place to be filed against.

---

### S01 — Ania, curious first-time visitor
**Persona:** No account, no profile, landed on the app from a friend's recommendation. Wants to know in thirty seconds if this is worth her time before creating anything.
**Goal:** Browse the home feed and open a recipe without ever touching onboarding.
**Primary flow:** `/` → scroll the `RecipeCard` grid → click into any recipe → `/recipes/[id]`.
**Success looks like:** The feed loads with real content immediately, no hardware-match badges appear (no profile exists yet — that's correct, not broken), and the detail page renders ingredients/steps/substitutions coherently for a cold visitor.
**Traces to:** 4.1 (Progressive Profiling), Section 2.

### S02 — Marta, mother of three, first onboarding
**Persona:** Time-poor, budget-conscious — the app's own stated core persona. Wants the app to actually know her kitchen before recommending anything.
**Goal:** Complete the 3-step onboarding wizard and see it actually take effect.
**Primary flow:** `/onboarding` → diet + allergies → goals → hardware (has an oven, no airfryer) → finish → back to `/`.
**Success looks like:** The wizard has a working skip link at every step, and finishing writes a real profile to `localStorage` that a fresh visit to `/onboarding` later pre-fills from. **Not** a feed-badge check by itself — `RecipeCard.requiredEquipment` in the fixture corpus only ever names `kitchenScale` or `airfryer` (never `oven`), so an oven-only profile correctly produces *zero* hardware-match badges on the home feed; that's the fixture data, not a bug (QA.md Issue #4, 2026-07-29). If a badge check is wanted, pick a hardware set that actually matches a fixture recipe (e.g. `airfryer`, matching `airfryerFries`) or check `r2`'s `kitchenScale` requirement instead.
**Traces to:** 4.1, Session 2.

### S03 — Tomek, severe peanut allergy
**Persona:** One bad substitution away from a real medical event, not a preference. The single highest-stakes story in this whole list.
**Goal:** Confirm no peanut/nut-based substitution is ever shown, votable, or silently folded into the displayed macros.
**Primary flow:** `/onboarding` with allergy `orzechy` → open the recipe whose "Mleko" ingredient has a known peanut-milk community substitution → check the swap list, the vote buttons, and the macro totals.
**Success looks like:** The unsafe substitution is invisible in all three places at once — not just hidden from the picker while still quietly affecting a number elsewhere.
**Traces to:** 4.1/4.2 (`filterSafeSubstitutions`), Session 9.

### S04 — Kasia, no airfryer
**Persona:** Owns a full kitchen minus one appliance. Wants recipes that need it to still be reachable, not hidden outright.
**Goal:** Find and cook a recipe that nominally requires an airfryer, using a step-level alternative instead.
**Primary flow:** `/onboarding` hardware = oven only → `/` (confirm the airfryer recipe is NOT hidden) → open it → check the equipment-mismatch badge and the browsable alternatives → `/recipes/[id]/cook` (confirm the oven technique auto-suggests).
**Success looks like:** The recipe stays visible on the feed (cookability reconciliation), the detail page names exactly what's missing, and Cooking Mode auto-picks a technique she can actually follow.
**Traces to:** 4.9, Sessions 9–10.

### S05 — Piotr, mid-cook with flour-covered hands
**Persona:** Actually cooking, not browsing. Can't reliably tap small targets or read a dimmed screen.
**Goal:** Get through a recipe hands-off-ish — screen stays awake, steps advance with a simple tap, a timer actually runs.
**Primary flow:** `/recipes/r1/cook` → tap through several steps → tap a duration chip to start a timer.
**Success looks like:** Fullscreen, large type, tap-anywhere-to-advance works, the timer visibly counts down and alerts, Wake Lock is requested (verifiable via devtools even if the OS doesn't visibly demonstrate it).
**Traces to:** 4.3.

### S06 — Basia, wants a note only she can see
**Persona:** Made a small tweak last time ("less salt") and doesn't want to forget it, but doesn't want it public.
**Goal:** Leave a private comment on a specific ingredient.
**Primary flow:** `/recipes/[id]` → open the comment composer under an ingredient → toggle "private" → submit.
**Success looks like:** The comment appears immediately, attributed to her, with no vote buttons (private notes aren't votable) and visibly marked private.
**Traces to:** 4.4, Session 3.

### S07 — Rafał, proposes a substitution
**Persona:** Doesn't have one ingredient on hand but knows a real swap that works.
**Goal:** Submit a new community substitution and see it usable in the same session.
**Primary flow:** `/recipes/[id]` → open the substitution composer on an ingredient → name + ratio → submit → choose it.
**Success looks like:** It appears in the swap list without a page reload, can be selected, and the macro totals recompute (with a zero delta, since a lay proposer never claims a macro impact).
**Traces to:** 4.2, Session 9.

### S08 — Ola, wants the best-reviewed swap
**Persona:** Reads other people's substitutions before deciding, doesn't propose her own.
**Goal:** Browse existing substitutions sorted by reaction and vote on one.
**Primary flow:** `/recipes/r1` → open the substitution list → upvote the top entry.
**Success looks like:** Her vote updates the count immediately; the sort order does not jump mid-click (a deliberate, documented non-live-resort).
**Traces to:** 4.4.

### S09 — Michał, budget-conscious dad
**Persona:** Has a hard weekly grocery number he can't go over.
**Goal:** Fill a full week's plan with quick-fill and watch the budget math hold him honest.
**Primary flow:** `/plan` → set a weekly budget → "🎲 Szybko zapełnij tydzień" → read the Budget Reality Check banner.
**Success looks like:** The grid fills without exceeding budget (quick-fill stops rather than overshoot), the banner's running total is arithmetically correct, and the UI's own copy is honest that this isn't AI.
**Traces to:** 6.2, Session 4.

### S10 — Zofia, doing the actual grocery run
**Persona:** Has a partial pantry already, needs to know exactly what's still missing before she leaves the house.
**Goal:** Cross-reference her pantry against this week's plan and close the loop after buying.
**Primary flow:** `/pantry` (add a couple of items) → `/plan` (assign meals) → `/shopping-list?week=...` → click "Kupione → dodaj do spiżarni" on a missing item.
**Success looks like:** The missing/already-covered split is correct, and confirming a purchase merges into her existing pantry row instead of creating a duplicate.
**Traces to:** 4.5, Sessions 5 & 12.

### S11 — Ewa, English-speaking expat
**Persona:** Reads Polish slowly. Wants the whole app in English, permanently, not per-page.
**Goal:** Switch the interface language once and have it actually stick.
**Primary flow:** Click `LanguageSwitcher` in the navbar → browse a couple of pages → reload the tab entirely.
**Success looks like:** Every visited page's copy is genuinely translated (not just the nav), `<html lang>` updates, and the choice survives the reload via the locale cookie.
**Traces to:** 4.6, Session 6.

### S12 — Grzegorz, wants to read in his own language without losing the original
**Persona:** Trusts a translation but wants to double-check the author's actual wording before cooking.
**Goal:** View a community-translated recipe, then explicitly flip back to the original.
**Primary flow:** `/recipes/r1` with the interface in English → note the translation badge → click "View Original".
**Success looks like:** It shows the true Polish original and stays there — not silently re-resolving back to the English translation, the exact bug Session 6 caught and fixed before shipping.
**Traces to:** 4.6.

### S13 — Nina, wants Vietnamese salads, not everything Vietnamese
**Persona:** Filters by two tags together and expects the intersection, the way any reasonable person would.
**Goal:** Use the tag filter in AND mode and get only recipes matching *both* selected tags.
**Primary flow:** `/` → open the filter panel → select two tags with the AND toggle active.
**Success looks like:** The result set is the true intersection — not the union of everything matching either tag. This is the literal, named competitor bug (Paprika) this feature exists to not repeat.
**Traces to:** 4.7, Session 12.

### S14 — Dawid, wants to exclude one tag entirely
**Persona:** Knows exactly one thing he doesn't want and wants it gone from every result, in any filter mode.
**Goal:** Cycle a tag pill into its exclude state and confirm the feed responds.
**Primary flow:** `/` → click a tag pill through neutral → include → exclude.
**Success looks like:** Once excluded, every recipe carrying that tag disappears from the results, regardless of the AND/OR setting on the rest of the filter.
**Traces to:** 4.7.

### S15 — Iga, registering for the first time
**Persona:** New user, will make at least one mistake filling out the form (as most people do).
**Goal:** Create a real account, including recovering from a validation error.
**Primary flow:** `/register` → submit with mismatched password confirmation (expect a clear error) → fix it → resubmit.
**Success looks like:** The mismatch is caught with a specific, understandable message; successful registration logs her in immediately and the navbar reflects it.
**Traces to:** 4.8, Session 8.

### S16 — Bartek, forgot his password
**Persona:** Wants to reset his password without accidentally learning whether some *other* email is registered.
**Goal:** Use the password-reset form and check it doesn't leak account existence.
**Primary flow:** `/password-reset` → submit a real registered email → submit an unregistered one → compare the two responses.
**Success looks like:** Byte-for-byte the same generic response both times — the deliberate, more-correct-than-`2do`'s-own-precedent choice already documented in 4.8.
**Traces to:** 4.8.

### S17 — piotr, acting as moderator
**Persona:** The one fixture account flagged `isModerator: true`. Needs to actually be able to do the job, not just have the flag.
**Goal:** Reach `/moderation`, resolve a pending comment report, and mark an eligible substitution as recognized.
**Primary flow:** Run **after S18, in the same browser session/context** — QA.md Issue #3 (2026-07-29) — so there's an actual pending report in the queue to act on, not an empty one. Then: log in as `piotr` → navbar avatar dropdown → "Moderacja" → resolve Julia's report from S18 (Remove or Dismiss) → mark the fixture substitution `s1` (net +11, already crosses `RECOGNITION_THRESHOLD`) as verified.
**Success looks like:** The route is genuinely inaccessible/invisible to a non-moderator session, and both actions reflect immediately — the report queue empties, and the recognized badge appears back on the recipe page next to `s1`.
**Traces to:** 4.4, Session 13.

### S18 — Julia, reports an abusive comment
**Persona:** Not a moderator, just someone who saw something that shouldn't be there.
**Goal:** File a report and get clear confirmation it was received.
**Primary flow:** `/recipes/[id]` → "🚩 Zgłoś" on a public comment → pick a reason → submit → revisit the page. **Run this one first, in the same session as S17** — its whole point is giving S17 a real report to resolve instead of two disconnected personas each seeing an artificially empty or artificially populated queue.
**Success looks like:** The button becomes a disabled "Zgłoszono" label on return, and — correctly, per the documented moderation model — the comment itself is still fully visible, since a report alone never hides content.
**Traces to:** 4.4.

### S19 — Wiktor, wants to publish his own recipe
**Persona:** Cooked something great, wants it in the app.
**Goal:** Find the "add a recipe" entry point, publish a real recipe under his own name, and see it appear on the home feed like any other.
**Primary flow:** Navbar → "+ Dodaj przepis" → `/recipes/new` → fill Basics, add ingredients (reorder at least one via drag), add steps (check which ingredients each uses, reorder at least one) → publish → confirm redirect to the new recipe's real detail page → confirm it appears on `/`.
**Success looks like:** Every field round-trips exactly (ingredient order after the drag, each step's ingredient associations, author attribution) — check the published recipe against `GET /api/recipes/[id]` directly, not just the rendered page. An unauthenticated visit to `/recipes/new` shows a login prompt with a working `?redirectTo=` back to the composer, not a raw 401 or a blank page.
**Traces to:** 4.2 (now built, Session 18 — see `CLAUDE.md`'s own updated entry). **Status changed from Session 15's original version of this story**, which deliberately tested for the *absence* of this feature (`CLAUDE.md` 4.2/`FUTURES.md` §4's long-documented gap) — that gap is closed now, so the story's own job changed from "confirm it's still missing" to "confirm it actually works," the same way a QA suite's coverage should evolve alongside the app rather than staying frozen at what was true when it was first written.

### S20 — Hania, bought a new oven, comes back to update her profile
**Persona:** Completed onboarding weeks ago; her kitchen has changed since.
**Goal:** Revisit onboarding, confirm it behaves as the de facto "edit profile" screen, and see the change take effect.
**Primary flow:** Complete onboarding once (or reuse S02's profile) → revisit `/onboarding` → confirm every field is pre-filled, not blank → add the oven → resubmit → check `/` for updated badges.
**Success looks like:** The wizard pre-fills from the existing profile rather than restarting blank, and the home feed's hardware-match badges reflect the new equipment immediately after saving.
**Traces to:** 4.1, Section 7 item 14.

---

## QA process for this pass

1. `npm run dev`, tested against the real running app in an actual browser tab — not a curl/smoke-test substitute, and not the standalone logic-equivalent scripts most prior sessions relied on (this app has had no headless-browser tooling until now, per Session 11's own honest note on that limitation).
2. One story at a time, in order. Each gets a dated entry in `QA.md` — what was actually clicked through, a verdict, and any bug found.
3. **Fix on the spot only if it's severe and small** (a broken link, a genuinely wrong number, a crash) — anything bigger gets logged to `QA.md`'s running Issues Backlog instead of turning this pass into an uncontrolled refactor.
4. After all 20: `QA.md` gets a closing summary splitting findings into "interface needs work" vs. "the underlying story/use-case itself needs rethinking" — those are different kinds of finding and shouldn't be filed the same way.
