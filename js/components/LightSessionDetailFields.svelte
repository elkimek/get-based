<script lang="ts">
  import type { SessionDetailField } from '../light-session-detail-presentation.js';
  let { fields, kind }: { fields: readonly SessionDetailField[]; kind: 'summary' | 'setup' | 'inputs' } = $props();
  const grid = {
    summary: 'sun-detail-grid gb:light-detail:grid-cols-[repeat(auto-fit,minmax(min(110px,100%),1fr))] gb:light-detail:gap-2.5 gb:light-detail:mb-4',
    setup: 'sun-detail-setup-grid gb:light-detail:grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gb:light-detail:gap-2',
    inputs: 'sun-detail-atm gb:light-detail:grid-cols-[repeat(auto-fit,minmax(min(110px,100%),1fr))] gb:light-detail:gap-1.5 gb:light-detail:max-[480px]:grid-cols-2',
  };
  const field = 'gb:light-detail:min-w-0 gb:light-detail:flex gb:light-detail:flex-col gb:light-detail:gap-[3px] gb:light-detail:border gb:light-detail:border-line gb:light-detail:rounded-control gb:light-detail:bg-secondary-surface gb:light-detail:px-2.5 gb:light-detail:py-2';
  const label = 'gb:light-detail:text-[10px] gb:light-detail:uppercase gb:light-detail:tracking-[0.04em] gb:light-detail:text-secondary';
  const value = 'gb:light-detail:text-ink gb:light-detail:font-semibold gb:light-detail:leading-normal gb:light-detail:wrap-anywhere gb:light-detail:tabular-nums';
</script>
<div class={`${grid[kind]} gb:light-detail:grid gb:light-detail:min-w-0`}>
  {#each fields as item}
    <div class={`${field}${item.wide ? ' gb:light-detail:col-span-full' : ''}${item.label === 'Source' && kind === 'inputs' ? ' sun-detail-atm-source' : ''}${item.label === 'UV split' ? ' sun-detail-atm-uvsplit' : ''}`} title={item.title || undefined}>
      <span class={label}>{item.label}</span>
      <strong class={`${value} ${kind === 'summary' ? 'gb:light-detail:text-sm' : 'gb:light-detail:text-[12.5px]'}`}>{item.value}</strong>
    </div>
  {/each}
</div>
