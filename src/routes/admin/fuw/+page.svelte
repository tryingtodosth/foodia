<script lang="ts">
	// Review queue for /fuw cookbook submissions: read each one in full (photos included — admins
	// can fetch private fuw/ objects), accept/reject, promote to a real Foodia recipe, delete spam,
	// and export accepted ones for the book. Every action re-runs the load (`invalidateAll`) so
	// what's shown is what the database now holds.
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import type { FuwStatus } from '$lib/types/fuw';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Filter = FuwStatus | 'all';
	let filter = $state<Filter>('pending');
	let busyId = $state<string | null>(null);
	let actionError = $state('');

	let counts = $derived({
		all: data.submissions.length,
		pending: data.submissions.filter((s) => s.status === 'pending').length,
		accepted: data.submissions.filter((s) => s.status === 'accepted').length,
		rejected: data.submissions.filter((s) => s.status === 'rejected').length
	});
	let visible = $derived(filter === 'all' ? data.submissions : data.submissions.filter((s) => s.status === filter));

	const FILTERS: Filter[] = ['pending', 'accepted', 'rejected', 'all'];

	function media(urlOrKey: string): string {
		return urlOrKey.startsWith('fuw/') ? `/api/media/${urlOrKey}` : urlOrKey;
	}

	async function call(id: string, url: string, init: RequestInit): Promise<Response | null> {
		busyId = id;
		actionError = '';
		const res = await fetch(url, init).catch(() => null);
		busyId = null;
		if (!res?.ok) {
			const detail = await res?.json().catch(() => null);
			actionError = detail?.message ?? t('admin.actionFailed');
			return null;
		}
		await invalidateAll();
		return res;
	}

	function setStatus(id: string, status: FuwStatus) {
		call(id, `/api/admin/fuw/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status })
		});
	}

	function promote(id: string, name: string) {
		if (!confirm(t('admin.fuw.promoteConfirm', { name }))) return;
		call(id, `/api/admin/fuw/${id}/promote`, { method: 'POST' });
	}

	function remove(id: string, name: string) {
		if (!confirm(t('admin.fuw.deleteConfirm', { name }))) return;
		call(id, `/api/admin/fuw/${id}`, { method: 'DELETE' });
	}

	function fmt(iso: string): string {
		return new Date(iso).toLocaleString();
	}
</script>

<section class="toolbar">
	<div class="filters" role="group" aria-label={t('admin.fuw.filterLabel')}>
		{#each FILTERS as f (f)}
			<button type="button" class="chip" class:chip--active={filter === f} onclick={() => (filter = f)}>
				{t(`admin.fuw.filter.${f}` as MessageKey)} ({counts[f]})
			</button>
		{/each}
	</div>
	<div class="exports">
		<span>{t('admin.fuw.exportLabel')}</span>
		<a class="btn btn--ghost" href="/api/admin/fuw/export?format=csv" download>CSV</a>
		<a class="btn btn--ghost" href="/api/admin/fuw/export?format=json" download>JSON</a>
		<a class="link" href="/fuw" target="_blank" rel="noopener">{t('admin.fuw.openForm')}</a>
	</div>
	<p class="hint">{t('admin.fuw.exportHint')}</p>
</section>

{#if actionError}
	<p class="error" role="alert">{actionError}</p>
{/if}

{#if visible.length === 0}
	<p class="empty">{t('admin.fuw.empty')}</p>
{:else}
	<ul class="subs">
		{#each visible as s (s.id)}
			<li class="sub" data-status={s.status}>
				<details>
					<summary>
						<span class="badge badge--{s.status}">{t(`admin.fuw.filter.${s.status}` as MessageKey)}</span>
						<strong>{s.recipe.name}</strong>
						<span class="meta">
							{s.authorName} · {t(`fuw.affiliation.${s.affiliation}` as MessageKey)}{s.affiliationDetail ? `, ${s.affiliationDetail}` : ''}
							· {fmt(s.submittedAt)}
						</span>
					</summary>

					<div class="body">
						{#if s.recipe.heroImage}
							<img class="hero" src={s.recipe.heroImage} alt="" />
						{/if}
						<p class="summary">{s.recipe.summary}</p>
						<p class="pre">{s.recipe.description}</p>

						<dl class="facts">
							<dt>{t('admin.fuw.email')}</dt>
							<dd><a href={`mailto:${s.email}`}>{s.email}</a></dd>
							<dt>{t('admin.fuw.language')}</dt>
							<dd>{s.recipe.sourceLocale ?? 'pl'}</dd>
							<dt>{t('recipeComposer.timeLabel')}</dt>
							<dd>{s.recipe.timeMinutes}</dd>
							{#if s.recipe.tags.length}
								<dt>{t('recipeComposer.tagsLabel')}</dt>
								<dd>{s.recipe.tags.join(', ')}</dd>
							{/if}
							{#if s.recipe.dietFlags.length}
								<dt>{t('recipeComposer.dietFlagsLabel')}</dt>
								<dd>{s.recipe.dietFlags.join(', ')}</dd>
							{/if}
							{#if s.recipe.requiredEquipment.length}
								<dt>{t('recipeComposer.equipmentLabel')}</dt>
								<dd>{s.recipe.requiredEquipment.join(', ')}</dd>
							{/if}
							{#if s.recipe.macros.kcal}
								<dt>{t('recipeComposer.macrosHeading')}</dt>
								<dd>
									{s.recipe.macros.kcal} kcal · {s.recipe.macros.proteinG} g / {s.recipe.macros.fatG} g / {s.recipe.macros.carbsG} g
								</dd>
							{/if}
							{#if s.recipe.costEstimate}
								<dt>{t('recipeComposer.costLabel')}</dt>
								<dd>{s.recipe.costEstimate.amount}</dd>
							{/if}
						</dl>

						<h3>{t('recipeComposer.ingredientsHeading')}</h3>
						<ul>
							{#each s.recipe.ingredients as ing, i (i)}
								<li>{ing.quantity} {ing.unit} {ing.name}</li>
							{/each}
						</ul>

						<h3>{t('recipeComposer.stepsHeading')}</h3>
						<ol>
							{#each s.recipe.steps as step, i (i)}
								<li>
									{step.text}
									{#if step.durationMinutes}<span class="meta">({step.durationMinutes} min)</span>{/if}
								</li>
							{/each}
						</ol>

						{#if s.story}
							<h3>{t('fuw.storyLabel')}</h3>
							<p class="pre">{s.story}</p>
						{/if}

						{#if s.photoKeys.length}
							<h3>{t('fuw.photosHeading')}</h3>
							<div class="photos">
								{#each s.photoKeys as key (key)}
									<a href={media(key)} target="_blank" rel="noopener"><img src={media(key)} alt="" /></a>
								{/each}
							</div>
						{/if}

						<div class="actions">
							{#if s.status !== 'accepted'}
								<button type="button" class="btn btn--primary" disabled={busyId === s.id} onclick={() => setStatus(s.id, 'accepted')}>
									{t('admin.fuw.accept')}
								</button>
							{/if}
							{#if s.status !== 'rejected' && !s.promotedRecipeId}
								<button type="button" class="btn btn--ghost" disabled={busyId === s.id} onclick={() => setStatus(s.id, 'rejected')}>
									{t('admin.fuw.reject')}
								</button>
							{/if}
							{#if s.status !== 'pending' && !s.promotedRecipeId}
								<button type="button" class="btn btn--ghost" disabled={busyId === s.id} onclick={() => setStatus(s.id, 'pending')}>
									{t('admin.fuw.backToPending')}
								</button>
							{/if}
							{#if s.promotedRecipeId}
								<a class="btn btn--ghost" href={`/recipes/${s.promotedRecipeId}`}>{t('admin.fuw.viewRecipe')}</a>
							{:else if s.status !== 'rejected'}
								<button type="button" class="btn btn--ghost" disabled={busyId === s.id} onclick={() => promote(s.id, s.recipe.name)}>
									{t('admin.fuw.promote')}
								</button>
								<button type="button" class="btn btn--danger" disabled={busyId === s.id} onclick={() => remove(s.id, s.recipe.name)}>
									{t('admin.fuw.delete')}
								</button>
							{:else}
								<button type="button" class="btn btn--danger" disabled={busyId === s.id} onclick={() => remove(s.id, s.recipe.name)}>
									{t('admin.fuw.delete')}
								</button>
							{/if}
						</div>
					</div>
				</details>
			</li>
		{/each}
	</ul>
{/if}

<style lang="scss">
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.filters,
	.exports {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		font-size: 13px;
	}
	.chip {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		border: 1px solid var(--bg-surface-alt);
		background: var(--bg-surface);
		font: inherit;
		cursor: pointer;
	}
	.chip--active {
		background: var(--text-primary);
		color: var(--bg-surface);
	}
	.link {
		font-size: 13px;
	}
	.hint,
	.empty,
	.meta {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.subs {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sub details {
		border: 1px solid var(--bg-surface-alt);
		border-radius: var(--radius-card);
		background: var(--bg-surface);
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-3);
		cursor: pointer;
	}
	.badge {
		font-size: 11px;
		font-weight: 600;
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--bg-surface-alt);
	}
	.badge--accepted {
		background: var(--status-success);
		color: white;
	}
	.badge--rejected {
		background: var(--status-danger);
		color: white;
	}
	.body {
		padding: 0 var(--space-3) var(--space-3);
		font-size: 14px;

		h3 {
			font-size: 14px;
			margin: var(--space-3) 0 var(--space-1);
		}
	}
	.hero {
		max-width: 100%;
		max-height: 260px;
		border-radius: var(--radius-card);
		object-fit: cover;
	}
	.summary {
		font-weight: 600;
	}
	.pre {
		white-space: pre-wrap;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-3);
		font-size: 13px;

		dt {
			color: var(--text-secondary);
		}
		dd {
			margin: 0;
			overflow-wrap: anywhere;
		}
	}
	.photos {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);

		img {
			width: 140px;
			height: 100px;
			object-fit: cover;
			border-radius: var(--radius-card);
		}
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.btn--danger {
		background: var(--status-danger);
		color: white;
	}
	.error {
		color: var(--status-danger);
		font-size: 13px;
	}
</style>
