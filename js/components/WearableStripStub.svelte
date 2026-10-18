<script lang="ts">
 import type {WearableStripStubView} from '../wearable-strip-stub-presentation.js';
 let {view}:{view:WearableStripStubView}=$props();
</script><svelte:options preserveWhitespace={true}/><section class="wearable-strip wearable-strip-stub">
    <div class="wearable-strip-stub-body">
      <span class="wearable-strip-icon" aria-hidden="true">⌬</span>
      <div class="wearable-strip-stub-text">
        <strong>Connect a wearable</strong> to see HRV, sleep, recovery and body composition trends alongside your blood work.
        <span class="wearable-strip-stub-brands">Oura · Withings · Fitbit · Polar · Apple Health</span>
      </div>
      <div class="wearable-strip-stub-actions">
        <button class="wearable-strip-stub-cta" data-wearable-action={view.connectAction}>Connect</button>
        <button class="wearable-strip-stub-dismiss" title="Hide this hint" aria-label="Dismiss wearable hint" data-wearable-action={view.dismissAction}>×</button>
      </div>
    </div>
  </section>