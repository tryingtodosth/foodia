// Bare ISO calendar-date math for the manual weekly planner (CLAUDE.md 6.2's eventual AI Meal
// Planning Wizard will need the same MealPlan.weekStart/MealPlanDay.date shape — this slice reuses
// it directly rather than inventing a parallel "draft" format to reconcile later).
//
// Dates are parsed as LOCAL calendar days via Date(y, m, d), never `new Date(isoString)` directly
// — the latter reads a bare `YYYY-MM-DD` string as UTC midnight, a real off-by-one-day bug in any
// timezone east of UTC (the same trap 2do's own `calendar.ts`/`parseCalendarDate` flags and avoids).
import type { UiLocale } from '$lib/i18n/locales';

export function toISODate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function parseISODate(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export function mondayOf(date: Date): Date {
	const day = date.getDay(); // 0 = Sunday
	const diff = day === 0 ? -6 : 1 - day;
	const monday = new Date(date);
	monday.setDate(date.getDate() + diff);
	monday.setHours(0, 0, 0, 0);
	return monday;
}

export function addDays(date: Date, n: number): Date {
	const next = new Date(date);
	next.setDate(date.getDate() + n);
	return next;
}

/** The 7 ISO dates (Mon..Sun) for the week starting at `weekStartISO`. */
export function weekDates(weekStartISO: string): string[] {
	const monday = parseISODate(weekStartISO);
	return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
}

const WEEKDAY_LABEL: Record<UiLocale, string[]> = {
	pl: ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz'],
	en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
};

export function weekdayLabel(iso: string, locale: UiLocale = 'pl'): string {
	const day = parseISODate(iso).getDay();
	return WEEKDAY_LABEL[locale][day === 0 ? 6 : day - 1];
}

export function formatShortDate(iso: string): string {
	const date = parseISODate(iso);
	return `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}
