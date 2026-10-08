<script lang="ts">
  import { lightToolClasses as c } from '../light-tools-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  let { trustedGuideHTML }: { trustedGuideHTML: string } = $props();
</script>
<LightToolFrame title="Home audit" suffix="10 min walkthrough" closeAction="close-audit">
  <!-- Existing shared camera guide owns this trusted, dismissible renderer. -->
  {@html trustedGuideHTML}
  <p class={c('modal-body-hint')}>Pause briefly in each room (~5–10 seconds). Press Done when finished — we'll surface a per-room mini-report.</p>
  <div class={c('audit-status')} id="audit-status" aria-live="polite" aria-atomic="true">Press Start when ready.</div>
  <ol class={c('audit-room-list')} id="audit-room-list"></ol>
  <div class={c('modal-actions tool-actions-audit')}>
    <button type="button" class={c('import-btn import-btn-secondary tool-control')} data-light-tools-action="close-audit">Cancel</button>
    <button type="button" class={c('import-btn import-btn-primary tool-control')} id="audit-toggle">Start audit</button>
  </div>
</LightToolFrame>
