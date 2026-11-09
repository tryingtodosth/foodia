// The cookbook form needs a real server (anonymous submissions + uploads), so it is never baked
// into the Capacitor static build; that build's SPA fallback serves the "needs a server" notice.
export const prerender = false;
