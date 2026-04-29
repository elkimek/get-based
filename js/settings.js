// settings.js — Settings modal (profile, display, AI provider, privacy)

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, isDebugMode, setDebugMode, isPIIReviewEnabled, setPIIReviewEnabled, isAnalyticsEnabled, setAnalyticsEnabled } from './utils.js';
import { getTheme, setTheme, getTimeFormat, setTimeFormat } from './theme.js';
import { formatCost, getProfileUsage, getGlobalUsage, resetProfileUsage } from './schema.js';
import { getAIProvider, isAIPaused, getOllamaPIIUrl, getOllamaPIIModel } from './api.js';
import { isOllamaPIIEnabled, setOllamaPIIEnabled, getOllamaConfig, checkOpenAICompatible } from './pii.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots } from './crypto.js';
import { isSyncEnabled, enableSync, disableSync, getMnemonic, getMnemonicResolutionError, getSyncBlocker, restoreFromMnemonic, getSyncRelay, setSyncRelay, checkRelayConnection, isMessengerEnabled, getMessengerToken, generateMessengerToken, revokeMessengerToken, pushContextToGateway } from './sync.js';
import { renderWearablesSettingsSection } from './wearables.js';
import './provider-panels.js';


// ═══════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════
let _activeSettingsTab = 'display';

