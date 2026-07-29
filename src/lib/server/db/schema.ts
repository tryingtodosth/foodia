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
	createdAt: text('created_at').notNull()
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
