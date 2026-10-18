<script lang="ts">
  import type { LiveSessionReadout } from '../light-active-session-presentation.js';
  let { readouts }: { readouts: readonly LiveSessionReadout[] } = $props();
  const badge = 'gb:light-active:inline-flex gb:light-active:items-center gb:light-active:flex-wrap gb:light-active:gap-x-2 gb:light-active:gap-y-1 gb:light-active:min-w-0 gb:light-active:max-w-full gb:light-active:wrap-anywhere gb:light-active:border gb:light-active:rounded-control gb:light-active:px-[9px] gb:light-active:py-[5px] gb:light-active:text-[11px] gb:light-active:leading-normal gb:light-active:text-ink';
</script>
<div class="sun-session-live-readouts gb:light-active:flex gb:light-active:flex-wrap gb:light-active:items-stretch gb:light-active:gap-[7px] gb:light-active:min-w-0 gb:light-active:mt-[9px]" aria-label="Live session estimates" data-light-active-presentation>
  {#each readouts as item}
    <span class={`${item.kind === 'vitamin-d' ? 'sun-session-vitd' : item.kind === 'burn' ? 'sun-session-med' : item.kind === 'retinal' ? 'sun-session-retinal' : 'sun-session-heat'}${item.idle ? ' sun-session-vitd-idle' : ''}${item.kind === 'burn' ? (item.tone === 'warning' ? ' warn' : item.tone === 'danger' ? ' over' : '') : item.kind === 'retinal' && item.tone === 'danger' ? ' warn' : ''} ${badge} ${item.kind === 'vitamin-d' ? 'gb:light-active:flex-[1_1_300px] gb:light-active:border-accent gb:light-active:bg-hover' : item.tone === 'danger' ? 'gb:light-active:border-danger gb:light-active:bg-[var(--red-bg)]' : item.tone === 'warning' ? 'gb:light-active:border-warning gb:light-active:bg-[var(--orange-bg)]' : 'gb:light-active:border-success gb:light-active:bg-[var(--green-bg)]'}`} title={item.title || undefined}>
      {#if item.kind === 'vitamin-d'}<strong class="gb:light-active:font-semibold">☀ Vitamin D estimate</strong>{/if}
      {#each item.values as value, index}{#if index > 0}<span aria-hidden="true">·</span>{/if}<span class="gb:light-active:tabular-nums">{value}</span>{/each}
    </span>
  {/each}
</div>
