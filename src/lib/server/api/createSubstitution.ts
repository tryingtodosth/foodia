import type { Db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

export class SubstitutionValidationError extends Error {}

export interface CreateSubstitutionInput {
	forIngredientId: string;
	name: string;
	ratio: number;
	deltaMacros?: { kcal?: number; proteinG?: number; fatG?: number; carbsG?: number };
}

/** The real write side of Substitution (CLAUDE.md 4.2) — mirrors createComment.ts exactly. Always
 *  `source: 'community'`, never `'system'` — a curated, recipe-author-verified substitution is a
 *  different trust level this endpoint has no business claiming on a proposer's behalf, matching
 *  SubstitutionComposer.svelte's own client-side rule that a lay proposer never claims deltaMacros
 *  unless they explicitly provide it. */
export async function createSubstitution(
	db: Db,
	proposedById: string,
	input: CreateSubstitutionInput
): Promise<string> {
	if (!input.name?.trim()) throw new SubstitutionValidationError('Substitution name is required');
	if (!input.forIngredientId) throw new SubstitutionValidationError('forIngredientId is required');
	if (typeof input.ratio !== 'number' || input.ratio <= 0) {
		throw new SubstitutionValidationError('ratio must be a positive number');
	}

	const [ingredient] = await db
		.select({ id: schema.ingredients.id })
		.from(schema.ingredients)
		.where(eq(schema.ingredients.id, input.forIngredientId));
	if (!ingredient) throw new SubstitutionValidationError(`Ingredient not found: ${input.forIngredientId}`);

	const id = crypto.randomUUID();
	await db.insert(schema.substitutions).values({
		id,
		forIngredientId: input.forIngredientId,
		name: input.name.trim(),
		ratio: input.ratio,
		deltaMacros: input.deltaMacros ?? null,
		upCount: 0,
		downCount: 0,
		source: 'community',
		proposedById
	});
	return id;
}
