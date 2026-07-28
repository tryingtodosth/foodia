// LoginForm.svelte reads `page.url.searchParams` (the optional `?redirectTo=`), which SvelteKit
// correctly refuses to prerender — same class of restriction /plan and /shopping-list already hit
// in Session 6 (a query string has no meaning for a page baked once, forever). No server load
// exists for this route either way, so the Capacitor build's SPA fallback serves it exactly as it
// should.
export const prerender = false;