export function openSettingsModal(tab) {
  window._settingsHadProvider = !!window.hasAIProvider?.();
  const overlay = document.getElementById('settings-modal-overlay');
  const modal = document.getElementById('settings-modal');
  const currentTheme = getTheme();
  const provider = getAIProvider();
  // Legacy v1.27 tab id 'integrations' — same redirect as switchSettingsTab.
  // Older deep-links / tour steps / external links may still pass it.
  if (tab === 'integrations') tab = 'wearables';
  if (tab) _activeSettingsTab = tab;

  modal.innerHTML = `
    <button class="modal-close" aria-label="Close" onclick="closeSettingsModal()">&times;</button>
    <h3>Settings</h3>

    <div class="settings-tabs-bar" role="tablist" aria-label="Settings sections">
      <button role="tab" aria-selected="${_activeSettingsTab === 'display'}" aria-controls="settings-tab-display" tabindex="${_activeSettingsTab === 'display' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'display' ? ' active' : ''}" data-tab="display" onclick="switchSettingsTab('display')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        Display
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'ai'}" aria-controls="settings-tab-ai" tabindex="${_activeSettingsTab === 'ai' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'ai' ? ' active' : ''}" data-tab="ai" onclick="switchSettingsTab('ai')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
        AI
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'privacy'}" aria-controls="settings-tab-privacy" tabindex="${_activeSettingsTab === 'privacy' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'privacy' ? ' active' : ''}" data-tab="privacy" onclick="switchSettingsTab('privacy')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Privacy
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'data'}" aria-controls="settings-tab-data" tabindex="${_activeSettingsTab === 'data' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'data' ? ' active' : ''}" data-tab="data" onclick="switchSettingsTab('data')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Data
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'wearables'}" aria-controls="settings-tab-wearables" tabindex="${_activeSettingsTab === 'wearables' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'wearables' ? ' active' : ''}" data-tab="wearables" onclick="switchSettingsTab('wearables')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 2"/><path d="M9 2h6M9 22h6"/></svg>
        Wearables
      </button>
      <button role="tab" aria-selected="${_activeSettingsTab === 'agent'}" aria-controls="settings-tab-agent" tabindex="${_activeSettingsTab === 'agent' ? 0 : -1}" class="settings-tab-btn${_activeSettingsTab === 'agent' ? ' active' : ''}" data-tab="agent" onclick="switchSettingsTab('agent')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="14" r="4"/><path d="m10.5 11 7.5-7.5M17 6l3 3M14 9l3 3"/></svg>
        Agent Access
      </button>
    </div>

    <!-- Display Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'display' ? ' active' : ''}" data-tab-panel="display">
      <div class="settings-row">
        <div class="settings-section">
          <label class="settings-label">Unit System</label>
          <div class="unit-toggle">
            <button class="unit-toggle-btn${state.unitSystem === 'EU' ? ' active' : ''}" data-unit="EU" onclick="switchUnitSystem('EU');updateSettingsUI()">EU (SI)</button>
            <button class="unit-toggle-btn${state.unitSystem === 'US' ? ' active' : ''}" data-unit="US" onclick="switchUnitSystem('US');updateSettingsUI()">US</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Range Display</label>
          <div class="range-toggle">
            <button class="range-toggle-btn${state.rangeMode === 'optimal' ? ' active' : ''}" data-range="optimal" onclick="switchRangeMode('optimal');updateSettingsUI()">Optimal</button>
            <button class="range-toggle-btn${state.rangeMode === 'reference' ? ' active' : ''}" data-range="reference" onclick="switchRangeMode('reference');updateSettingsUI()">Reference</button>
            <button class="range-toggle-btn${state.rangeMode === 'both' ? ' active' : ''}" data-range="both" onclick="switchRangeMode('both');updateSettingsUI()">Both</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Theme</label>
          <div class="settings-theme-toggle">
            <button class="settings-theme-btn${currentTheme === 'dark' ? ' active' : ''}" onclick="setTheme('dark');updateSettingsUI();destroyAllCharts();navigate(document.querySelector('.nav-item.active')?.dataset.category||'dashboard')">Dark</button>
            <button class="settings-theme-btn${currentTheme === 'light' ? ' active' : ''}" onclick="setTheme('light');updateSettingsUI();destroyAllCharts();navigate(document.querySelector('.nav-item.active')?.dataset.category||'dashboard')">Light</button>
          </div>
        </div>
        <div class="settings-section">
          <label class="settings-label">Time Format</label>
          <div class="unit-toggle">
            <button class="time-toggle-btn${getTimeFormat() === '24h' ? ' active' : ''}" data-timefmt="24h" onclick="setTimeFormat('24h');updateSettingsUI()">24h</button>
            <button class="time-toggle-btn${getTimeFormat() === '12h' ? ' active' : ''}" data-timefmt="12h" onclick="setTimeFormat('12h');updateSettingsUI()">12h (AM/PM)</button>
          </div>
        </div>
        <div class="settings-section">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <label class="settings-label" style="margin-bottom:2px">Tips & Recommendations</label>
              <div style="font-size:11px;color:var(--text-muted)">Supplement, food, and lifestyle guidance on markers</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="settings-product-recs" ${window.isProductRecsEnabled && window.isProductRecsEnabled() ? 'checked' : ''} onchange="setProductRecsEnabled(this.checked);if(window.navigate)window.navigate('dashboard')">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-group-title">Resources</div>
      <div class="settings-links-row">
        <a href="/docs" class="settings-link-btn">Documentation</a>
        <button class="settings-link-btn" onclick="closeSettingsModal();setTimeout(()=>startTour(false),300)">Guided Tour</button>
        <button class="settings-link-btn" onclick="closeSettingsModal();setTimeout(()=>openChangelog(true),300)">What's New</button>
      </div>

      <div style="margin-top:16px;text-align:center;font-size:11px;color:var(--text-muted);font-family:var(--font-mono);opacity:0.6">v${escapeHTML(window.APP_VERSION || '')} · <span id="settings-commit-hash">···</span></div>
    </div>

    <!-- AI Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'ai' ? ' active' : ''}" data-tab-panel="ai">
      <div class="settings-group-title">Provider</div>

      <div class="settings-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;color:var(--text-secondary)">AI features</span>
          <label class="toggle-switch">
            <input type="checkbox" id="ai-pause-toggle" ${isAIPaused() ? '' : 'checked'} onchange="toggleAIPause(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="ai-model-tip">Use a state-of-the-art model (Claude, GPT, Gemini) for medical data.<br>Stick with the same model across imports to keep marker keys consistent.</div>
        <div class="ai-provider-toggle">
          <button class="ai-provider-btn${provider === 'ppq' ? ' active' : ''}" data-provider="ppq" onclick="switchAIProvider('ppq')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.2 0-7-2.4-7-7 0-3.1 2.1-5.7 4-7.6.3-.3.8-.1.8.4v2.5c0 .2.2.3.3.2C12 9.6 13.5 5.3 13.6 2.2c0-.3.4-.5.6-.2C17.3 5.7 21 10.3 21 14.5 21 19.6 17 23 12 23z"/></svg> PPQ</button>
          <button class="ai-provider-btn${provider === 'routstr' ? ' active' : ''}" data-provider="routstr" onclick="switchAIProvider('routstr')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg> Routstr</button>
          <button class="ai-provider-btn${provider === 'openrouter' ? ' active' : ''}" data-provider="openrouter" onclick="switchAIProvider('openrouter')"><svg class="ai-provider-logo" viewBox="0 0 512 512" fill="currentColor" stroke="currentColor"><path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" stroke-width="90" fill="none"/><path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" stroke="none"/><path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" stroke-width="90" fill="none"/><path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" stroke="none"/></svg> OpenRouter</button>
          <button class="ai-provider-btn${provider === 'venice' ? ' active' : ''}" data-provider="venice" onclick="switchAIProvider('venice')"><svg class="ai-provider-logo" viewBox="0 0 326 366" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M105.481 245.984C99.4744 241.518 92.2244 237.777 84.2074 235.504C76.1903 233.231 67.406 232.427 58.8167 233.38C50.2272 234.332 41.8327 237.042 34.5086 241.017C27.1847 244.991 20.931 250.231 16.0487 255.905C11.1531 261.567 6.88803 268.522 4.0314 276.35C1.17477 284.178-0.273403 292.879 0.0448796 301.515C0.36299 310.152 2.44756 318.723 5.87231 326.319C9.29724 333.916 14.0625 340.538 19.3617 345.825C24.6482 351.124 31.2704 355.889 38.867 359.314C46.4637 362.739 55.0349 364.823 63.671 365.142C72.3073 365.46 81.0085 364.012 88.8366 361.155C96.6647 358.298 103.62 354.033 109.282 349.138C114.956 344.256 120.195 338.002 124.17 330.678C128.144 323.354 130.854 314.959 131.807 306.37C132.76 297.781 131.956 288.996 129.683 280.979C127.41 272.962 123.668 265.712 119.203 259.705L133.953 244.954L144.69 255.691H150.789L158.149 248.331V242.233L147.412 231.496L163 215.908L178.588 231.496L167.851 242.233V248.331L175.211 255.691H181.31L192.047 244.954L206.797 259.705C202.332 265.712 198.59 272.962 196.317 280.979C194.044 288.996 193.24 297.781 194.193 306.37C195.146 314.959 197.856 323.354 201.83 330.678C205.805 338.002 211.044 344.256 216.718 349.138C222.38 354.033 229.335 358.298 237.163 361.155C244.991 364.012 253.693 365.46 262.329 365.142C270.965 364.823 279.536 362.739 287.133 359.314C294.73 355.889 301.352 351.124 306.638 345.825C311.937 340.538 316.703 333.916 320.128 326.319C323.552 318.723 325.637 310.152 325.955 301.515C326.273 292.879 324.825 284.178 321.969 276.35C319.112 268.522 314.847 261.567 309.951 255.905C305.069 250.231 298.815 244.991 291.491 241.017C284.167 237.042 275.773 234.332 267.183 233.38C258.594 232.427 249.81 233.231 241.793 235.504C233.776 237.777 226.526 241.518 220.519 245.984L206.042 231.484L216.773 220.753V214.655L209.151 207.032H203.052L192.315 217.769L176.721 202.186L258.473 120.434L291.567 153.528V119.095H326L292.907 86.0012L326 52.9077V46.8095L318.377 39.1865H312.279L163 188.465L13.7212 39.1865H7.62295L0 46.8095V52.9077L33.0934 86.0012L0 119.095H34.4331V153.528L67.5263 120.434L149.279 202.186L133.685 217.769L122.948 207.032H116.849L109.226 214.655V220.753L119.958 231.484L105.481 245.984ZM238.144 321.715C234.778 328.62 235.477 338.188 239.811 344.531C243.793 351.1 252.216 355.693 259.895 355.484C267.574 355.693 275.997 351.1 279.979 344.531C284.313 338.188 285.012 328.62 281.646 321.715L282.484 320.812C289.389 324.196 298.971 323.511 305.324 319.178C311.904 315.2 316.508 306.768 316.297 299.081C316.508 291.395 311.904 282.963 305.324 278.984C298.971 274.652 289.389 273.966 282.484 277.351L281.646 276.448C285.012 269.543 284.313 259.974 279.979 253.632C275.997 247.063 267.574 242.469 259.895 242.679C252.216 242.469 243.793 247.063 239.811 253.632C235.477 259.974 234.778 269.543 238.144 276.448L237.306 277.351C230.401 273.966 220.818 274.652 214.466 278.984C207.886 282.963 203.282 291.395 203.492 299.081C203.282 306.768 207.886 315.2 214.466 319.178C220.818 323.511 230.401 324.196 237.306 320.812L238.144 321.715ZM86.1857 344.531C90.52 338.188 91.2191 328.62 87.8528 321.715L88.6913 320.812C95.5956 324.196 105.178 323.511 111.531 319.178C118.11 315.2 122.715 306.768 122.504 299.081C122.715 291.395 118.11 282.963 111.531 278.984C105.178 274.652 95.5956 273.966 88.6913 277.351L87.8528 276.448C91.2191 269.543 90.52 259.974 86.1857 253.632C82.2037 247.063 73.7808 242.469 66.1018 242.679C58.423 242.469 50.0001 247.063 46.0181 253.632C41.6839 259.974 40.9847 269.543 44.351 276.448L43.5126 277.351C36.6082 273.966 27.0255 274.652 20.6731 278.984C14.0932 282.963 9.48904 291.395 9.69934 299.081C9.48904 306.768 14.0932 315.2 20.6731 319.178C27.0255 323.511 36.6082 324.196 43.5126 320.812L44.351 321.715C40.9847 328.62 41.6839 338.188 46.0181 344.531C50.0001 351.1 58.423 355.693 66.1018 355.484C73.7808 355.693 82.2037 351.1 86.1857 344.531Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M162.891 39.1864L202.078 0L221.482 19.4047V84.8147L167.742 138.555H158.04L104.3 84.8147V19.4047L123.705 0L162.891 39.1864ZM123.705 13.7213L158.04 48.0567V111.112L123.705 76.7773V13.7213ZM167.744 48.0567L202.079 13.7213V76.7773L167.744 111.112V48.0567Z"/></svg> Venice</button>
          <button class="ai-provider-btn${provider === 'custom' ? ' active' : ''}" data-provider="custom" onclick="switchAIProvider('custom')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> Custom</button>
          <button class="ai-provider-btn${provider === 'ollama' ? ' active' : ''}" data-provider="ollama" onclick="switchAIProvider('ollama')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-3-8c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1s1 .45 1 1v2c0 .55-.45 1-1 1z"/></svg> Local</button>
        </div>
        <div id="ai-provider-panel">${window.renderAIProviderPanel(provider)}</div>
      </div>

      <div class="settings-group-title">AI Context</div>

      <div class="settings-section" id="ai-context-section">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text-secondary)">Include wearable data</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">~200 tokens summarising HRV, sleep, recovery and trends from your connected wearables.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ai-ctx-wearables-toggle" ${window.isWearableContextEnabled?.() ? 'checked' : ''} onchange="window.setWearableContextEnabled(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group-title">AI Usage</div>

      <div class="settings-section" id="ai-usage-section">
        ${renderAIUsageSection()}
      </div>
    </div>

    <!-- Privacy Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'privacy' ? ' active' : ''}" data-tab-panel="privacy">
      <div class="settings-group-title">AI Privacy Protection</div>

      <div class="settings-section" id="privacy-section">
        ${renderPrivacySection()}
      </div>
    </div>

    <!-- Data Tab -->
    <div class="settings-tab-panel${_activeSettingsTab === 'data' ? ' active' : ''}" data-tab-panel="data">
      <div class="settings-group-title">Security</div>

      <div class="settings-section" id="encryption-section">
        ${renderEncryptionSection()}
      </div>

      <div class="settings-group-title">Cross-Device Sync</div>

      <div class="settings-section" id="sync-section">
        ${renderSyncSection()}
      </div>

      <div class="settings-group-title">Backup &amp; Restore</div>

      <div class="settings-section" id="backup-section">
        ${renderBackupSection()}
      </div>

      <div class="settings-group-title">Imported Data</div>

      <div class="settings-section" id="data-entries-section">
        ${renderDataEntriesSection()}
      </div>
    </div>

    <!-- Wearables Tab — incoming biometric data (Oura, WHOOP, Fitbit, etc.) -->
    <div class="settings-tab-panel${_activeSettingsTab === 'wearables' ? ' active' : ''}" data-tab-panel="wearables">
      <div class="settings-section" id="wearables-section">
        ${renderWearablesSettingsSection()}
      </div>
    </div>

    <!-- Agent Access Tab — outgoing read permission for AI agents (MCP / Hermes / OpenClaw) -->
    <div class="settings-tab-panel${_activeSettingsTab === 'agent' ? ' active' : ''}" data-tab-panel="agent">
      <div class="settings-section" id="messenger-section">
        ${renderMessengerSection()}
      </div>
    </div>`;
  overlay.classList.add('show');
  window.initSettingsOllamaCheck();
  window.initSettingsModelFetch();
  loadBackupSnapshots();
  loadSettingsCommitHash();
  if (isSyncEnabled()) { loadMnemonic(); updateRelayStatus(); }
  // Always fire so wearables Manual-row reading counts populate on first paint
  // (whether the user lands on the Integrations tab or switches into it).
  document.dispatchEvent(new CustomEvent('settings:wearables-rendered'));
}

