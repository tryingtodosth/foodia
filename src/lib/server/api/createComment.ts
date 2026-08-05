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
	/** Session 27 — see `NodeComment.kind`. Absent means an ordinary note. */
	kind?: 'note' | 'story';
	/** Session 27 — a `/api/media/[key]` path produced by this app's own upload route. Validated
	 *  here rather than trusted: a client posting an arbitrary URL would turn every comment thread
	 *  into an off-site image embed (a tracking pixel, a hotlink, something this app cannot take
	 *  down once it's reported), which is exactly what the private-bucket, one-way-in/one-way-out
	 *  design documented in wrangler.jsonc exists to prevent. */
	imageUrl?: string;
}

/** The one shape an attached image may take — see `CreateCommentInput.imageUrl`. Anchored at both
 *  ends so neither a protocol-relative prefix (`//elsewhere.example/api/media/x`) nor a `..`
 *  traversal segment can smuggle a different destination past it. */
const MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function validImagePath(value: string): boolean {
	return MEDIA_PATH.test(value) && !value.split('/').includes('..');
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
	const content = input.content?.trim() ?? '';
	const imageUrl = input.imageUrl?.trim() || undefined;

	// Session 27 — a photo with no caption is a real, complete contribution ("here's what mine
	// looked like"), so content alone is no longer the requirement; SOMETHING has to be here is.
	if (!content && !imageUrl) {
		throw new CommentValidationError('A comment needs text, a photo, or both');
	}
	if (imageUrl && !validImagePath(imageUrl)) {
		throw new CommentValidationError('imageUrl must be an uploaded /api/media/ path');
	}
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
		content,
		visibility: input.visibility,
		kind: input.kind === 'story' ? 'story' : 'note',
		imageUrl,
		authorId,
		upCount: 0,
		downCount: 0,
		createdAt: new Date().toISOString()
	});
	return id;
}
