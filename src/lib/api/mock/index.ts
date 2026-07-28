import type { RecipeApiClient } from '$lib/api/client';
import type { RecipeCard } from '$lib/types/recipe';
import { recipesById } from './recipes.mock';

const ARTIFICIAL_DELAY_MS = 150;

function delay<T>(value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ARTIFICIAL_DELAY_MS));
}

function toCard(id: string): RecipeCard {
	const { ingredients, steps, versions, comments, relationships, description, translations, ...card } =
		recipesById[id];
	return card;
}

export const mockApiClient: RecipeApiClient = {
	async list() {
		return delay(Object.keys(recipesById).map(toCard));
	},
	async listDetails() {
		return delay(Object.values(recipesById));
	},
	async getCard(id: string) {
		const recipe = recipesById[id];
		if (!recipe) throw new Error(`Recipe not found: ${id}`);
		return delay(toCard(id));
	},
	async getDetail(id: string) {
		const recipe = recipesById[id];
		if (!recipe) throw new Error(`Recipe not found: ${id}`);
		return delay(recipe);
	},
	async getManyDetails(ids: string[]) {
		const unique = [...new Set(ids)];
		return delay(unique.map((id) => recipesById[id]).filter((r) => r !== undefined));
	}
};

export { recipesById };
