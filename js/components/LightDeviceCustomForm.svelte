<script lang="ts">
  import type { DeviceCustomView } from '../light-device-setup-presentation.js';
  import { deviceSetupClasses as c } from '../light-device-setup-classes.js';
  import LightDeviceSpecFields from './LightDeviceSpecFields.svelte';
  let { view }: { view: DeviceCustomView } = $props();
</script>

<div class="modal" role="dialog" aria-label="Add custom light device" data-light-device-setup>
  <div class="modal-header">
    <h3>Add a custom device</h3>
    <button type="button" class={c('modal-close')} data-light-device-custom-close aria-label="Close">×</button>
  </div>
  <div class="modal-body">
    {#if view.hasAI}
      <p class={c('modal-body-hint')}>Paste a product page URL or scan the label. AI fills the main fields and keeps any stated mode or measurement details. Verify them against the product page before saving.</p>
      <div class={c('custom-device-ai-row')}>
        <input type="url" id="custom-dev-url" aria-label="Product page URL" class={`${c('ctx-input')} gb:device-setup:flex-1 gb:device-setup:min-w-0`} placeholder="https://..." />
        <button type="button" class={c('import-btn import-btn-secondary custom-dev-fetch')} id="custom-dev-fetch">Fetch &amp; analyse</button>
      </div>
      {#if view.hasVision}
        <div class={`${c('custom-device-ai-row')} gb:device-setup:mt-2`}>
          <button type="button" class={c('import-btn import-btn-secondary custom-dev-scan')} id="custom-dev-scan">📷 Scan device label</button>
          <input type="file" id="custom-dev-image" accept="image/*" class="gb:device-setup:hidden">
        </div>
      {:else}
        <p class={`${c('modal-body-hint')} gb:device-setup:mt-2`}>Image scan needs a vision-capable AI model (Claude or OpenAI).</p>
      {/if}
      <hr class="gb:device-setup:my-4 gb:device-setup:mx-0 gb:device-setup:border-0 gb:device-setup:[border-top:1px_solid_var(--border)]">
    {:else}
      <p class={c('modal-body-hint')}>Set up an AI provider in Settings to auto-extract specs from a URL or photo. For now, fill in fields manually:</p>
    {/if}
    <LightDeviceSpecFields {view}/>
    <details id="custom-dev-extracted-details" class="sun-detail-disclosure" hidden>
      <summary>Review extracted mode and measurement details</summary>
      <pre id="custom-dev-extracted-json" class="gb:device-setup:whitespace-pre-wrap gb:device-setup:[overflow-wrap:anywhere] gb:device-setup:text-[11px]"></pre>
    </details>
    <div class="modal-actions gb:device-setup:mt-[18px]">
      <button type="button" class={c('import-btn import-btn-secondary')} data-light-device-custom-close>Cancel</button>
      <button type="button" class={c('import-btn import-btn-primary')} id="custom-dev-save">Add device</button>
    </div>
  </div>
</div>
