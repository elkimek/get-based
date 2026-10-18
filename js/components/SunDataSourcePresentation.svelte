<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import type { SunDataSourceView } from '../sun-data-source-presentation.js';
  import { sunDataSourceClasses as c } from '../sun-data-source-classes.js';
  import SunModeOption from './SunModeOption.svelte';

  let { view }: { view: SunDataSourceView } = $props();
</script><svelte:options preserveWhitespace={true} /><div class="local-ai-settings" id="sun-data-source-section">
    <h4 class={c.heading}>☀ Sun data source</h4>
    <div class={'ai-provider-desc ' + c.description}>Where the Light &amp; Sun lens fetches UV, ozone, clouds, and air-quality model data. It uses your privacy-rounded home postal area or country by default. Current device location is optional, rounded locally, and kept only for today.</div>
    <div class={c.options}>
      <SunModeOption view={view.options[0]} />
      <SunModeOption view={view.options[1]} />
      <SunModeOption view={view.options[2]} />
    </div>
    <div id="meteo-selfhost-fields" class={c.selfhost} style={view.showSelfhost ? '' : componentStaticStyles.hidden}>
      <!-- svelte-ignore a11y_label_has_associated_control (Preserve the sealed original native label contract.) --><label class={c.credentialLabel}>Server URL</label>
      <input type="text" class={'api-key-input ' + c.credentialInput} id="meteo-selfhost-url" value={view.url} placeholder="https://meteo.example.com" data-sun-source-action="save-meteo-selfhost">
      <!-- svelte-ignore a11y_label_has_associated_control (Preserve the sealed original native label contract.) --><label class={c.bearerLabel}>Bearer token (optional)</label>
      <input type="password" class={'api-key-input ' + c.credentialInput} id="meteo-selfhost-bearer" value={view.bearer} placeholder="••••••••" data-sun-source-action="save-meteo-selfhost" autocomplete="new-password">
    </div>
    {#if view.officialHost}<div class={c.hostedBoundary}><strong>Hosted privacy boundary:</strong> location is always rounded to a ~11 km grid before CAMS or Open-Meteo requests. Exact coordinates cannot be enabled on this deployment.</div>{:else}<div class={c.roundingRow}>
          <span class={c.roundingLabel}>Round location to ~11 km grid before sending<br><span class={c.roundingDescription}>Default ON. Stops the data source from seeing your exact address. Disable for slightly sharper UV math.</span></span>
          <label class={'toggle-switch ' + c.roundingToggle}>
            <input type="checkbox" id="meteo-privacy-rounding" checked={view.rounding === true} data-sun-source-action="toggle-meteo-rounding">
            <span class="toggle-slider"></span>
          </label>
        </div>{/if}
  </div>