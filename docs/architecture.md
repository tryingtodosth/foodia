# Foodia — Architecture: stack, data model, API clients

> Split out of the original monolithic `CLAUDE.md` (2026-11-09). Section numbers are unchanged, so references like "CLAUDE.md 4.5" or "Section 7 item 3" in code comments and other docs still resolve — see [`docs/README.md`](README.md) for the map.

## 1. Tech stack & architecture decisions

- **Frontend:** SvelteKit + TypeScript + SCSS, packaged for iOS/Android via **Capacitor** (🎯 **web-shell built, Session 6** — see 6.1; native platforms not yet scaffolded, no Android SDK/Xcode in this environment to verify a real native build against). Confirmed by you; not revisited here.
- **Backend:** ~~Django~~ **Cloudflare-native — decided Session 16, Phase 1 built Session 17** (resolves Section 8B's own long-open "is there an existing Django project?" question outright, rather than leaving it open indefinitely). Django was the original stated direction but doesn't run natively on Workers' isolate model (no full WSGI/ASGI Python runtime) — this stack was chosen so the *whole* app, not just the static frontend, deploys through the one `wrangler` pipeline this repo already has.
  - ✅ **Built, Session 17: D1** (serverless SQLite) as the relational store — a real 12-table schema (`lib/server/db/schema.ts`) covering the Recipe Graph, accounts, and sessions — queried through **Drizzle ORM** for type-safe TS schema/queries matching this app's own TS-first discipline. Migrated via `wrangler d1 migrations`, seeded directly from the existing mock fixtures (`scripts/seed.ts`), not hand-authored data.
  - ✅ **Built, Session 17: real accounts**, replacing `AUTH_ACCOUNTS`'s plaintext mock — **not** Lucia (`lucia` is deprecated; confirmed directly against npm before choosing an approach, not assumed) but hand-rolled sessions per Lucia's own migration guide: hashed session tokens in a `sessions` table, PBKDF2-SHA256 password hashing via Web Crypto (`lib/server/auth/`) — no native bcrypt bindings exist in the Workers isolate runtime, and Web Crypto is a standard global there.
  - 🧩 P2, not yet built: **R2** for photo/video uploads (the pick `FUTURES.md` 9.5 already named); **Durable Objects** for family live-sync/swipe-to-decide (`FUTURES.md` §7); **AI Gateway** in front of a real Claude call for the Meal Planning Wizard/Recipe Adapter (`FUTURES.md` §6); Pantry/MealPlan real cross-device persistence (still `localStorage`-only); comments/reports/translations/recognized-substitutions (still session-only client stores, not yet D1 tables/endpoints, even though the schema already has tables ready for them).
  - This frontend was **mock-first** — see Section 5 for the real detail of how the swap actually happened, not just that it was promised.
- **Offline-first is a real requirement, not a nice-to-have** — the founder's own "Creator Economy & Community" round is explicit that pantry data, downloaded meal plans, and cooking-mode media must work in a basement with no signal. That means: local persistence (Capacitor's SQLite plugin, or IndexedDB for the PWA-only path) for Pantry and the active week's MealPlan, service-worker caching for a downloaded plan's assets, and a sync layer that reconciles local writes against the server once connectivity returns. This is scoped as 🧩 P2 (see 6.1) — P1 runs entirely against mock data with no real offline/sync story yet, since there's nothing to sync against.
- **One repo for now.** Frontend and (future) backend as separate repos, matching `2do`'s own split. Revisit if a monorepo turns out to matter once the backend exists.

---

## 3. Core data model — the Recipe Graph Engine

Same "Card vs Detail" weight split `2do` uses, for the same reason: a feed of many recipes needs a light shape, a recipe actually being cooked needs the full graph. `id` is always `string`.

```typescript
// lib/types/recipe.ts
export type NodeType = 'ingredient' | 'step' | 'substitution';

export interface UserRef {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MacroSummary {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface ReactionSummary {           // reused verbatim for substitutions, tips, comments
  upCount: number;
  downCount: number;
  currentUserReaction: 'up' | 'down' | null;
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;                              // g, ml, szt, łyżka — no fixed vocabulary yet
  substitutable: boolean;
  substitutions?: Substitution[];            // Detail-only
}

export interface Substitution {
  id: string;
  forIngredientId: string;
  name: string;
  ratio: number;                             // conversion factor against the original quantity
  deltaMacros?: Partial<MacroSummary>;       // delta applied to the whole recipe if chosen
  reactions?: ReactionSummary;                // community up/down — drives default sort order
  source: 'system' | 'community';
  proposedBy?: UserRef;                       // absent for 'system'
}

export interface Step {
  id: string;
  order: number;
  text: string;
  durationMinutes?: number;                   // presence of this is what renders a tappable Timer chip
  requiresEquipment?: string[];                // HardwareProfile keys — absence of the gear hides/adapts this step
  ingredientIds: string[];
}

export interface RecipeVersion {              // "Budżetowa" / "15 minut" / "Wegetariańska"
  id: string;
  label: string;
  parentRecipeId: string | null;
}

export interface RecipeCard {
  id: string;
  name: string;
  summary: string;
  heroImage: string;
  author: UserRef;
  tags: string[];
  dietFlags: string[];                        // vegan, keto, gluten-free... loose, no fixed vocabulary
  requiredEquipment: string[];
  timeMinutes: number;
  costEstimate?: { amount: number; currency: string };
  macros: MacroSummary;
  reactions?: ReactionSummary;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeDetail extends RecipeCard {
  description: string;
  ingredients: Ingredient[];
  steps: Step[];
  versions?: RecipeVersion[];
  comments?: NodeComment[];                   // flat + target, same "flat not pre-nested" call 2do made
  relationships?: RecipeRelationship[];        // 🔮 P3 — D3 graph edges, see 6.3
}

// Node-based comments — the actual point of Module 4. A comment targets a specific
// Ingredient or Step, not the recipe as a whole.
export interface NodeComment {
  id: string;
  target: { type: NodeType; id: string };
  content: string;
  visibility: 'public' | 'private';           // private = visible only to its author, never synced to others
  author: UserRef;
  reactions?: ReactionSummary;
  createdAt: string;
}

export interface RecipeRelationship {         // 🔮 P3 — see 6.3
  id: string;
  from: { type: 'recipe' | NodeType; id: string };
  to: { type: 'recipe' | NodeType; id: string; label: string };
  relationshipType: string;                   // 'is_alternative_to' | 'evolved_from' | 'base_of' | ...
  source: 'system' | 'community';
}
```

