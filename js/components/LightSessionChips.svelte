<script lang="ts">
  import type { SessionChannelChip } from '../light-active-session-presentation.js';
  let { chips }: { chips: readonly SessionChannelChip[] } = $props();
  const accents: Record<string, string> = { vitamin_d: 'var(--yellow)', circadian: 'var(--accent)', nir_solar: 'var(--red)', no_cv: 'var(--green)', pomc: 'var(--orange)', violet_eye: 'var(--purple)' };
  const chip = 'sun-chip sun-chip-tier-2 gb:light-active:items-center gb:light-active:flex-wrap gb:light-active:gap-[5px] gb:light-active:[@media(pointer:coarse)]:min-h-11 gb:light-active:max-[480px]:min-h-11 gb:light-active:[@media(pointer:coarse)]:min-w-11 gb:light-active:max-[480px]:min-w-11 gb:light-active:max-w-full gb:light-active:px-2.5 gb:light-active:py-1 gb:light-active:border gb:light-active:border-[color-mix(in_srgb,var(--channel-accent)_30%,var(--border))] gb:light-active:rounded-control gb:light-active:bg-secondary-surface gb:light-active:text-ink gb:light-active:text-[11px] gb:light-active:font-body gb:light-active:text-left gb:light-active:cursor-pointer gb:light-active:hover:border-accent gb:light-active:focus-visible:outline-2 gb:light-active:focus-visible:outline-accent gb:light-active:wrap-anywhere';
</script>
{#snippet channel(item: SessionChannelChip, extra = false)}
  <button type="button" class={`${chip}${extra ? ' sun-chip-extra gb:light-active:hidden gb:light-active:in-[.sun-chips-expanded]:inline-flex' : ' gb:light-active:inline-flex'}`} style:--channel-accent={accents[item.key] || 'var(--accent)'} data-channel={item.key} data-sun-session-action="open-channel" data-sun-session-channel={item.key} title={item.title} aria-label={item.ariaLabel}>
    <span class="sun-chip-icon gb:light-active:text-xs" aria-hidden="true">{item.icon}</span>{' '}<span class="sun-chip-label gb:light-active:font-medium">{item.label}</span>{#if item.value}{' '}<span class="sun-chip-value gb:light-active:text-[10px] gb:light-active:font-semibold gb:light-active:tabular-nums">{item.value}</span>{/if}
  </button>
{/snippet}
<div class="sun-channel-chips gb:light-active:flex gb:light-active:flex-wrap gb:light-active:gap-1.5 gb:light-active:mt-2.5 gb:light-active:min-w-0" data-light-active-presentation>
  {#each chips.slice(0, 3) as item}{@render channel(item)}{/each}
  {#if chips.length > 3}
    <button type="button" class="sun-chip-more gb:light-active:order-[99] gb:light-active:[@media(pointer:coarse)]:min-h-11 gb:light-active:max-[480px]:min-h-11 gb:light-active:px-2.5 gb:light-active:py-1 gb:light-active:border gb:light-active:border-dashed gb:light-active:border-line gb:light-active:rounded-control gb:light-active:bg-transparent gb:light-active:text-secondary gb:light-active:text-[11px] gb:light-active:font-body gb:light-active:cursor-pointer gb:light-active:hover:border-accent gb:light-active:focus-visible:outline-2 gb:light-active:focus-visible:outline-accent" data-sun-session-action="toggle-chips" data-sun-session-hidden-count={chips.length - 3} aria-expanded="false" aria-label={`Show ${chips.length - 3} additional light channel${chips.length === 4 ? '' : 's'}`}>
      <span class="sun-chip-more-collapsed gb:light-active:in-[.sun-chips-expanded]:hidden">+ {chips.length - 3} more channel{chips.length === 4 ? '' : 's'}</span><span class="sun-chip-more-expanded gb:light-active:hidden gb:light-active:in-[.sun-chips-expanded]:inline">Show fewer</span>
    </button>
    {#each chips.slice(3) as item}{@render channel(item, true)}{/each}
  {/if}
</div>
