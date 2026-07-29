// Generates drizzle/seed.sql from the EXISTING mock fixtures (recipes.mock.ts/auth.mock.ts) —
// not hand-authored seed data. The point is a provable equivalence check: the real D1 rows should
// be a direct, verifiable copy of what the mock-era client has been serving all along, not a
// re-authored approximation of it. Run with `npx tsx scripts/seed.ts`, then apply the output via
// `wrangler d1 execute foodia-db --local --file=drizzle/seed.sql`.
//
// Deliberately outside `src/` and using relative imports, not the `$lib` alias — this runs under
// plain tsx/Node, not SvelteKit's own resolver. Only safe because every import this pulls in is
// either `import type` (erased entirely at compile time, esbuild never tries to resolve it) or a
// plain relative import — checked directly against both source files before relying on this.
import { writeFileSync } from 'node:fs';
import { spaghettiBolognese, overnightOats, airfryerFries, piotr, ania } from '../src/lib/api/mock/recipes.mock';
import { AUTH_ACCOUNTS } from '../src/lib/api/mock/auth.mock';
import { hashPassword } from '../src/lib/server/auth/password';
import type { RecipeDetail } from '../src/lib/types/recipe';

const NOW = '2026-07-29T00:00:00Z';

function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}
function sqlJson(value: unknown): string {
	return sqlString(JSON.stringify(value ?? null));
}
function sqlValue(value: unknown): string {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return value ? '1' : '0';
	return sqlString(String(value));
}

