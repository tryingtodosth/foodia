// The e-grocery export (CLAUDE.md 4.5): "starts as a copy-to-clipboard text list... with the API
// integration point named explicitly so swapping in a real Glovo/Frisco call later doesn't need a
// rewrite."
//
// These functions return semantic result codes, not literal display strings — the interface's own
// language can change at any moment (LanguageSwitcher, no reload), so the presentation layer
// (routes/shopping-list/+page.svelte) is what turns a code into text via `t()`, not this file.
import { t } from '$lib/i18n/t';
import { formatQuantity } from '$lib/utils/units';
import type { ShoppingListItem } from './shoppingList';

/** Reads `t()` directly — a deliberate, small exception to this file's own "pure util" shape, same
 *  category 2do's own permissions.ts documents for reading a reactive store from a plain function
 *  — since the copied/exported TEXT itself should also be in the viewer's current language. */
export function formatShoppingListText(items: ShoppingListItem[], weekStart: string): string {
	if (items.length === 0) {
		return `${t('shopping.export.header', { weekStart })}\n\n${t('shopping.export.allCoveredText')}`;
	}
	// `formatQuantity`, not the raw number — a missing quantity is now often the result of real
	// conversion math (Session 25), so "263.41176470588235 g" is a genuinely reachable value here,
	// and this text goes straight onto a shopper's clipboard.
	const lines = items.map((i) => `- ${formatQuantity(i.missingQuantity)} ${i.unit} ${i.name}`);
	return `${t('shopping.export.header', { weekStart })}\n\n${lines.join('\n')}`;
}

export type ClipboardResult = 'copied' | 'failed';

/** SSR-guarded — the Clipboard API only exists in the browser, and only reliably in a secure
 *  context (https/localhost). Returns 'failed' rather than throwing so the caller can fall back to
 *  a visible, manually-selectable text block instead of a silent failure. */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
	if (typeof navigator === 'undefined' || !navigator.clipboard) return 'failed';
	try {
		await navigator.clipboard.writeText(text);
		return 'copied';
	} catch {
		return 'failed';
	}
}

export type EGroceryResult = 'stub-copied' | 'stub-failed';

/**
 * The e-grocery integration point, named explicitly per CLAUDE.md 4.5 so this is the one function
 * that needs to change once a real Glovo/Frisco partnership exists — every call site already
 * expects a `Promise<EGroceryResult>`, so swapping the body for a real POST to the provider's cart
 * API won't touch anything upstream. No real integration exists yet, so today this is an honest
 * stub: it does the same clipboard copy `copyToClipboard` does, and the returned code says so
 * (translated by the caller), rather than pretending to have submitted an order.
 */
export async function exportToEGrocery(text: string): Promise<EGroceryResult> {
	const result = await copyToClipboard(text);
	return result === 'copied' ? 'stub-copied' : 'stub-failed';
}
