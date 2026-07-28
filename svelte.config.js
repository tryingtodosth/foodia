import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Two build targets from one codebase, chosen by an env var at build time — not a config nobody
// reads. The default (`npm run build`) targets Cloudflare Pages (adapter-cloudflare, same choice
// already made for the personali project — see its own CLAUDE.md's Deployment section), which is
// load-bearing: hooks.server.ts's per-request cookie/Accept-Language interface-locale detection
// only works with an actual server behind it, and this app built that for real (see CLAUDE.md's
// i18n section) — silently switching the WHOLE app to static output would quietly regress it.
// Cloudflare Pages' own Functions runtime is what supplies that "real server" per request.
// `BUILD_TARGET=capacitor npm run build:capacitor` instead produces a fully static, prerendered
// bundle Capacitor can embed in a native WebView (which has no server at runtime, full stop). The
// cost of that trade, paid only on the Capacitor build: the initial interface locale is whatever
// hooks.server.ts resolves during the build's own prerender crawl (no real request, so no cookie/
// Accept-Language — it bakes in the app's own DEFAULT_UI_LOCALE), corrected client-side within a
// tick by the cookie-resync effect in routes/+layout.svelte the moment the app actually mounts.
const isCapacitorBuild = process.env.BUILD_TARGET === 'capacitor';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	},
	kit: {
		adapter: isCapacitorBuild
			? adapterStatic({
					pages: 'build-capacitor',
					assets: 'build-capacitor',
					// NOT 'index.html' — the real home page prerenders to that exact filename too, and
					// adapter-static writes the fallback LAST, silently clobbering the real prerendered
					// home page with generic SPA boilerplate (caught during this app's own first
					// Capacitor build — a real bug, not a hypothetical). '200.html' is the same
					// convention Netlify's own SPA fallback uses; Capacitor's native shell only ever
					// needs it for a direct deep-link into a non-prerendered route (/plan,
					// /shopping-list), never for the initial app load, which always resolves to the
					// real index.html.
					fallback: '200.html',
					precompress: false,
					strict: true
				})
			: adapterCloudflare()
	}
};

export default config;
