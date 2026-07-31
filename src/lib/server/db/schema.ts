// The D1 schema (CLAUDE.md Section 1, Session 16 — Cloudflare-native, not Django). Deliberately
// scoped to Phase 1 only: the Recipe Graph (recipes/ingredients/steps/substitutions/step
// alternatives/versions), accounts+sessions, and the moderation/translation write-side that
// already exists client-side against mock data. Pantry/MealPlan (real cross-device sync) are
// explicitly Phase 2 — see FUTURES.md 9's own "sequencing, stated plainly" note — not modeled here
// yet, not an oversight.
//
// `id` is always `string`, matching the existing TS contract (lib/types/recipe.ts's own header
// note) — every table reuses the exact ids the mock fixtures already use ('r1', 'i1', 's1', ...)
// rather than switching to autoincrement/UUID, so the seed script (Task 27) is a direct,
// verifiable copy, not a re-keying exercise.
//
// `currentUserReaction` (ReactionSummary) is deliberately NOT a column anywhere — it's a
// per-viewer computed field, not stored state, and real per-user vote tracking (a genuine, separate
// feature: a reactions table keyed by (targetType, targetId, userId)) is out of scope for Phase 1,
// matching the fact that even the mock-era client never persisted a vote past a page reload either
// — this is a like-for-like scope, not a new regression.
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	displayName: text('display_name').notNull(),
	avatarUrl: text('avatar_url'),
	isModerator: integer('is_moderator', { mode: 'boolean' }).notNull().default(false),
	// Session 26 — per-account permission to upload real media (R2), deliberately default-off for
	// EVERY account including the admin's own: an upload path that writes real bytes to real
	// storage is the first thing in this app a stranger with an account could abuse, so the honest
	// default is "nobody, until someone is explicitly granted it" rather than "everyone with a
	// login." Granted only from /admin's own users table — there is no self-service path to it,
	// which is the whole point. Note this is NOT the admin flag: admin identity comes from the
	// ADMIN_EMAILS env allowlist (lib/server/auth/admin.ts), never from a column the app can write.
	canUpload: integer('can_upload', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').notNull()
});

// Hand-rolled sessions (no Lucia — deprecated, confirmed against npm directly before choosing this
// path). `id` here is the SHA-256 hash of the raw session token; the raw token is what's set in the
// cookie and never stored itself, so a leaked DB row alone can't be replayed as a session.
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull() // unix ms
});

export const recipes = sqliteTable('recipes', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	summary: text('summary').notNull(),
	description: text('description').notNull(),
	heroImage: text('hero_image').notNull(),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	// Loose, no fixed vocabulary — same "free text, not an enum" decision lib/types/recipe.ts's own
	// header comment already states for these two fields; a JSON array column is the honest match
	// for that, not a normalized tags table implying a fixed taxonomy that doesn't exist.
	tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
	dietFlags: text('diet_flags', { mode: 'json' }).$type<string[]>().notNull(),
	requiredEquipment: text('required_equipment', { mode: 'json' }).$type<string[]>().notNull(),
	timeMinutes: integer('time_minutes').notNull(),
	costAmount: real('cost_amount'),
	costCurrency: text('cost_currency'),
	kcal: integer('kcal').notNull(),
	proteinG: real('protein_g').notNull(),
	fatG: real('fat_g').notNull(),
	carbsG: real('carbs_g').notNull(),
	upCount: integer('up_count').notNull().default(0),
	downCount: integer('down_count').notNull().default(0),
	sourceLocale: text('source_locale'),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull()
});

