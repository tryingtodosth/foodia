import type { Config } from 'drizzle-kit';

// `dialect: 'sqlite'` is enough for `drizzle-kit generate` (it only diffs the schema to produce
// migration SQL, no live DB connection needed) — applying that SQL to the real local D1 is a
// separate step, `wrangler d1 migrations apply foodia-db --local`, which reads `migrations_dir`
// from wrangler.jsonc, not from here.
export default {
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle'
} satisfies Config;
