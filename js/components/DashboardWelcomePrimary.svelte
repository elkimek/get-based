<svelte:options preserveWhitespace={true} /><script lang="ts">
  import type {DashboardWelcomePrimaryView} from "../dashboard-welcome-presentation.js";
  import DashboardWelcomeSecondary from "./DashboardWelcomeSecondary.svelte";
  let {view}: {view: DashboardWelcomePrimaryView} = $props();
</script><div class="welcome-primary-panel welcome-chat-panel">
          <span class="welcome-primary-kicker">Start here</span>
          <strong>{view.title}</strong>
          <p>{view.copy}</p>
          <div class="welcome-primary-actions">
            <button type="button" class="welcome-action-btn welcome-action-primary" data-dashboard-welcome-action="open-chat">Start guided chat</button>
            <DashboardWelcomeSecondary view={view.secondary} />
          </div>
        </div>
        <div class="drop-zone drop-zone-hidden" id="drop-zone"></div>