function loadSettingsCommitHash() {
  const el = document.getElementById('settings-commit-hash');
  if (!el) return;
  const render = (sha, ref) => {
    const short = sha.slice(0, 7);
    const e = document.getElementById('settings-commit-hash');
    if (!e) return;
    // Show branch suffix on previews so BETA testers can tell main from a feature branch.
    const suffix = ref && ref !== 'main' ? ` <span style="color:var(--text-muted);opacity:0.7">(${ref})</span>` : '';
    e.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${short}" target="_blank" rel="noopener" style="color:var(--text-muted);text-decoration:none">${short}</a>${suffix}`;
  };
  // Prefer the deployed SHA from Vercel (truthful on previews). Fall back to
  // main HEAD via GitHub when /api/commit isn't available (local dev, etc).
  fetch('/api/commit')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ sha, ref }) => render(sha, ref))
    .catch(() => fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(sha => render(sha, 'main'))
      .catch(() => { const e = document.getElementById('settings-commit-hash'); if (e) e.textContent = ''; }));
}

export function switchSettingsTab(tabId) {
  // Legacy v1.27 tab id 'integrations' covered both wearables + agent access.
  // v1.30.0 split them. Land on Wearables for the back-compat redirect — most
  // pre-existing deep-links pointed at the wearable adapter rows.
  if (tabId === 'integrations') tabId = 'wearables';
  _activeSettingsTab = tabId;
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.querySelectorAll('.settings-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  modal.querySelectorAll('.settings-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tabPanel === tabId);
  });
  // Re-run init for tabs that need async setup
  if (tabId === 'ai') {
    window.initSettingsOllamaCheck();
    window.initSettingsModelFetch();
  }
  if (tabId === 'data') {
    refreshDataEntriesSection();
    loadBackupSnapshots();
  }
  if (tabId === 'wearables') {
    // Notify the wearables module so it can populate the Manual-row reading
    // counts on first paint, not just on details-toggle.
    document.dispatchEvent(new CustomEvent('settings:wearables-rendered'));
  }
}

