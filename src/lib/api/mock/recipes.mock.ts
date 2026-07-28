import type { RecipeDetail } from '$lib/types/recipe';

// Exported (Session 8) so lib/api/mock/auth.mock.ts can reuse the exact same two people as its own
// mock accounts, rather than inventing a second, disconnected pair — same "reuse existing fixtures,
// don't invent new people" discipline 2do's own auth.mock.ts already establishes.
// Session 13 — `piotr` is the one account designated a moderator (`isModerator: true`), the
// gate `/moderation` checks. Chosen arbitrarily between the two existing identities (there's no
// real role-granting UI in this mock-only app), same "power user" convention `2do`'s own
// superadmin fixture already establishes.
export const piotr = { id: 'u1', displayName: 'Piotr P.', avatarUrl: null, isModerator: true };
export const ania = { id: 'u2', displayName: 'Ania K.', avatarUrl: null };

export const spaghettiBolognese: RecipeDetail = {
	id: 'r1',
	name: 'Spaghetti Bolognese w 30 minut',
	summary: 'Klasyczny sos mięsny na co dzień — bez godzinnego duszenia.',
	description:
		'Szybka wersja tradycyjnego sosu bolognese, zoptymalizowana pod dzień powszedni: mniej duszenia, więcej smaku dzięki skoncentrowanemu przecierowi pomidorowemu i dobrze zredukowanemu winu.',
	heroImage: '/recipes/bolognese.jpg',
	author: piotr,
	tags: ['włoskie', 'makaron', 'na-co-dzien'],
	dietFlags: [],
	requiredEquipment: [],
	timeMinutes: 30,
	costEstimate: { amount: 18, currency: 'PLN' },
	macros: { kcal: 620, proteinG: 32, fatG: 22, carbsG: 68 },
	reactions: { upCount: 41, downCount: 2, currentUserReaction: null },
	createdAt: '2026-01-10T00:00:00Z',
	updatedAt: '2026-06-01T00:00:00Z',
	ingredients: [
		{
			id: 'i1',
			name: 'Mięso mielone wołowo-wieprzowe',
			quantity: 400,
			unit: 'g',
			substitutable: true,
			substitutions: [
				{
					id: 's1',
					forIngredientId: 'i1',
					name: 'Soczewica czerwona (namoczona)',
					ratio: 0.6,
					deltaMacros: { kcal: -180, proteinG: -14, fatG: -18 },
					reactions: { upCount: 12, downCount: 1, currentUserReaction: null },
					source: 'community',
					proposedBy: ania
				}
			]
		},
		{
			id: 'i2',
			name: 'Passata pomidorowa',
			quantity: 500,
			unit: 'ml',
			substitutable: false
		},
		{
			id: 'i3',
			name: 'Cebula',
			quantity: 1,
			unit: 'szt',
			substitutable: false
		},
		{
			id: 'i4',
			name: 'Czosnek',
			quantity: 2,
			unit: 'ząbki',
			substitutable: true,
			substitutions: [
				{
					id: 's2',
					forIngredientId: 'i4',
					name: 'Czosnek granulowany',
					ratio: 0.5,
					source: 'system'
				}
			]
		},
		{
			id: 'i5',
			name: 'Spaghetti',
			quantity: 350,
			unit: 'g',
			substitutable: true,
			substitutions: [
				{
					id: 's3',
					forIngredientId: 'i5',
					name: 'Makaron pełnoziarnisty',
					ratio: 1,
					deltaMacros: { carbsG: -6, proteinG: 2 },
					source: 'system'
				}
			]
		}
	],
	steps: [
		{
			id: 'st1',
			order: 1,
			text: 'Cebulę i czosnek drobno posiekaj, podsmaż na oliwie na złoty kolor.',
			ingredientIds: ['i3', 'i4']
		},
		{
			id: 'st2',
			order: 2,
			text: 'Dodaj mięso mielone, smaż aż się zrumieni.',
			durationMinutes: 8,
			ingredientIds: ['i1']
		},
		{
			id: 'st3',
			order: 3,
			text: 'Wlej passatę, przypraw solą i pieprzem, duś pod przykryciem.',
			durationMinutes: 15,
			ingredientIds: ['i2']
		},
		{
			id: 'st4',
			order: 4,
			text: 'Ugotuj spaghetti al dente w osolonej wodzie.',
			durationMinutes: 9,
			requiresEquipment: [],
			ingredientIds: ['i5']
		},
		{
			id: 'st5',
			order: 5,
			text: 'Połącz makaron z sosem, podawaj od razu.',
			ingredientIds: ['i5', 'i2']
		}
	],
	versions: [
		{ id: 'r1', label: 'Klasyczna', parentRecipeId: null },
		{ id: 'r1v2', label: 'Wegetariańska (soczewica)', parentRecipeId: 'r1' }
	],
	comments: [
		{
			id: 'c1',
			target: { type: 'ingredient', id: 'i4' },
			content: 'Dawajcie śmiało 4 ząbki zamiast 2 — dużo lepiej wychodzi.',
			visibility: 'public',
			author: ania,
			reactions: { upCount: 9, downCount: 0, currentUserReaction: null },
			createdAt: '2026-03-02T10:00:00Z'
		},
		{
			id: 'c2',
			target: { type: 'step', id: 'st3' },
			content: 'Mój piekarnik... to znaczy garnek, potrzebuje tu 20 minut, a nie 15.',
			visibility: 'private',
			author: piotr,
			createdAt: '2026-04-11T18:20:00Z'
		}
	],
	sourceLocale: 'pl',
	// The community-translation showcase fixture (CLAUDE.md's translation section): `tr1` is a
	// real, well-reacted English translation covering all three TranslatableFields — the ordinary
	// case. `tr2` is deliberately a same-locale (`'pl'`) suggestion with a NET-NEGATIVE reaction
	// score — a "propose changes to the original" submission nobody liked, kept unpopular on
	// purpose so it demonstrates the resolver's own rule that a same-locale suggestion is never
	// auto-applied over the true original regardless of its reactions, only reachable through an
	// explicit pick in the version picker.
	translations: [
		{
			id: 'tr1',
			recipeId: 'r1',
			locale: 'en',
			fields: {
				name: 'Spaghetti Bolognese in 30 Minutes',
				summary: 'A classic everyday meat sauce — no hour-long simmering required.',
				description:
					'A quick take on the traditional bolognese sauce, optimized for a weekday: less simmering, more flavor thanks to concentrated tomato paste and a well-reduced wine.'
			},
			translatedBy: ania,
			reactions: { upCount: 6, downCount: 0, currentUserReaction: null },
			createdAt: '2026-05-01T09:00:00Z'
		},
		{
			id: 'tr2',
			recipeId: 'r1',
			locale: 'pl',
			fields: {
				summary: 'Klasyczny sos mięsny na co dzień — szybciej niż myślisz.'
			},
			translatedBy: piotr,
			reactions: { upCount: 1, downCount: 3, currentUserReaction: null },
			createdAt: '2026-05-10T09:00:00Z'
		}
	]
};

