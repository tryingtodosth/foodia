// Password hashing via Web Crypto's PBKDF2 (CLAUDE.md Section 1, Session 16) — not bcrypt/argon2,
// which need native bindings the Workers isolate runtime doesn't have. `crypto.subtle` is a
// standard global in both the Workers runtime and modern Node, so this same module hashes
// passwords identically whether it's called from a real request or from the seed script (Task 27)
// — no special-cased plaintext path for seeded accounts.
//
// OWASP's current PBKDF2-HMAC-SHA256 guidance recommends 600,000+ iterations, but the Workers
// runtime's own `crypto.subtle.deriveBits` hard-rejects anything above 100,000 — a real platform
// ceiling, not a tunable budget: `NotSupportedError: Pbkdf2 failed: iteration counts above 100000
// are not supported`, discovered live on this app's first real Cloudflare deploy (every register/
// login 500'd; local Miniflare enforces no such cap, so this was invisible until real Workers ran
// it — CLAUDE.md Session 21). 100,000 is what the platform allows, so it's the ceiling here too.
// Stored inline as `iterations:saltHex:hashHex` so a future platform change doesn't invalidate
// passwords hashed under today's count — `verifyPassword` always re-derives using whatever count
// is stored on that row, not today's constant.

const DEFAULT_ITERATIONS = 100_000;
const HASH_ALGO = 'SHA-256';
const KEY_LENGTH_BITS = 256;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
	return [...new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function fromHex(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const derivedBits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: HASH_ALGO },
		keyMaterial,
		KEY_LENGTH_BITS
	);
	return toHex(derivedBits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hashHex = await derive(password, salt, DEFAULT_ITERATIONS);
	return `${DEFAULT_ITERATIONS}:${toHex(salt)}:${hashHex}`;
}

/** Constant-time-ish comparison (XOR every char, never short-circuit on first mismatch) — avoids
 *  leaking how many leading hex characters matched via response-timing, the standard guard for a
 *  security-sensitive string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [iterationsStr, saltHex, hashHex] = stored.split(':');
	if (!iterationsStr || !saltHex || !hashHex) return false;
	const iterations = Number(iterationsStr);
	const computedHex = await derive(password, fromHex(saltHex), iterations);
	return timingSafeEqual(computedHex, hashHex);
}