export function renderPrivacySection() {
  const piiUrl = getOllamaPIIUrl();
  const piiEnabled = isOllamaPIIEnabled();
  return `<div class="local-ai-settings">
    <div class="ai-provider-desc" style="margin-bottom:10px">Before any document or chat context is sent to AI for analysis — lab PDFs, EMF assessment reports, image-based imports — personal information (name, date of birth, ID numbers, address) is detected and replaced with fake data. Only lab values and content relevant to interpretation reach the AI provider.</div>
    <div class="privacy-status-card" id="privacy-status-card">
      <div class="privacy-status-icon" id="privacy-status-icon">&#128274;</div>
      <div class="privacy-status-body">
        <div class="privacy-status-title" id="privacy-status-title">Checking...</div>
        <div class="privacy-status-detail" id="privacy-status-detail"></div>
      </div>
    </div>
    <div class="privacy-configure-toggle" onclick="togglePrivacyConfigure()" style="margin-top:12px">
      <span class="privacy-configure-arrow" id="privacy-configure-arrow">&#9654;</span>
      Configure Local AI
    </div>
    <div class="privacy-configure-body" id="privacy-configure-body" style="display:none">
      <div id="pii-model-section">
        <div class="local-ai-status" id="pii-local-status">
          <span class="local-ai-status-dot" id="pii-local-dot"></span>
          <span id="pii-local-status-text">Click Test to check</span>
        </div>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted)">Server address</label>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
            <input type="text" class="api-key-input" id="pii-local-url-input" value="${piiUrl}" placeholder="http://localhost:11434" style="flex:1">
            <button class="import-btn import-btn-secondary" onclick="testPIIOllamaConnection()" style="white-space:nowrap">Test</button>
          </div>
        </div>
        <div id="pii-model-dropdown" style="margin-top:8px;display:none">
          <label style="font-size:12px;color:var(--text-muted)">Privacy model <span style="font-size:11px">(can be a smaller, faster model)</span></label>
          <select class="api-key-input" id="pii-model-select" style="margin-top:4px" onchange="setOllamaPIIModel(this.value)"></select>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-top:14px">
      <span style="font-size:13px">Use local AI for privacy protection<br><span style="font-size:11px;color:var(--text-muted)">Requires a local AI server (configure above). When disabled, regex pattern matching is used instead.</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="pii-local-toggle" ${piiEnabled ? 'checked' : ''} onchange="toggleOllamaPII(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-top:8px">
      <span style="font-size:13px">Review obfuscated text before sending to AI<br><span style="font-size:11px;color:var(--text-muted)">Pause after privacy protection runs so you can inspect what the AI is about to receive. Adds one click per import — recommended.</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="pii-review-toggle" ${isPIIReviewEnabled() ? 'checked' : ''} onchange="confirmDisablePIIReview(this)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-top:8px">
      <span style="font-size:13px">Verbose console logging<br><span style="font-size:11px;color:var(--text-muted)">Adds detailed log output across the app — useful for debugging or filing issues. No data leaves your device.</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="debug-mode-toggle" ${isDebugMode() ? 'checked' : ''} onchange="setDebugMode(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
  <div class="local-ai-settings" style="margin-top:16px">
    <h4 style="margin:0 0 6px 0;font-size:13px;color:var(--text-primary)">Anonymous Usage Stats</h4>
    <div class="ai-provider-desc" style="margin-bottom:10px">No health data is ever sent. I track cookieless pageviews and outbound clicks on affiliate links so I can tell which integrations actually help users — never which user, what data they were viewing, or any health context.</div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px">
      <span style="font-size:13px">Send anonymous usage stats<br><span style="font-size:11px;color:var(--text-muted)">Toggle takes effect on next launch.</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="analytics-toggle" ${isAnalyticsEnabled() ? 'checked' : ''} onchange="setAnalyticsEnabled(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>`;
}

export function togglePrivacyConfigure() {
  const body = document.getElementById('privacy-configure-body');
  const arrow = document.getElementById('privacy-configure-arrow');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.innerHTML = open ? '&#9654;' : '&#9660;';
}

export function toggleOllamaPII(enabled) {
  setOllamaPIIEnabled(enabled);
  updatePrivacyStatusCard();
  if (enabled) {
    // Expand the configure panel so user can set up Ollama
    const body = document.getElementById('privacy-configure-body');
    const arrow = document.getElementById('privacy-configure-arrow');
    if (body) body.style.display = 'block';
    if (arrow) arrow.innerHTML = '&#9660;';
  }
}

export async function updatePrivacyStatusCard(enhanced) {
  const icon = document.getElementById('privacy-status-icon');
  const title = document.getElementById('privacy-status-title');
  const detail = document.getElementById('privacy-status-detail');
  const card = document.getElementById('privacy-status-card');
  if (!title || !detail || !card) return;
  // If opt-in is off, always show basic
  if (!isOllamaPIIEnabled()) { enhanced = false; }
  // If not passed explicitly, check PII Ollama
  else if (enhanced === undefined) {
    try {
      const piiUrl = getOllamaPIIUrl();
      const config = getOllamaConfig();
      const result = await checkOpenAICompatible(piiUrl, config.apiKey);
      enhanced = result.available && result.models.length > 0;
    } catch { enhanced = false; }
  }
  if (enhanced) {
    const model = getOllamaPIIModel();
    card.className = 'privacy-status-card privacy-status-enhanced';
    if (icon) icon.innerHTML = '&#128274;';
    title.textContent = 'Enhanced protection';
    detail.textContent = `Local AI (${model}) understands context and language, so it reliably finds and replaces all personal info — including uncommon formats and non-English text.`;
  } else {
    card.className = 'privacy-status-card privacy-status-basic';
    if (icon) icon.innerHTML = '&#128274;';
    title.textContent = 'Basic protection';
    detail.innerHTML = 'Regex pattern matching catches common formats (names on labeled lines, IDs, emails, phone numbers). May miss unusual layouts or non-English personal data.<br><span style="margin-top:4px;display:inline-block">Set up Local AI for enhanced protection — a local server that reliably catches all personal info.</span>';
  }
}

