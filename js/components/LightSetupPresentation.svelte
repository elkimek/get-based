<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  import type { LightSetupPresentationProps } from '../light-setup-presentation.js';
  import LightSetupEditor from './LightSetupEditor.svelte';
  import LightSetupSummary from './LightSetupSummary.svelte';
  import LightSetupPrompt from './LightSetupPrompt.svelte';
  import LightSetupLocation from './LightSetupLocation.svelte';
  import LightSetupActions from './LightSetupActions.svelte';
  import LightSetupSkinLabel from './LightSetupSkinLabel.svelte';
  let { surface, view, includeActions = true, skinIndex = -1 }: LightSetupPresentationProps = $props();
</script>

{#if surface === 'card'}
  {#if view.complete}<LightSetupSummary {view} />{:else}<LightSetupPrompt deferred={view.deferredPrompt ?? !!view.defaults.setupPromptDismissedAt} ownerTicket={view.ownerTicket} />{/if}
{:else if surface === 'editor'}<LightSetupEditor {view} {includeActions} />
{:else if surface === 'actions'}<LightSetupActions complete={view.complete} />
{:else if surface === 'location'}<LightSetupLocation status={view.location} />
{:else if surface === 'skin-label'}<LightSetupSkinLabel {skinIndex} />
{:else if surface === 'modal'}
  <div class={setupClasses("modal light-setup-focus-modal")} data-light-setup-presentation data-light-setup-owner={view.ownerTicket || undefined} data-setup-step="core" role="dialog" aria-modal="true" aria-labelledby="light-setup-focus-title">
    <header class={setupClasses("light-setup-focus-head")}><div><div class={setupClasses("gb-modal-kicker")}>Light baseline</div>
      <h3 id="light-setup-focus-title">Personalize Light</h3>
      <p>Connect skin, location, indoor lighting, eyewear, and daily spectrum patterns to your Light context.</p>
    </div><button type="button" class={setupClasses("modal-close")} aria-label="Close light setup" data-light-setup-close>×</button></header>
    <div class={setupClasses("light-setup-focus-body")} tabindex="-1"><p class={setupClasses("light-setup-lead")} data-light-setup-status role="status" hidden></p><LightSetupEditor {view} includeActions={false} /></div>
    <LightSetupActions complete={view.complete} />
  </div>
{/if}
