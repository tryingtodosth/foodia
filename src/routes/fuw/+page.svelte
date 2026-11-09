<script lang="ts">
	// /fuw — "Książka kucharska Wydziału Fizyki", the Physics Faculty cookbook submission form
	// (docs/fuw.md). Anonymous on purpose: students, PhD students, professors and staff shouldn't
	// need a Foodia account to contribute one recipe. Submissions go to a staging table and are
	// reviewed in /admin/fuw; nothing here reaches the public feed on its own.
	//
	// The recipe fields are the exact same RecipeComposerForm /recipes/new uses ("as many options
	// as we have in Foodia"); only the person fields, extra photos and consent are cookbook-specific.
	import RecipeComposerForm from '$lib/components/recipe/RecipeComposerForm.svelte';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import { uiLocaleStore } from '$lib/state/uiLocale.svelte';
	import { FUW_AFFILIATIONS, type FuwAffiliation } from '$lib/types/fuw';
	import type { CreateRecipeInput } from '$lib/types/recipeInput';

	const MAX_PHOTOS = 6;

	interface Photo {
		key: string;
		preview: string;
	}

	let authorName = $state('');
	let affiliation = $state<FuwAffiliation>('student');
	let affiliationDetail = $state('');
	let email = $state('');
	let story = $state('');
	let consent = $state(false);
	let website = $state(''); // honeypot
	let photos = $state<Photo[]>([]);
	let photoUploading = $state(false);
	let photoError = $state('');

	let submitting = $state(false);
	let errorMessage = $state('');
	let submitted = $state(false);
	/** Bumped by "submit another" to remount the composer with a fresh, empty draft. */
	let formKey = $state(0);

	async function addPhoto(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		photoUploading = true;
		photoError = '';
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch('/api/fuw/uploads', { method: 'POST', body });
			if (!res.ok) {
				const detail = await res.json().catch(() => null);
				photoError = detail?.message ?? t('upload.errorGeneric');
				return;
			}
			const data = (await res.json()) as { key: string };
			photos = [...photos, { key: data.key, preview: URL.createObjectURL(file) }];
		} catch {
			photoError = t('upload.errorNetwork');
		} finally {
			photoUploading = false;
			input.value = '';
		}
	}

	function removePhoto(key: string) {
		photos = photos.filter((p) => p.key !== key);
	}

	async function submit(recipe: CreateRecipeInput) {
		errorMessage = '';
		if (!authorName.trim() || !email.trim()) {
			errorMessage = t('fuw.errorPersonRequired');
			return;
		}
		if (!consent) {
			errorMessage = t('fuw.errorConsent');
			return;
		}
		submitting = true;
		try {
			const res = await fetch('/api/fuw/submissions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					recipe,
					authorName,
					affiliation,
					affiliationDetail,
					email,
					story,
					photoKeys: photos.map((p) => p.key),
					consent,
					locale: uiLocaleStore.locale,
					website
				})
			});
			if (!res.ok) {
				const detail = await res.json().catch(() => null);
				errorMessage =
					res.status === 429
						? t('fuw.errorRateLimit')
						: t('fuw.errorValidation', { detail: detail?.message ?? res.statusText });
				return;
			}
			submitted = true;
			window.scrollTo({ top: 0 });
		} catch {
			errorMessage = t('upload.errorNetwork');
		} finally {
			submitting = false;
		}
	}

	function submitAnother() {
		for (const p of photos) URL.revokeObjectURL(p.preview);
		photos = [];
		story = '';
		consent = false;
		errorMessage = '';
		submitted = false;
		formKey += 1;
		// Name, affiliation and email are kept: the same person submitting a second recipe.
	}
</script>

<svelte:head>
	<title>{t('fuw.pageTitle')}</title>
	<meta name="description" content={t('fuw.lede')} />
</svelte:head>

<header class="cookbook">
	<p class="cookbook__kicker">{t('fuw.kicker')}</p>
	<h1>{t('fuw.pageTitle')}</h1>
	<p class="cookbook__lede">{t('fuw.lede')}</p>
</header>

