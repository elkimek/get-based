<script lang="ts">
  import type { LightDashboardPill } from '../light-page-presentation.js';
  let { pills }: { pills: readonly LightDashboardPill[] } = $props();
</script>
<div class="light-pills-row gb:light-page:flex gb:light-page:flex-wrap gb:light-page:gap-2" data-light-page-presentation data-light-dashboard-pills>
  {#each pills as pill}
    <button type="button" class={`light-pill light-pill-tier-${pill.active ? 2 : 0} light-pill-signal-${pill.active ? 'logged' : 'empty'} light-pill-dashboard gb:light-page:inline-flex gb:light-page:items-center gb:light-page:flex-wrap gb:light-page:gap-1.5 gb:light-page:px-3 gb:light-page:py-1.5 gb:light-page:rounded-full gb:light-page:bg-surface gb:light-page:border gb:light-page:border-line gb:light-page:text-xs gb:light-page:text-secondary gb:light-page:min-h-[45px] gb:light-page:min-w-[45px] gb:light-page:max-w-full gb:light-page:cursor-pointer gb:light-page:font-body gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-offset-2 gb:light-page:focus-visible:outline-accent ${pill.active ? '' : 'gb:light-page:border-dashed'}`} data-light-page-action="open-channel" data-channel={pill.key} title={pill.title} aria-label={pill.label}>
      <span class="light-pill-icon gb:light-page:text-[13px]" aria-hidden="true">{pill.icon}</span>
      <span class="light-pill-label gb:light-page:font-medium">{pill.name}</span>
      {@html pill.sparklineHTML}
      <span class="light-pill-daycount gb:light-page:text-[11px] gb:light-page:font-semibold gb:light-page:tabular-nums gb:light-page:text-secondary gb:light-page:opacity-100 gb:light-page:min-w-6 gb:light-page:text-right gb:light-page:whitespace-nowrap">{pill.days}</span>
    </button>{' '}
  {/each}
</div>
