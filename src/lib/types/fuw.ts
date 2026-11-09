// The /fuw cookbook form — "Książka kucharska Wydziału Fizyki" (docs/fuw.md). Shared by the
// public form, the anonymous submission endpoint and the /admin/fuw review tab.
import type { CreateRecipeInput } from './recipeInput';

/** Who is submitting. Professors and staff are first-class contributors, not "other". */
export const FUW_AFFILIATIONS = [
	'student',
	'phd',
	'professor',
	'academic',
	'staff',
	'alumni',
	'other'
] as const;
export type FuwAffiliation = (typeof FUW_AFFILIATIONS)[number];

export type FuwStatus = 'pending' | 'accepted' | 'rejected';

export interface FuwSubmissionInput {
	recipe: CreateRecipeInput;
	/** As it should be printed in the book, e.g. "prof. dr hab. Anna Nowak". */
	authorName: string;
	affiliation: FuwAffiliation;
	/** Year of study, or title and department, e.g. "Zakład Fizyki Teoretycznej". */
	affiliationDetail?: string;
	/** Contact only — never shown publicly. */
	email: string;
	story?: string;
	/** R2 keys from /api/fuw/uploads (`fuw/<uuid>.<ext>`), beyond the hero image. */
	photoKeys: string[];
	consent: boolean;
	/** Interface language at submission time. */
	locale: string;
	/** Honeypot. A human never sees this field; anything in it means a bot filled the form. */
	website?: string;
}

/** What /admin/fuw renders — the stored row, with the email included (admin-only response). */
export interface FuwSubmission {
	id: string;
	status: FuwStatus;
	locale: string;
	recipe: CreateRecipeInput;
	authorName: string;
	affiliation: string;
	affiliationDetail: string | null;
	email: string;
	story: string | null;
	photoKeys: string[];
	submittedAt: string;
	reviewedAt: string | null;
	promotedRecipeId: string | null;
}

export const FUW_KEY_PATTERN = /^fuw\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

/** `/api/media/fuw/<uuid>.jpg` -> `fuw/<uuid>.jpg`, or null for anything that isn't a fuw upload. */
export function fuwKeyFromUrl(url: string | undefined | null): string | null {
	if (!url) return null;
	const prefix = '/api/media/';
	if (!url.startsWith(prefix)) return null;
	const key = url.slice(prefix.length);
	return FUW_KEY_PATTERN.test(key) ? key : null;
}