{#if __IS_CAPACITOR__}
	<p class="notice">{t('recipeComposer.noBackend')}</p>
{:else if submitted}
	<section class="thanks" aria-live="polite">
		<h2>{t('fuw.thanksHeading')}</h2>
		<p>{t('fuw.thanksBody')}</p>
		<button type="button" class="btn btn--primary" onclick={submitAnother}>{t('fuw.submitAnother')}</button>
	</section>
{:else}
	<ol class="how">
		<li>{t('fuw.how1')}</li>
		<li>{t('fuw.how2')}</li>
		<li>{t('fuw.how3')}</li>
	</ol>

	{#key formKey}
		<RecipeComposerForm
			mode="fuw"
			canUpload={true}
			uploadEndpoint="/api/fuw/uploads"
			{submitting}
			{errorMessage}
			submitLabel={t('fuw.submit')}
			submittingLabel={t('fuw.submitting')}
			onSubmit={submit}
		>
			{#snippet extra()}
				<section class="person">
					<h2>{t('fuw.photosHeading')}</h2>
					<p class="hint">{t('fuw.photosHint')}</p>
					{#if photos.length}
						<ul class="photos">
							{#each photos as photo (photo.key)}
								<li>
									<img src={photo.preview} alt="" />
									<button type="button" class="btn btn--ghost" onclick={() => removePhoto(photo.key)}>
										{t('recipeComposer.removeIngredient')}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if photos.length < MAX_PHOTOS}
						<label class="upload">
							<span class="upload__label">{photoUploading ? t('upload.uploading') : t('fuw.addPhoto')}</span>
							<input
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								disabled={photoUploading}
								onchange={addPhoto}
							/>
						</label>
						<p class="hint">{t('upload.hint')}</p>
					{/if}
					{#if photoError}<p class="error">{photoError}</p>{/if}
				</section>

				<section class="person">
					<h2>{t('fuw.personHeading')}</h2>
					<label class="field">
						{t('fuw.authorNameLabel')}
						<input type="text" bind:value={authorName} maxlength="150" required placeholder={t('fuw.authorNamePlaceholder')} />
					</label>
					<div class="row">
						<label class="field">
							{t('fuw.affiliationLabel')}
							<select bind:value={affiliation}>
								{#each FUW_AFFILIATIONS as a (a)}
									<option value={a}>{t(`fuw.affiliation.${a}` as MessageKey)}</option>
								{/each}
							</select>
						</label>
						<label class="field">
							{t('fuw.affiliationDetailLabel')}
							<input
								type="text"
								bind:value={affiliationDetail}
								maxlength="200"
								placeholder={affiliation === 'student' || affiliation === 'phd' || affiliation === 'alumni'
									? t('fuw.affiliationDetailPlaceholderStudent')
									: t('fuw.affiliationDetailPlaceholderStaff')}
							/>
						</label>
					</div>
					<label class="field">
						{t('fuw.emailLabel')}
						<input type="email" bind:value={email} maxlength="200" required autocomplete="email" />
						<span class="hint">{t('fuw.emailHint')}</span>
					</label>
					<label class="field">
						{t('fuw.storyLabel')}
						<textarea bind:value={story} rows="4" maxlength="6000" placeholder={t('fuw.storyPlaceholder')}></textarea>
					</label>

					<!-- Honeypot: invisible to people (and to assistive tech), filled in by naive bots. -->
					<div class="hp" aria-hidden="true">
						<label>
							Website
							<input type="text" bind:value={website} tabindex="-1" autocomplete="off" />
						</label>
					</div>

					<label class="consent">
						<input type="checkbox" bind:checked={consent} required />
						<span>{t('fuw.consentLabel')}</span>
					</label>
				</section>
			{/snippet}
		</RecipeComposerForm>
	{/key}
{/if}

<style lang="scss">
	.cookbook {
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--radius-card);
		background: var(--bg-surface);
		border: 1px solid var(--bg-surface-alt);

		h1 {
			margin: 0 0 var(--space-2);
		}
	}
	.cookbook__kicker {
		margin: 0 0 var(--space-1);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
		font-weight: 600;
	}
	.cookbook__lede {
		margin: 0;
		color: var(--text-secondary);
	}
	.how {
		margin: 0 0 var(--space-5);
		padding-left: var(--space-4);
		color: var(--text-secondary);
		font-size: 14px;
		line-height: 1.6;
	}
	.notice {
		color: var(--text-secondary);
	}
	.thanks {
		padding: var(--space-4);
		border-radius: var(--radius-card);
		background: var(--bg-surface);
		border: 1px solid var(--status-success);
	}
	.person {
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-5);
		border-bottom: 1px solid var(--bg-surface-alt);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 13px;
		color: var(--text-secondary);
		margin-bottom: var(--space-3);
		flex: 1;
		min-width: 200px;

		input,
		textarea,
		select {
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 14px;
			font-family: inherit;
			color: var(--text-primary);
			background: var(--bg-surface);
		}
	}
	.row {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.hint {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0 0 var(--space-2);
	}
	.photos {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-3);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);

		li {
			display: flex;
			flex-direction: column;
			gap: var(--space-1);
			align-items: flex-start;
		}
		img {
			width: 140px;
			height: 100px;
			object-fit: cover;
			border-radius: var(--radius-card);
		}
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;
		flex-wrap: wrap;

		input[type='file'] {
			font-size: 12px;
			color: var(--text-secondary);
			max-width: 100%;
		}
	}
	.upload__label {
		font-weight: 600;
	}
	.consent {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		font-size: 14px;

		input {
			margin-top: 3px;
		}
	}
	.hp {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
	.error {
		color: var(--status-danger);
		font-size: 13px;
	}
</style>
