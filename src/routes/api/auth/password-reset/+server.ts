// Deliberately does no real lookup and always succeeds — same enumeration-safe stance
// auth.svelte.ts's own mock-era recoverPassword already took, carried forward unchanged. No real
// email-sending exists yet (a genuinely separate, later piece of work — this endpoint's job today
// is only to not leak whether an address is registered), so this is an honest stub, not a lie: it
// promises exactly what it does, nothing about an email actually being sent.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	return json({ success: true });
};
