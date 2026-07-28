<script lang="ts">
	// The write-side of Device/Equipment Alternatives (CLAUDE.md 4.1/4.2) — same "collapsed toggle
	// reveals a form" shape as CommentComposer/SubstitutionComposer. Reuses the onboarding wizard's
	// own translated hardware labels (`onboarding.hardware.*`) rather than a second copy, since
	// they name the exact same HardwareProfile keys.
	import { t } from '$lib/i18n/t';
	import type { MessageKey } from '$lib/i18n/messages';
	import type { HardwareProfile } from '$lib/types/user';

	let {
		onsubmit
	}: { onsubmit: (text: string, requiresEquipment: string[], durationMinutes: number | null) => void } =
		$props();

	const HARDWARE_KEYS: (keyof HardwareProfile)[] = [
		'oven',
		'microwave',
		'airfryer',
		'blenderJug',
		'kitchenScale'
	];

	let open = $state(false);
	let text = $state('');
	let selectedEquipment = $state<string[]>([]);
	let durationMinutes = $state<number | ''>('');

	function toggleEquipment(key: string) {
		selectedEquipment = selectedEquipment.includes(key)
			? selectedEquipment.filter((k) => k !== key)
			: [...selectedEquipment, key];
	}

	function submit() {
		const trimmed = text.trim();
		if (!trimmed) return;
		onsubmit(trimmed, selectedEquipment, durationMinutes === '' ? null : durationMinutes);
		text = '';
		selectedEquipment = [];
		durationMinutes = '';
		open = false;
	}

	function cancel() {
		open = false;
		text = '';
		selectedEquipment = [];
		durationMinutes = '';
	}
</script>

{#if !open}
	<button type="button" class="composer-toggle" onclick={() => (open = true)}>
		{t('stepAlternative.proposeToggle')}
	</button>
{:else}
	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<textarea bind:value={text} placeholder={t('stepAlternative.textPlaceholder')} rows="2" required
		></textarea>
		<div class="composer__row">
			<span class="composer__label">{t('stepAlternative.equipmentLabel')}</span>
			<div class="composer__equipment">
				{#each HARDWARE_KEYS as key (key)}
					<label class="composer__chip">
						<input
							type="checkbox"
							checked={selectedEquipment.includes(key)}
							onchange={() => toggleEquipment(key)}
						/>
						{t(`onboarding.hardware.${key}` as MessageKey)}
					</label>
				{/each}
			</div>
		</div>
		<label class="composer__duration">
			{t('stepAlternative.durationLabel')}
			<input type="number" min="1" bind:value={durationMinutes} placeholder="np. 20" />
		</label>
		<div class="composer__actions">
			<button type="button" class="btn btn--ghost" onclick={cancel}>{t('comment.cancel')}</button>
			<button type="submit" class="btn btn--primary">{t('comment.add')}</button>
		</div>
	</form>
{/if}

<style lang="scss">
	.composer-toggle {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
		padding: var(--space-1) 0;

		&:hover {
			color: var(--accent);
		}
	}
	.composer {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);

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
	.composer__row {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.composer__label {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.composer__equipment {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.composer__chip {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--text-secondary);
	}
	.composer__duration {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 12px;
		color: var(--text-secondary);

		input {
			width: 70px;
			padding: var(--space-1) var(--space-2);
			border-radius: var(--radius-card);
			border: 1px solid var(--bg-surface-alt);
			font-size: 13px;
			font-family: inherit;
		}
	}
	.composer__actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
