<script lang="ts">
	// The client half of the R2 upload path (Session 26). Deliberately additive to the URL field it
	// sits next to rather than replacing it: pasting a link has been the only way to give a recipe
	// a photo since the Composer shipped (Session 18), every existing recipe's `heroImage` is such
	// a link, and an account without upload permission must still be able to publish exactly as it
	// could before this feature existed.
	//
	// `canUpload` here only decides whether the file picker is *drawn*. The real check is
	// server-side in /api/uploads (session + `users.can_upload`), which is where a forged value
	// would meet a 403 — see that route's own header comment.
	import { t } from '$lib/i18n/t';

	let {
		value = $bindable(''),
		canUpload = false
	}: { value?: string; canUpload?: boolean } = $props();

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	async function handleFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		uploadError = null;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch('/api/uploads', { method: 'POST', body });
			if (!res.ok) {
				// SvelteKit's `error()` helper returns { message } — surfacing the server's own reason
				// (too large, wrong type, no permission) beats a generic failure string, since every
				// one of those is something the person can actually act on.
				const detail = await res.json().catch(() => null);
				uploadError = detail?.message ?? t('upload.errorGeneric');
				return;
			}
			const data = (await res.json()) as { url: string };
			value = data.url;
		} catch {
			uploadError = t('upload.errorNetwork');
		} finally {
			uploading = false;
			// Clear the picker so re-selecting the same file still fires a change event.
			input.value = '';
		}
	}
</script>

<div class="image-field">
	<label class="field">
		{t('recipeComposer.heroImageLabel')}
		<input type="text" bind:value placeholder="https://..." />
	</label>

	{#if canUpload}
		<label class="upload">
			<span class="upload__label">
				{uploading ? t('upload.uploading') : t('upload.chooseFile')}
			</span>
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				disabled={uploading}
				onchange={handleFile}
			/>
		</label>
		<p class="hint">{t('upload.hint')}</p>
	{/if}

	{#if uploadError}
		<p class="error">{uploadError}</p>
	{/if}

	{#if value}
		<!-- A real preview, not just a URL echoed back: it's the only way to catch "that link is
		     dead" or "that's the wrong photo" before publishing. -->
		<img class="preview" src={value} alt="" />
	{/if}
</div>

<style lang="scss">
	.image-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 13px;
		color: var(--text-secondary);

		input {
			padding: var(--space-2);
			border: 1px solid var(--bg-surface-alt);
			border-radius: var(--radius-card);
			font-family: inherit;
			font-size: 14px;
			color: var(--text-primary);
			background: var(--bg-surface);
		}
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;

		input[type='file'] {
			font-size: 12px;
			color: var(--text-secondary);
		}
	}
	.upload__label {
		font-weight: 600;
		color: var(--text-primary);
	}
	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-secondary);
	}
	.error {
		margin: 0;
		font-size: 13px;
		color: var(--status-danger);
	}
	.preview {
		max-width: 240px;
		max-height: 160px;
		object-fit: cover;
		border-radius: var(--radius-card);
	}
</style>
