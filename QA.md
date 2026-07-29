# Foodia — Live Interface QA (against `STORIES.md`)

**Status:** results of walking all 20 `STORIES.md` personas through the actual running app, live, story by story. Run 2026-07-29, local only — the `foodia.net` push happens later, out of scope here.

**Method, and a real detour worth recording.** The plan was to drive this session's actual Chrome via the Claude-in-Chrome extension, but it wasn't connected in this environment. Rather than fall back to a non-interactive curl/SSR pass (which can't exercise localStorage, cookies, timers, or clicks — the exact things most of these stories hinge on), a headless Chromium was installed locally via Playwright (`/tmp/.../scratchpad/qa-runner`, not part of this repo) and driven programmatically against `npm run dev` at `http://localhost:5174/`. This is genuinely interactive testing — real clicks, real `localStorage`/cookie state, a real DOM — just automated instead of hand-driven. Screenshots for each story are in `qa-screenshots/` in this repo.

**A methodology note, stated plainly since it shaped this whole pass:** the first full run produced 8 "CHECK" results out of 20. Every single one turned out to be a bug in the *test script* (a wrong CSS class guessed from a stale memory of the CSS, a text selector too broad and matching an unrelated button, a wrong `localStorage` key, a wrong assumption about which fixture recipes require which appliance) — except **one**, which turned out to be a real, fixed-on-the-spot application bug (Issue #1 below). Each script bug was root-caused against the actual component source before being called a bug or a false alarm — worth being explicit about that discipline, since "the test failed" and "the app is broken" are different claims, and conflating them would have wrongly flagged 7 working features.

**Final result: 20/20 PASS**, one of them only after a real fix (Issue #1). Every entry below states what passed on its own merits vs. what was corrected first.

---

## S01 — Ania, cold browse, no profile — ✅ PASS
Home feed loaded with all 3 fixture recipes, zero hardware-match badges (correct — no profile exists), and clicking into a card genuinely navigated to that recipe's detail page (`/recipes/r1`, real h1 "Spaghetti Bolognese w 30 minut"). *(First run's h1 check read the home page's own heading due to a race in the test script, not the app — fixed by waiting on the URL instead of just network-idle.)*
📸 `qa-screenshots/S01-detail.png`

## S02 — Marta, first onboarding wizard — ✅ PASS
Wizard completed end-to-end (diet, allergies, goals, hardware), saved to `localStorage['foodia-profile']` correctly, and the home feed re-rendered post-onboarding. *(The original story assumption — "hardware-match badges should appear for an oven-only profile" — was wrong, not the app: checked directly against `recipes.mock.ts`, and no fixture recipe declares `requiredEquipment: ['oven']` at the recipe level, only `kitchenScale` and `airfryer` ever do. Zero badges is the correct result for this profile. `STORIES.md` S02's own success criteria should be read as "badges reflect the real fixture corpus," not "any hardware pre-fill produces a badge.")*
📸 `qa-screenshots/S02-after-home.png`

## S03 — Tomek, peanut allergy guardrail — ✅ PASS
Onboarded with allergy `orzechy`, opened the recipe whose "Mleko" ingredient carries the known peanut-milk community substitution, expanded every swap panel on the page. The substitution's name never appeared anywhere — not collapsed, not expanded, not in the vote list. `filterSafeSubstitutions` held under direct interactive testing, not just its own standalone verification script (Session 9).
📸 `qa-screenshots/S03-recipe-expanded.png`

## S04 — Kasia, no airfryer, step alternative — ✅ PASS
`airfryerFries` stayed visible on the feed for an oven-only profile (cookability reconciliation, 4.9/Session 10, holds under a real click-through). The detail page's equipment-mismatch badge named the missing airfryer, and Cooking Mode auto-suggested the oven technique once actually advanced to the airfryer step (st9) — step 1 needs no equipment at all, so the first screen legitimately has nothing to show yet, which the original test script didn't account for.
📸 `qa-screenshots/S04-cook.png`

## S05 — Piotr, Cooking Mode / Wake Lock / timer — ✅ PASS
Tap-anywhere-to-advance worked correctly (confirmed via screenshot: step counter moved 1/5 → 2/5). The step's 8-minute duration button ("Uruchom minutnik") started a real countdown, `role="timer"` appeared. **One real, worth-noting observation, not a bug:** the Wake Lock indicator stayed on "⏳" (pending) rather than flipping to active — plausibly a headless-Chromium/background-tab restriction on the Wake Lock API rather than an app defect (CLAUDE.md Section 7 item 9 already documents this exact API as inconsistent across WebViews). Logged in the backlog below as worth a manual check on a real device/tab, not treated as a confirmed bug from an automated headless run.
📸 `qa-screenshots/S05-timer.png`

## S06 — Basia, private comment — ✅ PASS
Comment composer opened, private toggle checked, submitted, rendered immediately with no vote buttons (private comments correctly aren't votable). *(First attempt clicked the wrong toggle — this app renders the substitution-composer's toggle before the comment-composer's toggle in DOM order for a substitutable ingredient, and a generic `.composer-toggle` selector grabbed the first one. Fixed by matching the exact visible text instead of the shared CSS class.)*
📸 `qa-screenshots/S06-after-submit.png`

## S07 — Rafał, propose a substitution — ✅ PASS
Proposed "Kasza jaglana," it appeared in the swap list same-session with no reload, was selectable, and the page stayed stable after choosing it. *(First attempt's text selector for the propose button was too broad and matched the page's own "🌍 Zaproponuj tłumaczenie" translation-suggestion button instead, since both contain the word "Zaproponuj" and the translation button sits higher in the DOM. Fixed by matching the full button text.)*
📸 `qa-screenshots/S07-after-propose.png`

## S08 — Ola, vote on a substitution — ✅ PASS
Upvote count moved 12 → 13 immediately on click, no page reload, matching the documented optimistic-override behavior.
📸 `qa-screenshots/S08-after-vote.png`

## S09 — Michał, /plan quick-fill + budget — ✅ PASS
Set an 80 PLN weekly budget, quick-fill populated 8 of 28 slots and stopped rather than overshoot (final total: 78/80 PLN), and the UI copy explicitly disclaims being real AI, exactly as documented.
📸 `qa-screenshots/S09-after-fill.png`

## S10 — Zofia, pantry + shopping list loop — ✅ PASS
Added "Sól, 200g" to the pantry twice in a row — confirmed it merges into one row, not two (the Session 12 dedup fix holds under a real double-submit, not just its own script). Full shopping list (12 items, correctly excluding "Sól" since no fixture recipe uses it) rendered with a working "Kupione → dodaj do spiżarni" button on every row. *(The first pass's "0 buy buttons" reading was the test script screenshotting during the shopping list's own real, brief `Liczenie listy...` async-load window — re-verified after waiting it out; not an app bug.)*
📸 `qa-screenshots/S10-shopping-list-loaded.png`

## S11 — Ewa, language switcher persistence — ✅ PASS
Switched to English, `<html lang>` and every visible string updated instantly, and a full tab reload kept it in English (cookie persistence, not just in-memory state).
📸 `qa-screenshots/S11-after-reload.png`

## S12 — Grzegorz, View Original stays original — ✅ PASS
With the interface in English, r1 auto-resolved to its real community translation ("Spaghetti Bolognese in 30 Minutes"). Clicking "View Original" correctly showed the true Polish original and — the specific thing Session 6 fixed and this story exists to re-verify — did **not** silently re-resolve back to the English translation.
📸 `qa-screenshots/S12-view-original.png`

## S13 — Nina, AND-mode tag filter (the Paprika bug check) — ✅ PASS
Selecting two tags under the default AND mode returned the true intersection (0 recipes — this tiny 3-recipe fixture corpus has no recipe carrying both arbitrary tags chosen), and switching the same two tags to OR mode widened the result to 2, demonstrably different — proof the AND/OR distinction is real, not cosmetic. *(First attempt's OR-toggle selector matched on the English words "OR"/"LUB," but the actual Polish label is "dowolny" — fixed by selecting the second segmented-control button positionally instead of guessing the label.)*
📸 `qa-screenshots/S13-and-two-tags.png`, `qa-screenshots/S13-or-two-tags.png`

## S14 — Dawid, exclusion pill cycling — ✅ PASS
Cycled the `#airfryer` pill from neutral → include → exclude; recipe count dropped from 3 to 2, correctly removing the one recipe carrying that tag.
📸 `qa-screenshots/S14-excluded.png`

## S15 — Iga, register with validation recovery — ✅ PASS
Mismatched password confirmation produced an immediate, specific error ("Hasła się nie zgadzają") and disabled the submit button; fixing it and resubmitting logged her in immediately, with the navbar showing "Iga Nowak."
📸 `qa-screenshots/S15-after-register.png`

## S16 — Bartek, password reset enumeration-safety — ✅ PASS
A real registered email and a made-up one produced byte-for-byte the same generic response. No account-existence leak.
📸 `qa-screenshots/S16-fake-email.png`

## S17 — piotr, moderator dashboard — ✅ PASS
Logged in as `piotr@foodia.net`, the "Moderacja" link appeared in the avatar dropdown (and only for this account), `/moderation` rendered with no access-denied gate. **Genuine limitation of this pass, not a bug:** the pending-reports and eligible-substitutions queues were both empty in this fresh browser context, so the actual Remove/Dismiss/Mark-as-verified *actions* weren't exercised end-to-end — only that the page and its gating work. Logged as a follow-up in the backlog.
📸 `qa-screenshots/S17-moderation-page.png`

## S18 — Julia, report a comment — ✅ PASS
Filed a report on a public comment on r1; on return, the toggle correctly became a disabled "Zgłoszono" label, and the comment itself stayed fully visible (a report alone never hides content, matching the documented moderation model).
📸 `qa-screenshots/S18-after-report.png`

## S19 — Wiktor, no recipe-creation entry point (expected gap) — ✅ PASS (gap confirmed)
No "add/create a recipe" wording anywhere in the navbar or home page; `GET /recipes/new` returned a real 404. This story exists specifically to verify the documented gap (`CLAUDE.md` 4.2 / `FUTURES.md` §4) is still accurate against the live app — it is.
📸 `qa-screenshots/S19-home.png`

## S20 — Hania, revisit onboarding as edit-profile — ✅ PASS (after a real fix — see Issue #1)
Revisiting `/onboarding` on a fresh page load now correctly pre-fills every field (diet, goals, hardware) from the saved profile, adding a second appliance and resaving correctly preserves the first. **This did not pass on the first attempt** — see Issue #1, fixed during this session.
📸 `qa-screenshots/S20-step1-prefilled.png`, `qa-screenshots/S20-after-save.png`

---

## Issues Backlog

### Issue #1 — Onboarding didn't pre-fill on a fresh page load, and would have silently overwritten a saved profile — 🔴 FIXED ON THE SPOT
**Found via:** S20. **Severity:** real data loss on a very ordinary path (closing and reopening the browser, typing the URL directly, or any full page load of `/onboarding` rather than an in-app link click) — exactly the "really bad, fix now" bar.

`routes/onboarding/+page.svelte` read `profileStore.profile` into a plain `const existing` at component-script top level. `profileStore` is deliberately *lazily* hydrated from `localStorage` via a `$effect` in the root layout (by design — see `profile.svelte.ts`'s own header comment on why, to avoid an SSR/client hydration mismatch). On an in-app client-side navigation this was invisible, because hydration had already run earlier in the tab's life. But on any **fresh full page load** of `/onboarding` — confirmed directly: a profile saved as `{"diet":"vegetarian","goals":["budget"],"hardware":{"oven":true,...}}` in `localStorage` produced a wizard that opened on `omnivore`, zero goals, and zero hardware checked, every time — `const existing` was evaluated before the root layout's hydrate effect had a chance to run, and being a plain `const`, never updated once hydration completed a moment later. Confirmed with a standalone reproduction script isolating this from the rest of the test suite before calling it a bug, not assumed from the first CHECK result.

The real consequence isn't just a blank-looking form: `finish()` unconditionally calls `profileStore.save()` with whatever the form currently holds. A returning user who opened `/onboarding` to tweak one setting, didn't notice the rest had reset to defaults, and clicked "Gotowe" would have **silently wiped their real diet/allergy/goal/hardware profile** — directly contradicting the feature's own documented purpose (`CLAUDE.md` Section 7 item 14: revisiting onboarding is supposed to double as "edit profile," not "reset profile").

**Fix:** gated the pre-fill on `profileStore.hydrated` (the flag that store already exposes for exactly this class of problem) via a `$effect` that seeds the form fields once, the moment hydration actually completes — works identically whether hydration happened moments ago (SPA nav) or is happening right now (fresh load). Verified live: `S20-step1-prefilled.png` shows the correct diet pre-checked on a genuinely fresh tab; the saved profile after adding a second appliance correctly retained the first (`hardware.oven === true && hardware.microwave === true`). `npm run check` clean (0 errors) after the fix, no new warnings beyond the pre-existing baseline.

### Issue #2 — Wake Lock stays "pending," never "active," under headless Chromium — 🟡 NEEDS A REAL-DEVICE CHECK, not filed as confirmed
S05 never saw the wake indicator flip from ⏳ to active. Plausibly an automated/headless-browser restriction on the Wake Lock API rather than a real app defect — CLAUDE.md Section 7 item 9 already flags Wake Lock support as inconsistent across WebViews in general, and P2's own plan already calls for a native Capacitor fallback for exactly this reason. Worth a two-minute manual check in a real foregrounded tab before treating this as anything more than an automated-testing artifact.

### Issue #3 — Moderator actions weren't exercised end-to-end — 🟢 RESOLVED (story fixed, then re-verified live)
Originally: S17 confirmed the gate and the page render, but the fixture corpus's report/eligibility queues were empty in a fresh mock session, so the actual resolve actions never ran against real data. `STORIES.md` S17/S18 were rewritten (2026-07-29) so S18 files a report and S17 resolves it in one continuous session. Re-ran the combined flow live to confirm the fix actually closes the loop, not just that the wording reads better:
- Julia's report showed up correctly in piotr's `/moderation` queue, in the same browser session, with full denormalized context ("W przepisie: Spaghetti Bolognese w 30 minut — Czosnek · Powód: Spam").
- Clicking "Usuń komentarz" resolved it, and navigating back to `/recipes/r1` showed the real tombstone ("Komentarz usunięty przez moderatora.") in place of the original comment — the full report → review → remove lifecycle, live, not just the standalone 19-assertion script Session 13 originally verified this against.
- **A real methodology trap found along the way, worth recording since it'll bite the next QA pass too:** the first two attempts at this combined flow used `page.waitForLoadState('networkidle')` after clicking in-app links, and both times the report appeared to have vanished by the time `/moderation` loaded. It hadn't — `waitForLoadState('networkidle')` doesn't reliably signal completion for SvelteKit's client-side (pushState) route transitions the way it does for a real full page load, since no new network "load" event necessarily fires. Reading `page.url()` or checking the DOM immediately after such a click can catch the page mid-transition. Fixed by waiting on a concrete post-navigation signal (a fixed short delay or a selector unique to the destination page) instead of `networkidle` for in-app SPA navigations specifically. This came very close to being logged as a second real app bug (state not surviving client-side navigation) before being traced back to the test's own wait strategy — a reminder to keep applying this session's own standing discipline (root-cause every failure against the actual source/behavior before calling it a bug).

### Issue #4 — `STORIES.md` S02's success criteria over-specified an expectation the fixture data can't satisfy — 🟡 story wording, already corrected in this pass's write-up above
S02's original text implied any hardware pre-fill should produce a feed badge. In reality only `kitchenScale` and `airfryer` are ever declared as recipe-level requirements in the fixture corpus — an oven-only profile legitimately produces zero badges. Not a bug in the app; `STORIES.md` S02 is worth rewording next time it's touched so a future QA pass doesn't re-flag the same non-issue.

---

## Closing summary

**Interface itself needed work:** one real thing (Issue #1), now fixed — a genuine hydration-ordering bug with real data-loss consequences, caught only because a live interactive pass (not a curl/SSR check, and not the standalone logic scripts most prior sessions relied on) actually reloaded the page the way a returning user would. This is a good, concrete argument for keeping some form of real browser QA in the loop going forward, not just type-checking and mock-data scripts — this exact class of bug is structurally invisible to both.

**The stories/use-cases themselves needed adjusting**, not the app: two of the twenty (S02, S17) had success criteria that didn't match either the real fixture data or the real single-session scope of this pass. Both are called out above rather than quietly patched — and S17's fix was re-verified live afterward (Issue #3), not just assumed correct because the wording read better.

**Everything else (18 of 20 stories) passed on the app's own merits**, several of them re-confirming specific, previously-fixed bugs (Session 6's View Original bug, Session 9's allergy-declension fix, Session 12's pantry dedup and AND/OR filter fix) actually hold under live interaction, not just their own original standalone verification scripts — a real form of regression coverage this app didn't have before this session.

**Next up, per the standing plan:** other adjustments from `CLAUDE.md`/`FUTURES.md`'s own accumulated reports.
