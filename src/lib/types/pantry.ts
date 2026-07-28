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
