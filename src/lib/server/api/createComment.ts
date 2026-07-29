import type { Db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

export class CommentValidationError extends Error {}

export interface CreateCommentInput {
	recipeId: string;
	targetType: 'ingredient' | 'step' | 'substitution' | 'step_alternative';
	targetId: string;
	content: string;
	visibility: 'public' | 'private';
}

/** The real write side of NodeComment (CLAUDE.md 4.4) — `assembleRecipeDetail` (dbApiClient.ts)
 *  already reads from the `comments` table (built alongside it in Session 17, for recipes created
 *  after that point), this is the missing insert half. Requires a real author, same reasoning
 *  `createRecipe.ts` already gives for requiring one — an anonymous-authored comment has no
 *  identity to attribute a report to later (4.4's own moderation model needs a real `commentAuthorId`). */
export async function createComment(
	db: Db,
	authorId: string,
	input: CreateCommentInput
): Promise<string> {
	if (!input.content?.trim()) throw new CommentValidationError('Comment content is required');
	if (!input.recipeId) throw new CommentValidationError('recipeId is required');
	if (!input.targetId) throw new CommentValidationError('targetId is required');

	const [recipe] = await db
		.select({ id: schema.recipes.id })
		.from(schema.recipes)
		.where(eq(schema.recipes.id, input.recipeId));
	if (!recipe) throw new CommentValidationError(`Recipe not found: ${input.recipeId}`);

	const id = crypto.randomUUID();
	await db.insert(schema.comments).values({
		id,
		recipeId: input.recipeId,
		targetType: input.targetType,
		targetId: input.targetId,
		content: input.content.trim(),
		visibility: input.visibility,
		authorId,
		upCount: 0,
		downCount: 0,
		createdAt: new Date().toISOString()
	});
	return id;
}
