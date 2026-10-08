<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  let { deferred, ownerTicket = '' }: { deferred: boolean; ownerTicket?: string } = $props();
</script>

<div class={setupClasses("light-setup-prompt light-widget-prompt")} data-light-setup-presentation data-light-setup-owner={ownerTicket || undefined} data-light-widget-prompt>
  <div class={setupClasses("light-widget-prompt-copy")}><strong>{deferred ? 'Light setup not finished' : 'Make light part of your health picture'}</strong>
    <p>{deferred ? 'Confirm skin type before starting sun or device sessions; add the rest whenever you are ready.' : 'A short setup connects skin, daylight, indoor lighting, eyewear, and spectrum patterns to your Light context.'}</p>
  </div>
  <div class={setupClasses("light-setup-prompt-actions")}>
    {#if !deferred}<button type="button" class={setupClasses("dashboard-action-btn")} data-light-setup-action="dismiss">Later</button>{/if}
    <button type="button" class={setupClasses("dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta")} data-light-setup-action="reopen">Personalize Light</button>
  </div>
</div>