function insertStatement(table: string, rows: Record<string, unknown>[]): string {
	if (rows.length === 0) return '';
	const columns = Object.keys(rows[0]);
	const values = rows
		.map((row) => `(${columns.map((c) => sqlValue(row[c])).join(', ')})`)
		.join(',\n\t');
	return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n\t${values};`;
}

async function main() {
	const statements: string[] = [];

	// --- users, real hashed passwords for the two mock accounts (never plaintext, even seeded) ---
	const userRows = await Promise.all(
		AUTH_ACCOUNTS.map(async (acc) => ({
			id: acc.user.id,
			email: acc.email,
			password_hash: await hashPassword(acc.password),
			display_name: acc.user.displayName,
			avatar_url: acc.user.avatarUrl,
			is_moderator: 'isModerator' in acc.user && acc.user.isModerator ? 1 : 0,
			created_at: NOW
		}))
	);
	statements.push(insertStatement('users', userRows));

	const recipes: RecipeDetail[] = [spaghettiBolognese, overnightOats, airfryerFries];

	const recipeRows: Record<string, unknown>[] = [];
	const versionRows: Record<string, unknown>[] = [];
	const ingredientRows: Record<string, unknown>[] = [];
	const substitutionRows: Record<string, unknown>[] = [];
	const stepRows: Record<string, unknown>[] = [];
	const stepAltRows: Record<string, unknown>[] = [];
	const commentRows: Record<string, unknown>[] = [];
	const translationRows: Record<string, unknown>[] = [];

	for (const r of recipes) {
		recipeRows.push({
			id: r.id,
			name: r.name,
			summary: r.summary,
			description: r.description,
			hero_image: r.heroImage,
			author_id: r.author.id,
			tags: JSON.stringify(r.tags),
			diet_flags: JSON.stringify(r.dietFlags),
			required_equipment: JSON.stringify(r.requiredEquipment),
			time_minutes: r.timeMinutes,
			cost_amount: r.costEstimate?.amount ?? null,
			cost_currency: r.costEstimate?.currency ?? null,
			kcal: r.macros.kcal,
			protein_g: r.macros.proteinG,
			fat_g: r.macros.fatG,
			carbs_g: r.macros.carbsG,
			up_count: r.reactions?.upCount ?? 0,
			down_count: r.reactions?.downCount ?? 0,
			source_locale: r.sourceLocale ?? null,
			created_at: r.createdAt,
			updated_at: r.updatedAt
		});

		for (const v of r.versions ?? []) {
			versionRows.push({
				id: `${r.id}::${v.id}`, // versions aren't globally unique ids in the mock (r1's own id IS a version id) — namespaced here since this table's id is its own primary key, not FK'd elsewhere
				recipe_id: r.id,
				label: v.label,
				parent_recipe_id: v.parentRecipeId
			});
		}

		for (const [ingIndex, ing] of r.ingredients.entries()) {
			ingredientRows.push({
				id: ing.id,
				recipe_id: r.id,
				order_index: ingIndex,
				name: ing.name,
				quantity: ing.quantity,
				unit: ing.unit,
				substitutable: ing.substitutable ? 1 : 0
			});
			for (const sub of ing.substitutions ?? []) {
				substitutionRows.push({
					id: sub.id,
					for_ingredient_id: sub.forIngredientId,
					name: sub.name,
					ratio: sub.ratio,
					delta_macros: sub.deltaMacros ? JSON.stringify(sub.deltaMacros) : null,
					up_count: sub.reactions?.upCount ?? 0,
					down_count: sub.reactions?.downCount ?? 0,
					source: sub.source,
					proposed_by_id: sub.proposedBy?.id ?? null
				});
			}
		}

		for (const [stepIndex, step] of r.steps.entries()) {
			stepRows.push({
				id: step.id,
				recipe_id: r.id,
				order_index: stepIndex,
				text: step.text,
				duration_minutes: step.durationMinutes ?? null,
				requires_equipment: step.requiresEquipment ? JSON.stringify(step.requiresEquipment) : null,
				ingredient_ids: JSON.stringify(step.ingredientIds)
			});
			for (const alt of step.alternatives ?? []) {
				stepAltRows.push({
					id: alt.id,
					for_step_id: alt.forStepId,
					text: alt.text,
					requires_equipment: alt.requiresEquipment ? JSON.stringify(alt.requiresEquipment) : null,
					duration_minutes: alt.durationMinutes ?? null,
					up_count: alt.reactions?.upCount ?? 0,
					down_count: alt.reactions?.downCount ?? 0,
					source: alt.source,
					proposed_by_id: alt.proposedBy?.id ?? null
				});
			}
		}

		for (const c of r.comments ?? []) {
			commentRows.push({
				id: c.id,
				recipe_id: r.id,
				target_type: c.target.type,
				target_id: c.target.id,
				content: c.content,
				visibility: c.visibility,
				author_id: c.author.id,
				up_count: c.reactions?.upCount ?? 0,
				down_count: c.reactions?.downCount ?? 0,
				created_at: c.createdAt
			});
		}

		for (const t of r.translations ?? []) {
			translationRows.push({
				id: t.id,
				recipe_id: r.id,
				locale: t.locale,
				fields: JSON.stringify(t.fields),
				translated_by_id: t.translatedBy.id,
				up_count: t.reactions?.upCount ?? 0,
				down_count: t.reactions?.downCount ?? 0,
				created_at: t.createdAt
			});
		}
	}

	statements.push(insertStatement('recipes', recipeRows));
	statements.push(insertStatement('recipe_versions', versionRows));
	statements.push(insertStatement('ingredients', ingredientRows));
	statements.push(insertStatement('substitutions', substitutionRows));
	statements.push(insertStatement('steps', stepRows));
	statements.push(insertStatement('step_alternatives', stepAltRows));
	statements.push(insertStatement('comments', commentRows));
	statements.push(insertStatement('translations', translationRows));

	const sql = statements.filter(Boolean).join('\n\n');
	writeFileSync(new URL('../drizzle/seed.sql', import.meta.url), sql + '\n');
	console.log(
		`Wrote drizzle/seed.sql — ${recipeRows.length} recipes, ${ingredientRows.length} ingredients, ${substitutionRows.length} substitutions, ${stepRows.length} steps, ${stepAltRows.length} step alternatives, ${commentRows.length} comments, ${translationRows.length} translations, ${userRows.length} users.`
	);
}

main();
