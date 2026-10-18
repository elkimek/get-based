<svelte:options preserveWhitespace={true}/><script lang="ts">
  import type {DashboardAICtaView} from '../dashboard-ai-cta-presentation.js';
  let {view}: {view: DashboardAICtaView} = $props();
</script><button type="button" class="dashboard-cta" data-dashboard-ai-action={view.action} aria-label={view.ariaLabel}>{view.leading}<span class="dashboard-cta-icon" aria-hidden="true">{view.icon}</span>{view.leading}<span class="dashboard-cta-plus" aria-hidden="true">+</span>{view.leading}<span>{view.label}</span>{view.trailing}</button>