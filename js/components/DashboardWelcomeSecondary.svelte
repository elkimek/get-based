<svelte:options preserveWhitespace={true} /><script lang="ts">
  import type {DashboardWelcomeSecondaryView} from "../dashboard-welcome-presentation.js";
  let {view}: {view: DashboardWelcomeSecondaryView} = $props();
</script>{#if view.paused}<button type="button" class="welcome-action-btn" data-dashboard-welcome-action="open-ai-settings">Re-enable AI</button>
           <button type="button" class="welcome-action-btn welcome-direct-import-btn" data-dashboard-welcome-action="direct-import">Import file</button>{:else}<button type="button" class="welcome-action-btn welcome-direct-import-btn" data-dashboard-welcome-action="direct-import">Import file</button>{/if}