export function updateSettingsUI() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.querySelectorAll('.unit-toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.unit === state.unitSystem));
  modal.querySelectorAll('.range-toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.range === state.rangeMode));
  const theme = getTheme();
  modal.querySelectorAll('.settings-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === theme);
  });
  const timeFmt = getTimeFormat();
  modal.querySelectorAll('.time-toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.timefmt === timeFmt));
}

export function closeSettingsModal() {
  const hadProvider = window._settingsHadProvider;
  document.getElementById('settings-modal-overlay').classList.remove('show');
  if (window.updateChatNudge) window.updateChatNudge();
}


// ═══════════════════════════════════════════════
// SYNC SECTION
// ═══════════════════════════════════════════════
function renderPendingTombstones() {
  const pending = window.listPendingTombstones?.() || [];
  if (pending.length === 0) return '';
  const rows = pending.map(p => `
    <div class="sync-tombstone-row" data-tomb-id="${escapeAttr(p.id)}">
      <span class="sync-tombstone-name">${escapeHTML(p.name)}</span>
      <span class="sync-tombstone-meta">${p.at ? `flagged ${new Date(p.at).toLocaleDateString()}` : ''}</span>
      <button class="sync-tombstone-btn sync-tombstone-apply" onclick="window.applyPendingTombstone('${escapeAttr(p.id)}').then(() => window.openSettingsModal('data'))">Apply delete</button>
      <button class="sync-tombstone-btn sync-tombstone-reject" onclick="window.rejectPendingTombstone('${escapeAttr(p.id)}').then(() => window.openSettingsModal('data'))">Restore</button>
    </div>`).join('');
  return `
    <div class="sync-tombstone-banner">
      <div class="sync-tombstone-head">
        <strong>${pending.length} profile${pending.length === 1 ? '' : 's'} flagged for deletion on another device</strong>
        <span class="sync-tombstone-help">Confirm each — Apply wipes locally, Restore re-publishes.</span>
      </div>
      ${rows}
    </div>`;
}

function renderSyncSection() {
  const enabled = isSyncEnabled();
  const relay = getSyncRelay();
  const blocker = getSyncBlocker();
  // Banner appears in place of the toggle when the browser is missing a
  // primitive Evolu needs (Web Locks, StorageManager, OPFS, or WebCrypto).
  // Lets the user see "this is broken and here's why" instead of clicking
  // a dead toggle and waiting 30s for a cryptic timeout toast.
  const blockerBanner = blocker ? `
    <div style="margin-bottom:16px;padding:10px 12px;border:1px solid #fbbf24;background:rgba(251,191,36,0.08);border-radius:6px;color:#fbbf24;font-size:12px;line-height:1.45">
      <strong>Sync unavailable in this browser.</strong><br>
      ${escapeHTML(blocker)}
    </div>` : '';
  return `
    ${blockerBanner}
    ${renderPendingTombstones()}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${enabled ? '16' : '8'}px;${blocker ? 'opacity:0.5;pointer-events:none' : ''}">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Cross-device sync</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">E2E encrypted via Evolu CRDT</div>
      </div>
      <label class="chat-websearch-toggle-label" style="display:flex" aria-label="Toggle cross-device sync">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSync(this.checked)" style="display:none" ${blocker ? 'disabled' : ''}>
        <span class="chat-toggle-slider"></span>
      </label>
    </div>
    ${enabled ? `
      <div id="sync-relay-status" style="display:flex;align-items:center;gap:6px;margin-bottom:16px">
        <span id="sync-status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block"></span>
        <span id="sync-status-text" style="font-size:12px;color:var(--text-muted)">Checking relay...</span>
      </div>

      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Your mnemonic</label>
          <div style="display:flex;gap:6px">
            <button id="sync-mnemonic-toggle" class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" onclick="toggleMnemonicVisibility()" aria-label="Show mnemonic">Show</button>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" onclick="copyMnemonic()" aria-label="Copy mnemonic">Copy</button>
          </div>
        </div>
        <div id="sync-mnemonic" data-masked="true" style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;min-height:20px;user-select:none" aria-label="Mnemonic phrase">Loading...</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">These words are your encryption key. Store them offline. Never share them.</div>
      </div>

      <div style="margin-bottom:16px">
        <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px;width:100%" onclick="openRestoreMnemonicDialog()">Restore from a different mnemonic…</button>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.4">Replace this device's identity with a 24-word seed from another device. Your current data is overwritten.</div>
      </div>

      <details style="margin-bottom:8px">
        <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none">Advanced</summary>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Relay server</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="sync-relay-input" value="${escapeAttr(relay)}" style="flex:1;font-size:12px;border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:6px 10px;font-family:var(--font-mono, monospace)" placeholder="wss://...">
            <button class="import-btn import-btn-secondary" style="font-size:12px;padding:4px 12px" onclick="saveSyncRelay()">Save</button>
          </div>
        </div>
      </details>
    ` : `
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5">
        Sync profiles, lab data, and AI settings across your devices. Data is encrypted with a key derived from a 24-word mnemonic — the relay server only sees ciphertext.
      </div>
    `}
  `;
}

let _syncToggling = false;
let _syncToggleWatchdog = null;
function _releaseSyncToggle() {
  _syncToggling = false;
  if (_syncToggleWatchdog) { clearTimeout(_syncToggleWatchdog); _syncToggleWatchdog = null; }
}
async function toggleSync(enabled) {
  if (_syncToggling) {
    // Don't silently swallow — tell the user their click registered but is
    // already mid-flight. (If they're hitting this repeatedly, the watchdog
    // below will release the lock so the next click works.)
    showNotification('Sync change already in progress…', 'info');
    return;
  }
  _syncToggling = true;
  // Watchdog: if the modal closes by some path that doesn't run our
  // cleanup (e.g. ESC key, page nav, browser back, JS error), release
  // the toggle lock after 60s so the next click isn't dead. 60s is
  // generous — long enough to write down 24 words, short enough to
  // recover from a wedge before the user gives up.
  _syncToggleWatchdog = setTimeout(_releaseSyncToggle, 60000);
  if (enabled) {
    showSyncSetupModal();
    // _syncToggling cleared by closeSyncSetup, syncSetupDone, or watchdog
  } else {
    try {
      _mnemonicCache = null;
      _mnemonicRetries = 0;
      clearTimeout(_mnemonicRetryTimer);
      await disableSync();
      // disableSync triggers a page reload, but if we're still here render
      // the disabled state immediately for visual feedback.
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } catch (e) {
      console.error('[sync] disable failed:', e);
      showNotification(`Disable failed: ${e?.message || e}`, 'error');
      // Visually un-stick the toggle by re-rendering — the underlying
      // localStorage flag is already false (set early in disableSync) so
      // the toggle will show as off.
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } finally {
      _releaseSyncToggle();
    }
  }
}

export function showSyncSetupModal() {
  let overlay = document.getElementById('sync-setup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sync-setup-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Sync setup" style="max-width:480px">
    <h3 style="margin:0 0 6px;font-size:16px;color:var(--text-primary)">Set up sync</h3>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 20px;line-height:1.5">Your data is encrypted with a 24-word mnemonic. The relay server only sees ciphertext.</p>
    <div id="sync-setup-choices">
      <button class="import-btn import-btn-primary" style="width:100%;padding:12px 16px;font-size:13px;margin-bottom:10px;text-align:left" onclick="syncSetupNew()">
        <div style="font-weight:600">New setup</div>
        <div style="font-weight:400;opacity:0.8;margin-top:2px;font-size:12px">First time syncing — generate a new mnemonic</div>
      </button>
      <button class="import-btn import-btn-secondary" style="width:100%;padding:12px 16px;font-size:13px;text-align:left" onclick="syncSetupRestore()">
        <div style="font-weight:600">Join existing</div>
        <div style="font-weight:400;opacity:0.8;margin-top:2px;font-size:12px">I have a mnemonic from another device</div>
      </button>
    </div>
    <div id="sync-setup-new" style="display:none"></div>
    <div id="sync-setup-restore" style="display:none">
      <textarea id="sync-setup-restore-input" style="font-size:12px;width:100%;height:70px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:10px 12px;font-family:var(--font-mono, monospace);box-sizing:border-box;margin-bottom:10px" placeholder="Paste your 24-word mnemonic here..."></textarea>
      <div style="display:flex;gap:8px">
        <button class="import-btn import-btn-primary" style="flex:1;padding:8px 16px;font-size:13px" onclick="syncSetupDoRestore()">Restore</button>
        <button class="import-btn import-btn-secondary" style="padding:8px 16px;font-size:13px" onclick="syncSetupBack()">Back</button>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      <button class="confirm-btn confirm-btn-cancel" onclick="closeSyncSetup()">Cancel</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  overlay.onclick = (e) => { if (e.target === overlay) { const d = overlay.querySelector('.confirm-dialog'); if (d) { d.classList.add('modal-nudge'); d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true }); } } };
}

async function closeSyncSetup() {
  const overlay = document.getElementById('sync-setup-overlay');
  if (overlay) overlay.classList.remove('show');
  // If sync was started during setup but user cancelled, clean up
  if (isSyncEnabled()) {
    _mnemonicCache = null;
    _mnemonicRetries = 0;
    clearTimeout(_mnemonicRetryTimer);
    await disableSync();
  }
  const el = document.getElementById('sync-section');
  if (el) el.innerHTML = renderSyncSection();
  _releaseSyncToggle();
}

