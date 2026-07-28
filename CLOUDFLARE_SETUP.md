# Cloudflare setup — reference / how to come back to it

**Nothing about this was changed to enable local dev.** `npm run dev` (plain Vite) and the
Cloudflare deployment path have always been two separate things in this project — this file exists
so the Cloudflare-linked half stays documented in one place while day-to-day work happens locally.
Same structure as `personali`'s own `CLOUDFLARE_SETUP.md` — see that project's copy if you want the
side-by-side comparison of how the two apps' setups agree/differ.

## What's actually wired to Cloudflare today

- **`wrangler.jsonc`** (project root) — `pages_build_output_dir: .svelte-kit/cloudflare`. That one
  key is what marks this as a **Cloudflare Pages** project (not a plain Worker) and tells
  `adapter-cloudflare` where to emit the Pages bundle (`_worker.js` + `_routes.json` + static
  assets). `compatibility_flags: ["nodejs_compat"]` is required — without it, the build fails
  (`Could not resolve async_hooks`), since SvelteKit's internals use it.
- **`svelte.config.js`** — the **default** build target (`npm run build`, no `BUILD_TARGET` env var
  set) now uses `@sveltejs/adapter-cloudflare` instead of `@sveltejs/adapter-auto`. This only
  matters for `vite build` — `vite dev` never touches the adapter at all. The **Capacitor** build
  target (`BUILD_TARGET=capacitor npm run build:capacitor`) is untouched — it still uses
  `@sveltejs/adapter-static`, producing the fully static, prerendered bundle Capacitor embeds in a
  native WebView. Two independent targets from one codebase, chosen by an env var — see
  `svelte.config.js`'s own comment and `CLAUDE.md`'s Capacitor section (6.1) for why they have to
  stay separate (Capacitor has no server at runtime; Cloudflare Pages Functions *is* the server
  `hooks.server.ts`'s own per-request locale detection needs).
- **`src/app.d.ts`** — `App.Platform` typed for Cloudflare's `env`/`cf`/`ctx`. `env` is currently
  just `Record<string, unknown>` since no real bindings (KV/D1/R2/etc.) exist yet.
- **Two npm scripts** go through Cloudflare's own tooling instead of plain Vite:
  - `npm run cf:dev` — `vite build && wrangler pages dev`. Builds for real (the Cloudflare target,
    not Capacitor), then serves the actual Pages bundle through Miniflare (Cloudflare's local
    Workers-runtime emulator) instead of Vite's dev server. Slower per-iteration (real build, no
    HMR) but is what actually exercises the Workers runtime — the right tool if a bug is suspected
    to be Cloudflare-specific, not a day-to-day dev loop.
  - `npm run deploy` — `vite build && wrangler pages deploy`. Pushes a build straight to Cloudflare
    Pages from the CLI.
- **The GitHub↔Cloudflare connection itself is NOT in this repo at all** — it's a GitHub App OAuth
  authorization done on Cloudflare's own dashboard (`Workers & Pages → Create → Pages → Connect to
  Git`), on the account owner's side. Nothing here can inspect or change it.
- **Custom domain** is bound via Cloudflare's own dashboard too, separate from the Pages project's
  internal name (`"name": "foodia"` in `wrangler.jsonc` is just the project's dashboard label,
  cosmetic).

## Local dev vs. Cloudflare — what actually differs

| | `npm run dev` | `npm run cf:dev` | `npm run deploy` | `npm run build:capacitor` |
|---|---|---|---|---|
| What runs | Vite dev server | Real Cloudflare build, served via Miniflare | Real Cloudflare build, pushed to Cloudflare | Real static build for the Capacitor/native shell |
| Adapter used | none (`vite dev`) | `adapter-cloudflare` | `adapter-cloudflare` | `adapter-static` |
| Needs `wrangler login`? | No | No (local emulation) | **Yes** | No |
| Good for | Day-to-day work | Confirming something isn't Cloudflare-specific before deploying | Actually shipping the web app | Producing the bundle `npx cap sync` embeds natively |

## How to come back to the Cloudflare-strict path

1. `npm run build` — confirm the Cloudflare-targeted build still succeeds (`adapter-cloudflare`
   runs here, `npm run dev` never touches it, `npm run build:capacitor` uses a different adapter
   entirely).
2. `npm run cf:dev` — serve that real build through Miniflare, the closest local approximation of
   the actual Workers runtime, if something needs to be confirmed as not Cloudflare-specific.
3. `npx wrangler login` (interactive, opens a browser) if deploying — only needed for
   `npm run deploy`, not for `cf:dev`.
4. `npm run deploy` — ships it.

If `wrangler.jsonc`'s own `pages_build_output_dir`/`compatibility_flags` or `svelte.config.js`'s
adapter import ever get changed for a local-debugging reason, the values to restore are exactly
what's shown in "What's actually wired to Cloudflare today" above.
