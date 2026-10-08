<script lang="ts">
  import type { OnboardingAIView } from '../light-onboarding-ai-presentation.js';
  import { onboardingAIClasses as classes, onboardingAIButtonClasses } from '../light-onboarding-ai-classes.js';
  let { view }: { view: OnboardingAIView } = $props();
</script>

<div class={classes(`light-setup-ai-block${view.status === 'ok' ? ` light-setup-ai-block-${view.dot}` : ''}`)} data-light-onboarding-ai data-ai-state={view.status}>
  <div class={classes('light-setup-ai-head')}>
    {#if view.status === 'ok'}
      <span class={classes('light-setup-ai-head-label')}>Your light context</span>
      <button type="button" class={onboardingAIButtonClasses(false)} data-ai-action="refresh-onboarding" data-ai-owner={view.actionOwner} title="Re-run analysis" aria-label="Re-run">↻</button>
    {:else}Your light context{/if}
  </div>
  {#if view.status === 'ok'}
    <div class={classes(`sun-detail-ai sun-detail-ai-${view.dot}`)}>
      <div class={classes('sun-detail-ai-head')}>
        <span class={classes(`sun-session-ai-dot sun-session-ai-dot-${view.dot}`)} aria-hidden="true"></span>
        <span class={classes('sun-detail-ai-tip')}><span class={classes('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}</span>
      </div>
      {#if view.detail}<div class={classes('sun-detail-ai-body')}>{view.detail}</div>{/if}
      {#if view.actions.length}<ul class={classes('light-setup-ai-actions')}>{#each view.actions as action}<li>{action}</li>{/each}</ul>{/if}
    </div>
  {:else}
    <div class={classes(`sun-detail-ai sun-detail-ai-${view.status === 'analyzing' ? 'loading' : view.status}`)}>
      <span class={classes(`sun-session-ai-dot sun-session-ai-dot-${view.status === 'analyzing' ? 'shimmer' : 'gray'}`)} aria-hidden="true"></span>
      <span>{view.message}</span>
      {#if view.status !== 'analyzing'}<button type="button" class={onboardingAIButtonClasses(view.status === 'idle')} data-ai-action="refresh-onboarding" data-ai-owner={view.actionOwner}>{view.status === 'error' ? 'Try again' : 'Generate context'}</button>{/if}
    </div>
  {/if}
</div>
