<script lang="ts">
	// Every account, with the two permission toggles this dashboard exists to operate: moderator
	// (the role the app has always had) and upload (new in Session 26, default-off for everyone —
	// this table is the only place it can ever be turned on).
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/t';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');
	let busyId = $state<string | null>(null);
	let actionError = $state(false);

	let adminSet = $derived(new Set(data.adminEmails.map((e) => e.toLowerCase())));

	let visible = $derived(
		query.trim().length === 0
			? data.users
			: data.users.filter((u) => {
					const needle = query.trim().toLowerCase();
					return (
						u.email.toLowerCase().includes(needle) || u.displayName.toLowerCase().includes(needle)
					);
				})
	);

	async function toggleFlag(userId: string, flag: 'isModerator' | 'canUpload', value: boolean) {
		busyId = userId;
		actionError = false;
		const res = await fetch(`/api/admin/users/${userId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ flag, value })
		}).catch(() => null);
		busyId = null;
		if (!res?.ok) {
			actionError = true;
			return;
		}
		// Re-runs the server load rather than patching the row in place: the table's own counts and
		// flags then come from the database that was just written to, so what's on screen can't
		// drift from what's stored.
		await invalidateAll();
	}

	async function removeUser(userId: string, displayName: string) {
		if (!confirm(t('admin.users.deleteConfirm', { name: displayName }))) return;
		busyId = userId;
		actionError = false;
		const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' }).catch(() => null);
		busyId = null;
		if (!res?.ok) {
			actionError = true;
			return;
		}
		await invalidateAll();
	}
</script>

<section>
	<h2>{t('admin.users.heading')}</h2>

	<input class="search" type="search" placeholder={t('admin.users.search')} bind:value={query} />

	{#if actionError}
		<p class="error">{t('admin.actionFailed')}</p>
	{/if}

	{#if visible.length === 0}
		<p class="empty">{t('admin.users.empty')}</p>
	{:else}
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th>{t('admin.users.colUser')}</th>
						<th>{t('admin.users.colJoined')}</th>
						<th class="num">{t('admin.users.colRecipes')}</th>
						<th class="num">{t('admin.users.colComments')}</th>
						<th>{t('admin.users.colModerator')}</th>
						<th>{t('admin.users.colUpload')}</th>
						<th>{t('admin.users.colActions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each visible as user (user.id)}
						{@const isAllowlisted = adminSet.has(user.email.toLowerCase())}
						<tr class:busy={busyId === user.id}>
							<td>
								<a href={`/users/${user.id}`}>{user.displayName}</a>
								{#if isAllowlisted}
									<span class="badge">{t('admin.users.adminBadge')}</span>
								{/if}
								<span class="muted">{user.email}</span>
							</td>
							<td class="muted">{user.createdAt.slice(0, 10)}</td>
							<td class="num">{user.recipeCount}</td>
							<td class="num">{user.commentCount}</td>
							<td>
								<input
									type="checkbox"
									checked={user.isModerator}
									disabled={busyId === user.id}
									onchange={(e) =>
										toggleFlag(user.id, 'isModerator', e.currentTarget.checked)}
								/>
							</td>
							<td>
								<input
									type="checkbox"
									checked={user.canUpload}
									disabled={busyId === user.id}
									onchange={(e) => toggleFlag(user.id, 'canUpload', e.currentTarget.checked)}
								/>
							</td>
							<td>
								{#if isAllowlisted}
									<span class="muted">{t('admin.users.deleteBlockedSelf')}</span>
								{:else}
									<button
										type="button"
										class="btn btn--ghost danger"
										disabled={busyId === user.id}
										onclick={() => removeUser(user.id, user.displayName)}
									>
										{t('admin.users.delete')}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style lang="scss">
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
	tr.busy {
		opacity: 0.5;
	}
	.muted {
		display: block;
		font-size: 11px;
		color: var(--text-secondary);
	}
	td.muted {
		display: table-cell;
		white-space: nowrap;
	}
	.badge {
		display: inline-block;
		margin-left: var(--space-1);
		padding: 0 var(--space-1);
		border-radius: var(--radius-card);
		background: var(--accent);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
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
