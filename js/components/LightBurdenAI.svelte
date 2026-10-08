<script lang="ts">
  import type { ReviewAIView } from '../light-review-ai-presentation.js';
  import { reviewAIClasses as classes } from '../light-review-ai-classes.js';
  import { sessionAIClasses as shared } from '../light-session-ai-classes.js';
  import LightVerdictDot from './LightVerdictDot.svelte';
  import LightVerdictButton from './LightVerdictButton.svelte';
  import LightReviewDetail from './LightReviewDetail.svelte';
  let { view }: { view: ReviewAIView } = $props();
</script>
{#if view.variant === 'heuristic'}
  <p data-light-review-ai class={classes('light-env-summary-interp')}>{view.heuristic}</p>
{:else}
  <div data-light-review-ai data-ai-state={view.status} class={classes(`light-env-summary-ai${view.variant === 'ok' ? ` light-env-summary-ai-${view.dot}` : ''}`)}>
    {#if view.variant === 'cached' || view.variant === 'analyzing'}<LightReviewDetail {view} />
    {:else if view.variant === 'ok'}
      <LightVerdictDot dot={view.dot} />
      <span class={classes('light-env-summary-ai-tip')}><span class={shared('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}</span>
      <LightVerdictButton {view} />
      {#if view.detail}<div class={classes('light-env-summary-ai-detail')}>{view.detail}</div>{/if}
    {:else}
      <p class={classes('light-env-summary-interp')}>{view.heuristic}</p>
      <LightVerdictButton {view} label={view.buttonLabel} idleDetail={false} className={classes('light-env-summary-ai-cta')} />
    {/if}
  </div>
{/if}
