<script lang="ts">
  import type { ReviewAIView } from '../light-review-ai-presentation.js';
  import { sessionAIClasses as shared } from '../light-session-ai-classes.js';
  import { reviewAIClasses as classes } from '../light-review-ai-classes.js';
  import LightVerdictDot from './LightVerdictDot.svelte';
  let { view, compact = false }: { view: ReviewAIView; compact?: boolean } = $props();
  const tone = $derived(view.status === 'ok' ? view.dot : view.status === 'analyzing' ? 'loading' : view.status);
</script>
<div class={`${shared(`sun-detail-ai sun-detail-ai-${tone}`)} ${classes(compact ? 'review-detail review-detail-compact' : 'review-detail')}`}>
  {#if view.status === 'ok'}
    <div class={shared('sun-detail-ai-head')}>
      <LightVerdictDot dot={view.dot} />
      <span class={shared('sun-detail-ai-tip')}><span class={shared('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}</span>
    </div>
    {#if view.detail}<div class={shared('sun-detail-ai-body')}>{view.detail}</div>{/if}
  {:else}
    <LightVerdictDot dot={view.status === 'analyzing' ? 'shimmer' : 'gray'} />
    <span>{view.message}</span>
  {/if}
</div>
