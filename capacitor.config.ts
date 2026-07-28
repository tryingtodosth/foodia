import type { CapacitorConfig } from '@capacitor/cli';

// `webDir` points at the static build produced by `BUILD_TARGET=capacitor npm run build:capacitor`
// (see svelte.config.js's own conditional adapter, and package.json's script) — NOT the same
// output `npm run build`'s default (Node/adapter-auto) target produces. Capacitor bundles this
// directory verbatim into the native app; there's no server at runtime, which is exactly why the
// two build targets exist in the first place. See CLAUDE.md's own Capacitor section for the full
// reasoning and the native-platform setup steps this repo hasn't run yet (no Android SDK/Xcode
// available in this environment to verify a native build against).
const config: CapacitorConfig = {
	appId: 'net.foodia.app',
	appName: 'Foodia',
	webDir: 'build-capacitor',
	server: {
		// Capacitor's own dev-reload convenience — androidScheme must be 'https' for the Clipboard/
		// Wake Lock APIs (both already used by this app, see CookingMode.svelte/shoppingExport.ts)
		// to work correctly inside the native WebView, which otherwise defaults to a plain 'http'
		// origin some of those APIs silently refuse to run under.
		androidScheme: 'https'
	}
};

export default config;