export const overnightOats: RecipeDetail = {
	id: 'r2',
	name: 'Owsianka na zimno (overnight oats)',
	summary: 'Zero gotowania, gotowe rano — idealne do biura.',
	description:
		'Przygotowywana wieczorem, gotowa do zjedzenia rano bez podgrzewania — dobrze się przechowuje i nie pachnie w biurowej kuchni.',
	heroImage: '/recipes/oats.jpg',
	author: ania,
	tags: ['sniadanie', 'do-biura', 'bez-gotowania'],
	dietFlags: ['wegetariańskie'],
	requiredEquipment: ['kitchenScale'],
	timeMinutes: 5,
	costEstimate: { amount: 4, currency: 'PLN' },
	macros: { kcal: 340, proteinG: 12, fatG: 9, carbsG: 52 },
	reactions: { upCount: 27, downCount: 1, currentUserReaction: null },
	createdAt: '2026-02-01T00:00:00Z',
	updatedAt: '2026-02-01T00:00:00Z',
	ingredients: [
		{ id: 'i6', name: 'Płatki owsiane', quantity: 50, unit: 'g', substitutable: false },
		{
			id: 'i7',
			name: 'Mleko',
			quantity: 150,
			unit: 'ml',
			substitutable: true,
			substitutions: [
				{
					id: 's4',
					forIngredientId: 'i7',
					name: 'Mleko owsiane',
					ratio: 1,
					source: 'system'
				},
				// The Ingredient Alternatives allergy-guardrail demo fixture (CLAUDE.md 4.1/4.2, Section 7
				// item 2): a real, well-reacted community substitution that a peanut-allergic viewer must
				// never see — `filterSafeSubstitutions` (lib/utils/substitution.ts) removes it the instant
				// `DietProfile.allergies` contains anything matching "orzech" (peanut/nut), before it ever
				// reaches the swap picker, the macro recompute, or a vote. Left visible to everyone else.
				{
					id: 's6',
					forIngredientId: 'i7',
					name: 'Mleko orzechowe (orzech laskowy)',
					ratio: 1,
					reactions: { upCount: 5, downCount: 0, currentUserReaction: null },
					source: 'community',
					proposedBy: ania
				}
			]
		},
		{ id: 'i8', name: 'Jogurt naturalny', quantity: 100, unit: 'g', substitutable: false },
		{ id: 'i9', name: 'Miód', quantity: 1, unit: 'łyżka', substitutable: false }
	],
	steps: [
		{
			id: 'st6',
			order: 1,
			text: 'Wszystkie składniki wymieszaj w słoiku.',
			ingredientIds: ['i6', 'i7', 'i8', 'i9']
		},
		{
			id: 'st7',
			order: 2,
			text: 'Odstaw w lodówce na noc (minimum 6 godzin).',
			durationMinutes: 360,
			ingredientIds: []
		}
	]
};

