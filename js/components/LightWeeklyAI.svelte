<script lang="ts">
  import LightWeeklyFallback from './LightWeeklyFallback.svelte';
  import type { ReviewAIView } from '../light-review-ai-presentation.js';
  import { reviewAIClasses as classes } from '../light-review-ai-classes.js';
  import LightVerdictDot from './LightVerdictDot.svelte';
  import LightVerdictButton from './LightVerdictButton.svelte';
  let { view }: { view: ReviewAIView } = $props();
</script>
<div data-light-review-ai data-ai-state={view.status} class={classes('light-channel-mix-ai')}>
  {#if view.variant === 'ok' || view.variant === 'cached'}
    <section class={classes('light-weekly-ai-review')}>
      <div class={classes('light-weekly-ai-head')}>
        <div><div class={classes('light-weekly-period')}>AI summary · What changed</div><div class={classes('light-weekly-ai-tip')}>{view.tip}</div></div>
        {#if view.variant === 'ok'}<LightVerdictButton {view} title="Refresh weekly review" ariaLabel="Refresh weekly light review" />{/if}
      </div>
      {#if view.detail}<div class={classes('light-weekly-ai-detail')}>{view.detail}</div>{/if}
    </section>
  {:else if view.variant === 'analyzing'}
    <div class={classes('light-weekly-ai-loading')}><LightVerdictDot dot="shimmer" /><span>{view.message}</span></div>
  {:else}
    {#if view.fallback}{#if view.fallback.kind === 'weekly-fallback'}<LightWeeklyFallback view={view.fallback}/>{:else}{@html view.fallback.html}{/if}{/if}
    {#if view.variant === 'unavailable'}
      <div class={classes('light-weekly-ai-unavailable')} role="status"><strong class={classes('unavailable-heading')}>AI review needs a little history.</strong><span>Complete at least one sun or device session; the review will become available here.</span></div>
    {:else if view.variant === 'error'}
      <div class={classes('light-weekly-ai-action-row')} role="status"><span class={classes('light-weekly-ai-action-status')}>{view.message}</span><button type="button" class={classes('dashboard-action-btn light-channel-mix-ai-cta')} data-ai-action={view.action} data-ai-owner={view.actionOwner}>{view.buttonLabel}</button></div>
    {:else}
      <div class={classes('light-weekly-ai-action-row')}><button type="button" class={classes('dashboard-action-btn light-channel-mix-ai-cta')} data-ai-action={view.action} data-ai-owner={view.actionOwner}><span aria-hidden="true">↻</span> {view.buttonLabel}</button><span class={classes('light-weekly-ai-action-status')}>{view.helper}</span></div>
    {/if}
  {/if}
</div>
