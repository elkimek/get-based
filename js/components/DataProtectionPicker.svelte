<script lang="ts">
  import type { ProtectionAction, ProtectionCard } from '../data-protection-picker-model.js';
  let { cards, pick, close }: { cards: ProtectionCard[]; pick(key: ProtectionAction): void; close(): void } = $props();
  const focus = 'gb:protection-picker:focus-visible:outline-2 gb:protection-picker:focus-visible:outline-accent gb:protection-picker:focus-visible:outline-offset-2';
</script>
<div class="confirm-dialog gb:protection-picker:box-border gb:protection-picker:w-full gb:protection-picker:max-w-[560px] gb:protection-picker:max-h-[calc(100dvh-32px)] gb:protection-picker:overflow-y-auto gb:protection-picker:overscroll-contain gb:protection-picker:p-5 gb:protection-picker:font-body gb:protection-picker:text-ink gb:protection-picker:max-[400px]:p-3" role="dialog" aria-modal="true" aria-labelledby="data-protection-picker-title" data-data-protection-view>
  <h2 id="data-protection-picker-title" class="confirm-message gb:protection-picker:mt-0 gb:protection-picker:mb-3.5 gb:protection-picker:text-lg gb:protection-picker:font-semibold">Protect your data</h2>
  <div class="dashboard-picker-grid gb:protection-picker:mb-3.5 gb:protection-picker:grid gb:protection-picker:grid-cols-1 gb:protection-picker:gap-2.5">
    {#each cards as card (card.key)}
      <button type="button" class={`dashboard-picker-card gb:protection-picker:box-border gb:protection-picker:flex gb:protection-picker:w-full gb:protection-picker:min-h-11 gb:protection-picker:flex-col gb:protection-picker:items-start gb:protection-picker:gap-1.5 gb:protection-picker:rounded-control gb:protection-picker:border gb:protection-picker:border-line gb:protection-picker:bg-surface gb:protection-picker:p-3.5 gb:protection-picker:text-left gb:protection-picker:font-body gb:protection-picker:text-ink gb:protection-picker:cursor-pointer gb:protection-picker:hover:border-accent gb:protection-picker:hover:bg-hover ${focus}`} data-pick={card.key} data-configured={card.configured ? 'true' : undefined} aria-labelledby={`protection-${card.key}-title protection-${card.key}-action`} aria-describedby={`protection-${card.key}-description`} onclick={() => pick(card.key)}>
        <span class="dashboard-picker-icon gb:protection-picker:text-[22px] gb:protection-picker:leading-none" aria-hidden="true">{card.icon}</span>
        <span id={`protection-${card.key}-title`} class="dashboard-picker-title gb:protection-picker:inline-flex gb:protection-picker:items-center gb:protection-picker:gap-1.5 gb:protection-picker:text-sm gb:protection-picker:font-semibold">{card.title}{#if card.configured}<span class="dashboard-picker-check gb:protection-picker:text-success-ink" aria-hidden="true">✓</span>{/if}</span>
        <span id={`protection-${card.key}-description`} class="dashboard-picker-sub gb:protection-picker:text-xs gb:protection-picker:leading-normal gb:protection-picker:text-secondary">{card.description}</span>
        <span id={`protection-${card.key}-action`} class={`dashboard-picker-action gb:protection-picker:mt-1 gb:protection-picker:text-xs gb:protection-picker:font-medium ${card.configured ? 'gb:protection-picker:text-success-ink' : 'gb:protection-picker:text-link-ink'}`}>{card.configured ? 'Configured' : 'Set up →'}</span>
      </button>
    {/each}
  </div>
  <div class="confirm-actions gb:protection-picker:mt-1.5 gb:protection-picker:flex gb:protection-picker:justify-end">
    <button type="button" class={`confirm-btn confirm-btn-cancel gb:protection-picker:transition-none gb:protection-picker:min-h-11 gb:protection-picker:min-w-11 gb:protection-picker:rounded-control gb:protection-picker:border gb:protection-picker:border-line gb:protection-picker:bg-secondary-surface gb:protection-picker:px-4 gb:protection-picker:py-2 gb:protection-picker:font-body gb:protection-picker:text-sm gb:protection-picker:text-ink gb:protection-picker:cursor-pointer ${focus}`} id="data-protection-picker-cancel" onclick={close}>Close</button>
  </div>
</div>
