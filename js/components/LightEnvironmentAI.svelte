<script lang="ts">
  import type { EnvironmentAIView } from '../light-environment-ai-presentation.js';
  import { environmentAIClasses as classes } from '../light-environment-ai-classes.js';
  import { sessionAIClasses } from '../light-session-ai-classes.js';
  import LightVerdictDot from './LightVerdictDot.svelte';
  import LightVerdictButton from './LightVerdictButton.svelte';
  let { view }: { view: EnvironmentAIView } = $props();
  const stateClass = $derived(view.status === 'ok' ? view.dot : view.status === 'analyzing' ? 'loading' : view.status);
  const dot = $derived(view.status === 'analyzing' ? 'shimmer' : view.status === 'ok' ? view.dot : 'gray');
</script>

{#if view.kind === 'audit-dot'}
  <span data-light-environment-ai class={`${sessionAIClasses(`sun-session-ai-dot sun-session-ai-dot-${view.dot}`)} ${classes('light-audit-ai-dot')}`}
    title={`AI verdict: ${view.tip}`} aria-hidden="true"></span>
{:else if view.kind === 'measurement'}
  <div data-light-environment-ai data-ai-state={view.status}
    class={classes(`light-env-reading-ai${view.status === 'error' ? ' sun-session-ai-error' : view.status === 'idle' ? ' sun-session-ai-idle' : ''}`)}
    title={view.status === 'ok' ? view.detail : undefined}>
    <LightVerdictDot {dot} />
    {#if view.status !== 'idle'}
      <span class={`${sessionAIClasses(`sun-session-ai-tip${view.status === 'ok' ? ` sun-session-ai-tip-${view.dot}` : ''}`)} ${classes('measurement-tip')}`}>
        {#if view.status === 'ok'}<span class={sessionAIClasses('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}{:else}{view.message}{/if}
      </span>
    {/if}
    {#if view.status !== 'analyzing'}
      <LightVerdictButton {view} label={view.buttonLabel} cta={view.status === 'idle'}
        className={view.status === 'idle' ? classes('measurement-cta') : ''}
        title={view.status === 'idle' ? 'Run an AI verdict on this measurement — flags significant issues and suggests fixes' : undefined} />
    {/if}
  </div>
{:else if view.kind === 'room'}
  <div data-light-environment-ai data-ai-state={view.status} class={classes(`light-env-room-ai light-env-room-ai-${stateClass}`)}>
    <LightVerdictDot {dot} />
    <span class={classes('light-env-room-ai-label')}>AI read</span>
    <span class={classes('light-env-room-ai-tip')}>
      {#if view.status === 'ok'}<span class={sessionAIClasses('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}{:else}{view.message}{/if}
    </span>
    {#if view.status !== 'analyzing'}
      <LightVerdictButton {view} label={view.buttonLabel} idleDetail={false} className={classes('light-env-room-ai-refresh')} />
    {/if}
  </div>
{:else}
  <div data-light-environment-ai data-ai-state={view.status} class={classes(view.kind === 'screen' ? 'light-env-screen-ai' : 'light-audit-ai')}>
    <div class={classes(view.kind === 'screen' ? 'light-env-screen-ai-head' : 'light-audit-ai-head')}>⚡ AI verdict</div>
    <div class={`${sessionAIClasses(`sun-detail-ai sun-detail-ai-${stateClass}`)} ${classes('environment-detail')}`}>
      {#if view.status === 'ok'}
        <div class={sessionAIClasses('sun-detail-ai-head')}>
          <LightVerdictDot {dot} />
          <span class={sessionAIClasses('sun-detail-ai-tip')}><span class={sessionAIClasses('sun-session-ai-prefix')} aria-hidden="true">{view.prefix}</span> {view.tip}</span>
          <LightVerdictButton {view} />
        </div>
        {#if view.detail}<div class={sessionAIClasses('sun-detail-ai-body')}>{view.detail}</div>{/if}
      {:else}
        <LightVerdictDot {dot} />
        <span>{view.message}</span>
        {#if view.status !== 'analyzing'}<LightVerdictButton {view} label={view.buttonLabel} />{/if}
      {/if}
    </div>
  </div>
{/if}
