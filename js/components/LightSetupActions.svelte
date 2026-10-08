<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  let { complete }: { complete: boolean } = $props();
</script>

<div class={setupClasses("light-setup-actions")} data-light-setup-presentation data-setup-actions="core">
  {#if complete}<button type="button" class={setupClasses("import-btn import-btn-secondary")} data-light-setup-action="cancel-reopen">Cancel</button>
  {:else}<button type="button" class={setupClasses("import-btn import-btn-tertiary light-setup-skip-btn")} data-light-setup-action="dismiss">I'll do this later</button>{/if}
  <button type="button" class={setupClasses("import-btn import-btn-primary light-setup-next-btn")} data-light-setup-action="set-step" data-light-setup-step="score">Next: Light patterns</button>
</div>
<div class={setupClasses("light-setup-actions")} data-light-setup-presentation data-setup-actions="score">
  <button type="button" class={setupClasses("import-btn import-btn-secondary")} data-light-setup-action="set-step" data-light-setup-step="core">Back</button>
  <button type="button" class={setupClasses("import-btn import-btn-primary light-setup-save-btn")} data-light-setup-action="save">{complete ? 'Save changes' : 'Save setup'}</button>
</div>
