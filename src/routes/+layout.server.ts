import type { LayoutServerLoad } from './$types';

// Cascades to every route in the app. Only `true` for the Capacitor static build — `adapter-static`
// can't execute ANY of this app's `+page.server.ts` load functions at runtime (there's no server
// in a native WebView), so every route that has one must be prerendered instead. Safe and actually
// correct here, not a workaround: the mock API's data is deterministic and never varies per-request
// (all real per-user state — Profile/Pantry/MealPlan — lives client-side in localStorage, never
// touched by these server loads), so baking the HTML once at build time produces the exact same
// output a real request would. The default (`npm run build`) leaves this `false`, keeping the
// real per-request SSR path (and hooks.server.ts's own cookie/Accept-Language locale detection)
// intact for the Node/edge deployment — see svelte.config.js's own header comment.
export const prerender = process.env.BUILD_TARGET === 'capacitor';

export const load: LayoutServerLoad = ({ locals }) => {
	return { locale: locals.locale };
};
