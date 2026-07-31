// The gate (Session 26). Everything under /admin passes through here first.
//
// Two deliberate choices worth naming:
//
//   404, not 403. A 403 confirms that /admin exists and that the visitor simply isn't on the list,
//   which is free information for anyone probing the site. A 404 says the same thing every other
//   nonexistent URL says. The admin never sees it, so nothing is lost by being uninformative here.
//
//   The check is server-side and runs before any child load, so no admin data is ever fetched —
//   let alone serialized into a page — for a request that isn't allowed to see it. The navbar link
//   and every UI affordance elsewhere are cosmetic by comparison; this is the actual boundary.
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Explicitly opted OUT of the root layout's own `prerender = BUILD_TARGET === 'capacitor'`
// cascade. Prerendering means running this load at build time, where there is no request, no
// cookie and no session — so it would resolve to "not an admin", throw, and fail the Capacitor
// build outright. Same `export const prerender = false` escape /plan and /shopping-list already
// use for their own can't-be-baked-at-build-time reasons; the static build serves this route
// through its `200.html` SPA fallback, where the client-side gate below shows the honest
// "needs a real server" state instead.
export const prerender = false;

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.isAdmin) error(404, 'Not found');
	return { adminEmail: locals.user?.email ?? '' };
};
