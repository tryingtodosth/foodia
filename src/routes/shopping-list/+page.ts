// Same reasoning as routes/plan/+page.ts — reads `?week=` from the URL, which can't be prerendered,
// and has no server load anyway (fully store/localStorage-driven), so the SPA fallback is correct.
export const prerender = false;