let _syncSetupInProgress = false;
async function syncSetupNew() {
  if (_syncSetupInProgress) return;
  _syncSetupInProgress = true;
  const choicesEl = document.getElementById('sync-setup-choices');
  const newEl = document.getElementById('sync-setup-new');
  if (choicesEl) choicesEl.style.display = 'none';
  if (newEl) newEl.style.display = 'block';
  newEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text-muted);font-size:13px">Generating identity...</div>';

  try {
    await enableSync({ skipPush: false });

    // Wait for mnemonic to resolve
    let mnemonic = null;
    for (let i = 0; i < 30; i++) {
      if (!isSyncEnabled()) return; // cancelled during wait
      mnemonic = getMnemonic();
      if (mnemonic) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!mnemonic) {
      newEl.innerHTML = '<div style="color:var(--red);font-size:13px;padding:8px 0">Failed to generate mnemonic. Try again.</div>';
      return;
    }

    _mnemonicCache = mnemonic;
    newEl.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Your mnemonic</div>
        <div style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-word;line-height:1.6;user-select:all">${escapeHTML(mnemonic)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px">
        Write these 24 words down and store them offline. You will need them to sync another device. Anyone with this mnemonic can access your synced data.
      </div>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:12px;color:var(--text-primary);margin-bottom:14px">
        <input type="checkbox" id="sync-setup-ack" style="margin-top:2px" onchange="document.getElementById('sync-setup-done-btn').disabled=!this.checked">
        I have saved my mnemonic somewhere safe
      </label>
      <button id="sync-setup-done-btn" class="import-btn import-btn-primary" style="width:100%;padding:8px 16px;font-size:13px;opacity:0.45;cursor:not-allowed" disabled onclick="syncSetupDone()">Done</button>
    `;
    // Wire up disabled style toggle on checkbox
    const ack = document.getElementById('sync-setup-ack');
    const doneBtn = document.getElementById('sync-setup-done-btn');
    if (ack && doneBtn) {
      ack.onchange = () => {
        doneBtn.disabled = !ack.checked;
        doneBtn.style.opacity = ack.checked ? '1' : '0.45';
        doneBtn.style.cursor = ack.checked ? 'pointer' : 'not-allowed';
      };
    }
  } finally {
    _syncSetupInProgress = false;
  }
}

function syncSetupDone() {
  const overlay = document.getElementById('sync-setup-overlay');
  if (overlay) overlay.classList.remove('show');
  _releaseSyncToggle();
  const el = document.getElementById('sync-section');
  if (el) el.innerHTML = renderSyncSection();
  loadMnemonic();
  updateRelayStatus();
}

function syncSetupRestore() {
  document.getElementById('sync-setup-choices').style.display = 'none';
  document.getElementById('sync-setup-restore').style.display = 'block';
  const input = document.getElementById('sync-setup-restore-input');
  if (input) input.focus();
}

function syncSetupBack() {
  document.getElementById('sync-setup-choices').style.display = '';
  document.getElementById('sync-setup-restore').style.display = 'none';
  document.getElementById('sync-setup-new').style.display = 'none';
}

async function syncSetupDoRestore() {
  if (_syncSetupInProgress) return;
  const input = document.getElementById('sync-setup-restore-input');
  if (!input) return;
  const raw = (input.value || '').trim();
  if (!raw) {
    showNotification('Paste your 24-word seed into the textarea first', 'error');
    input.focus();
    return;
  }
  const mnemonic = raw;
  const words = mnemonic.split(/\s+/);
  if (words.length !== 24) {
    showNotification(`Seed must be exactly 24 words (got ${words.length})`, 'error');
    return;
  }

  _syncSetupInProgress = true;
  try {
    // Enable sync (generates throwaway identity) then immediately restore
    await enableSync({ skipPush: true });
    const result = await restoreFromMnemonic(mnemonic);
    if (!result) {
      // Restore failed — clean up the throwaway identity
      await disableSync();
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
      _syncToggling = false;
      return;
    }
    // restoreFromMnemonic triggers reload, so nothing else needed
  } finally {
    _syncSetupInProgress = false;
  }
}

async function updateRelayStatus() {
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  if (!dot || !text) return;
  const connected = await checkRelayConnection();
  dot.style.background = connected ? '#22c55e' : 'var(--red)';
  text.textContent = connected ? 'Connected to relay' : 'Relay unreachable';
  // Keep header indicator in sync
  if (window.updateSyncIndicator) window.updateSyncIndicator();
}

let _mnemonicRetries = 0;
let _mnemonicCache = null;
let _mnemonicRetryTimer = null;
const MNEMONIC_MASK = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022';

function loadMnemonic() {
  clearTimeout(_mnemonicRetryTimer);
  const el = document.getElementById('sync-mnemonic');
  if (!el || !isSyncEnabled()) { _mnemonicRetries = 0; return; }
  const mnemonic = getMnemonic();
  if (mnemonic) {
    _mnemonicCache = mnemonic;
    el.dataset.masked = 'true';
    el.textContent = MNEMONIC_MASK;
    el.style.userSelect = 'none';
    el.style.color = '';
    _mnemonicRetries = 0;
    return;
  }
  // Stop polling immediately if Evolu surfaced an actual init error —
  // no point waiting 30s for a promise that already rejected.
  const initErr = getMnemonicResolutionError();
  if (initErr) {
    el.textContent = `Sync init failed: ${initErr}`;
    el.style.color = '#fbbf24';
    _mnemonicRetries = 0;
    return;
  }
  if (_mnemonicRetries < 30) {
    _mnemonicRetries++;
    el.textContent = 'Resolving…';
    _mnemonicRetryTimer = setTimeout(loadMnemonic, 1000);
  } else {
    el.textContent = 'Could not resolve mnemonic — open the dev console and check for [sync] errors, or try a hard refresh';
    el.style.color = '#fbbf24';
    _mnemonicRetries = 0;
  }
}

function toggleMnemonicVisibility() {
  const el = document.getElementById('sync-mnemonic');
  const btn = document.getElementById('sync-mnemonic-toggle');
  if (!el || !btn || !_mnemonicCache) return;
  const masked = el.dataset.masked === 'true';
  if (masked) {
    el.textContent = _mnemonicCache;
    el.dataset.masked = 'false';
    el.style.userSelect = 'all';
    btn.textContent = 'Hide';
  } else {
    el.textContent = MNEMONIC_MASK;
    el.dataset.masked = 'true';
    el.style.userSelect = 'none';
    btn.textContent = 'Show';
  }
}

let _clipboardClearTimer = null;
function copyMnemonic() {
  if (!_mnemonicCache) return;
  navigator.clipboard.writeText(_mnemonicCache).then(() => {
    showNotification('Mnemonic copied — clipboard will clear in 60s', 'success');
    clearTimeout(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, 60000);
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

/**
 * Single-step restore modal — replaces the old two-button flow that confused
 * users into clicking the outer "Restore from mnemonic" button (which only
 * revealed a textarea) and waiting for something to happen. Now the modal
 * contains the seed input + a single Restore action button + Cancel, all
 * in one place. Same pattern as the sync setup wizard so users don't have
 * to learn two different shapes.
 */
function openRestoreMnemonicDialog() {
  let overlay = document.getElementById('sync-restore-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sync-restore-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-restore-title" style="max-width:480px">
    <h3 id="sync-restore-title" style="margin:0 0 6px;font-size:16px;color:var(--text-primary)">Restore from mnemonic</h3>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;line-height:1.5">Paste your 24-word seed from another device. This replaces your current sync identity — anything synced under the old identity will no longer reach this device.</p>
    <textarea id="sync-restore-dialog-input" autofocus aria-label="24-word mnemonic" style="font-size:12px;width:100%;height:90px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:10px 12px;font-family:var(--font-mono, monospace);box-sizing:border-box" placeholder="word word word word word word word word word word word word word word word word word word word word word word word word"></textarea>
    <div id="sync-restore-dialog-msg" style="font-size:11px;color:var(--text-muted);margin-top:6px;min-height:14px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="confirm-btn confirm-btn-cancel" onclick="closeRestoreMnemonicDialog()">Cancel</button>
      <button id="sync-restore-dialog-go" class="import-btn import-btn-primary" style="padding:8px 16px;font-size:13px" onclick="confirmRestoreMnemonic()">Restore &amp; reload</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  // Live word count + button enable so the user gets immediate feedback as
  // they paste — much friendlier than only finding out on submit.
  const input = document.getElementById('sync-restore-dialog-input');
  const msg = document.getElementById('sync-restore-dialog-msg');
  const btn = document.getElementById('sync-restore-dialog-go');
  if (input) {
    input.focus();
    const update = () => {
      const raw = (input.value || '').trim();
      if (!raw) {
        if (msg) { msg.textContent = ''; msg.style.color = 'var(--text-muted)'; }
        if (btn) btn.disabled = true;
        return;
      }
      const words = raw.split(/\s+/);
      if (words.length === 24) {
        if (msg) { msg.textContent = '✓ 24 words detected'; msg.style.color = 'var(--green, #22c55e)'; }
        if (btn) btn.disabled = false;
      } else {
        if (msg) { msg.textContent = `${words.length} word${words.length === 1 ? '' : 's'} so far — need exactly 24`; msg.style.color = '#fbbf24'; }
        if (btn) btn.disabled = true;
      }
    };
    input.addEventListener('input', update);
    update();
  }
  overlay.onclick = (e) => { if (e.target === overlay) closeRestoreMnemonicDialog(); };
}

function closeRestoreMnemonicDialog() {
  const overlay = document.getElementById('sync-restore-overlay');
  if (overlay) overlay.classList.remove('show');
}

async function confirmRestoreMnemonic() {
  const input = document.getElementById('sync-restore-dialog-input');
  const btn = document.getElementById('sync-restore-dialog-go');
  if (!input) return;
  const raw = (input.value || '').trim();
  const words = raw.split(/\s+/);
  if (words.length !== 24) {
    showNotification(`Seed must be exactly 24 words (got ${words.length})`, 'error');
    input.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Restoring…'; }
  // No second confirm dialog — the modal already explains what restore
  // does, and the action button is explicit ("Restore & reload"). Adding
  // a second confirm pile-up was the friction users complained about.
  const result = await restoreFromMnemonic(raw);
  if (!result) {
    if (btn) { btn.disabled = false; btn.textContent = 'Restore & reload'; }
    if (!isSyncEnabled()) showNotification('Sync not initialized — enable sync first, then restore', 'error');
  }
  // On success: restoreFromMnemonic triggers reload (Evolu auto-reloads),
  // so we don't need to close this modal — the page replaces itself.
}

function saveSyncRelay() {
  const input = document.getElementById('sync-relay-input');
  if (!input) return;
  const url = input.value.trim();
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    showNotification('Relay URL must start with wss:// or ws://', 'error');
    return;
  }
  setSyncRelay(url);
  showNotification('Relay saved — restart sync to apply', 'success');
  updateRelayStatus();
}

// ═══════════════════════════════════════════════
// MESSENGER ACCESS
// ═══════════════════════════════════════════════

function renderMessengerSection() {
  const enabled = isMessengerEnabled();
  const token = getMessengerToken();
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${enabled ? '16' : '8'}px">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Agent Access</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Let AI agents query your labs and context via MCP, Hermes Agent, or OpenClaw</div>
      </div>
      <label class="chat-websearch-toggle-label" style="display:flex" aria-label="Toggle Agent Access">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleMessenger(this.checked)" style="display:none">
        <span class="chat-toggle-slider"></span>
      </label>
    </div>
    ${enabled && token ? `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">Read-only token</label>
          <div style="display:flex;gap:6px">
            <button id="messenger-token-toggle" class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" onclick="toggleMessengerToken()" aria-label="Show token">Show</button>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px" onclick="copyMessengerToken()" aria-label="Copy token">Copy</button>
          </div>
        </div>
        <div id="messenger-token" data-masked="true" style="font-family:var(--font-mono, monospace);font-size:11.5px;background:var(--bg-secondary);padding:10px 12px;border-radius:8px;border:1px solid var(--border);word-break:break-all;line-height:1.6;min-height:20px;user-select:none" aria-label="Agent Access token">${'\u2022'.repeat(64)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5">Use <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" style="color:var(--accent)">getbased-mcp</a> to connect <a href="https://github.com/hermes-agent/hermes-agent" target="_blank" rel="noopener" style="color:var(--accent)">Hermes Agent</a>, <a href="https://openclaw.ai" target="_blank" rel="noopener" style="color:var(--accent)">OpenClaw</a>, or any MCP-compatible agent. Paste this token into your agent's config.</div>
      </div>
      <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px;width:100%" onclick="regenerateMessengerToken()">Regenerate token</button>
      <div style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px">
          <div style="flex:1">
            <div style="font-size:13px;color:var(--text-secondary)">Push wearable daily series</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Adds a pivoted daily-values matrix (HRV, RHR, sleep…) so agents can spot trends. ~100 / 400 / 1200 extra tokens for 7 / 30 / 90 days respectively (real-measured at 13 metrics); cached cleanly so the marginal cost per turn is small. Off by default — pick 7 days for cheap follow-ups, 30 for monthly reasoning, 90 for season-spanning analysis.</div>
          </div>
          <select id="agent-wearable-series-select"
            onchange="window.setAgentWearableSeriesDays(this.value === 'off' ? 0 : Number(this.value)); window.pushContextToGateway && window.pushContextToGateway()"
            aria-label="Wearable series window pushed to agent"
            style="font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);min-width:90px">
            <option value="off"${(window.getAgentWearableSeriesDays?.() || 0) === 0 ? ' selected' : ''}>Off</option>
            <option value="7"${window.getAgentWearableSeriesDays?.() === 7 ? ' selected' : ''}>7 days</option>
            <option value="30"${window.getAgentWearableSeriesDays?.() === 30 ? ' selected' : ''}>30 days</option>
            <option value="90"${window.getAgentWearableSeriesDays?.() === 90 ? ' selected' : ''}>90 days</option>
          </select>
        </div>
      </div>
    ` : `
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5">
        Let AI agents query your labs — coding agents, messenger bots, or any <a href="https://github.com/elkimek/getbased-agents/tree/main/packages/mcp" target="_blank" rel="noopener" style="color:var(--accent)">MCP-compatible tool</a>. Only a read-only summary is shared — your data stays encrypted.
      </div>
    `}
  `;
}

let _messengerToggling = false;
function toggleMessenger(enabled) {
  if (_messengerToggling) return;
  _messengerToggling = true;
  try {
    if (enabled) {
      generateMessengerToken();
      pushContextToGateway();
      showNotification('Agent Access enabled', 'success');
    } else {
      revokeMessengerToken();
      showNotification('Agent Access disabled', 'success');
    }
    const el = document.getElementById('messenger-section');
    if (el) el.innerHTML = renderMessengerSection();
  } finally {
    _messengerToggling = false;
  }
}

function toggleMessengerToken() {
  const el = document.getElementById('messenger-token');
  const btn = document.getElementById('messenger-token-toggle');
  if (!el || !btn) return;
  const token = getMessengerToken();
  if (!token) return;
  const masked = el.dataset.masked === 'true';
  if (masked) {
    el.textContent = token;
    el.dataset.masked = 'false';
    el.style.userSelect = 'all';
    btn.textContent = 'Hide';
  } else {
    el.textContent = '\u2022'.repeat(64);
    el.dataset.masked = 'true';
    el.style.userSelect = 'none';
    btn.textContent = 'Show';
  }
}

function copyMessengerToken() {
  const token = getMessengerToken();
  if (!token) return;
  navigator.clipboard.writeText(token).then(() => {
    showNotification('Token copied — clipboard will clear in 60s', 'success');
    clearTimeout(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
    }, 60000);
  }).catch(() => {
    showNotification('Could not access clipboard', 'error');
  });
}

