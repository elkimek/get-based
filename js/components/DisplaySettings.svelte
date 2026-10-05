<script lang="ts">
  import { untrack } from 'svelte';
  import type { DisplayPreferences } from '../settings-display-contract.js';

  let { initial }: { initial: DisplayPreferences } = $props();
  // This snapshot is controlled by the existing settings/state services. Svelte
  // owns only presentation; delegated actions continue to own all mutations.
  let preferences = $state(untrack(() => initial));
  export function refresh(next: DisplayPreferences): void { preferences = next; }

  const row = 'gb:display:grid gb:display:gap-3 gb:display:py-4 gb:display:border-b gb:display:border-line gb:display:@min-[34rem]:grid-cols-[minmax(0,1fr)_auto] gb:display:@min-[34rem]:items-center';
  const title = 'gb:display:m-0 gb:display:text-sm gb:display:font-semibold gb:display:text-ink';
  const description = 'gb:display:mt-1 gb:display:text-[13px] gb:display:leading-relaxed gb:display:text-secondary';
  const group = 'gb:display:flex gb:display:flex-wrap gb:display:gap-1 gb:display:items-center';
  const control = 'gb:display:inline-flex gb:display:items-center gb:display:justify-center gb:display:min-h-11 gb:display:px-3 gb:display:py-2 gb:display:rounded-control gb:display:border gb:display:border-line gb:display:bg-surface gb:display:text-ink gb:display:text-[13px] gb:display:font-body gb:display:font-medium gb:display:cursor-pointer gb:display:transition-colors gb:display:hover:bg-hover gb:display:aria-pressed:bg-accent gb:display:aria-pressed:text-on-accent gb:display:aria-pressed:border-accent gb:display:focus-visible:outline-2 gb:display:focus-visible:outline-offset-2 gb:display:focus-visible:outline-accent gb:display:motion-reduce:transition-none';
</script>

      <div class="gb:display:@container">
        <div class="{row}">
          <div>
            <div id="display-units-label" class="{title}">Unit System</div>
            <p id="display-units-help" class="{description}">Changes how results, ranges, reports, and AI context are displayed. Your original data remains unchanged.</p>
          </div>
          <div class="{group}" role="group" aria-labelledby="display-units-label" aria-describedby="display-units-help">
            <button type="button" class="unit-toggle-btn{preferences.unitSystem === 'EU' ? ' active' : ''} {control}" aria-pressed="{preferences.unitSystem === 'EU'}" data-unit="EU" data-settings-action="switch-unit" title="International SI units">International (SI)</button>
            <button type="button" class="unit-toggle-btn{preferences.unitSystem === 'ANZ' ? ' active' : ''} {control}" aria-pressed="{preferences.unitSystem === 'ANZ'}" data-unit="ANZ" data-settings-action="switch-unit" title="Common Australian and New Zealand pathology reporting units">Australia / NZ</button>
            <button type="button" class="unit-toggle-btn{preferences.unitSystem === 'US' ? ' active' : ''} {control}" aria-pressed="{preferences.unitSystem === 'US'}" data-unit="US" data-settings-action="switch-unit" title="US conventional units">US</button>
          </div>
        </div>
        <div class="{row}">
          <div id="display-alt-label" class="{title}" title="Show values in the alternate unit system to cross-check a lab report.">Alternate Units</div>
          <div class="{group}" role="group" aria-labelledby="display-alt-label">
            <button type="button" class="unit-toggle-btn{!preferences.showAltUnits ? ' active' : ''} {control}" aria-pressed="{!preferences.showAltUnits}" data-alt-units="off" data-settings-action="toggle-alt-units">Off</button>
            <button type="button" class="unit-toggle-btn{preferences.showAltUnits ? ' active' : ''} {control}" aria-pressed="{!!preferences.showAltUnits}" data-alt-units="on" data-settings-action="toggle-alt-units">Show both</button>
          </div>
        </div>
        <div class="{row}">
          <div id="display-range-label" class="{title}">Range Display</div>
          <div class="{group}" role="group" aria-labelledby="display-range-label">
            <button type="button" class="range-toggle-btn{preferences.rangeMode === 'optimal' ? ' active' : ''} {control}" aria-pressed="{preferences.rangeMode === 'optimal'}" data-range="optimal" data-settings-action="switch-range">Optimal</button>
            <button type="button" class="range-toggle-btn{preferences.rangeMode === 'reference' ? ' active' : ''} {control}" aria-pressed="{preferences.rangeMode === 'reference'}" data-range="reference" data-settings-action="switch-range">Reference</button>
            <button type="button" class="range-toggle-btn{preferences.rangeMode === 'both' ? ' active' : ''} {control}" aria-pressed="{preferences.rangeMode === 'both'}" data-range="both" data-settings-action="switch-range">Both</button>
          </div>
        </div>
        <div class="{row}">
          <div id="display-time-label" class="{title}">Time Format</div>
          <div class="{group}" role="group" aria-labelledby="display-time-label">
            <button type="button" class="time-toggle-btn{preferences.timeFormat === '24h' ? ' active' : ''} {control}" aria-pressed="{preferences.timeFormat === '24h'}" data-timefmt="24h" data-settings-action="set-time-format">24h</button>
            <button type="button" class="time-toggle-btn{preferences.timeFormat === '12h' ? ' active' : ''} {control}" aria-pressed="{preferences.timeFormat === '12h'}" data-timefmt="12h" data-settings-action="set-time-format">12h (AM/PM)</button>
          </div>
        </div>
        <div class="{row}">
          <div>
            <div class="{title}">Appearance</div>
            <p class="{description}">Themes, accent color, and dashboard layout live in the quick Tweaks panel.</p>
          </div>
          <button type="button" class="{control}" data-settings-action="open-tweaks">Open Tweaks</button>
        </div>
        <div class="{row}">
          <div>
            <label for="settings-product-recs" class="{title}">Tips</label>
            <p id="display-tips-help" class="{description}">Optional general-information ideas about lifestyle, food, supplements, and products. Not a care plan.</p>
          </div>
          <div class="gb:display:flex gb:display:items-center gb:display:min-h-11">
            <label class="toggle-switch">
              <input type="checkbox" id="settings-product-recs" aria-label="Tips" aria-describedby="display-tips-help" checked={preferences.productRecs} data-settings-action="set-product-recs">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="{row}">
          <div>
            <label for="debug-mode-toggle" class="{title}">Debug Mode</label>
            <p id="display-debug-help" class="{description}">Adds detailed log output and reveals low-level diagnostic details for troubleshooting. No data leaves your device.</p>
          </div>
          <div class="gb:display:flex gb:display:items-center gb:display:min-h-11">
            <label class="toggle-switch">
              <input type="checkbox" id="debug-mode-toggle" aria-label="Debug Mode" aria-describedby="display-debug-help" checked={preferences.debugMode} data-settings-action="set-debug-mode">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="gb:display:mt-6 gb:display:mb-3 gb:display:text-xs gb:display:font-mono gb:display:text-secondary">Resources</div>
      <div class="{group}">
        <a href="/docs" class="{control}">Documentation</a>
        <button type="button" class="{control}" data-settings-action="start-guided-tour">Guided Tour</button>
        <button type="button" class="{control}" data-settings-action="open-changelog">What's New</button>
      </div>
      <div class="gb:display:mt-4 gb:display:text-center gb:display:text-xs gb:display:text-muted gb:display:font-mono">v{preferences.version} · <span id="settings-commit-hash">···</span></div>
