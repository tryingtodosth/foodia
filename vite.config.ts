import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// A compile-time constant, not a runtime check — lets client components (not just server code)
	// tell the two build targets apart (svelte.config.js's own BUILD_TARGET env var, threaded
	// through here since a .svelte file can't read `process.env` directly). Needed by
	// /shopping-list specifically (Session 16): it has no +page.server.ts by design, so it can't
	// get this from a server load the way every other route already does, but it still needs to
	// know whether to call the real httpApiClient (default build, a live server exists) or fall
	// back to mockApiClient (Capacitor build, static output, no server ever exists to call).
	define: {
		__IS_CAPACITOR__: JSON.stringify(process.env.BUILD_TARGET === 'capacitor')
	}
});