function regenerateMessengerToken() {
  generateMessengerToken();
  pushContextToGateway();
  showNotification('Token regenerated — update your bot config with the new token', 'success');
  const el = document.getElementById('messenger-section');
  if (el) el.innerHTML = renderMessengerSection();
}

Object.assign(window, { toggleSync, toggleMnemonicVisibility, copyMnemonic, openRestoreMnemonicDialog, closeRestoreMnemonicDialog, confirmRestoreMnemonic, saveSyncRelay, closeSyncSetup, syncSetupNew, syncSetupRestore, syncSetupBack, syncSetupDoRestore, syncSetupDone, showSyncSetupModal, toggleMessenger, toggleMessengerToken, copyMessengerToken, regenerateMessengerToken });


export function renderDataEntriesSection() {
  const entries = (state.importedData && state.importedData.entries) ? state.importedData.entries : [];
  if (entries.length === 0) {
    return '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No data yet. Drop a PDF or JSON file on the dashboard, or add values manually.</div>';
  }
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const manualValues = state.importedData.manualValues || {};
  let html = '';
  for (const entry of sorted) {
    const d = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const cnt = Object.keys(entry.markers).length;
    const entryMarkerKeys = Object.keys(entry.markers);
    const manualCount = entryMarkerKeys.filter(k => manualValues[k + ':' + entry.date]).length;
    const isFullyManual = !entry.importedWith && manualCount === cnt;
    const files = entry.sourceFiles || (entry.sourceFile ? [entry.sourceFile] : []);
    const fileLabel = files.length > 0
      ? `<span style="color:var(--text-muted);margin-left:8px;font-size:11px;border-bottom:1px dashed var(--text-muted);cursor:help" title="${escapeAttr(files.join('\n'))}">${files.length === 1 ? escapeHTML(files[0].length > 30 ? files[0].slice(0, 27) + '...' : files[0]) : files.length + ' files'}</span>`
      : '';
    const sourceLabel = isFullyManual
      ? '<span style="color:var(--accent);margin-left:8px;font-size:11px">manual entry</span>'
      : entry.importedWith?.modelId
        ? `<span style="color:var(--text-muted);margin-left:8px;font-size:11px">${escapeHTML(entry.importedWith.modelId)}</span>`
        : manualCount > 0
          ? `<span style="color:var(--text-muted);margin-left:8px;font-size:11px">${manualCount} manual</span>`
          : '';
    html += `<div class="imported-entry">
      <span class="ie-info"><span class="ie-date">${d}</span><span class="ie-count">${cnt} markers</span>${fileLabel}${sourceLabel}</span>
      <div class="ie-actions">
        <button class="ie-remove" onclick="removeImportedEntry('${entry.date}');refreshDataEntriesSection()">Remove</button>
      </div>
    </div>`;
  }
  html += `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
    <button class="import-btn import-btn-secondary" onclick="exportClientJSON(window.getActiveProfileId())">Export Client</button>
    <button class="import-btn import-btn-secondary" onclick="exportAllDataJSON()" title="Full backup — all profiles, data, and chat history">Export All Clients</button>
    <button class="import-btn import-btn-secondary" onclick="exportPDFReport()">Export Report</button>
    <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="clearAllData()">Clear All Data</button></div>`;
  return html;
}

