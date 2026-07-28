// This route reads `page.url.searchParams` (the optional `?week=` cross-link from the shopping
// list), which SvelteKit correctly refuses to prerender — a query string has no meaning for a page
// baked once at build time. Not a loss for the Capacitor build: this route has no server load at
// all (all its real data comes from mealPlanStore/localStorage), so it's already fully client-
// driven — `adapter-static`'s `fallback: 'index.html'` (svelte.config.js) serves it as an ordinary
// SPA route instead, which is the correct behavior for it either way.
export const prerender = false;
