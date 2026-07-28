// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { UiLocale } from '$lib/i18n/locales';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			locale: UiLocale;
		}
		interface PageData {
			locale: UiLocale;
		}
		// interface PageState {}
		interface Platform {
			// No real Cloudflare bindings (KV/D1/R2/etc.) exist yet — this is just the shape
			// adapter-cloudflare needs to type `event.platform` at all. Widen `env` once real
			// bindings are added to wrangler.jsonc.
			env: Record<string, unknown>;
			cf?: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