export function refreshDataEntriesSection() {
  const el = document.getElementById('data-entries-section');
  if (el) el.innerHTML = renderDataEntriesSection();
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function renderAIUsageSection() {
  const pu = getProfileUsage(state.currentProfile);
  const gu = getGlobalUsage();
  const profileName = state.profiles?.[state.currentProfile]?.name || 'Current profile';
  let html = '<div style="font-size:13px;color:var(--text-secondary);line-height:2">';
  html += `<div><strong>${escapeHTML(profileName)}</strong>: ${formatCost(pu.totalCost)} · ${pu.requestCount} request${pu.requestCount !== 1 ? 's' : ''} · ${formatTokens(pu.totalInputTokens + pu.totalOutputTokens)} tokens</div>`;
  html += `<div><strong>All profiles</strong>: ${formatCost(gu.totalCost)} · ${gu.requestCount} request${gu.requestCount !== 1 ? 's' : ''} · ${formatTokens(gu.totalInputTokens + gu.totalOutputTokens)} tokens</div>`;
  html += '</div>';
  if (pu.requestCount > 0) {
    html += `<button class="import-btn import-btn-secondary" style="margin-top:8px;font-size:11px" onclick="resetCurrentProfileUsage()">Reset profile usage</button>`;
  }
  return html;
}

function resetCurrentProfileUsage() {
  resetProfileUsage(state.currentProfile);
  const el = document.getElementById('ai-usage-section');
  if (el) el.innerHTML = renderAIUsageSection();
}

// Disable confirmation for the PII review toggle. On→off shows a one-time
// warning so users don't silently lose visibility into what's leaving their
// device. On→on (re-enabling) and the initial setup are silent.
export function confirmDisablePIIReview(checkbox) {
  if (checkbox.checked) {
    setPIIReviewEnabled(true);
    return;
  }
  // Going from on → off: warn unless they've explicitly dismissed before
  const acknowledged = localStorage.getItem('labcharts-pii-review-disable-ack') === '1';
  if (acknowledged) {
    setPIIReviewEnabled(false);
    return;
  }
  // Restore the toggle while the dialog is open; commit only on confirm
  checkbox.checked = true;
  showConfirmDialog(
    "Turn off the obfuscation review?\n\nWith this off, getbased's PII detector runs but you won't see the result before it's sent to the AI provider. Recommended only after you've verified the obfuscation works on your data.",
    () => {
      localStorage.setItem('labcharts-pii-review-disable-ack', '1');
      setPIIReviewEnabled(false);
      checkbox.checked = false;
    }
  );
}

Object.assign(window, {
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  renderPrivacySection,
  togglePrivacyConfigure,
  toggleOllamaPII,
  confirmDisablePIIReview,
  updatePrivacyStatusCard,
  updateSettingsUI,
  renderDataEntriesSection,
  refreshDataEntriesSection,
  resetCurrentProfileUsage,
});
