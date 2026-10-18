<svelte:options preserveWhitespace={true}/><script lang="ts">
  import type {DashboardAIRowView} from '../dashboard-ai-cta-presentation.js';
  let {view}: {view: DashboardAIRowView} = $props();
</script><div class="lens-section" role="button" tabindex="0" aria-label={view.ariaLabel} data-dashboard-ai-action={view.action} title={view.title}><span class="lens-section-icon">{view.icon}</span><span class="lens-section-body"><span class="lens-section-label">{view.label}</span><span class="lens-section-text">{view.detail}</span></span><span class="lens-section-edit">{view.editIcon}</span></div>