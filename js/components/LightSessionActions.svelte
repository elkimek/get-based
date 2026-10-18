<script lang="ts">
  import type { LightSessionActionsView } from '../light-page-presentation.js';
  let { view }: { view: LightSessionActionsView } = $props();
  const button = 'light-log-action gb:light-page:min-h-[38px] gb:light-page:[@media(pointer:coarse)]:min-h-11 gb:light-page:max-[480px]:min-h-11 gb:light-page:[@media(pointer:coarse)]:min-w-11 gb:light-page:max-[480px]:min-w-11 gb:light-page:inline-flex gb:light-page:w-full gb:light-page:justify-center gb:light-page:rounded-control gb:light-page:border gb:light-page:px-3 gb:light-page:py-2 gb:light-page:font-body gb:light-page:text-xs gb:light-page:leading-normal gb:light-page:font-semibold gb:light-page:cursor-pointer gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-accent gb:light-page:focus-visible:outline-offset-2';
</script>
<div class="light-session-log-actions gb:light-page:grid gb:light-page:gap-2.5 gb:light-page:min-w-0" data-light-page-presentation>
  <div class="light-quicklog-row gb:light-page:flex gb:light-page:flex-wrap gb:light-page:gap-2 gb:light-page:m-0 gb:light-page:p-0 gb:light-page:border-0 gb:light-page:bg-transparent gb:light-page:shadow-none">
    {#each view.actions as action}
      <button type="button" class={`${button} ${action.primary ? 'gb:light-page:border-accent gb:light-page:bg-accent gb:light-page:text-on-accent' : 'gb:light-page:border-line gb:light-page:bg-surface gb:light-page:text-ink'}`} data-light-page-action={action.action}>{action.label}</button>{' '}
    {/each}
    {#if view.empty}<span class="light-summary-tally gb:light-page:text-xs gb:light-page:text-secondary">No sessions yet</span>{/if}
  </div>
</div>
