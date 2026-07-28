// User Context Engine — see CLAUDE.md Section 4.1.

export interface HardwareProfile {
	oven: boolean;
	microwave: boolean;
	airfryer: boolean;
	blenderJug: boolean;
	kitchenScale: boolean;
}

export interface DietProfile {
	diet: string; // 'omnivore' | 'vegan' | 'vegetarian' | 'keto' | ... — loose, no fixed vocabulary yet
	allergies: string[]; // hard constraint — the substitution engine must never suggest a swap violating these
	goals: string[]; // 'weight_loss' | 'easy_digestion' | ...
}

export interface UserProfile {
	id: string;
	displayName: string;
	diet: DietProfile;
	hardware: HardwareProfile;
	activeSubProfileId?: string; // P2 — "Goście w weekend" / "Gotowanie dla partnera"
}
