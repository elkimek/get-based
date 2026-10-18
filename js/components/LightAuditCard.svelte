<script lang="ts">
  import LightEnvironmentAI from './LightEnvironmentAI.svelte';
  import type { LightAuditCardView } from '../light-audit-presentation.js';
  import { lightAuditClasses as c } from '../light-audit-classes.js';
  import LightAuditDetail from './LightAuditDetail.svelte';
  let { view }: { view: LightAuditCardView } = $props();
</script>

<div data-light-audit-card data-id={view.id} class={c(`light-audit-card${view.expanded ? ' expanded' : ''}`)}>
  <div class={c('light-audit-header')}>
    <button type="button" class={c('light-audit-disclosure-toggle')}
      aria-expanded={view.expanded} aria-label={view.ariaLabel}
      data-light-env-action="toggle-audit" data-light-env-id={view.actionId}></button>
    <div class={c('light-audit-info')}>
      <div class={c('light-audit-info-top')}>
        <!-- Configured AI owns this trusted, possibly interactive renderer. -->
        <div class={c('light-audit-ai-dot')}>{#if view.aiDot}<LightEnvironmentAI view={view.aiDot}/>{/if}</div>
        <span class={c('light-audit-date')}>{view.date}</span>
        {#if view.label}<span class={c('light-audit-label')}>{view.label}</span>{/if}
      </div>
      <span class={c('light-audit-meta')}>{view.meta}</span>
    </div>
    <span class={c(`light-env-sev-dot light-env-sev-${view.severity.color}`)} title={view.severity.label}>
      <span class="sr-only">{view.severity.label}</span>
    </span>
  </div>
  {#if view.detail}<LightAuditDetail view={view.detail} actionId={view.actionId}/>{/if}
</div>