export const airfryerFries: RecipeDetail = {
	id: 'r3',
	name: 'Frytki z batatów z airfryera',
	summary: 'Chrupiące, bez litra oleju — 15 minut, jeden sprzęt.',
	description: 'Szybki dodatek do obiadu, wymaga tylko airfryera — bez piekarnika, bez smażenia.',
	heroImage: '/recipes/fries.jpg',
	author: piotr,
	tags: ['dodatek', 'airfryer', 'szybkie'],
	dietFlags: ['wegańskie', 'bezglutenowe'],
	requiredEquipment: ['airfryer'],
	timeMinutes: 15,
	costEstimate: { amount: 6, currency: 'PLN' },
	macros: { kcal: 210, proteinG: 3, fatG: 5, carbsG: 38 },
	reactions: { upCount: 18, downCount: 0, currentUserReaction: null },
	createdAt: '2026-05-05T00:00:00Z',
	updatedAt: '2026-05-05T00:00:00Z',
	ingredients: [
		{ id: 'i10', name: 'Bataty', quantity: 500, unit: 'g', substitutable: false },
		{ id: 'i11', name: 'Oliwa z oliwek', quantity: 1, unit: 'łyżka', substitutable: false },
		{
			id: 'i12',
			name: 'Papryka wędzona',
			quantity: 1,
			unit: 'łyżeczka',
			substitutable: true,
			substitutions: [
				{ id: 's5', forIngredientId: 'i12', name: 'Papryka słodka', ratio: 1, source: 'system' }
			]
		}
	],
	steps: [
		{
			id: 'st8',
			order: 1,
			text: 'Bataty pokrój w słupki, wymieszaj z oliwą i przyprawami.',
			ingredientIds: ['i10', 'i11', 'i12']
		},
		{
			id: 'st9',
			order: 2,
			text: 'Piecz w airfryerze w 200°C, potrząsając koszykiem w połowie.',
			durationMinutes: 15,
			requiresEquipment: ['airfryer'],
			ingredientIds: ['i10'],
			// The Device/Equipment Alternatives demo fixture (CLAUDE.md 4.1/4.2's own long-flagged
			// "temporarily disable broken equipment... needs a real per-recipe re-derivation of
			// alternate cooking methods" gap, now resolved at the step level). A viewer with no
			// declared airfryer still sees this recipe at all (the RecipeCard-level `requiredEquipment`
			// hard filter is unrelated and unchanged — see that module's own doc note on why the two
			// stay deliberately unreconciled), and Cooking Mode auto-picks this oven technique in
			// place of the base step; the recipe detail page's browse list shows both, votable.
			alternatives: [
				{
					id: 'sa1',
					forStepId: 'st9',
					text: 'Piecz w piekarniku nagrzanym do 220°C (termoobieg) przez 25 minut, obracając w połowie.',
					requiresEquipment: ['oven'],
					durationMinutes: 25,
					reactions: { upCount: 14, downCount: 1, currentUserReaction: null },
					source: 'system'
				},
				{
					id: 'sa2',
					forStepId: 'st9',
					text: 'Smaż na patelni z odrobiną oleju na średnim ogniu, mieszając co kilka minut, aż się zarumienią.',
					reactions: { upCount: 3, downCount: 2, currentUserReaction: null },
					source: 'community',
					proposedBy: piotr
				}
			]
		}
	]
};

export const recipesById: Record<string, RecipeDetail> = {
	[spaghettiBolognese.id]: spaghettiBolognese,
	[overnightOats.id]: overnightOats,
	[airfryerFries.id]: airfryerFries
};
