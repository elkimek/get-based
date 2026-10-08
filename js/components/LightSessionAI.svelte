<script lang="ts">
  import type { SessionAIView } from '../light-session-ai-presentation.js';
  import { sessionAIClasses as classes } from '../light-session-ai-classes.js';
  import LightVerdictDot from './LightVerdictDot.svelte';
  import LightVerdictButton from './LightVerdictButton.svelte';
  let { view }: { view: SessionAIView } = $props();
</script>
{#if view.mode === 'inline'}
  <div class={classes(`sun-session-ai${view.status === 'error' ? ' sun-session-ai-error' : view.status === 'idle' ? ' sun-session-ai-idle' : ''}`)} data-light-session-ai data-ai-state={view.status} data-ai-action="stop-propagation">
    <LightVerdictDot dot={view.status === 'analyzing' ? 'shimmer' : view.status === 'ok' ? view.dot : 'gray'} />
    {#if view.status === 'idle'}
      <LightVerdictButton {view} label="Analyze this session" cta />
    {:else}
      <span class={classes(`sun-session-ai-tip${view.status === 'ok' ? ` sun-session-ai-tip-${view.dot}` : ''}`)} title={view.status === 'error' ? view.message : undefined}>{#if view.status === 'ok'}<span class={classes('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}{:else}{view.message}{/if}</span>
      {#if view.status !== 'analyzing'}<LightVerdictButton {view} />{/if}
    {/if}
  </div>
{:else}
  <div class={classes(`sun-detail-ai sun-detail-ai-${view.status === 'ok' ? view.dot : view.status === 'analyzing' ? 'loading' : view.status}`)} data-light-session-ai data-ai-state={view.status}>
    {#if view.status === 'ok'}
      <div class={classes('sun-detail-ai-head')}>
        <LightVerdictDot dot={view.dot} />
        <span class={classes('sun-detail-ai-tip')}>{view.tip}</span>
        <LightVerdictButton {view} />
      </div>
      {#if view.detail}<div class={classes('sun-detail-ai-body')}>{view.detail}</div>{/if}
    {:else}
      <LightVerdictDot dot={view.status === 'analyzing' ? 'shimmer' : 'gray'} />
      <span>{view.message}</span>
      {#if view.status !== 'analyzing'}<LightVerdictButton {view} label={view.status === 'error' ? 'Try again' : 'Analyze now'} />{/if}
    {/if}
  </div>
{/if}
