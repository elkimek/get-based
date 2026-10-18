<script lang="ts">
  import LightChannelSparkline from './LightChannelSparkline.svelte';
  import { channelPillClasses as c } from '../light-channel-pill-classes.js';
  import type { LightDashboardPill } from '../light-page-presentation.js';
  let { pills }: { pills: readonly LightDashboardPill[] } = $props();
</script>
<div class={`${c('light-pills-row')} gb:light-page:flex gb:light-page:flex-wrap gb:light-page:gap-2`} data-light-page-presentation data-light-channel-pills data-light-dashboard-pills>
  {#each pills as pill}
    <button type="button" class={`${c(`light-pill light-pill-tier-${pill.active ? 2 : 0} light-pill-signal-${pill.active ? 'logged' : 'empty'} light-pill-dashboard`, pill.key)} gb:light-page:inline-flex gb:light-page:items-center gb:light-page:flex-wrap gb:light-page:gap-1.5 gb:light-page:px-3 gb:light-page:py-1.5 gb:light-page:rounded-full gb:light-page:bg-surface gb:light-page:border gb:light-page:border-line gb:light-page:text-xs gb:light-page:text-secondary gb:light-page:[@media(pointer:coarse)]:min-h-11 gb:light-page:max-[480px]:min-h-11 gb:light-page:[@media(pointer:coarse)]:min-w-11 gb:light-page:max-[480px]:min-w-11 gb:light-page:max-w-full gb:light-page:cursor-pointer gb:light-page:font-body gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-offset-2 gb:light-page:focus-visible:outline-accent ${pill.active ? '' : 'gb:light-page:border-dashed'}`} data-light-page-action="open-channel" data-channel={pill.key} title={pill.title} aria-label={pill.label}>
      <span class={`${c('light-pill-icon')} gb:light-page:text-[13px]`} aria-hidden="true">{pill.icon}</span>
      <span class={`${c('light-pill-label')} gb:light-page:font-medium`}>{pill.name}</span>
      {#if pill.chart}<LightChannelSparkline chart={pill.chart}/>{/if}
      <span class={`${c('light-pill-daycount')} gb:light-page:text-[11px] gb:light-page:font-semibold gb:light-page:tabular-nums gb:light-page:text-secondary gb:light-page:opacity-100 gb:light-page:min-w-6 gb:light-page:text-right gb:light-page:whitespace-nowrap`}>{pill.days}</span>
    </button>{' '}
  {/each}
</div>
