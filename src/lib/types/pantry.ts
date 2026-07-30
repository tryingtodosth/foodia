// Smart Pantry & Meal Planning — see CLAUDE.md Section 4.5 / 6.2.

export interface PantryItem {
	id: string;
	ingredientName: string;
	quantity: number;
	unit: string;
	updatedAt: string;
}

export type MealSlotKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealSlot {
	/** Session 23 — previously absent; `slot` alone used to BE the identity ("at most one meal per
	 *  (date, slot)," `mealPlanStore.assign`'s own old behavior replaced whatever was already
	 *  there). A real id is what makes "no limit on the amount of meals" possible — several meals
	 *  can now share the same `slot` kind (two snacks, a second dinner) without colliding. */
	id: string;
	slot: MealSlotKind;
	recipeId: string;
	versionId?: string;
	servings: number;
}

export interface MealPlanDay {
	date: string; // ISO date
	meals: MealSlot[];
}

export interface MealPlan {
	id: string;
	userId: string;
	weekStart: string; // ISO date, Monday
	budget?: { amount: number; currency: string };
	days: MealPlanDay[];
}