```typescript
// lib/types/user.ts
export interface HardwareProfile {
  oven: boolean;
  microwave: boolean;
  airfryer: boolean;
  blenderJug: boolean;
  kitchenScale: boolean;
  // extensible — a plain boolean map keeps Step.requiresEquipment trivial to check against
}

export interface DietProfile {
  diet: string;                               // 'omnivore' | 'vegan' | 'vegetarian' | 'keto' | ... loose
  allergies: string[];                        // hard constraint — see 4.1's guardrail note
  goals: string[];                             // 'weight_loss' | 'easy_digestion' | ...
}

export interface UserProfile {
  id: string;
  displayName: string;
  diet: DietProfile;
  hardware: HardwareProfile;
  activeSubProfileId?: string;                 // 🧩 P2 — "Goście w weekend" / "Gotowanie dla partnera"
}
```

```typescript
// lib/types/pantry.ts
export interface PantryItem {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  updatedAt: string;
}

export interface MealSlot {
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId: string;
  versionId?: string;
  servings: number;
}

export interface MealPlanDay {
  date: string;                                // ISO date
  meals: MealSlot[];
}

export interface MealPlan {
  id: string;
  userId: string;
  weekStart: string;                           // ISO date, Monday
  budget?: { amount: number; currency: string };
  days: MealPlanDay[];
}
```

**Deliberately not built yet, flagged rather than faked:** a real nutrition database backing `MacroSummary`/`deltaMacros` (today these are hand-authored numbers on mock fixtures, not computed from any ingredient-level nutrition table — see 8B, this needs a real data source before it can be trusted for anything health-related), and ~~unit-conversion tables (`cup` → `g` is ingredient-density-dependent, not a fixed ratio — see 7's issue list)~~ ✅ **built, Session 25 — see 4.10** (the density dependency is real and is handled by asking the cook once per ingredient, not by a licensed density database).

**Session 6 addition — content translation** (4.6's own data model, `RecipeCard`/`RecipeDetail` gained fields, `Translation` is new):

```typescript
// lib/types/recipe.ts — additions
export interface RecipeCard {
  // ...all fields above, plus:
  sourceLocale?: string;                        // absent means 'pl' — every mock fixture is Polish-authored
}

export type TranslatableField = 'name' | 'summary' | 'description';

export interface Translation {
  id: string;
  recipeId: string;
  locale: string;                               // not constrained to the interface's own UiLocale — see 4.6
  fields: Partial<Record<TranslatableField, string>>;
  translatedBy: UserRef;
  reactions?: ReactionSummary;                  // lets the community vote among competing submissions
  createdAt: string;
}

export interface RecipeDetail extends RecipeCard {
  // ...all fields above, plus:
  translations?: Translation[];                 // Detail-only, same weight-split as comments/relationships
}
```

---

## 5. Mocking strategy (same shape as `2do`'s Section 5.1)

```typescript
// lib/api/client.ts
export interface RecipeApiClient {
  getCard(id: string): Promise<RecipeCard>;
  getDetail(id: string): Promise<RecipeDetail>;
  list(filters?: Record<string, unknown>): Promise<RecipeCard[]>;
}
```

`mockApiClient` reads from `lib/api/mock/*.mock.ts` fixtures shaped exactly like `RecipeCard`/`RecipeDetail`. ✅ **The real swap happened, Session 17** — two concrete implementations now exist, not one: `lib/server/api/dbApiClient.ts` (`createDbApiClient(db)`, D1-backed, server-only) for every `+page.server.ts` load, and `lib/api/http.ts` (`httpApiClient`, fetch-based against the new `/api/recipes` routes) for the one call site that's genuinely client-only (`/shopping-list`). `lib/server/api/client.ts`'s `getRecipeApiClient(platform)` picks `dbApiClient` when a live D1 binding exists and falls back to `mockApiClient` otherwise — not a hedge, a real architectural necessity, since the Capacitor build's static output can never have a live D1 binding to fall back FROM (see that file's own header comment). Components still only ever import the `RecipeApiClient` interface, never a concrete implementation — the promise this section originally made turned out to hold exactly as stated, three years and one payoff later.
