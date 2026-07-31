<script lang="ts">
	// Content management — the destructive actions no surface in this app has ever had. Recipes
	// delete outright (cascading to their ingredients/steps/comments); comments get two distinct
	// actions, hide and delete, because they're genuinely different things (see the API route's own
	// header comment).
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let recipeQuery = $state('');
	let busyId = $state<string | null>(null);
	let actionError = $state(false);

	let visibleRecipes = $derived(
		recipeQuery.trim().length === 0
			? data.recipes
			: data.recipes.filter((r) =>
					r.name.toLowerCase().includes(recipeQuery.trim().toLowerCase())
				)
	);

	async function call(id: string, url: string, init: RequestInit) {
		busyId = id;
		actionError = false;
		const res = await fetch(url, init).catch(() => null);
		busyId = null;
		if (!res?.ok) {
			actionError = true;
			return;
		}
		await invalidateAll();
	}

	function removeRecipe(id: string, name: string) {
		if (!confirm(t('admin.content.deleteRecipeConfirm', { name }))) return;
		call(id, `/api/admin/recipes/${id}`, { method: 'DELETE' });
	}

	function deleteComment(id: string) {
		if (!confirm(t('admin.content.deleteCommentConfirm'))) return;
		call(id, `/api/admin/comments/${id}`, { method: 'DELETE' });
	}

	function setRemoved(id: string, removed: boolean) {
		call(id, `/api/admin/comments/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ removed })
		});
	}
</script>

{#if actionError}
	<p class="error">{t('admin.actionFailed')}</p>
{/if}

<section>
	<h2>{t('admin.content.recipesHeading')} ({data.recipes.length})</h2>
	<input
		class="search"
		type="search"
		placeholder={t('admin.content.search')}
		bind:value={recipeQuery}
	/>

	{#if visibleRecipes.length === 0}
		<p class="empty">{t('admin.content.empty')}</p>
	{:else}
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th>{t('admin.content.recipesHeading')}</th>
						<th>{t('admin.content.author')}</th>
						<th class="num">#</th>
						<th>{t('admin.content.created')}</th>
						<th>{t('admin.users.colActions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRecipes as recipe (recipe.id)}
						<tr class:busy={busyId === recipe.id}>
							<td>
								{recipe.name}
								<span class="muted">{recipe.sourceLocale}</span>
							</td>
							<td><a href={`/users/${recipe.authorId}`}>{recipe.authorName}</a></td>
							<td class="num nowrap">
								{recipe.ingredientCount} / {recipe.stepCount} / {recipe.commentCount}
							</td>
							<td class="nowrap">{recipe.createdAt.slice(0, 10)}</td>
							<td class="nowrap">
								<a href={`/recipes/${recipe.id}`}>{t('admin.content.view')}</a>
								<button
									type="button"
									class="link-btn danger"
									disabled={busyId === recipe.id}
									onclick={() => removeRecipe(recipe.id, recipe.name)}
								>
									{t('admin.content.delete')}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section>
	<h2>{t('admin.content.commentsHeading')} ({data.comments.length})</h2>
	{#if data.comments.length === 0}
		<p class="empty">{t('admin.content.empty')}</p>
	{:else}
		<ul class="comments">
			{#each data.comments as comment (comment.id)}
				<li class="comment" class:busy={busyId === comment.id}>
					<p class="comment__content">
						{#if comment.visibility === 'private'}
							<span class="tag">🔒 {t('admin.content.privateLabel')}</span>
						{/if}
						{#if comment.removed}
							<span class="tag tag--removed">{t('admin.content.removedLabel')}</span>
						{/if}
						"{comment.content}"
					</p>
					<p class="comment__meta">
						<a href={`/users/${comment.authorId}`}>{comment.authorName}</a>
						· <a href={`/recipes/${comment.recipeId}`}>{comment.recipeName}</a>
						· {comment.createdAt.slice(0, 10)}
					</p>
					<div class="comment__actions">
						{#if comment.removed}
							<button
								type="button"
								class="link-btn"
								disabled={busyId === comment.id}
								onclick={() => setRemoved(comment.id, false)}
							>
								{t('admin.content.restore')}
							</button>
						{:else}
							<button
								type="button"
								class="link-btn"
								disabled={busyId === comment.id}
								onclick={() => setRemoved(comment.id, true)}
							>
								{t('admin.content.remove')}
							</button>
						{/if}
						<button
							type="button"
							class="link-btn danger"
							disabled={busyId === comment.id}
							onclick={() => deleteComment(comment.id)}
						>
							{t('admin.content.delete')}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style lang="scss">
	section {
		margin-bottom: var(--space-5);
	}
	.search {
		width: 100%;
		max-width: 320px;
		padding: var(--space-2);
		margin-bottom: var(--space-3);
		border: 1px solid var(--bg-surface-alt);
		border-radius: var(--radius-card);
		font-family: inherit;
		font-size: 14px;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th,
	td {
		text-align: left;
		padding: var(--space-2);
		border-bottom: 1px solid var(--bg-surface-alt);
		vertical-align: top;
	}
	th {
		font-size: 12px;
		color: var(--text-secondary);
		font-weight: 600;
		white-space: nowrap;
	}
	.num {
		text-align: right;
	}
	.nowrap {
		white-space: nowrap;
	}
	tr.busy,
	li.busy {
		opacity: 0.5;
	}
	.muted {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.comments {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.comment {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		margin-bottom: var(--space-2);
	}
	.comment__content {
		margin: 0 0 var(--space-1);
		font-size: 14px;
	}
	.comment__meta {
		margin: 0 0 var(--space-2);
		font-size: 12px;
		color: var(--text-secondary);
	}
	.comment__actions {
		display: flex;
		gap: var(--space-3);
	}
	.tag {
		display: inline-block;
		padding: 0 var(--space-1);
		border-radius: var(--radius-card);
		background: var(--bg-surface-alt);
		font-size: 11px;
		color: var(--text-secondary);
	}
	.tag--removed {
		color: var(--status-danger);
	}
	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
		font-size: 13px;
		color: var(--accent);
		cursor: pointer;

		&:disabled {
			cursor: default;
			opacity: 0.6;
		}
	}
	.danger {
		color: var(--status-danger);
	}
	.error {
		color: var(--status-danger);
		font-size: 13px;
	}
	.empty {
		color: var(--text-secondary);
		font-size: 14px;
	}
</style>
