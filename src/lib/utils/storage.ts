// Thin, SSR-guarded localStorage JSON helpers — same `typeof window === 'undefined'` discipline
// the 2do project's own cookies.ts already established for exactly this "client-only persistence,
// no real backend yet" need. Wrapped in try/catch since localStorage can throw (private browsing,
// storage disabled), not just be absent.

export function readJSON<T>(key: string): T | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export function writeJSON<T>(key: string, value: T): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// storage full / disabled — best-effort only, same honesty as every other P1 mock-era
		// persistence in this app. Nothing here is a durability guarantee yet.
	}
}

export function removeItem(key: string): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(key);
	} catch {
		// no-op
	}
}