export const recipeVersions = sqliteTable('recipe_versions', {
	id: text('id').primaryKey(),
	recipeId: text('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	parentRecipeId: text('parent_recipe_id')
});

export const ingredients = sqliteTable('ingredients', {
	id: text('id').primaryKey(),
	recipeId: text('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	orderIndex: integer('order_index').notNull(),
	name: text('name').notNull(),
	quantity: real('quantity').notNull(),
	unit: text('unit').notNull(),
	substitutable: integer('substitutable', { mode: 'boolean' }).notNull().default(false)
});

export const substitutions = sqliteTable('substitutions', {
	id: text('id').primaryKey(),
	forIngredientId: text('for_ingredient_id')
		.notNull()
		.references(() => ingredients.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	ratio: real('ratio').notNull(),
	deltaMacros: text('delta_macros', { mode: 'json' }).$type<
		Partial<{ kcal: number; proteinG: number; fatG: number; carbsG: number }>
	>(),
	upCount: integer('up_count').notNull().default(0),
	downCount: integer('down_count').notNull().default(0),
	source: text('source', { enum: ['system', 'community'] }).notNull(),
	proposedById: text('proposed_by_id').references(() => users.id)
});

export const steps = sqliteTable('steps', {
	id: text('id').primaryKey(),
	recipeId: text('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	orderIndex: integer('order_index').notNull(),
	text: text('text').notNull(),
	durationMinutes: integer('duration_minutes'),
	requiresEquipment: text('requires_equipment', { mode: 'json' }).$type<string[]>(),
	// Matches Step.ingredientIds' own existing shape (a flat id-reference array, not a separate
	// relation with its own identity) — a join table here would model a relationship this app's own
	// type never treats as independently queryable, not a simplification that loses anything real.
	ingredientIds: text('ingredient_ids', { mode: 'json' }).$type<string[]>().notNull()
});

export const stepAlternatives = sqliteTable('step_alternatives', {
	id: text('id').primaryKey(),
	forStepId: text('for_step_id')
		.notNull()
		.references(() => steps.id, { onDelete: 'cascade' }),
	text: text('text').notNull(),
	requiresEquipment: text('requires_equipment', { mode: 'json' }).$type<string[]>(),
	durationMinutes: integer('duration_minutes'),
	// Session 22 — an ingredient swap can require a step to change too (a longer bake time, a
	// different technique), not just an equipment substitute. Nullable and `set null` on delete:
	// this alternative is real, standalone content the moment it exists — losing the substitution
	// it was proposed alongside shouldn't take the step-level fix down with it.
	triggeredBySubstitutionId: text('triggered_by_substitution_id').references(() => substitutions.id, {
		onDelete: 'set null'
	}),
	upCount: integer('up_count').notNull().default(0),
	downCount: integer('down_count').notNull().default(0),
	source: text('source', { enum: ['system', 'community'] }).notNull(),
	proposedById: text('proposed_by_id').references(() => users.id)
});

export const comments = sqliteTable('comments', {
	id: text('id').primaryKey(),
	// Denormalized, not looked up via targetId alone — the same "carry a label, avoid a lookup"
	// convention CommentReport (moderation.ts) already establishes client-side, reused here so a
	// query for "every comment on this recipe" never needs a join through ingredients/steps first.
	recipeId: text('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	targetType: text('target_type', {
		enum: ['ingredient', 'step', 'substitution', 'step_alternative']
	}).notNull(),
	targetId: text('target_id').notNull(),
	content: text('content').notNull(),
	visibility: text('visibility', { enum: ['public', 'private'] }).notNull(),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	upCount: integer('up_count').notNull().default(0),
	downCount: integer('down_count').notNull().default(0),
	createdAt: text('created_at').notNull(),
	// Session 26 — a moderator removal is a soft delete, not a DELETE: the recipe page renders a
	// tombstone ("removed by a moderator") in place of the content, which needs the row to still
	// exist, and /activity's own "your comments a moderator removed" section needs it too. The
	// content column is left intact deliberately — a removal must be reviewable/reversible by an
	// admin, and the read path (assembleRecipeDetail) is what strips the text before it ever
	// reaches a viewer, so nothing leaks by keeping it.
	removedAt: text('removed_at'),
	removedById: text('removed_by_id').references(() => users.id)
});

export const commentReports = sqliteTable('comment_reports', {
	id: text('id').primaryKey(),
	commentId: text('comment_id')
		.notNull()
		.references(() => comments.id, { onDelete: 'cascade' }),
	// Same denormalization CommentReport already carries client-side (recipeId/recipeName/
	// targetLabel/commentContent/commentAuthor) — kept identical here, not re-derived via joins,
	// so /moderation and /activity's own queries stay exactly as cheap as their client-side
	// equivalents already are.
	recipeId: text('recipe_id').notNull(),
	recipeName: text('recipe_name').notNull(),
	targetLabel: text('target_label').notNull(),
	commentContent: text('comment_content').notNull(),
	commentAuthorId: text('comment_author_id').notNull(),
	reason: text('reason', { enum: ['spam', 'abuse', 'unsafe', 'other'] }).notNull(),
	reportedById: text('reported_by_id').notNull(),
	status: text('status', { enum: ['pending', 'removed', 'dismissed'] })
		.notNull()
		.default('pending'),
	createdAt: text('created_at').notNull()
});

export const translations = sqliteTable('translations', {
	id: text('id').primaryKey(),
	recipeId: text('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	locale: text('locale').notNull(),
	fields: text('fields', { mode: 'json' })
		.$type<Partial<{ name: string; summary: string; description: string }>>()
		.notNull(),
	translatedById: text('translated_by_id')
		.notNull()
		.references(() => users.id),
	upCount: integer('up_count').notNull().default(0),
	downCount: integer('down_count').notNull().default(0),
	createdAt: text('created_at').notNull()
});

// Mirrors substitutionModeration.svelte.ts's own store exactly — a substitution id is either in
// this table (recognized) or it isn't, no separate boolean column on `substitutions` itself,
// matching that store's own "explicit approval, not a silent vote-count auto-promotion" note.
export const recognizedSubstitutions = sqliteTable('recognized_substitutions', {
	substitutionId: text('substitution_id')
		.primaryKey()
		.references(() => substitutions.id, { onDelete: 'cascade' }),
	recognizedAt: text('recognized_at').notNull()
});
