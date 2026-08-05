<script lang="ts">
	import { t } from '$lib/i18n/t';
	import type { CommentKind } from '$lib/types/recipe';

	// The write-side of Module 4's node-based comments (CLAUDE.md 4.4) — collapsed by default so
	// a recipe with many ingredients/steps doesn't show an open textarea under every single one.
	// `onsubmit` may return a Promise<boolean> (Session 22 — now a real POST /api/comments call,
	// not a synchronous local push): true collapses the form, false/rejection keeps it open with
	// the entered text intact and shows an inline error, rather than silently discarding it.
	//
	// Session 27 — photos and stories. Both are OPT-IN per call site (`allowMedia`/`allowStory`,
	// default off) rather than switched on everywhere: this composer renders under every ingredient,
	// step, substitution and step-alternative on the recipe page, and putting a file picker and a
	// story toggle under all of them would bury the thing people actually came to do. The ingredient
	// sheet turns them on, because that's where the ask ("photos, stories") actually lives.
	// `extras` is a third, optional callback argument for exactly the same reason — every existing
	// `(content, visibility) => ...` call site keeps working untouched.
	let {
		onsubmit,
		allowMedia = false,
		allowStory = false,
		canUpload = false
	}: {
		onsubmit: (
			content: string,
			visibility: 'public' | 'private',
			extras: { kind: CommentKind; imageUrl?: string }
		) => boolean | Promise<boolean> | void;
		allowMedia?: boolean;
		allowStory?: boolean;
		canUpload?: boolean;
	} = $props();

	let open = $state(false);
	let content = $state('');
	let visibility = $state<'public' | 'private'>('public');
	let kind = $state<CommentKind>('note');
	let imageUrl = $state<string | null>(null);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let submitting = $state(false);
	let failed = $state(false);

	// A photo alone is a real contribution ("here's what mine looked like") — the server agrees
	// (createComment.ts requires text OR an image, not text specifically), so the button must not
	// disagree with it and refuse to send one.
	let canSubmit = $derived(content.trim().length > 0 || imageUrl !== null);

	/** Reuses the exact `/api/uploads` route the recipe composer's own ImageUploadField already
	 *  posts to — same session + `can_upload` check server-side, same R2 bucket, same
	 *  `/api/media/[key]` path back. `canUpload` here only decides whether the picker is DRAWN. */
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
				const detail = await res.json().catch(() => null);
				uploadError = detail?.message ?? t('upload.errorGeneric');
				return;
			}
			const data = (await res.json()) as { url: string };
			imageUrl = data.url;
		} catch {
			uploadError = t('upload.errorNetwork');
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	async function submit() {
		if (!canSubmit) return;
		failed = false;
		submitting = true;
		const result = await onsubmit(content.trim(), visibility, {
			kind,
			imageUrl: imageUrl ?? undefined
		});
		submitting = false;
		if (result === false) {
			failed = true;
			return;
		}
		reset();
		open = false;
	}

	function reset() {
		content = '';
		visibility = 'public';
		kind = 'note';
		imageUrl = null;
		uploadError = null;
		failed = false;
	}

	function cancel() {
		open = false;
		reset();
	}
</script>

{#if !open}
	<button type="button" class="composer-toggle" onclick={() => (open = true)}>
		{t('comment.addToggle')}
	</button>
{:else}
	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		{#if allowStory}
			<div class="composer__kinds" role="group" aria-label={t('comment.kindLabel')}>
				<button
					type="button"
					class="composer__kind"
					class:active={kind === 'note'}
					aria-pressed={kind === 'note'}
					onclick={() => (kind = 'note')}
				>
					💬 {t('comment.kindNote')}
				</button>
				<button
					type="button"
					class="composer__kind"
					class:active={kind === 'story'}
					aria-pressed={kind === 'story'}
					onclick={() => (kind = 'story')}
				>
					📖 {t('comment.kindStory')}
				</button>
			</div>
		{/if}

		<textarea
			bind:value={content}
			placeholder={kind === 'story' ? t('comment.storyPlaceholder') : t('comment.placeholder')}
			rows={kind === 'story' ? 4 : 2}
		></textarea>

		{#if allowMedia}
			{#if canUpload}
				<label class="composer__upload">
					<span>{uploading ? t('upload.uploading') : t('comment.addPhoto')}</span>
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif"
						disabled={uploading}
						onchange={handleFile}
					/>
				</label>
			{:else}
				<!-- Stated, not silently omitted: uploading is a per-account permission an admin grants
				     (users.can_upload), so someone who simply doesn't have it yet should learn that
				     rather than wonder where the button went. -->
				<p class="composer__hint">{t('comment.photoNoPermission')}</p>
			{/if}
			{#if uploadError}
				<p class="composer__error">{uploadError}</p>
			{/if}
			{#if imageUrl}
				<div class="composer__preview">
					<img src={imageUrl} alt="" />
					<button type="button" class="composer__remove" onclick={() => (imageUrl = null)}>
						{t('comment.removePhoto')}
					</button>
				</div>
			{/if}
		{/if}

		{#if failed}
			<p class="composer__error">{t('comment.postError')}</p>
		{/if}
		<div class="composer__row">
			<label class="composer__visibility">
				<input
					type="checkbox"
					checked={visibility === 'private'}
					onchange={(e) => (visibility = e.currentTarget.checked ? 'private' : 'public')}
				/>
				{t('comment.privateLabel')}
			</label>
			<div class="composer__actions">
				<button type="button" class="btn btn--ghost" onclick={cancel}>{t('comment.cancel')}</button>
				<button type="submit" class="btn btn--primary" disabled={submitting || !canSubmit}>
					{t('comment.add')}
				</button>
			</div>
		</div>
	</form>
{/if}

<style lang="scss">
	.composer-toggle {
		margin-top: var(--space-1);
		padding-left: var(--space-3);
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;

		&:hover {
			color: var(--accent);
		}
	}
	.composer {
		margin-top: var(--space-2);
		padding-left: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);

		textarea {
			width: 100%;
			padding: var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-family: inherit;
			font-size: 13px;
			resize: vertical;
		}
	}
	.composer__kinds {
		display: flex;
		gap: var(--space-1);
	}
	.composer__kind {
		border: 1px solid var(--bg-surface-alt);
		background: none;
		border-radius: var(--radius-pill);
		padding: 2px 10px;
		font-family: inherit;
		font-size: 12px;
		color: var(--text-secondary);
		cursor: pointer;

		&.active {
			background: var(--accent);
			border-color: var(--accent);
			color: white;
		}
	}
	.composer__upload {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 12px;
		color: var(--text-secondary);

		input[type='file'] {
			font-size: 11px;
		}
	}
	.composer__preview {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);

		img {
			max-width: 140px;
			max-height: 110px;
			object-fit: cover;
			border-radius: var(--radius-card);
		}
	}
	.composer__remove {
		background: none;
		border: none;
		font-family: inherit;
		font-size: 11px;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 0;

		&:hover {
			color: var(--status-danger);
		}
	}
	.composer__hint {
		margin: 0;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.composer__error {
		margin: 0;
		font-size: 12px;
		color: var(--status-danger);
	}
	.composer__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.composer__visibility {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.composer__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
