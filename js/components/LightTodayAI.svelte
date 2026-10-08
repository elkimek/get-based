<script lang="ts">
  import type { ReviewAIView, DashboardLightFallbackView } from '../light-review-ai-presentation.js';
  import { reviewAIClasses as classes } from '../light-review-ai-classes.js';
  import { sessionAIClasses as shared, sessionAIIdleDetailButton } from '../light-session-ai-classes.js';
  import LightVerdictDot from './LightVerdictDot.svelte';
  import LightVerdictButton from './LightVerdictButton.svelte';
  import LightReviewDetail from './LightReviewDetail.svelte';
  import LightTodayQuestion from './LightTodayQuestion.svelte';
  let { view }: { view: ReviewAIView | DashboardLightFallbackView } = $props();
</script>
{#if view.kind === 'dashboard-fallback'}
  <div data-light-review-ai class={classes('light-today-hero light-today-hero-dashboard-fallback')}>
    <div class={classes('light-today-hero-head')}><span class={classes('light-today-hero-label')}>Today's light</span></div>
    <div class={`${shared('sun-detail-ai sun-detail-ai-idle')} ${classes('review-detail review-detail-compact review-fallback-detail')}`}>
      <LightVerdictDot dot="gray" />
      <span>Open Light &amp; Sun to review today's sun, devices, environment, and channel rhythm.</span>
      <button type="button" class={`${shared('sun-session-ai-refresh')} ${sessionAIIdleDetailButton} ${classes('review-fallback-action')}`} 
        data-dashboard-widget-action="navigate" data-dashboard-widget-route="light">Open Light &amp; Sun</button>
    </div>
  </div>
{:else if view.kind === 'today'}
  <div data-light-review-ai data-ai-state={view.status} class={classes(`light-today-hero${view.status === 'ok' ? ` light-today-hero-${view.dot}` : ''}`)}>
    <div class={classes('light-today-hero-head')}><span class={classes('light-today-hero-label')}>Today's light</span></div>
    <LightTodayQuestion />
    <section class={classes(`light-ai-answer light-ai-answer-${view.status === 'ok' ? view.dot : 'gray'}`)}>
      <div class={classes('light-ai-answer-head')}>
        <div><div class={classes('light-ai-kicker')}>AI answer</div><p class={classes('panel-copy')}>Auto-generated once per day when light data exists. Cached in this profile.</p></div>
        {#if view.status !== 'analyzing'}
          <LightVerdictButton {view} label={view.buttonLabel} idleDetail={false}
            title={view.status === 'ok' ? "Re-run today's verdict" : undefined}
            ariaLabel={view.status === 'ok' ? "Re-run today's verdict" : undefined} />
        {/if}
      </div>
      <LightReviewDetail {view} compact />
    </section>
    {#if view.trends.length}<div class={classes('light-today-trends')}>{#each view.trends as trend}<span class={classes('light-today-trend')}>⚡ {trend}</span>{/each}</div>{/if}
  </div>
{:else if view.variant === 'ok' || view.status === 'analyzing'}
  <div data-light-review-ai data-ai-state={view.status} class={classes(`light-today-dash-ai${view.variant === 'ok' ? ` light-today-dash-ai-${view.dot}` : ''}`)}>
    <div class={classes('light-today-dash-ai-row')}>
      <LightVerdictDot dot={view.status === 'analyzing' ? 'shimmer' : view.dot} className={classes('dashboard-dot')} />
      <span class={classes('light-today-dash-ai-tip')}>{#if view.variant === 'ok'}<span class={shared('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}{:else}{view.message}{/if}</span>
      {#if view.variant === 'ok'}<LightVerdictButton {view} title="Re-run today's verdict" ariaLabel="Re-run today's verdict" />{/if}
    </div>
    {#if view.variant === 'ok' && view.detail}<div class={classes('light-today-dash-ai-body')}><p class={classes('dashboard-detail-copy')}>{view.detail}</p></div>{/if}
  </div>
{:else}
  <button type="button" data-light-review-ai data-ai-state={view.status} class={classes('light-today-dash-ai light-today-dash-ai-cta')}
    data-ai-action={view.action} data-ai-owner={view.actionOwner}>
    <LightVerdictDot dot="gray" /><span class={classes('light-today-dash-ai-tip')}>{view.message}</span>
  </button>
{/if}
