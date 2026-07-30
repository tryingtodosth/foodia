import type { Db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

export class StepAlternativeValidationError extends Error {}

export interface CreateStepAlternativeInput {
	forStepId: string;
	text: string;
	requiresEquipment?: string[];
	durationMinutes?: number;
	/** Session 22 — links this alternative to the ingredient swap that necessitates it, when there
	 *  is one. Optional: a plain equipment-driven technique (the original 4.9 use case) has none. */
	triggeredBySubstitutionId?: string;
}

/** The real write side of StepAlternative (CLAUDE.md 4.9) — mirrors createSubstitution.ts exactly.
 *  Was session-only client state (`sessionStepAlternativesStore`) until now, same "never really
 *  reached the server" gap comments/substitutions had on `/recipes/[id]` before Session 22's own
 *  audit found it — a proposal that only ever lived in one browser tab isn't durably discussable by
 *  anyone else, which is exactly what this endpoint exists to fix. */
export async function createStepAlternative(
	db: Db,
	proposedById: string,
	input: CreateStepAlternativeInput
): Promise<string> {
	if (!input.text?.trim()) throw new StepAlternativeValidationError('Step alternative text is required');
	if (!input.forStepId) throw new StepAlternativeValidationError('forStepId is required');

	const [step] = await db
		.select({ id: schema.steps.id })
		.from(schema.steps)
		.where(eq(schema.steps.id, input.forStepId));
	if (!step) throw new StepAlternativeValidationError(`Step not found: ${input.forStepId}`);

	if (input.triggeredBySubstitutionId) {
		const [sub] = await db
			.select({ id: schema.substitutions.id })
			.from(schema.substitutions)
			.where(eq(schema.substitutions.id, input.triggeredBySubstitutionId));
		if (!sub) {
			throw new StepAlternativeValidationError(`Substitution not found: ${input.triggeredBySubstitutionId}`);
		}
	}

	const id = crypto.randomUUID();
	await db.insert(schema.stepAlternatives).values({
		id,
		forStepId: input.forStepId,
		text: input.text.trim(),
		requiresEquipment: input.requiresEquipment?.length ? input.requiresEquipment : null,
		durationMinutes: input.durationMinutes ?? null,
		triggeredBySubstitutionId: input.triggeredBySubstitutionId ?? null,
		upCount: 0,
		downCount: 0,
		source: 'community',
		proposedById
	});
	return id;
}
