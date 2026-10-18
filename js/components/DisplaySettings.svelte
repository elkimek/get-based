<script lang="ts">
  import { untrack } from 'svelte';
  import SettingsToggle from './SettingsToggle.svelte';
  import type { DisplayPreferences } from '../settings-display-contract.js';

  let { initial }: { initial: DisplayPreferences } = $props();
  // This snapshot is controlled by the existing settings/state services. Svelte
  // owns only presentation; delegated actions continue to own all mutations.
  let preferences = $state(untrack(() => initial));
  export function refresh(next: DisplayPreferences): void { preferences = next; }

  // These semantic classes are compiled from the shared Tailwind recipes. Keep
  // the original compact desktop cascade; touch targets expand only for coarse pointers.
  const control = 'gb:display:focus-visible:outline-2 gb:display:focus-visible:outline-offset-2 gb:display:focus-visible:outline-accent gb:display:motion-reduce:transition-none gb:display:[@media(pointer:coarse)]:min-h-11 gb:display:[@media(pointer:coarse)]:min-w-11';
</script>

<div class="settings-row">
  <div class="settings-section">
    <div id="display-units-label" class="settings-label">Unit System</div>
    <div class="unit-toggle" role="group" aria-labelledby="display-units-label" aria-describedby="display-units-help">
      <button type="button" class="unit-toggle-btn{preferences.unitSystem === 'EU' ? ' active' : ''} {control}" aria-pressed={preferences.unitSystem === 'EU'} data-unit="EU" data-settings-action="switch-unit" title="International SI units">International (SI)</button>
      <button type="button" class="unit-toggle-btn{preferences.unitSystem === 'ANZ' ? ' active' : ''} {control}" aria-pressed={preferences.unitSystem === 'ANZ'} data-unit="ANZ" data-settings-action="switch-unit" title="Common Australian and New Zealand pathology reporting units">Australia / NZ</button>
      <button type="button" class="unit-toggle-btn{preferences.unitSystem === 'US' ? ' active' : ''} {control}" aria-pressed={preferences.unitSystem === 'US'} data-unit="US" data-settings-action="switch-unit" title="US conventional units">US</button>
    </div>
    <div id="display-units-help" class="settings-copy-desc">Changes how stored results, ranges, reports, and AI context are displayed. Your original data remains unchanged.</div>
  </div>
  <div class="settings-section">
    <div id="display-alt-label" class="settings-label" title="Show values in the alternate unit system to cross-check a lab report.">Alternate Units</div>
    <div class="unit-toggle" role="group" aria-labelledby="display-alt-label">
      <button type="button" class="unit-toggle-btn{!preferences.showAltUnits ? ' active' : ''} {control}" aria-pressed={!preferences.showAltUnits} data-alt-units="off" data-settings-action="toggle-alt-units">Off</button>
      <button type="button" class="unit-toggle-btn{preferences.showAltUnits ? ' active' : ''} {control}" aria-pressed={!!preferences.showAltUnits} data-alt-units="on" data-settings-action="toggle-alt-units">Show both</button>
    </div>
  </div>
  <div class="settings-section">
    <div id="display-range-label" class="settings-label">Range Display</div>
    <div class="range-toggle" role="group" aria-labelledby="display-range-label">
      <button type="button" class="range-toggle-btn{preferences.rangeMode === 'optimal' ? ' active' : ''} {control}" aria-pressed={preferences.rangeMode === 'optimal'} data-range="optimal" data-settings-action="switch-range">Optimal</button>
      <button type="button" class="range-toggle-btn{preferences.rangeMode === 'reference' ? ' active' : ''} {control}" aria-pressed={preferences.rangeMode === 'reference'} data-range="reference" data-settings-action="switch-range">Reference</button>
      <button type="button" class="range-toggle-btn{preferences.rangeMode === 'both' ? ' active' : ''} {control}" aria-pressed={preferences.rangeMode === 'both'} data-range="both" data-settings-action="switch-range">Both</button>
    </div>
  </div>
  <div class="settings-section">
    <div id="display-time-label" class="settings-label">Time Format</div>
    <div class="unit-toggle" role="group" aria-labelledby="display-time-label">
      <button type="button" class="time-toggle-btn{preferences.timeFormat === '24h' ? ' active' : ''} {control}" aria-pressed={preferences.timeFormat === '24h'} data-timefmt="24h" data-settings-action="set-time-format">24h</button>
      <button type="button" class="time-toggle-btn{preferences.timeFormat === '12h' ? ' active' : ''} {control}" aria-pressed={preferences.timeFormat === '12h'} data-timefmt="12h" data-settings-action="set-time-format">12h (AM/PM)</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-action-row">
      <div class="settings-copy">
        <div class="settings-copy-title">Appearance</div>
        <div class="settings-copy-desc">Themes, accent color, and dashboard layout live in the quick Tweaks panel.</div>
      </div>
      <button type="button" class="import-btn import-btn-secondary settings-mini-btn {control} gb:display:[@media(pointer:coarse)]:shrink-0" data-settings-action="open-tweaks">Open Tweaks</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-action-row">
      <div class="settings-copy">
        <label for="settings-product-recs" class="settings-label">Tips</label>
        <div id="display-tips-help" class="settings-copy-desc">Optional general-information ideas about lifestyle, food, supplements, and products. Not a care plan.</div>
      </div>
      <SettingsToggle id="settings-product-recs" label="Tips" help="display-tips-help" checked={preferences.productRecs} action="set-product-recs" touch="coarse" />
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-action-row">
      <div class="settings-copy">
        <label for="debug-mode-toggle" class="settings-label">Debug Mode</label>
        <div id="display-debug-help" class="settings-copy-desc">Adds detailed log output and reveals low-level diagnostic details for troubleshooting. No data leaves your device.</div>
      </div>
      <SettingsToggle id="debug-mode-toggle" label="Debug Mode" help="display-debug-help" checked={preferences.debugMode} action="set-debug-mode" touch="coarse" />
    </div>
  </div>
</div>
<div class="settings-group-title">Resources</div>
<div class="settings-links-row">
  <a href="/docs" class="settings-link-btn {control}">Documentation</a>
  <button type="button" class="settings-link-btn {control}" data-settings-action="start-guided-tour">Guided Tour</button>
  <button type="button" class="settings-link-btn {control}" data-settings-action="open-changelog">What's New</button>
</div>
<div class="gb:display:mt-4 gb:display:text-center gb:display:text-[11px] gb:display:text-muted gb:display:font-mono gb:display:opacity-60">v{preferences.version} · <span id="settings-commit-hash">···</span></div>
