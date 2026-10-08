<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  import type { LightSetupView } from '../light-setup-presentation.js';
  let { status }: { status: LightSetupView['location'] } = $props();
</script>

<div class={setupClasses(`light-setup-location-status light-setup-location-${status.tone}`)} data-light-setup-presentation aria-label="Location status">
    <div class={setupClasses("light-setup-location-copy")}>
      <div class={setupClasses("light-setup-location-label")}>Location</div>
      <div class={setupClasses("light-setup-location-value-row")}>
        <strong>{status.value}</strong>
        <span class={setupClasses("light-setup-location-badge")}>{status.badge}</span>
      </div>
      <p>{status.detail}</p>
    </div>
    <div class={setupClasses("light-setup-location-actions")}>
      <button type="button" class={setupClasses("import-btn import-btn-secondary")} data-light-setup-action="open-profile-location">Edit profile</button>
      <button type="button" class={setupClasses("import-btn import-btn-secondary")} data-light-setup-action="request-precise-location">{status.preciseLabel}</button>
      {#if status.clearLabel}<button type="button" class={setupClasses("import-btn import-btn-secondary")} data-light-setup-action="clear-current-location">{status.clearLabel}</button>{/if}
    </div>
  </div>
