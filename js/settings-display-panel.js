// @ts-check
// settings-display-panel.js - Settings Display tab rendering and state refresh.

import { state } from './state.js';
import { isProductRecsEnabled } from './recommendations.js';
import { getAppVersionRuntime } from './utils-runtime.js';
import { getTheme, getTimeFormat } from './theme.js';
import { escapeHTML, isDebugMode } from './utils.js';

/** @param {boolean} active */
export function renderDisplaySettingsPanel(active) {
  return `
    <div class="settings-tab-panel${active ? ' active' : ''}" data-tab-panel="display" id="settings-tab-display" role="tabpanel" aria-label="Display">
      <div class="settings-row">
        <div class="settings-section">
          <label class="settings-label">Unit System</label>
          <div class="unit-toggle">
            <button class="unit-toggle-btn${state.unitSystem === 'EU' ? ' active' : ''}" data-unit="EU" data-settings-action="switch-unit" title="International SI units">International (SI)</button>
            <button class="unit-toggle-btn${state.unitSystem === 'ANZ' ? ' active' : ''}" data-unit="ANZ" data-settings-action="switch-unit" title="Common Australian and New Zealand pathology reporting units">Australia / NZ</button>
            <button class="unit-toggle-btn${state.unitSystem === 'US' ? ' active' : ''}" data-unit="US" data-settings-action="switch-unit" title="US conventional units">US</button>
          </div>
          <div class="settings-copy-desc">Changes how stored results, ranges, reports, and AI context are displayed. Your original data remains unchanged.</div>
        </div>
        <div class="settings-section">
          <label class="settings-label" title="When on, the marker detail view also shows values in the alternate unit system (e.g. mg/dL alongside mmol/L). Useful for cross-checking against a lab report printed in the other system.">Alternate Units</label>
          <div class="unit-toggle">
            <button class="unit-toggle-btn${!state.showAltUnits ? ' active' : ''}" data-alt-units="off" data-settings-action="toggle-alt-units">Off</button>
            <button class="unit-toggle-btn${state.showAltUnits ? ' active' : ''}" data-alt-units="on" data-settings-action="toggle-alt-units">Show both</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Range Display</label>
          <div class="range-toggle">
            <button class="range-toggle-btn${state.rangeMode === 'optimal' ? ' active' : ''}" data-range="optimal" data-settings-action="switch-range">Optimal</button>
            <button class="range-toggle-btn${state.rangeMode === 'reference' ? ' active' : ''}" data-range="reference" data-settings-action="switch-range">Reference</button>
            <button class="range-toggle-btn${state.rangeMode === 'both' ? ' active' : ''}" data-range="both" data-settings-action="switch-range">Both</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Time Format</label>
          <div class="unit-toggle">
            <button class="time-toggle-btn${getTimeFormat() === '24h' ? ' active' : ''}" data-timefmt="24h" data-settings-action="set-time-format">24h</button>
            <button class="time-toggle-btn${getTimeFormat() === '12h' ? ' active' : ''}" data-timefmt="12h" data-settings-action="set-time-format">12h (AM/PM)</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-action-row">
            <div class="settings-copy">
              <div class="settings-copy-title">Appearance</div>
              <div class="settings-copy-desc">Themes, accent color, and dashboard layout live in the quick Tweaks panel.</div>
            </div>
            <button type="button" class="import-btn import-btn-secondary settings-mini-btn" data-settings-action="open-tweaks">Open Tweaks</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-action-row">
            <div class="settings-copy">
              <label class="settings-label">Tips</label>
              <div class="settings-copy-desc">Optional general-information ideas about lifestyle, food, supplements, and products. Not a care plan.</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="settings-product-recs" aria-label="Tips" ${isProductRecsEnabled() ? 'checked' : ''} data-settings-action="set-product-recs">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-action-row">
            <div class="settings-copy">
              <label class="settings-label">Debug Mode</label>
              <div class="settings-copy-desc">Adds detailed log output and reveals low-level diagnostic details for troubleshooting. No data leaves your device.</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="debug-mode-toggle" aria-label="Debug Mode" ${isDebugMode() ? 'checked' : ''} data-settings-action="set-debug-mode">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-group-title">Resources</div>
      <div class="settings-links-row">
        <a href="/docs" class="settings-link-btn">Documentation</a>
        <button class="settings-link-btn" data-settings-action="start-guided-tour">Guided Tour</button>
        <button class="settings-link-btn" data-settings-action="open-changelog">What's New</button>
      </div>

      <div style="margin-top:16px;text-align:center;font-size:11px;color:var(--text-muted);font-family:var(--font-mono);opacity:0.6">v${escapeHTML(getAppVersionRuntime())} · <span id="settings-commit-hash">···</span></div>
    </div>`;
}

export function updateDisplaySettingsPanel() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  const unitButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.unit-toggle-btn[data-unit]')));
  unitButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.unit === state.unitSystem));
  const rangeButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.range-toggle-btn')));
  rangeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.range === state.rangeMode));
  const altUnitButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.unit-toggle-btn[data-alt-units]')));
  altUnitButtons.forEach(btn => btn.classList.toggle('active', (btn.dataset.altUnits === 'on') === !!state.showAltUnits));
  const theme = getTheme();
  const themeButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.settings-theme-btn')));
  themeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.themeId === theme));
  const timeFmt = getTimeFormat();
  const timeButtons = /** @type {HTMLElement[]} */ (Array.from(modal.querySelectorAll('.time-toggle-btn')));
  timeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.timefmt === timeFmt));
}
