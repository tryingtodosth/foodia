// Plain document.cookie helpers, SSR-guarded — same convention 2do's own cookies.ts establishes
// for exactly this "client-only write, but needs to survive a hard reload / new tab" need (2do's
// own auth-session cookie was built for precisely this reason, after an earlier localStorage
// design turned out to be tab-scoped, not origin-scoped). Used here for the interface-language
// choice, which needs to be readable by `hooks.server.ts` on the very next request — a plain
// `localStorage` write (like profile.svelte.ts/pantry.svelte.ts use) would be invisible server-side.

export function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, days: number): void {
	if (typeof document === 'undefined') return;
	const maxAge = days * 24 * 60 * 60;
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function removeCookie(name: string): void {
	if (typeof document === 'undefined') return;
	document.cookie = `${name}=; path=/; max-age=0`;
}
