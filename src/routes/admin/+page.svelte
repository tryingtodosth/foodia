<script lang="ts">
	// Overview: what's actually in the database right now. Every number is a real `count(*)` from
	// this request, not a cached or estimated figure — see lib/server/api/admin.ts's own note on
	// why counting is cheap enough to just do properly.
	import { t } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tiles = $derived(
		data.stats
			? [
					{ label: t('admin.stats.users'), value: data.stats.users },
					{ label: t('admin.stats.recipes'), value: data.stats.recipes },
					{ label: t('admin.stats.ingredients'), value: data.stats.ingredients },
					{ label: t('admin.stats.steps'), value: data.stats.steps },
					{ label: t('admin.stats.comments'), value: data.stats.publicComments },
					{ label: t('admin.stats.privateComments'), value: data.stats.privateComments },
					{ label: t('admin.stats.removedComments'), value: data.stats.removedComments },
					{ label: t('admin.stats.substitutions'), value: data.stats.substitutions },
					{ label: t('admin.stats.stepAlternatives'), value: data.stats.stepAlternatives },
					{ label: t('admin.stats.translations'), value: data.stats.translations },
					{ label: t('admin.stats.sessions'), value: data.stats.sessions },
					{ label: t('admin.stats.pendingReports'), value: data.stats.pendingReports },
					{ label: t('admin.stats.uploaders'), value: data.stats.uploaders }
				]
			: []
	);

	function shortDate(iso: string): string {
		return iso.slice(0, 10);
	}
</script>

{#if !data.stats}
	<p class="empty">{t('recipeComposer.noBackend')}</p>
{:else}
	<section>
		<h2>{t('admin.stats.heading')}</h2>
		<div class="tiles">
			{#each tiles as tile (tile.label)}
				<div class="tile">
					<span class="tile__value">{tile.value}</span>
					<span class="tile__label">{tile.label}</span>
				</div>
			{/each}
		</div>
	</section>

	<div class="columns">
		<section>
			<h2>{t('admin.stats.recentUsersHeading')}</h2>
			<ul class="list">
				{#each data.recentUsers as user (user.id)}
					<li>
						<a href={`/users/${user.id}`}>{user.displayName}</a>
						<span class="muted">{user.email} · {shortDate(user.createdAt)}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>{t('admin.stats.recentRecipesHeading')}</h2>
			<ul class="list">
				{#each data.recentRecipes as recipe (recipe.id)}
					<li>
						<a href={`/recipes/${recipe.id}`}>{recipe.name}</a>
						<span class="muted">{recipe.authorName} · {shortDate(recipe.createdAt)}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>
{/if}

<style lang="scss">
	section {
		margin-bottom: var(--space-5);
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-2);
	}
	.tile {
		background: var(--bg-surface);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.tile__value {
		font-size: 24px;
		font-weight: 600;
	}
	.tile__label {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-4);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;

		li {
			display: flex;
			flex-direction: column;
			padding: var(--space-2) 0;
			border-bottom: 1px solid var(--bg-surface-alt);
			font-size: 14px;
		}
		a {
			color: var(--text-primary);
		}
	}
	.muted,
	.empty {
		font-size: 12px;
		color: var(--text-secondary);
	}
</style>
