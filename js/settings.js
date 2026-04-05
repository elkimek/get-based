// settings.js — Settings modal (profile, display, AI provider, privacy)

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, isDebugMode, setDebugMode, isPIIReviewEnabled, setPIIReviewEnabled } from './utils.js';
import { getTheme, setTheme, getTimeFormat, setTimeFormat } from './theme.js';
import { formatCost, getProfileUsage, getGlobalUsage, resetProfileUsage } from './schema.js';
import { getVeniceKey, saveVeniceKey, getOpenRouterKey, saveOpenRouterKey, getAIProvider, setAIProvider, getVeniceModel, setVeniceModel, getOpenRouterModel, setOpenRouterModel, getOllamaMainModel, setOllamaMainModel, getOllamaPIIModel, setOllamaPIIModel, getOllamaPIIUrl, setOllamaPIIUrl, validateVeniceKey, validateOpenRouterKey, fetchVeniceModels, fetchOpenRouterModels, renderModelPricingHint, isRecommendedModel, getVeniceModelDisplay, getOpenRouterModelDisplay, fetchOpenRouterModelPricing, getOpenRouterBalance, getVeniceBalance, getRoutstrBalance, createRoutstrAccount, createRoutstrLightningInvoice, checkRoutstrInvoiceStatus, topupRoutstrCashu, isAIPaused, setAIPaused, isE2EEModel, isVeniceE2EEActive, getVeniceE2EE, setVeniceE2EE } from './api.js';
import { getOllamaConfig, checkOllama, checkOpenAICompatible, saveOllamaConfig, isOllamaPIIEnabled, setOllamaPIIEnabled } from './pii.js';
import { detectHardware, assessModel, assessFitness, getBestModel, getUpgradeSuggestion, saveHardwareOverride, getHardwareOverride } from './hardware.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots, updateKeyCache } from './crypto.js';
import { isSyncEnabled, enableSync, disableSync, getMnemonic, restoreFromMnemonic, getSyncRelay, setSyncRelay, checkRelayConnection, isMessengerEnabled, getMessengerToken, generateMessengerToken, revokeMessengerToken, pushContextToGateway } from './sync.js';


// ═══════════════════════════════════════════════
// MODEL DROPDOWN HELPER
// ═══════════════════════════════════════════════
function buildModelOptions(provider, models, currentModel, labelFn) {
  const rec = models.filter(function(m) { return isRecommendedModel(provider, m.id); });
  const rest = models.filter(function(m) { return !isRecommendedModel(provider, m.id); });
  let html = '';
  if (rec.length) {
    html += '<optgroup label="\u2605 Recommended for medical analysis">';
    html += rec.map(function(m) { return '<option value="' + m.id + '"' + (currentModel === m.id ? ' selected' : '') + '>' + escapeHTML(labelFn(m)) + '</option>'; }).join('');
    html += '</optgroup>';
  }
  if (rest.length) {
    html += (rec.length ? '<optgroup label="Other models">' : '');
    html += rest.map(function(m) { return '<option value="' + m.id + '"' + (currentModel === m.id ? ' selected' : '') + '>' + escapeHTML(labelFn(m)) + '</option>'; }).join('');
    if (rec.length) html += '</optgroup>';
  }
  return html;
}

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
  if (tab) _activeSettingsTab = tab;

  modal.innerHTML = `
    <button class="modal-close" onclick="closeSettingsModal()">&times;</button>
    <h3>Settings</h3>

    <div class="settings-tabs-bar">
      <button class="settings-tab-btn${_activeSettingsTab === 'display' ? ' active' : ''}" data-tab="display" onclick="switchSettingsTab('display')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        Display
      </button>
      <button class="settings-tab-btn${_activeSettingsTab === 'ai' ? ' active' : ''}" data-tab="ai" onclick="switchSettingsTab('ai')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>
        AI
      </button>
      <button class="settings-tab-btn${_activeSettingsTab === 'data' ? ' active' : ''}" data-tab="data" onclick="switchSettingsTab('data')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Data
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
        <button class="settings-link-btn" onclick="closeSettingsModal();setTimeout(()=>openGlossary(),300)">Marker Glossary</button>
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
          <button class="ai-provider-btn${provider === 'routstr' ? ' active' : ''}" data-provider="routstr" onclick="switchAIProvider('routstr')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10h-2V8H9V6h2V4h2v2h2v2h-2v2zm-2 4h2v6h3l-4 4-4-4h3v-6z"/></svg> Routstr</button>
          <button class="ai-provider-btn${provider === 'openrouter' ? ' active' : ''}" data-provider="openrouter" onclick="switchAIProvider('openrouter')"><svg class="ai-provider-logo" viewBox="0 0 512 512" fill="currentColor" stroke="currentColor"><path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" stroke-width="90" fill="none"/><path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" stroke="none"/><path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" stroke-width="90" fill="none"/><path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" stroke="none"/></svg> OpenRouter</button>
          <button class="ai-provider-btn${provider === 'venice' ? ' active' : ''}" data-provider="venice" onclick="switchAIProvider('venice')"><svg class="ai-provider-logo" viewBox="0 0 326 366" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M105.481 245.984C99.4744 241.518 92.2244 237.777 84.2074 235.504C76.1903 233.231 67.406 232.427 58.8167 233.38C50.2272 234.332 41.8327 237.042 34.5086 241.017C27.1847 244.991 20.931 250.231 16.0487 255.905C11.1531 261.567 6.88803 268.522 4.0314 276.35C1.17477 284.178-0.273403 292.879 0.0448796 301.515C0.36299 310.152 2.44756 318.723 5.87231 326.319C9.29724 333.916 14.0625 340.538 19.3617 345.825C24.6482 351.124 31.2704 355.889 38.867 359.314C46.4637 362.739 55.0349 364.823 63.671 365.142C72.3073 365.46 81.0085 364.012 88.8366 361.155C96.6647 358.298 103.62 354.033 109.282 349.138C114.956 344.256 120.195 338.002 124.17 330.678C128.144 323.354 130.854 314.959 131.807 306.37C132.76 297.781 131.956 288.996 129.683 280.979C127.41 272.962 123.668 265.712 119.203 259.705L133.953 244.954L144.69 255.691H150.789L158.149 248.331V242.233L147.412 231.496L163 215.908L178.588 231.496L167.851 242.233V248.331L175.211 255.691H181.31L192.047 244.954L206.797 259.705C202.332 265.712 198.59 272.962 196.317 280.979C194.044 288.996 193.24 297.781 194.193 306.37C195.146 314.959 197.856 323.354 201.83 330.678C205.805 338.002 211.044 344.256 216.718 349.138C222.38 354.033 229.335 358.298 237.163 361.155C244.991 364.012 253.693 365.46 262.329 365.142C270.965 364.823 279.536 362.739 287.133 359.314C294.73 355.889 301.352 351.124 306.638 345.825C311.937 340.538 316.703 333.916 320.128 326.319C323.552 318.723 325.637 310.152 325.955 301.515C326.273 292.879 324.825 284.178 321.969 276.35C319.112 268.522 314.847 261.567 309.951 255.905C305.069 250.231 298.815 244.991 291.491 241.017C284.167 237.042 275.773 234.332 267.183 233.38C258.594 232.427 249.81 233.231 241.793 235.504C233.776 237.777 226.526 241.518 220.519 245.984L206.042 231.484L216.773 220.753V214.655L209.151 207.032H203.052L192.315 217.769L176.721 202.186L258.473 120.434L291.567 153.528V119.095H326L292.907 86.0012L326 52.9077V46.8095L318.377 39.1865H312.279L163 188.465L13.7212 39.1865H7.62295L0 46.8095V52.9077L33.0934 86.0012L0 119.095H34.4331V153.528L67.5263 120.434L149.279 202.186L133.685 217.769L122.948 207.032H116.849L109.226 214.655V220.753L119.958 231.484L105.481 245.984ZM238.144 321.715C234.778 328.62 235.477 338.188 239.811 344.531C243.793 351.1 252.216 355.693 259.895 355.484C267.574 355.693 275.997 351.1 279.979 344.531C284.313 338.188 285.012 328.62 281.646 321.715L282.484 320.812C289.389 324.196 298.971 323.511 305.324 319.178C311.904 315.2 316.508 306.768 316.297 299.081C316.508 291.395 311.904 282.963 305.324 278.984C298.971 274.652 289.389 273.966 282.484 277.351L281.646 276.448C285.012 269.543 284.313 259.974 279.979 253.632C275.997 247.063 267.574 242.469 259.895 242.679C252.216 242.469 243.793 247.063 239.811 253.632C235.477 259.974 234.778 269.543 238.144 276.448L237.306 277.351C230.401 273.966 220.818 274.652 214.466 278.984C207.886 282.963 203.282 291.395 203.492 299.081C203.282 306.768 207.886 315.2 214.466 319.178C220.818 323.511 230.401 324.196 237.306 320.812L238.144 321.715ZM86.1857 344.531C90.52 338.188 91.2191 328.62 87.8528 321.715L88.6913 320.812C95.5956 324.196 105.178 323.511 111.531 319.178C118.11 315.2 122.715 306.768 122.504 299.081C122.715 291.395 118.11 282.963 111.531 278.984C105.178 274.652 95.5956 273.966 88.6913 277.351L87.8528 276.448C91.2191 269.543 90.52 259.974 86.1857 253.632C82.2037 247.063 73.7808 242.469 66.1018 242.679C58.423 242.469 50.0001 247.063 46.0181 253.632C41.6839 259.974 40.9847 269.543 44.351 276.448L43.5126 277.351C36.6082 273.966 27.0255 274.652 20.6731 278.984C14.0932 282.963 9.48904 291.395 9.69934 299.081C9.48904 306.768 14.0932 315.2 20.6731 319.178C27.0255 323.511 36.6082 324.196 43.5126 320.812L44.351 321.715C40.9847 328.62 41.6839 338.188 46.0181 344.531C50.0001 351.1 58.423 355.693 66.1018 355.484C73.7808 355.693 82.2037 351.1 86.1857 344.531Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M162.891 39.1864L202.078 0L221.482 19.4047V84.8147L167.742 138.555H158.04L104.3 84.8147V19.4047L123.705 0L162.891 39.1864ZM123.705 13.7213L158.04 48.0567V111.112L123.705 76.7773V13.7213ZM167.744 48.0567L202.079 13.7213V76.7773L167.744 111.112V48.0567Z"/></svg> Venice</button>
          <button class="ai-provider-btn${provider === 'ollama' ? ' active' : ''}" data-provider="ollama" onclick="switchAIProvider('ollama')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-3-8c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1s1 .45 1 1v2c0 .55-.45 1-1 1z"/></svg> Local</button>
        </div>
        <div id="ai-provider-panel">${renderAIProviderPanel(provider)}</div>
      </div>

      <div class="settings-group-title">PDF Import Privacy</div>

      <div class="settings-section" id="privacy-section">
        ${renderPrivacySection()}
      </div>

      <div class="settings-group-title">AI Usage</div>

      <div class="settings-section" id="ai-usage-section">
        ${renderAIUsageSection()}
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

      <div class="settings-group-title">Agent Access</div>

      <div class="settings-section" id="messenger-section">
        ${renderMessengerSection()}
      </div>

      <div class="settings-group-title">Backup &amp; Restore</div>

      <div class="settings-section" id="backup-section">
        ${renderBackupSection()}
      </div>

      <div class="settings-group-title">Imported Data</div>

      <div class="settings-section" id="data-entries-section">
        ${renderDataEntriesSection()}
      </div>
    </div>`;
  overlay.classList.add('show');
  initSettingsOllamaCheck();
  initSettingsModelFetch();
  loadBackupSnapshots();
  loadSettingsCommitHash();
  if (isSyncEnabled()) { loadMnemonic(); updateRelayStatus(); }
}

function loadSettingsCommitHash() {
  const el = document.getElementById('settings-commit-hash');
  if (!el) return;
  fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
    .then(r => r.ok ? r.text() : Promise.reject())
    .then(sha => { const short = sha.slice(0, 7); const e = document.getElementById('settings-commit-hash'); if (e) e.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${short}" target="_blank" rel="noopener" style="color:var(--text-muted);text-decoration:none">${short}</a>`; })
    .catch(() => { const e = document.getElementById('settings-commit-hash'); if (e) e.textContent = ''; });
}

export function switchSettingsTab(tabId) {
  _activeSettingsTab = tabId;
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  modal.querySelectorAll('.settings-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tabPanel === tabId);
  });
  // Re-run init for tabs that need async setup
  if (tabId === 'ai') {
    initSettingsOllamaCheck();
    initSettingsModelFetch();
  }
  if (tabId === 'data') {
    refreshDataEntriesSection();
    loadBackupSnapshots();
  }
}

export function renderAIProviderPanel(provider) {
  if (provider === 'openrouter') {
    const currentKey = getOpenRouterKey();
    const orModel = getOpenRouterModel();
    let cachedORModels = []; try { cachedORModels = JSON.parse(localStorage.getItem('labcharts-openrouter-models') || '[]'); } catch(e) {}
    let orModelHtml;
    if (cachedORModels.length > 0) {
      const opts = buildModelOptions('openrouter', cachedORModels, orModel, function(m) { return m.name || m.id; });
      const isCustom = !cachedORModels.some(m => m.id === orModel);
      orModelHtml = `<div style="margin-top:12px" id="openrouter-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="openrouter-model-select" style="margin-top:4px" onchange="onOpenRouterDropdownChange(this.value)">${isCustom ? '<option value="__custom" disabled selected>Using custom model</option>' : ''}${opts}</select>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" id="openrouter-custom-model" placeholder="Or type any model ID and press Enter" style="font-size:11px;flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);font-family:monospace${isCustom ? ';border-color:var(--accent)' : ''}" value="${isCustom ? escapeHTML(orModel) : ''}" onkeydown="if(event.key==='Enter'){applyCustomOpenRouterModel(this.value)}"><span id="openrouter-model-health" style="font-size:14px;min-width:18px;text-align:center"></span></div>
        <div id="openrouter-model-pricing" style="margin-top:4px">${renderModelPricingHint('openrouter', orModel)}</div>
      </div>`;
    } else {
      orModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="openrouter-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getOpenRouterModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
    }
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">API marketplace routing to 200+ models (Claude, GPT, Llama, Gemini, and more). Pay-per-use with a single key.</div>
      ${currentKey ? '' : '<button class="or-oauth-btn" onclick="startOpenRouterOAuth()">Connect with OpenRouter</button><div class="or-oauth-divider"><span>or enter key manually</span></div>'}
      <div class="api-key-status" id="openrouter-key-status">
        ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
      </div>
      <input type="password" class="api-key-input" id="openrouter-key-input" placeholder="sk-or-..." value="${escapeAttr(currentKey)}">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="import-btn import-btn-primary" id="save-openrouter-key-btn" onclick="handleSaveOpenRouterKey()">Save & Validate</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveOpenRouterKey()">Remove Key</button>' : ''}
      </div>
      ${currentKey ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted)"><span id="or-balance">Balance: loading...</span> <a href="#" onclick="refreshOpenRouterBalance();return false" style="color:var(--accent);font-size:11px;text-decoration:none">\u21bb</a></div>` : ''}
      ${orModelHtml}
      <div class="api-key-notice">Your key is stored locally and sent directly to OpenRouter. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style="color:var(--accent)">Get an API key</a> &middot; <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener" style="color:var(--accent)">Add credits</a></div>
    </div>`;
  }
  if (provider === 'routstr') {
    const currentKey = getRoutstrKey();
    const rsModel = getRoutstrModel();
    const nodeUrl = window.nostrGetSelectedNode ? window.nostrGetSelectedNode() : null;
    let cachedRSModels = []; try { cachedRSModels = JSON.parse(localStorage.getItem('labcharts-routstr-models') || '[]'); } catch(e) {}
    let rsModelHtml;
    if (cachedRSModels.length > 0) {
      const opts = buildModelOptions('routstr', cachedRSModels, rsModel, function(m) { return m.name || m.id; });
      rsModelHtml = `<div style="margin-top:12px" id="routstr-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="routstr-model-select" style="margin-top:4px" onchange="setRoutstrModel(this.value);updateRoutstrModelPricing(this.value)">${opts}</select>
        <div id="routstr-model-pricing" style="margin-top:4px">${renderModelPricingHint('routstr', rsModel)}</div>
      </div>`;
    } else {
      rsModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="routstr-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getRoutstrModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(connect to a node to load models)</span>' : ''}</div>`;
    }
    // Wallet section
    const walletHtml = `<div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:12px;color:var(--text-muted)">Wallet: <span id="routstr-wallet-balance" style="color:var(--text-primary);font-weight:600">\u26a1 loading...</span></div>
        <div style="display:flex;gap:6px">
          <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px" onclick="showRoutstrWalletFund()">\u26a1 Fund</button>
          <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="showRoutstrWalletBackup()">Backup</button>
        </div>
      </div>
      <div id="routstr-wallet-fund-area" style="display:none"></div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px">5% on Cashu deposits supports getbased development</div>
    </div>`;
    // Node section
    const nodeLabel = nodeUrl ? escapeHTML(nodeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')) : 'none selected';
    const nodeHtml = `<div style="padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:12px;color:var(--text-muted)">Node: <span id="routstr-node-label" style="color:var(--text-primary)">${currentKey ? '<span style="color:var(--green)">\u2713 ' + nodeLabel + '</span>' : nodeLabel}</span></div>
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="showRoutstrNodePicker()">Browse</button>
      </div>
      ${currentKey ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Session: <span id="routstr-node-balance">loading...</span> <a href="#" onclick="refreshRoutstrBalance();return false" style="color:var(--accent);font-size:10px;text-decoration:none">\u21bb</a></div>' : ''}
      <div id="routstr-node-picker" style="display:none;max-height:250px;overflow-y:auto"></div>
    </div>`;
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Decentralized AI with Bitcoin. Fund your wallet, pick a node from the network.</div>
      ${walletHtml}
      ${nodeHtml}
      ${rsModelHtml}
      <div class="or-oauth-divider"><span>or enter existing session key</span></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="password" class="api-key-input" id="routstr-key-input" placeholder="sk-..." value="${escapeAttr(currentKey)}" style="flex:1">
        <button class="import-btn import-btn-primary" id="save-routstr-key-btn" style="white-space:nowrap" onclick="handleSaveRoutstrKey()">Save</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveRoutstrKey()">Remove</button>' : ''}
      </div>
      <div class="api-key-notice">Fund your wallet with Lightning, then connect to any <a href="https://routstr.com" target="_blank" rel="noopener" style="color:var(--accent)">Routstr</a> node on the network. Or paste a Cashu token or session key directly.</div>
    </div>`;
  }
  if (provider === 'venice') {
    const currentKey = getVeniceKey();
    const veniceModel = getVeniceModel();
    const e2eeOn = getVeniceE2EE();
    let cachedE2EEModels = []; try { cachedE2EEModels = JSON.parse(localStorage.getItem('labcharts-venice-e2ee-models') || '[]'); } catch(e) {}
    let cachedRegularModels = []; try { cachedRegularModels = JSON.parse(localStorage.getItem('labcharts-venice-models') || '[]'); } catch(e) {}
    const displayModels = e2eeOn && cachedE2EEModels.length ? cachedE2EEModels : cachedRegularModels;
    // If E2EE is on but no E2EE models cached, turn it off
    if (e2eeOn && !cachedE2EEModels.length) { setVeniceE2EE(false); }
    const hasE2EEModels = cachedE2EEModels.length > 0;
    let veniceModelHtml;
    if (displayModels.length > 0) {
      const opts = buildModelOptions('venice', displayModels, veniceModel, function(m) { return m.name || m.id; });
      veniceModelHtml = `<div style="margin-top:12px" id="venice-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="venice-model-select" style="margin-top:4px" onchange="setVeniceModel(this.value);updateVeniceModelPricing(this.value)">${opts}</select>
        <div id="venice-model-pricing" style="margin-top:4px">${renderModelPricingHint('venice', veniceModel)}</div>
      </div>
      ${hasE2EEModels ? `<div style="margin-top:12px;display:flex;align-items:center;gap:8px">
        <label class="toggle-switch" style="flex-shrink:0"><input type="checkbox" id="venice-e2ee-toggle" ${getVeniceE2EE() ? 'checked' : ''} onchange="toggleVeniceE2EE(this.checked)"><span class="toggle-slider"></span></label>
        <span style="font-size:13px">End-to-End Encryption</span>
      </div>
      <div id="venice-e2ee-indicator" style="margin-top:6px;font-size:12px;${isVeniceE2EEActive() ? '' : 'display:none'}"><span style="color:var(--green)">&#128274;</span> Prompts encrypted in your browser, decrypted only inside a verified TEE. Web search and image attachments are disabled.</div>` : ''}`;
    } else {
      veniceModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="venice-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getVeniceModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
    }
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Privacy-focused cloud AI. Uncensored models, no data stored. Requires API key.</div>
      <div class="api-key-status" id="venice-key-status">
        ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
      </div>
      <input type="password" class="api-key-input" id="venice-key-input" placeholder="venice-..." value="${escapeAttr(currentKey)}">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="import-btn import-btn-primary" id="save-venice-key-btn" onclick="handleSaveVeniceKey()">Save & Validate</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveVeniceKey()">Remove Key</button>' : ''}
      </div>
      ${currentKey ? '<div style="margin-top:8px;font-size:12px;color:var(--text-muted)"><span id="venice-balance">Balance: loading...</span> <a href="#" onclick="refreshVeniceBalance();return false" style="color:var(--accent);font-size:11px;text-decoration:none">\u21bb</a></div>' : ''}
      ${veniceModelHtml}
      <div class="api-key-notice">Your key is stored locally and sent directly to Venice AI. No data is stored on their servers. <a href="https://venice.ai/settings/api" target="_blank" rel="noopener" style="color:var(--accent)">Get an API key</a></div>
    </div>`;
  }
  if (provider === 'ppq') {
    const currentKey = getPpqKey();
    const ppqModel = getPpqModel();
    let cachedPpqModels = []; try { cachedPpqModels = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
    let ppqModelHtml;
    if (cachedPpqModels.length > 0) {
      const opts = buildModelOptions('ppq', cachedPpqModels, ppqModel, function(m) { return m.name || m.id; });
      ppqModelHtml = `<div style="margin-top:12px" id="ppq-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="ppq-model-select" style="margin-top:4px" onchange="setPpqModel(this.value);updatePpqModelPricing(this.value)">${opts}</select>
        <div id="ppq-model-pricing" style="margin-top:4px">${renderModelPricingHint('ppq', ppqModel)}</div>
      </div>`;
    } else {
      ppqModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="ppq-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getPpqModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
    }
    const balanceHtml = currentKey ? `<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
        <div style="font-size:12px;color:var(--text-muted)"><span id="ppq-balance">Balance: loading...</span> <a href="#" onclick="refreshPpqBalance();return false" style="color:var(--accent);font-size:11px;text-decoration:none">\u21bb</a></div>
        <button class="import-btn import-btn-secondary" id="ppq-topup-toggle" style="font-size:11px;padding:2px 10px" onclick="showPpqTopup()">Top Up</button>
      </div>
      <div id="ppq-topup-area" style="display:none"></div>` : '';
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Pay-per-query AI aggregator. 300+ models, no subscription, no KYC. Top up with crypto or <a href="https://www.bitrefill.com/gift-cards/ppq-us/" target="_blank" rel="noopener" style="color:var(--accent)">gift cards</a>.</div>
      ${currentKey ? '' : '<button class="import-btn import-btn-primary" style="width:100%;margin-bottom:8px" onclick="handleCreatePpqAccount()">Create Account (instant, no signup)</button><div class="or-oauth-divider"><span>or enter existing key</span></div>'}
      <div class="api-key-status" id="ppq-key-status">
        ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
      </div>
      <input type="password" class="api-key-input" id="ppq-key-input" placeholder="sk-..." value="${escapeAttr(currentKey)}">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="import-btn import-btn-primary" id="save-ppq-key-btn" onclick="handleSavePpqKey()">Save & Validate</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemovePpqKey()">Remove Key</button>' : ''}
      </div>
      ${balanceHtml}
      ${ppqModelHtml}
      <div class="api-key-notice">Your key is stored locally. No account data is shared with getbased. <a href="https://ppq.ai" target="_blank" rel="noopener" style="color:var(--accent)">ppq.ai</a></div>
    </div>`;
  }
  // Local AI panel — works with any OpenAI-compatible server (Ollama, LM Studio, Jan, etc.)
  const config = getOllamaConfig();
  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">Runs AI on your computer. Free, private, no data leaves your machine. Works with <a href="https://ollama.com" target="_blank" rel="noopener" style="color:var(--accent)">Ollama</a>, <a href="https://lmstudio.ai" target="_blank" rel="noopener" style="color:var(--accent)">LM Studio</a>, <a href="https://jan.ai" target="_blank" rel="noopener" style="color:var(--accent)">Jan</a>, llama.cpp, LocalAI, and others.</div>
    <div class="local-ai-status" id="local-ai-status">
      <span class="local-ai-status-dot" id="local-ai-dot"></span>
      <span id="local-ai-status-text">Checking connection...</span>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">Server address</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
        <input type="text" class="api-key-input" id="local-ai-url-input" value="${escapeAttr(config.url)}" placeholder="http://localhost:11434" style="flex:1">
        <button class="import-btn import-btn-secondary" onclick="testOllamaConnection()" style="white-space:nowrap">Test</button>
      </div>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">API Key <span style="font-size:11px">(optional — most local servers don't need one)</span></label>
      <input type="password" class="api-key-input" id="local-ai-apikey-input" value="${escapeAttr(config.apiKey)}" placeholder="Leave empty if not required" style="margin-top:4px">
    </div>
    <div id="local-ai-model-section" style="margin-top:8px;display:none">
      <label style="font-size:12px;color:var(--text-muted)">AI Model</label>
      <select class="api-key-input" id="local-ai-model-select" style="margin-top:4px" onchange="setOllamaMainModel(this.value); refreshModelAdvisor()"></select>
      <div style="margin-top:4px">${renderModelPricingHint('ollama', '')}</div>
    </div>
    <div id="local-ai-advisor"></div>
    <div class="api-key-notice" style="margin-top:12px">
      Connects via the OpenAI-compatible API (<code style="font-size:11px;padding:2px 4px;background:var(--bg-primary);border-radius:3px">/v1/chat/completions</code>). All major local servers support this, including Ollama.
    </div>
  </div>`;
}

export function renderPrivacySection() {
  const piiUrl = getOllamaPIIUrl();
  const piiEnabled = isOllamaPIIEnabled();
  return `<div class="local-ai-settings">
    <div class="ai-provider-desc" style="margin-bottom:10px">Before your lab PDF is sent to AI for analysis, personal information (name, date of birth, ID numbers, address) is detected and replaced with fake data. Only lab results and marker values reach the AI provider.</div>
    <div class="privacy-status-card" id="privacy-status-card">
      <div class="privacy-status-icon" id="privacy-status-icon">&#128274;</div>
      <div class="privacy-status-body">
        <div class="privacy-status-title" id="privacy-status-title">Checking...</div>
        <div class="privacy-status-detail" id="privacy-status-detail"></div>
      </div>
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin:12px 0">
      <span style="font-size:13px">Use local AI for privacy protection<br><span style="font-size:11px;color:var(--text-muted)">Requires a local AI server. When disabled, regex pattern matching is used instead</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="pii-local-toggle" ${piiEnabled ? 'checked' : ''} onchange="toggleOllamaPII(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-top:4px">
      <span style="font-size:13px">Review obfuscated text before sending to AI<br><span style="font-size:11px;color:var(--text-muted)">Pause after privacy protection to inspect what AI will receive</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="pii-review-toggle" ${isPIIReviewEnabled() ? 'checked' : ''} onchange="setPIIReviewEnabled(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px">
      <span style="font-size:13px">Show privacy details in import preview</span>
      <label class="toggle-switch">
        <input type="checkbox" id="debug-mode-toggle" ${isDebugMode() ? 'checked' : ''} onchange="setDebugMode(this.checked)">
        <span class="toggle-slider"></span>
      </label>
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

export function toggleAIPause(enabled) {
  setAIPaused(!enabled);
  showNotification(enabled ? 'AI features enabled' : 'AI features paused', 'info');
  // Refresh focus card — show cached content when paused, fetch new when enabled
  if (window.loadFocusCard) window.loadFocusCard();
}

export function switchAIProvider(provider) {
  setAIProvider(provider);
  // Clean up any running topup poll/countdown timers
  if (_ppqTopupPollTimer) { clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null; }
  if (_ppqCountdownTimer) { clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null; }
  if (_rsTopupPollTimer) { clearInterval(_rsTopupPollTimer); _rsTopupPollTimer = null; }
  if (_rsCountdownTimer) { clearInterval(_rsCountdownTimer); _rsCountdownTimer = null; }
  if (_rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel(provider);
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.querySelectorAll('.ai-provider-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.provider === provider));
  }
  initSettingsOllamaCheck();
  initSettingsModelFetch();
}

export function initSettingsModelFetch() {
  const orKey = getOpenRouterKey();
  if (orKey && document.getElementById('openrouter-model-area')) {
    fetchOpenRouterModels(orKey).then(function(models) { if (models.length) renderOpenRouterModelDropdown(models); });
    getOpenRouterBalance().then(function(b) {
      const el = document.getElementById('or-balance');
      if (el && b) el.innerHTML = _orBalanceHtml(b.remaining);
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
  const veniceKey = getVeniceKey();
  if (veniceKey && document.getElementById('venice-model-area')) {
    fetchVeniceModels(veniceKey).then(function() {
      // After fetch, render the right list based on E2EE state
      const listKey = getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
      let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch(e) {}
      if (models.length) renderVeniceModelDropdown(models);
    });
    getVeniceBalance().then(function(b) {
      const el = document.getElementById('venice-balance');
      if (el && b) el.innerHTML = _veniceBalanceHtml(b);
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
  const rsKey = getRoutstrKey();
  if (rsKey && document.getElementById('routstr-model-area')) {
    fetchRoutstrModels(rsKey).then(function(models) { if (models.length) renderRoutstrModelDropdown(models); });
    getRoutstrBalance().then(function(b) {
      const el = document.getElementById('routstr-node-balance');
      if (el && b) el.innerHTML = _rsBalanceHtml(b.sats);
      else if (el) el.textContent = 'unavailable';
    });
  }
  // Cashu wallet balance (always, even without node connection)
  if (document.getElementById('routstr-wallet-balance') && window.cashuGetBalance) {
    window.cashuGetBalance().then(function(bal) {
      const el = document.getElementById('routstr-wallet-balance');
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    });
  }
  const ppqKey = getPpqKey();
  if (ppqKey && document.getElementById('ppq-model-area')) {
    fetchPpqModels(ppqKey).then(function(models) { if (models.length) renderPpqModelDropdown(models); });
    // Fetch balance
    getPpqBalance().then(function(balance) {
      const el = document.getElementById('ppq-balance');
      if (el && balance != null) {
        el.innerHTML = _ppqBalanceHtml(balance);
        // Auto-expand topup when balance is empty
        if (parseFloat(balance) === 0 && document.getElementById('ppq-topup-area')) showPpqTopup();
      }
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
}

export function initSettingsOllamaCheck() {
  const config = getOllamaConfig();
  const mainUrl = config.url;
  const piiUrl = getOllamaPIIUrl();
  const sameUrl = mainUrl === piiUrl;

  // Check local server if the panel is visible (Local provider selected)
  if (document.getElementById('local-ai-dot')) {
    // Call both endpoints in parallel — OpenAI-compatible for model list, Ollama-native for model details
    Promise.allSettled([
      checkOpenAICompatible(mainUrl, config.apiKey),
      checkOllama(mainUrl),
    ]).then(([openaiResult, ollamaResult]) => {
      const result = openaiResult.value || { available: false, models: [] };
      const ollama = ollamaResult.value || { available: false, models: [], modelDetails: [] };
      const dot = document.getElementById('local-ai-dot');
      const text = document.getElementById('local-ai-status-text');
      const modelSection = document.getElementById('local-ai-model-section');
      const modelSelect = document.getElementById('local-ai-model-select');
      if (!dot || !text) return;
      if (result.available && result.models.length > 0) {
        dot.classList.add('connected');
        let currentModel = getOllamaMainModel();
        if (!result.models.includes(currentModel)) {
          currentModel = result.models[0];
          setOllamaMainModel(currentModel);
        }
        text.textContent = `Connected (${currentModel})`;
        if (modelSection && modelSelect) {
          modelSection.style.display = 'block';
          modelSelect.innerHTML = result.models.map(m => `<option value="${escapeHTML(m)}" ${m === currentModel ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
        }
        // Render model advisor — prefer Ollama-native details (/api/tags has sizes),
        // fall back to OpenAI-compatible details (LM Studio, Jan, etc.)
        const isOllamaServer = ollama.available && ollama.modelDetails?.length > 0;
        const modelDetails = isOllamaServer
          ? ollama.modelDetails
          : (result.modelDetails || []);
        if (modelDetails.length > 0) {
          window._lastOllamaModelDetails = modelDetails;
          window._lastIsOllamaServer = isOllamaServer;
          renderModelAdvisor(modelDetails, modelSelect, isOllamaServer);
        }
      } else if (result.available) {
        dot.classList.add('disconnected');
        text.textContent = 'Connected but no models found. Load a model in your server.';
      } else {
        dot.classList.add('disconnected');
        text.textContent = 'Not connected — start your local server to use';
      }
      // Reuse result for privacy card if same URL
      if (sameUrl) {
        updatePrivacyStatusCard(result.available && result.models.length > 0);
      } else {
        updatePrivacyStatusCard();
      }
    });
  } else {
    // Main panel not visible — just update privacy card
    updatePrivacyStatusCard();
  }
}

function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch { return true; }
}

async function renderModelAdvisor(modelDetails, modelSelect, isOllama = false) {
  const advisorEl = document.getElementById('local-ai-advisor');
  if (!advisorEl) return;
  const serverUrl = getOllamaConfig().url;
  const isLocal = isLocalUrl(serverUrl);
  // Only auto-detect hardware for localhost — remote server GPU ≠ browser GPU
  const hw = isLocal
    ? await detectHardware()
    : { gpu: { name: null, vram: getHardwareOverride(), unified: false, renderer: null, source: getHardwareOverride() ? 'manual' : 'remote' }, ram: { gb: null, source: 'unknown' }, cpuThreads: null };
  const currentModel = getOllamaMainModel();

  // Find the best model for auto-selection hint
  const best = getBestModel(modelDetails, hw.gpu.vram ? hw : null);

  // Enhance model dropdown with size/quant labels, can-run badges, and fitness stars
  if (modelSelect) {
    const opts = Array.from(modelSelect.options);
    for (const opt of opts) {
      const detail = modelDetails.find(d => d.name === opt.value);
      if (!detail) continue;
      const sizeGb = detail.size ? (detail.size / 1e9).toFixed(1) + ' GB' : '';
      const quant = detail.quantLevel || '';
      const assess = hw.gpu.vram ? assessModel(detail, hw) : null;
      const dot = assess ? assess.badge + ' ' : '';
      const fitness = assessFitness(opt.value);
      const star = (fitness && fitness.tier === 'recommended') ? '\u2605 ' : '';
      const parts = [opt.value, sizeGb, quant].filter(Boolean);
      opt.textContent = dot + star + parts.join(' \u00B7 ');
    }
  }

  // Build advisor panel HTML
  const gpuLabel = !isLocal && !hw.gpu.vram
    ? 'Remote server \u2014 enter VRAM below to check model fit'
    : hw.gpu.vram
      ? `${escapeHTML(hw.gpu.name || 'Server')} \u2014 ${hw.gpu.vram} GB ${hw.gpu.unified ? 'unified memory' : 'VRAM'}${hw.gpu.source === 'manual' ? ' (manual)' : ''}`
      : hw.gpu.source === 'blocked' || hw.gpu.source === 'unavailable'
        ? 'GPU not detected'
        : hw.gpu.renderer
          ? `${escapeHTML(hw.gpu.renderer)} (VRAM unknown)`
          : 'GPU not detected';
  const ramLabel = hw.ram.gb ? `${hw.ram.gb} GB` : 'Unknown';
  const cpuLabel = hw.cpuThreads ? `${hw.cpuThreads} threads` : '';

  // Model rows — with fitness rating
  const fitnessLabel = { recommended: '\u2605 Recommended', capable: 'Capable', underpowered: 'Underpowered', inadequate: 'Inadequate' };
  const fitnessCss = { recommended: 'fitness-great', capable: 'fitness-good', underpowered: 'fitness-fair', inadequate: 'fitness-poor' };
  const rows = modelDetails.map(m => {
    const hasSize = m.size > 0;
    const assess = !hasSize ? { tier: 'unknown', badge: '?', label: 'Size unknown' }
      : hw.gpu.vram ? assessModel(m, hw) : { tier: 'unknown', badge: '?', vramNeeded: (m.size / 1e9) * 1.15, label: !isLocal ? 'Enter VRAM' : 'Set VRAM to check' };
    const fitness = assessFitness(m.name);
    const sizeLabel = hasSize ? `${(m.size / 1e9).toFixed(1)} GB` : '';
    const isActive = m.name === currentModel;
    const isBest = best && m.name === best.name;
    return `<div class="model-advisor-row${isActive ? ' active' : ''}">
      <span class="model-advisor-badge model-advisor-verdict ${assess.tier}">${assess.badge}</span>
      <span class="model-advisor-name">${escapeHTML(m.name)}${isActive ? ' <span style="font-size:10px;opacity:0.6">\u2190 active</span>' : ''}${isBest && !isActive ? ' <span style="font-size:10px;opacity:0.6">\u2190 best pick</span>' : ''}</span>
      <span class="model-advisor-size">${sizeLabel}${m.quantLevel ? ' \u00B7 ' + escapeHTML(m.quantLevel) : ''}${m.paramSize ? ' \u00B7 ' + escapeHTML(m.paramSize) : ''}</span>
      ${fitness ? `<span class="model-advisor-fitness ${fitnessCss[fitness.tier]}" title="${escapeAttr(fitness.note)}">${fitnessLabel[fitness.tier]}</span>` : '<span class="model-advisor-fitness" style="opacity:0.4">Unknown</span>'}
      <span class="model-advisor-verdict ${assess.tier}">${escapeHTML(assess.label)}</span>
    </div>`;
  }).join('');

  // Upgrade suggestion — only show ollama pull command for Ollama servers
  const upgrade = getUpgradeSuggestion(modelDetails, hw.gpu.vram ? hw : null);
  const suggestHtml = upgrade ? `
    <div class="model-advisor-suggest">
      <div class="model-advisor-suggest-title">Upgrade recommendation</div>
      ${isOllama ? `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">ollama pull ${escapeHTML(upgrade.model)}</code>
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" onclick="copyOllamaPullCmd('ollama pull ${escapeAttr(upgrade.model)}')">Copy</button>
      </div>` : `<div class="model-advisor-pull-row">
        <code class="model-advisor-pull-cmd">${escapeHTML(upgrade.model)}</code>
      </div>`}
      <div class="model-advisor-pull-why">${escapeHTML(upgrade.note)}</div>
    </div>` : '';

  // VRAM override section — open by default for remote servers without override
  const overrideVal = getHardwareOverride();
  const overrideOpen = (!isLocal && !overrideVal) ? 'flex' : 'none';
  const overrideLabel = isLocal ? 'Override VRAM' : 'Server VRAM';
  const overrideHtml = `
    <div class="model-advisor-override">
      <div class="model-advisor-override-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'">
        \u25B8 ${overrideLabel}${overrideVal ? ` (${overrideVal} GB)` : ''}
      </div>
      <div class="model-advisor-override-body" style="display:${overrideOpen}">
        <input type="number" id="hw-vram-override-input" placeholder="${hw.gpu.vram || 'GB'}" value="${overrideVal || ''}" min="1" max="256" step="1">
        <span style="font-size:12px;color:var(--text-muted)">GB</span>
        <button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" onclick="applyHardwareOverride(document.getElementById('hw-vram-override-input').value)">Apply</button>
        ${overrideVal ? '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 8px" onclick="clearHardwareOverride()">Reset</button>' : ''}
      </div>
    </div>`;

  advisorEl.innerHTML = `
    <div class="model-advisor">
      <div class="model-advisor-hw">
        <span class="model-advisor-hw-chip">${isLocal ? '\uD83C\uDFAE' : '\uD83C\uDF10'} ${gpuLabel}</span>
        ${isLocal && hw.ram.gb ? `<span class="model-advisor-hw-chip">\uD83D\uDDA5\uFE0F ${ramLabel} RAM</span>` : ''}
        ${isLocal && cpuLabel ? `<span class="model-advisor-hw-chip">\u2699\uFE0F ${cpuLabel}</span>` : ''}
      </div>
      ${rows}
      ${suggestHtml}
      ${overrideHtml}
    </div>`;
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
  // Clean up any running topup poll/countdown timers
  if (_ppqTopupPollTimer) { clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null; }
  if (_ppqCountdownTimer) { clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null; }
  if (_rsTopupPollTimer) { clearInterval(_rsTopupPollTimer); _rsTopupPollTimer = null; }
  if (_rsCountdownTimer) { clearInterval(_rsCountdownTimer); _rsCountdownTimer = null; }
  if (_rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
}

/** After a successful key save, auto-close settings and return to chat if we came from onboarding. */
function _returnToChatIfOnboarding() {
  if (window._settingsHadProvider) return; // already had a provider — user is just reconfiguring
  if (!window.hasAIProvider?.()) return;
  closeSettingsModal();
  setTimeout(() => window.openChatPanel?.(), 300);
}

function isHttpsToNonLocalhost(url) {
  if (location.protocol !== 'https:') return false;
  try {
    const host = new URL(url).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch { return false; }
}

function isCORSError(e) {
  if (e instanceof TypeError) return true;
  const m = e.message || '';
  return m.includes('Failed to fetch') || m.includes('Load failed') || m.includes('NetworkError');
}

function getCORSHelpText() {
  const ua = navigator.userAgent || '';
  const isMac = /Mac/i.test(ua);
  const isWin = /Win/i.test(ua);
  if (isMac) return 'Blocked by CORS — Ollama: run launchctl setenv OLLAMA_ORIGINS "*" and restart. LM Studio: Settings → Enable CORS';
  if (isWin) return 'Blocked by CORS — Ollama: set OLLAMA_ORIGINS=* as system env var and restart. LM Studio: Settings → Enable CORS';
  return 'Blocked by CORS — Ollama: OLLAMA_ORIGINS=* ollama serve. LM Studio: Settings → Enable CORS';
}

export async function testOllamaConnection() {
  const urlInput = document.getElementById('local-ai-url-input');
  const dot = document.getElementById('local-ai-dot');
  const text = document.getElementById('local-ai-status-text');
  const modelSection = document.getElementById('local-ai-model-section');
  const modelSelect = document.getElementById('local-ai-model-select');
  if (!urlInput || !text) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const config = getOllamaConfig();
  const apiKeyInput = document.getElementById('local-ai-apikey-input');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  text.textContent = 'Testing...';
  dot.className = 'local-ai-status-dot';
  if (isHttpsToNonLocalhost(url)) {
    dot.classList.add('disconnected');
    text.textContent = 'Cannot reach LAN servers from HTTPS — Local AI must run on this machine (localhost)';
    return;
  }
  try {
    // Pre-flight CORS check — fetch a lightweight endpoint to detect CORS before check functions swallow the error
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}) }); }
    catch (preErr) { if (isCORSError(preErr)) { dot.classList.add('disconnected'); text.textContent = getCORSHelpText(); return; } }
    const [result, ollamaResult] = await Promise.all([
      checkOpenAICompatible(url, apiKey),
      checkOllama(url).catch(() => ({ available: false, models: [], modelDetails: [] })),
    ]);
    if (!result.available) throw new Error('Not reachable');
    const models = result.models;
    if (models.length === 0) {
      dot.classList.add('disconnected');
      text.textContent = 'Connected but no models found. Load a model in your server.';
    } else {
      dot.classList.add('connected');
      await saveOllamaConfig({ ...config, url, model: models[0], apiKey });
      if (!localStorage.getItem('labcharts-ollama-model')) setOllamaMainModel(models[0]);
      text.textContent = `Connected (${getOllamaMainModel()})`;
      if (modelSection && modelSelect) {
        const currentModel = getOllamaMainModel();
        modelSection.style.display = 'block';
        modelSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentModel ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
      }
      // Render model advisor — prefer Ollama-native, fall back to OpenAI-compatible
      const isOllamaServer = ollamaResult.available && ollamaResult.modelDetails?.length > 0;
      const modelDetails = isOllamaServer
        ? ollamaResult.modelDetails
        : (result.modelDetails || []);
      if (modelDetails.length > 0 && modelSection && modelSelect) {
        window._lastOllamaModelDetails = modelDetails;
        window._lastIsOllamaServer = isOllamaServer;
        renderModelAdvisor(modelDetails, modelSelect, isOllamaServer);
      }
    }
    // Also refresh privacy section status
    updatePrivacyStatusCard();
    _returnToChatIfOnboarding();
  } catch (e) {
    dot.classList.add('disconnected');
    text.textContent = isCORSError(e) ? getCORSHelpText() : 'Not connected — check URL and ensure your server is running';
  }
}

export async function testPIIOllamaConnection() {
  const urlInput = document.getElementById('pii-local-url-input');
  const dot = document.getElementById('pii-local-dot');
  const text = document.getElementById('pii-local-status-text');
  const piiDropdown = document.getElementById('pii-model-dropdown');
  const piiSelect = document.getElementById('pii-model-select');
  if (!urlInput || !text) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const config = getOllamaConfig();
  text.textContent = 'Testing...';
  dot.className = 'local-ai-status-dot';
  if (isHttpsToNonLocalhost(url)) {
    dot.classList.add('disconnected');
    text.textContent = 'Cannot reach LAN servers from HTTPS — Local AI must run on this machine (localhost)';
    return;
  }
  try {
    try { await fetch(`${url}/v1/models`, { method: 'HEAD', signal: AbortSignal.timeout(3000), ...(config.apiKey ? { headers: { Authorization: `Bearer ${config.apiKey}` } } : {}) }); }
    catch (preErr) { if (isCORSError(preErr)) { dot.classList.add('disconnected'); text.textContent = getCORSHelpText(); return; } }
    const result = await checkOpenAICompatible(url, config.apiKey);
    if (!result.available) throw new Error('Not reachable');
    const models = result.models;
    if (models.length === 0) {
      dot.classList.add('disconnected');
      text.textContent = 'Connected but no models found';
    } else {
      dot.classList.add('connected');
      setOllamaPIIUrl(url);
      setOllamaPIIEnabled(true);
      const toggle = document.getElementById('pii-local-toggle');
      if (toggle) toggle.checked = true;
      let currentPII = getOllamaPIIModel();
      if (!models.includes(currentPII)) { currentPII = models[0]; setOllamaPIIModel(currentPII); }
      text.textContent = `Connected — using ${currentPII}`;
      if (piiDropdown && piiSelect) {
        piiDropdown.style.display = 'block';
        piiSelect.innerHTML = models.map(m => `<option value="${escapeHTML(m)}" ${m === currentPII ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
      }
    }
    updatePrivacyStatusCard();
  } catch (e) {
    dot.classList.add('disconnected');
    text.textContent = isCORSError(e) ? getCORSHelpText() : 'Not connected — check URL and ensure your server is running';
    updatePrivacyStatusCard();
  }
}

function _veniceBalanceHtml(b) {
  if (b.diem != null) {
    const v = parseFloat(b.diem); // 1 DIEM = 1 USD
    const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
    return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
  }
  return 'Balance: <span style="color:' + (b.canConsume ? 'var(--green)' : 'var(--red)') + '">' + (b.canConsume ? 'Active' : 'No balance') + '</span>';
}
export function refreshVeniceBalance() {
  const el = document.getElementById('venice-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getVeniceBalance().then(function(b) {
    if (el && b) el.innerHTML = _veniceBalanceHtml(b);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}
export function updateVeniceModelPricing(modelId) {
  const el = document.getElementById('venice-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('venice', modelId || getVeniceModel());
}

export async function handleSaveVeniceKey() {
  const input = document.getElementById('venice-key-input');
  const btn = document.getElementById('save-venice-key-btn');
  const status = document.getElementById('venice-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateVeniceKey(key);
  if (result.valid) {
    await saveVeniceKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models…</span>';
    await fetchVeniceModels(key);
    // Render the right list based on E2EE state
    const listKey = getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
    let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch(e) {}
    if (models.length) {
      renderVeniceModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('Venice API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveVeniceKey() {
  localStorage.removeItem('labcharts-venice-key');
  updateKeyCache('labcharts-venice-key', null);
  localStorage.removeItem('labcharts-venice-models');
  localStorage.removeItem('labcharts-venice-model');
  localStorage.removeItem('labcharts-venice-e2ee');
  localStorage.removeItem('labcharts-venice-e2ee-models');
  localStorage.removeItem('labcharts-venice-model-regular');
  localStorage.removeItem('labcharts-venice-model-e2ee');
  window.clearE2EESession?.();
  showNotification('Venice API key removed', 'info');
  openSettingsModal();
}

export function renderVeniceModelDropdown(models) {
  const area = document.getElementById('venice-model-area');
  if (!area || !models.length) return;
  const currentModel = getVeniceModel();
  const opts = buildModelOptions('venice', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="venice-model-select" style="margin-top:4px" onchange="setVeniceModel(this.value);updateVeniceModelPricing(this.value)">' + opts + '</select>' +
    '<div id="venice-model-pricing" style="margin-top:4px">' + renderModelPricingHint('venice', currentModel) + '</div>';
}

export function toggleVeniceE2EE(on) {
  setVeniceE2EE(on);
  if (!on) window.clearE2EESession?.();
  // Swap model dropdown to E2EE or regular model list
  const listKey = on ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
  let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch {}
  if (models.length) {
    // Save current model for the mode we're leaving, restore the one for the mode we're entering
    const prevKey = on ? 'labcharts-venice-model-regular' : 'labcharts-venice-model-e2ee';
    const restoreKey = on ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular';
    localStorage.setItem(prevKey, getVeniceModel());
    const restored = localStorage.getItem(restoreKey);
    const newModel = restored && models.some(m => m.id === restored) ? restored : models[0].id;
    setVeniceModel(newModel);
    renderVeniceModelDropdown(models);
  }
  const el = document.getElementById('venice-e2ee-indicator');
  if (el) el.style.display = on ? '' : 'none';
  window.updateChatHeaderModel?.();
  window.refreshWebSearchToggle?.();
}

export function updateOpenRouterModelPricing(modelId) {
  const el = document.getElementById('openrouter-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('openrouter', modelId || getOpenRouterModel());
}

export async function handleSaveOpenRouterKey() {
  const input = document.getElementById('openrouter-key-input');
  const btn = document.getElementById('save-openrouter-key-btn');
  const status = document.getElementById('openrouter-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateOpenRouterKey(key);
  if (result.valid) {
    await saveOpenRouterKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models\u2026</span>';
    const models = await fetchOpenRouterModels(key);
    if (models.length) {
      renderOpenRouterModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('OpenRouter API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveOpenRouterKey() {
  localStorage.removeItem('labcharts-openrouter-key');
  updateKeyCache('labcharts-openrouter-key', null);
  localStorage.removeItem('labcharts-openrouter-models');
  localStorage.removeItem('labcharts-openrouter-model');
  localStorage.removeItem('labcharts-openrouter-pricing');
  showNotification('OpenRouter API key removed', 'info');
  openSettingsModal();
}

export function renderOpenRouterModelDropdown(models) {
  const area = document.getElementById('openrouter-model-area');
  if (!area || !models.length) return;
  const currentModel = getOpenRouterModel();
  const isCustom = !models.some(m => m.id === currentModel);
  const opts = buildModelOptions('openrouter', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="openrouter-model-select" style="margin-top:4px" onchange="onOpenRouterDropdownChange(this.value)">' + opts + '</select>' +
    '<div style="margin-top:6px;display:flex;align-items:center;gap:8px"><input type="text" class="api-key-input" id="openrouter-custom-model" placeholder="Or enter model ID (e.g. arcee-ai/trinity-large-preview:free)" style="font-size:12px;flex:1' + (isCustom ? ';border-color:var(--accent)' : '') + '" value="' + (isCustom ? escapeHTML(currentModel) : '') + '" onkeydown="if(event.key===\'Enter\'){applyCustomOpenRouterModel(this.value)}"><span id="openrouter-model-health" style="font-size:16px;min-width:20px;text-align:center"></span></div>' +
    '<span style="font-size:11px;color:var(--text-muted);margin-top:2px;display:block">Press Enter to apply — checks model connectivity</span>' +
    '<div id="openrouter-model-pricing" style="margin-top:4px">' + renderModelPricingHint('openrouter', currentModel) + '</div>';
}

function _orBalanceHtml(remaining) {
  const v = parseFloat(remaining);
  const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
}
export function refreshOpenRouterBalance() {
  const el = document.getElementById('or-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getOpenRouterBalance().then(function(b) {
    if (el && b) el.innerHTML = _orBalanceHtml(b.remaining);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}

export async function applyCustomOpenRouterModel(modelId) {
  const id = modelId.trim();
  if (!id) return;
  setOpenRouterModel(id);
  // Show "checking..." while we verify the model
  const pricingEl = document.getElementById('openrouter-model-pricing');
  if (pricingEl) pricingEl.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">Checking pricing\u2026</span>';
  const select = document.getElementById('openrouter-model-select');
  const input = document.getElementById('openrouter-custom-model');
  const inDropdown = select && [...select.options].some(o => o.value === id);
  if (select) {
    if (inDropdown) {
      select.value = id;
      if (input) { input.value = ''; input.style.borderColor = ''; }
    } else {
      // Show "Custom model" placeholder in dropdown
      let customOpt = select.querySelector('option[value="__custom"]');
      if (!customOpt) {
        customOpt = document.createElement('option');
        customOpt.value = '__custom';
        customOpt.disabled = true;
        customOpt.textContent = 'Using custom model';
        select.insertBefore(customOpt, select.firstChild);
      }
      customOpt.selected = true;
    }
  }
  // Health check — verify model responds
  const indicator = document.getElementById('openrouter-model-health');
  if (indicator) { indicator.textContent = '⏳'; indicator.title = 'Checking...'; indicator.style.color = 'var(--text-muted)'; }
  try {
    await window.callClaudeAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
    if (indicator) { indicator.textContent = '✓'; indicator.title = 'Model responding'; indicator.style.color = 'var(--green)'; }
    if (input && !inDropdown) input.style.borderColor = 'var(--green)';
    showNotification('Model set: ' + id, 'info');
    // Fetch actual pricing and update display
    await fetchOpenRouterModelPricing(id);
    updateOpenRouterModelPricing(id);
  } catch (e) {
    if (indicator) { indicator.textContent = '✗'; indicator.title = e.message || 'Connection failed'; indicator.style.color = 'var(--red)'; }
    if (input) input.style.borderColor = 'var(--red)';
    updateOpenRouterModelPricing(id);
    showNotification('Model check failed: ' + (e.message || 'unknown error'), 'error');
  }
}

export function onOpenRouterDropdownChange(value) {
  setOpenRouterModel(value);
  updateOpenRouterModelPricing(value);
  const input = document.getElementById('openrouter-custom-model');
  if (input) { input.value = ''; input.style.borderColor = ''; }
  const health = document.getElementById('openrouter-model-health');
  if (health) { health.textContent = ''; health.title = ''; }
  // Remove "Using custom model" placeholder if present
  const select = document.getElementById('openrouter-model-select');
  const customOpt = select?.querySelector('option[value="__custom"]');
  if (customOpt) customOpt.remove();
}

// ─── Routstr handlers ───
export function updateRoutstrModelPricing(modelId) {
  const el = document.getElementById('routstr-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('routstr', modelId || getRoutstrModel());
}

export async function handleSaveRoutstrKey() {
  const input = document.getElementById('routstr-key-input');
  const btn = document.getElementById('save-routstr-key-btn');
  const status = document.getElementById('routstr-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter a key or Cashu token</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateRoutstrKey(key);
  if (result.valid) {
    let finalKey = key;
    // Convert Cashu token to a session key so Lightning topup works
    if (key.startsWith('cashu')) {
      status.innerHTML = '<span style="color:var(--text-muted)">Converting token to session key\u2026</span>';
      try {
        const wallet = await createRoutstrAccount(key);
        if (wallet.api_key) finalKey = wallet.api_key;
      } catch (e) {
        status.innerHTML = '<span style="color:var(--red)">' + escapeHTML(e.message) + '</span>';
        btn.disabled = false; btn.textContent = 'Save & Validate';
        return;
      }
      // Cashu token is now spent — user MUST save the session key
      await saveRoutstrKey(finalKey);
      await fetchRoutstrModels();
      const panel = document.getElementById('ai-provider-panel');
      if (panel) {
        panel.innerHTML = `<div class="ai-provider-panel">
          <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
            <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your session key</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Your Cashu token has been redeemed. This session key is the <strong>only way to access your balance</strong>. Copy it now \u2014 there is no recovery.</div>
            <label style="font-size:11px;color:var(--text-muted)">Session Key</label>
            <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(finalKey)}</div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="import-btn import-btn-primary" style="font-size:12px" onclick="navigator.clipboard.writeText('${escapeAttr(finalKey)}');this.textContent='\u2713 Copied (clears in 60s)';clearTimeout(window._rsClipTimer);window._rsClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Key</button>
              <button class="import-btn import-btn-secondary" style="font-size:12px" onclick="dismissRoutstrKeyReveal()">I\u2019ve saved it</button>
            </div>
          </div>
        </div>`;
      }
      btn.disabled = false; btn.textContent = 'Save & Validate';
      return;
    }
    await saveRoutstrKey(finalKey);
    status.innerHTML = '<span style="color:var(--green)">Connected \u2014 loading models\u2026</span>';
    const models = await fetchRoutstrModels();
    if (models.length) {
      renderRoutstrModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    }
    if (result.warning) showNotification(result.warning, 'info', 5000);
    else showNotification('Routstr key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveRoutstrKey() {
  localStorage.removeItem('labcharts-routstr-key');
  updateKeyCache('labcharts-routstr-key', null);
  localStorage.removeItem('labcharts-routstr-models');
  localStorage.removeItem('labcharts-routstr-model');
  localStorage.removeItem('labcharts-routstr-pricing');
  localStorage.removeItem('labcharts-routstr-vision-models');
  showNotification('Routstr key removed', 'info');
  openSettingsModal();
}

export function renderRoutstrModelDropdown(models) {
  const area = document.getElementById('routstr-model-area');
  if (!area || !models.length) return;
  const currentModel = getRoutstrModel();
  const opts = buildModelOptions('routstr', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="routstr-model-select" style="margin-top:4px" onchange="setRoutstrModel(this.value);updateRoutstrModelPricing(this.value)">' + opts + '</select>' +
    '<div id="routstr-model-pricing" style="margin-top:4px">' + renderModelPricingHint('routstr', currentModel) + '</div>';
}

// ─── Routstr wallet handlers ───
function _rsBalanceHtml(sats) {
  const color = sats < 100 ? 'var(--red)' : sats < 500 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">\u26a1 ' + sats.toLocaleString() + ' sats</span>';
}
export function refreshRoutstrBalance() {
  const el = document.getElementById('routstr-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getRoutstrBalance().then(function(b) {
    if (el && b) el.innerHTML = _rsBalanceHtml(b.sats);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}
export function dismissRoutstrKeyReveal() {
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('routstr');
  let cachedModels = []; try { cachedModels = JSON.parse(localStorage.getItem('labcharts-routstr-models') || '[]'); } catch(e) {}
  if (cachedModels.length) renderRoutstrModelDropdown(cachedModels);
  getRoutstrBalance().then(function(b) {
    const el = document.getElementById('routstr-balance');
    if (el && b) el.innerHTML = _rsBalanceHtml(b.sats);
    if (b && b.sats > 0) {
      showNotification('Routstr wallet ready', 'success');
      _returnToChatIfOnboarding();
    } else {
      showRoutstrTopup();
      showNotification('Top up to start using AI', 'info');
    }
  });
}
// ─── Routstr decentralized wallet UI ───
let _rsFundPollTimer = null;

export function showRoutstrWalletFund() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  area.style.display = 'block';
  const presets = [5000, 10000, 25000, 50000];
  area.innerHTML = `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Fund with Lightning</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(s => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1" onclick="doRoutstrWalletFund(${s})">\u26a1 ${s.toLocaleString()}</button>`).join('')}<div id="routstr-wfund-custom-slot" style="display:flex"><button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--text-muted)" onclick="rsWalletFundCustomInput()">\u26a1\u2026</button></div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">5,000 sats is enough for onboarding \u00b7 min 1,000</div>
    <div style="margin-top:6px"><div class="or-oauth-divider"><span>or paste Cashu token</span></div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <input type="text" class="api-key-input" id="routstr-wcashu-input" placeholder="cashu..." style="font-size:11px;flex:1;font-family:monospace">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrWalletReceiveCashu()">Deposit</button>
    </div></div>
    <div id="routstr-wfund-status"></div>
  </div>`;
}

export function rsWalletFundCustomInput() {
  const slot = document.getElementById('routstr-wfund-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="numeric" id="routstr-wfund-custom" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;width:80px;text-align:center;cursor:text;border:1px solid var(--accent)" placeholder="sats" onkeydown="if(event.key===\'Enter\')doRoutstrWalletFundCustom();if(event.key===\'Escape\')showRoutstrWalletFund()" onblur="if(this.value.trim())doRoutstrWalletFundCustom()">';
  document.getElementById('routstr-wfund-custom')?.focus();
}

export function doRoutstrWalletFundCustom() {
  const input = document.getElementById('routstr-wfund-custom');
  if (!input) return;
  const amount = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 1000) {
    const s = document.getElementById('routstr-wfund-status');
    if (s) s.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Minimum 1,000 sats</div>';
    return;
  }
  doRoutstrWalletFund(amount);
}

export async function doRoutstrWalletFund(amountSats) {
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Creating invoice\u2026</div>';
  try {
    const result = await window.cashuCreateFundingInvoice(amountSats);
    // QR code
    let qrSvg = '';
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'L');
      qr.addData(result.invoice.toUpperCase());
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    }
    const payUri = 'lightning:' + result.invoice;
    statusEl.innerHTML = `<div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">\u26a1 ${amountSats.toLocaleString()} sats</div>
      ${qrSvg ? `<a href="${payUri}" style="display:inline-block;background:#fff;padding:8px;border-radius:8px;width:180px;height:180px">${qrSvg}</a>` : ''}
      <div style="margin-top:6px"><button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px" onclick="navigator.clipboard.writeText('${escapeAttr(result.invoice)}');this.textContent='\u2713 Copied'">${result.invoice.slice(0, 20)}\u2026 copy</button></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="routstr-wfund-poll">Waiting for payment\u2026</div>
    </div>`;
    // Poll for payment
    _rsFundPollTimer = setInterval(async function() {
      try {
        const s = await window.cashuCheckFundingStatus(result.quote);
        if (s && s.paid) {
          clearInterval(_rsFundPollTimer); _rsFundPollTimer = null;
          statusEl.innerHTML = '<div style="margin-top:8px;text-align:center;font-size:12px;color:var(--green)">\u2713 +' + amountSats.toLocaleString() + ' sats added to wallet!</div>';
          showNotification('Wallet funded \u26a1 ' + amountSats.toLocaleString() + ' sats', 'success');
          _refreshRoutstrWalletBalance();
          setTimeout(function() { const a = document.getElementById('routstr-wallet-fund-area'); if (a) a.style.display = 'none'; }, 3000);
        }
      } catch {}
    }, 3000);
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function doRoutstrWalletReceiveCashu() {
  const input = document.getElementById('routstr-wcashu-input');
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!input || !statusEl) return;
  const token = input.value.trim();
  if (!token || !token.startsWith('cashu')) { statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Paste a valid Cashu token (starts with cashu...)</div>'; return; }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Depositing to wallet\u2026</div>';
  try {
    const result = await window.cashuReceiveToken(token);
    input.value = '';
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 +' + result.received + ' sats (' + result.fee + ' fee)</div>';
    showNotification('Wallet funded \u26a1 ' + result.received + ' sats', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function showRoutstrWalletBackup() {
  try {
    const token = await window.cashuExportWallet();
    if (!token) { showNotification('Wallet is empty', 'info'); return; }
    navigator.clipboard.writeText(token);
    showNotification('Wallet backup copied to clipboard (clears in 60s)', 'success');
    clearTimeout(window._rsCashuBackupTimer);
    window._rsCashuBackupTimer = setTimeout(() => navigator.clipboard.writeText(''), 60000);
  } catch (e) {
    showNotification('Backup failed: ' + e.message, 'error');
  }
}

export async function showRoutstrNodePicker() {
  const area = document.getElementById('routstr-node-picker');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  area.style.display = 'block';
  area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Searching Nostr relays\u2026</div>';
  try {
    const nodes = await window.nostrDiscoverNodes(true);
    if (!nodes.length) {
      area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">No nodes found. Try again later.</div>';
      return;
    }
    area.innerHTML = '<div style="margin-top:8px">' + nodes.map(function(n) {
      const url = n.urls[0] || '';
      const domain = escapeHTML(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      const label = escapeHTML(n.name || domain);
      const models = n.online ? n.modelCount + ' model' + (n.modelCount !== 1 ? 's' : '') : 'offline';
      const onion = n.onion ? ' <span style="font-size:10px" title="Tor available">\ud83e\udde5</span>' : '';
      const statusDot = n.online ? '<span style="color:var(--green)">\u25cf</span>' : '<span style="color:var(--text-muted)">\u25cb</span>';
      const opacity = n.online ? '' : 'opacity:0.5;';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);${opacity}">
        <div>${statusDot} <span style="font-size:12px;font-weight:500">${label}</span>${onion}<br><span style="font-size:10px;color:var(--text-muted)">${domain} \u00b7 ${models}</span></div>
        ${n.online ? `<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px" onclick="connectRoutstrNode('${escapeAttr(url)}')">Connect</button>` : ''}
      </div>`;
    }).join('') + '</div>';
  } catch (e) {
    area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}

export async function connectRoutstrNode(nodeUrl) {
  const walletBalance = await window.cashuGetBalance();
  if (walletBalance < 1000) {
    showNotification('Fund your wallet first (\u26a1 1,000+ sats needed)', 'error');
    showRoutstrWalletFund();
    return;
  }
  // Show deposit amount picker
  const picker = document.getElementById('routstr-node-picker');
  const nodeLabel = escapeHTML(nodeUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  const presets = [1000, 2500, 5000].filter(v => v <= walletBalance);
  if (walletBalance > 5000 && walletBalance <= 50000) presets.push(walletBalance);
  else if (walletBalance > 50000) presets.push(50000);
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:12px;margin-bottom:6px">Deposit to <strong>${nodeLabel}</strong></div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${walletBalance.toLocaleString()} sats. How much to deposit?</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(v => `<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="doRoutstrNodeDeposit('${escapeAttr(nodeUrl)}',${v})">\u26a1 ${v.toLocaleString()}</button>`).join('')}
    </div>
    <div id="routstr-deposit-status" style="margin-top:6px"></div>
  </div>`;
}

let _rsConnecting = false;
export async function doRoutstrNodeDeposit(nodeUrl, amount) {
  if (_rsConnecting) return;
  _rsConnecting = true;
  const statusEl = document.getElementById('routstr-deposit-status');
  if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Depositing ' + amount.toLocaleString() + ' sats\u2026</div>';
  try {
    const result = await window.cashuDepositToNode(nodeUrl, amount);
    if (!result.api_key) throw new Error('No session key returned');
    await saveRoutstrKey(result.api_key);
    window.nostrSetSelectedNode(nodeUrl);
    // Clear cached model — new node may have different model IDs
    localStorage.removeItem('labcharts-routstr-model');
    localStorage.removeItem('labcharts-routstr-models');
    const models = await fetchRoutstrModels();
    showNotification('Connected to ' + nodeUrl.replace(/^https?:\/\//, '') + ' \u26a1 ' + amount.toLocaleString() + ' sats', 'success');
    const panel = document.getElementById('ai-provider-panel');
    if (panel) panel.innerHTML = renderAIProviderPanel('routstr');
    if (models.length) renderRoutstrModelDropdown(models);
    _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
    _returnToChatIfOnboarding();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
  _rsConnecting = false;
}

async function _refreshRoutstrWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (!el) return;
  try {
    const balance = await window.cashuGetBalance();
    el.textContent = '\u26a1 ' + balance.toLocaleString() + ' sats';
  } catch {
    el.textContent = '\u26a1 0 sats';
  }
}

let _rsTopupPollTimer = null;
let _rsCountdownTimer = null;
export function showRoutstrTopup() {
  const area = document.getElementById('routstr-topup-area');
  if (!area) return;
  if (area.style.display !== 'none') { cancelRoutstrTopup(); return; }
  area.style.display = 'block';
  const presets = [5000, 10000, 25000, 50000];
  area.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Top up with Lightning</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px" id="routstr-topup-presets">
      ${presets.map(s => `<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;flex:1" onclick="doRoutstrLightningTopup(${s})">\u26a1 ${s.toLocaleString()} sats</button>`).join('')}<div id="routstr-custom-slot" style="display:flex"><button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;color:var(--text-muted)" onclick="rsShowCustomSatsInput()">\u26a1\u2026</button></div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">5,000 sats is enough for onboarding, a few imports, and chats \u00b7 min 1,000</div>
    <div style="margin-top:8px"><div class="or-oauth-divider"><span>or paste Cashu token</span></div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <input type="text" class="api-key-input" id="routstr-cashu-input" placeholder="cashu..." style="font-size:11px;flex:1;font-family:monospace">
      <button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;white-space:nowrap" onclick="doRoutstrCashuTopup()">Deposit</button>
    </div></div>
    <div id="routstr-topup-status"></div>
  </div>`;
}
export function rsShowCustomSatsInput() {
  const slot = document.getElementById('routstr-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="numeric" id="routstr-custom-sats" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;width:80px;text-align:center;cursor:text;border:1px solid var(--accent)" placeholder="sats" onkeydown="if(event.key===\'Enter\')doRoutstrCustomTopup();if(event.key===\'Escape\')showRoutstrTopup()" onblur="if(this.value.trim())doRoutstrCustomTopup()">';
  document.getElementById('routstr-custom-sats')?.focus();
}
export function doRoutstrCustomTopup() {
  const input = document.getElementById('routstr-custom-sats');
  if (!input) return;
  const amount = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 1000) {
    const statusEl = document.getElementById('routstr-topup-status');
    if (statusEl) statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Minimum 1,000 sats</div>';
    return;
  }
  doRoutstrLightningTopup(amount);
}
export async function doRoutstrLightningTopup(amountSats) {
  const statusEl = document.getElementById('routstr-topup-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Creating invoice\u2026</div>';
  try {
    const result = await createRoutstrLightningInvoice(amountSats);
    const bolt11 = result.bolt11 || result.payment_request || result.invoice;
    const invoiceId = result.invoice_id || result.id;
    if (!bolt11) throw new Error('No invoice returned');
    // QR code
    let qrSvg = '';
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'L');
      qr.addData(bolt11.toUpperCase());
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    }
    const payUri = 'lightning:' + bolt11;
    statusEl.innerHTML = `<div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">\u26a1 ${amountSats.toLocaleString()} sats</div>
      ${qrSvg ? `<a href="${payUri}" style="display:inline-block;background:#fff;padding:8px;border-radius:8px;width:180px;height:180px">${qrSvg}</a>` : ''}
      <div style="margin-top:6px"><button class="import-btn import-btn-secondary" style="font-size:10px;padding:2px 8px" onclick="navigator.clipboard.writeText('${escapeAttr(bolt11)}');this.textContent='\u2713 Copied'">${bolt11.slice(0, 20)}\u2026 copy</button></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px" id="routstr-topup-countdown">Waiting for payment\u2026</div>
    </div>`;
    // Countdown
    if (result.expires_at) {
      const expiresMs = (typeof result.expires_at === 'number' && result.expires_at < 1e12) ? result.expires_at * 1000 : result.expires_at;
      _rsCountdownTimer = setInterval(function() {
        const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
        const cdEl = document.getElementById('routstr-topup-countdown');
        if (cdEl) cdEl.textContent = remaining > 0 ? 'Expires in ' + Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0') : 'Invoice expired';
        if (remaining <= 0) clearInterval(_rsCountdownTimer);
      }, 1000);
    }
    // Poll for payment
    if (invoiceId) {
      _rsTopupPollTimer = setInterval(async function() {
        try {
          const s = await checkRoutstrInvoiceStatus(invoiceId);
          if (s && (s.status === 'paid' || s.status === 'complete' || s.status === 'settled')) {
            clearInterval(_rsTopupPollTimer); _rsTopupPollTimer = null;
            clearInterval(_rsCountdownTimer); _rsCountdownTimer = null;
            statusEl.innerHTML = '<div style="margin-top:8px;text-align:center;font-size:12px;color:var(--green)">\u2713 +' + amountSats.toLocaleString() + ' sats added!</div>';
            showNotification('Routstr topped up \u26a1 ' + amountSats.toLocaleString() + ' sats', 'success');
            refreshRoutstrBalance();
            setTimeout(function() { const a = document.getElementById('routstr-topup-area'); if (a) a.style.display = 'none'; }, 3000);
          } else if (s && (s.status === 'expired' || s.status === 'invalid')) {
            clearInterval(_rsTopupPollTimer); _rsTopupPollTimer = null;
            clearInterval(_rsCountdownTimer); _rsCountdownTimer = null;
            statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">Invoice expired. Try again.</div>';
          }
        } catch {}
      }, 3000);
    }
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}
export async function doRoutstrCashuTopup() {
  const input = document.getElementById('routstr-cashu-input');
  const statusEl = document.getElementById('routstr-topup-status');
  if (!input || !statusEl) return;
  const token = input.value.trim();
  if (!token || !token.startsWith('cashu')) { statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Paste a valid Cashu token (starts with cashu...)</div>'; return; }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Depositing\u2026</div>';
  try {
    const result = await topupRoutstrCashu(token);
    // API response fields vary — check balance before/after instead
    input.value = '';
    const balAfter = await getRoutstrBalance();
    const balEl = document.getElementById('routstr-balance');
    if (balEl && balAfter) balEl.innerHTML = _rsBalanceHtml(balAfter.sats);
    const addedSats = balAfter ? balAfter.sats : 0;
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Deposited \u2014 balance: \u26a1 ' + addedSats.toLocaleString() + ' sats</div>';
    showNotification('Cashu deposited', 'success');
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(e.message) + '</div>';
  }
}
export function cancelRoutstrTopup() {
  if (_rsTopupPollTimer) { clearInterval(_rsTopupPollTimer); _rsTopupPollTimer = null; }
  if (_rsCountdownTimer) { clearInterval(_rsCountdownTimer); _rsCountdownTimer = null; }
  if (_rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }
  const area = document.getElementById('routstr-topup-area');
  if (area) area.style.display = 'none';
}

// ─── PPQ handlers ───
let _ppqCreating = false;
export async function handleCreatePpqAccount() {
  if (_ppqCreating) return;
  _ppqCreating = true;
  const createBtn = document.querySelector('[onclick="handleCreatePpqAccount()"]');
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating\u2026'; }
  const status = document.getElementById('ppq-key-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Creating account\u2026</span>';
  try {
    const result = await createPpqAccount();
    if (!result.success && !result.api_key) throw new Error('Account creation failed');
    await savePpqKey(result.api_key);
    savePpqCreditId(result.credit_id);
    const models = await fetchPpqModels(result.api_key);
    // Show key reveal screen — user must save it before continuing
    const panel = document.getElementById('ai-provider-panel');
    if (panel) {
      panel.innerHTML = `<div class="ai-provider-panel">
        <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
          <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your account details</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">PPQ accounts are anonymous \u2014 <strong>there is no way to recover a lost key</strong>. Copy both values now and store them somewhere safe.</div>
          <label style="font-size:11px;color:var(--text-muted)">API Key</label>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(result.api_key)}</div>
          <label style="font-size:11px;color:var(--text-muted);margin-top:8px;display:block">Credit ID <span style="font-size:10px">(enter at <a href="https://ppq.ai" target="_blank" rel="noopener" style="color:var(--accent)">ppq.ai</a> to access your account on the web)</span></label>
          <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(result.credit_id)}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="import-btn import-btn-primary" style="font-size:12px" onclick="navigator.clipboard.writeText('API Key: ${escapeAttr(result.api_key)}\\nCredit ID: ${escapeAttr(result.credit_id)}');this.textContent='\u2713 Copied (clears in 60s)';clearTimeout(window._ppqClipTimer);window._ppqClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Both</button>
            <button class="import-btn import-btn-secondary" style="font-size:12px" onclick="dismissPpqKeyReveal()">I\u2019ve saved it</button>
          </div>
        </div>
      </div>`;
    }
  } catch (e) {
    if (status) status.innerHTML = '<span style="color:var(--red)">Failed to create account: ' + escapeHTML(e.message) + '</span>';
    if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Account (instant, no signup)'; }
  }
  _ppqCreating = false;
}

export function dismissPpqKeyReveal() {
  // Re-render panel to normal connected state + load models
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('ppq');
  let cachedModels = []; try { cachedModels = JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]'); } catch(e) {}
  if (cachedModels.length) renderPpqModelDropdown(cachedModels);
  getPpqBalance().then(function(balance) {
    const el = document.getElementById('ppq-balance');
    if (el && balance != null) el.innerHTML = _ppqBalanceHtml(balance);
  });
  // New accounts start at $0 — always show topup, never auto-return to chat
  showPpqTopup();
  showNotification('Account ready \u2014 top up to start using AI', 'info');
}

export async function handleSavePpqKey() {
  const input = document.getElementById('ppq-key-input');
  const btn = document.getElementById('save-ppq-key-btn');
  const status = document.getElementById('ppq-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validatePpqKey(key);
  if (result.valid) {
    await savePpqKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected \u2014 loading models\u2026</span>';
    const models = await fetchPpqModels(key);
    if (models.length) {
      renderPpqModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    }
    showNotification('PPQ key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export async function handleRemovePpqKey() {
  // Check balance before removing — warn if funds remain
  const balance = await getPpqBalance();
  const hasFunds = balance != null && parseFloat(balance) > 0;
  const msg = hasFunds
    ? `This account has $${parseFloat(balance).toFixed(2)} remaining. Removing this key will permanently lose access to those funds unless you\u2019ve saved the key elsewhere.\n\nRemove PPQ key?`
    : 'Remove PPQ key? Make sure you\u2019ve saved it if you want to reuse this account later.';
  showConfirmDialog(msg, function() {
    localStorage.removeItem('labcharts-ppq-key');
    updateKeyCache('labcharts-ppq-key', null);
    localStorage.removeItem('labcharts-ppq-models');
    localStorage.removeItem('labcharts-ppq-model');
    localStorage.removeItem('labcharts-ppq-pricing');
    localStorage.removeItem('labcharts-ppq-vision-models');
    localStorage.removeItem('labcharts-ppq-credit-id');
    showNotification('PPQ key removed', 'info');
    openSettingsModal();
  });
}

export function renderPpqModelDropdown(models) {
  const area = document.getElementById('ppq-model-area');
  if (!area || !models.length) return;
  const currentModel = getPpqModel();
  const opts = buildModelOptions('ppq', models, currentModel, function(m) { return m.name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="ppq-model-select" style="margin-top:4px" onchange="setPpqModel(this.value);updatePpqModelPricing(this.value)">' + opts + '</select>' +
    '<div id="ppq-model-pricing" style="margin-top:4px">' + renderModelPricingHint('ppq', currentModel) + '</div>';
}

export function updatePpqModelPricing(modelId) {
  const el = document.getElementById('ppq-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('ppq', modelId);
}

function _ppqBalanceHtml(balance) {
  const v = parseFloat(balance);
  const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
}

export async function refreshPpqBalance() {
  const el = document.getElementById('ppq-balance');
  if (!el) return;
  el.textContent = 'Balance: refreshing\u2026';
  const balance = await getPpqBalance();
  if (balance != null) el.innerHTML = _ppqBalanceHtml(balance);
  else el.textContent = 'Balance: unavailable';
}

let _ppqTopupPollTimer = null;
let _ppqCountdownTimer = null;

const _ppqSvg = {
  lightning: '<svg viewBox="0 0 282 282"><circle cx="141" cy="141" r="141" fill="#7B1AF7"/><path d="M79.76 144.05L173.76 63.05C177.86 60.42 181.76 63.05 179.26 67.55L149.26 126.55H202.76C202.76 126.55 211.26 126.55 202.76 133.55L110.26 215.05C103.76 220.55 99.26 217.55 103.76 209.05L132.76 151.55H79.76C79.76 151.55 71.26 151.55 79.76 144.05Z" fill="#fff"/></svg>',
  btc: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#fff" fill-rule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"/></svg>',
  xmr: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#FF6600"/><path fill="#fff" fill-rule="nonzero" d="M15.97 5.235c5.985 0 10.825 4.84 10.825 10.824a11.07 11.07 0 01-.558 3.432h-3.226v-9.094l-7.04 7.04-7.04-7.04v9.094H5.704a11.07 11.07 0 01-.557-3.432c0-5.984 4.84-10.824 10.824-10.824zM14.358 19.02L16 20.635l1.613-1.614 3.051-3.08v5.72h4.547a10.806 10.806 0 01-9.24 5.192c-3.902 0-7.334-2.082-9.24-5.192h4.546v-5.72l3.08 3.08z"/></svg>',
  ltc: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#A6A9AA"/><path fill="#fff" d="M10.427 19.214L9 19.768l.688-2.759 1.444-.58L13.213 8h5.129l-1.519 6.196 1.41-.571-.68 2.75-1.427.571-.848 3.483H23L22.127 24H9.252z"/></svg>',
  liquid: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0D1437"/><path fill="#22E1C9" d="M16 7c-2.4 3.5-6 7.5-6 11.5C10 21.54 12.69 24 16 24s6-2.46 6-5.5C22 14.5 18.4 10.5 16 7zm0 14.5c-1.93 0-3.5-1.32-3.5-3 0-2.25 2.13-4.82 3.5-6.71 1.37 1.89 3.5 4.46 3.5 6.71 0 1.68-1.57 3-3.5 3z"/></svg>',
};
const PPQ_METHODS = [
  { id: 'btc-lightning', svg: _ppqSvg.lightning, label: 'Lightning', min: 1, amounts: [1, 2, 5, 10] },
  { id: 'btc', svg: _ppqSvg.btc, label: 'Bitcoin', min: 10, amounts: [10, 25, 50, 100] },
  { id: 'xmr', svg: _ppqSvg.xmr, label: 'Monero', min: 5, amounts: [5, 10, 25, 50] },
  { id: 'ltc', svg: _ppqSvg.ltc, label: 'Litecoin', min: 2, amounts: [2, 5, 10, 25] },
  { id: 'lbtc', svg: _ppqSvg.liquid, label: 'Liquid', min: 2, amounts: [2, 5, 10, 25] },
];
let _ppqSelectedMethod = 'btc-lightning';

function _ppqMethodBtn(m, active) {
  return `<button class="${active ? 'ppq-method-btn active' : 'ppq-method-btn'}" onclick="selectPpqMethod('${m.id}')"><span class="ppq-method-icon">${m.svg}</span><span class="ppq-method-label">${m.label}</span></button>`;
}

export function showPpqTopup() {
  const area = document.getElementById('ppq-topup-area');
  if (!area) return;
  const toggle = document.getElementById('ppq-topup-toggle');
  if (area.style.display !== 'none') {
    area.style.display = 'none';
    if (toggle) toggle.textContent = 'Top Up';
    return;
  }
  area.style.display = 'block';
  if (toggle) toggle.textContent = 'Close';
  _ppqSelectedMethod = 'btc-lightning';
  // Inject styles if not present
  if (!document.getElementById('ppq-topup-style')) {
    const style = document.createElement('style');
    style.id = 'ppq-topup-style';
    style.textContent = `.ppq-method-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;border:2px solid var(--border);background:var(--bg-primary);color:var(--text-muted);cursor:pointer;flex:1;min-width:0;transition:all .15s}
.ppq-method-btn:hover{border-color:var(--text-muted);color:var(--text-primary)}
.ppq-method-btn.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--bg-primary));box-shadow:0 0 0 1px var(--accent)}
.ppq-method-btn.active .ppq-method-label{color:var(--text-primary)}
.ppq-method-icon{width:24px;height:24px;display:block}
.ppq-method-icon svg{width:100%;height:100%}
.ppq-method-label{font-size:10px;font-weight:600;white-space:nowrap;letter-spacing:.01em}
.ppq-amt-btn{padding:7px 0;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-size:13px;font-weight:600;flex:1;text-align:center;transition:all .15s}
.ppq-amt-btn:hover{border-color:var(--accent);color:var(--accent)}
@keyframes ppq-pulse{0%,100%{opacity:1}50%{opacity:.3}}`;
    document.head.appendChild(style);
  }
  _renderPpqTopupPicker(area);
}

function _renderPpqTopupPicker(area) {
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  area.innerHTML = `<div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:10px;border:1px solid var(--border)">
    <div style="display:flex;gap:6px;margin-bottom:10px">${PPQ_METHODS.map(function(m) { return _ppqMethodBtn(m, m.id === _ppqSelectedMethod); }).join('')}</div>
    <div style="display:flex;gap:6px">${method.amounts.map(function(v) {
      return '<button class="ppq-amt-btn" onclick="doPpqTopup(' + v + ')">$' + v + '</button>';
    }).join('')}<div id="ppq-custom-slot" style="flex:1;display:flex"><button class="ppq-amt-btn" style="width:100%;color:var(--text-muted)" onclick="ppqShowCustomInput()">$\u2026</button></div></div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">$2 is enough for onboarding, a few imports, and chats \u00b7 min $${method.min}</div>
  </div>`;
}

export function selectPpqMethod(methodId) {
  _ppqSelectedMethod = methodId;
  const area = document.getElementById('ppq-topup-area');
  if (area) _renderPpqTopupPicker(area);
}

export function ppqShowCustomInput() {
  const slot = document.getElementById('ppq-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="decimal" id="ppq-custom-amount" class="ppq-amt-btn" style="width:100%;text-align:center;cursor:text" placeholder="$" onkeydown="if(event.key===\'Enter\')doPpqTopupCustom();if(event.key===\'Escape\')selectPpqMethod(\'' + _ppqSelectedMethod + '\')" onblur="if(this.value.trim())doPpqTopupCustom()">';
  const input = document.getElementById('ppq-custom-amount');
  if (input) input.focus();
}

export function doPpqTopupCustom() {
  const input = document.getElementById('ppq-custom-amount');
  if (!input) return;
  const raw = input.value.replace(/[^0-9.]/g, '');
  const amount = parseFloat(raw);
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  if (isNaN(amount) || amount < method.min) {
    showNotification('Minimum amount is $' + method.min, 'error');
    return;
  }
  doPpqTopup(amount);
}

export async function doPpqTopup(amount) {
  const area = document.getElementById('ppq-topup-area');
  if (!area) return;
  const method = PPQ_METHODS.find(function(m) { return m.id === _ppqSelectedMethod; }) || PPQ_METHODS[0];
  area.innerHTML = '<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--text-muted)">Generating invoice\u2026</div>';
  try {
    const result = await createPpqTopup(amount, _ppqSelectedMethod);
    const payString = result.lightning_invoice || result.payment_address || '';
    const invoiceId = result.invoice_id || '';
    const cryptoAmount = result.crypto_amount_due ? parseFloat(result.crypto_amount_due) : null;
    // QR data: Lightning invoices use uppercase for smaller QR; addresses stay as-is
    const isLightning = _ppqSelectedMethod === 'btc-lightning';
    let qrSvg = '';
    try {
      const qr = qrcode(0, 'L');
      qr.addData(isLightning ? payString.toUpperCase() : payString);
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    } catch { /* QR generation failed, show text only */ }
    // URI scheme for "Open in Wallet"
    const walletUri = isLightning ? 'lightning:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'btc' || _ppqSelectedMethod === 'lbtc' ? 'bitcoin:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'ltc' ? 'litecoin:' + escapeAttr(payString)
      : _ppqSelectedMethod === 'xmr' ? 'monero:' + escapeAttr(payString)
      : '#';
    const copyLabel = isLightning ? 'Copy Invoice' : 'Copy Address';
    const detailLabel = isLightning ? 'Show invoice text' : 'Show address';
    const cryptoHint = cryptoAmount ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + cryptoAmount + '</div>' : '';
    area.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${qrSvg ? '<div style="flex-shrink:0;background:#fff;padding:6px;border-radius:6px;width:140px;height:140px">' + qrSvg + '</div>' : ''}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;display:flex;align-items:center;gap:4px"><span style="width:16px;height:16px;display:inline-block">${method.svg}</span> ${method.label} \u2014 $${parseFloat(amount).toFixed(2)}</div>
          ${cryptoHint}
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
            <button class="import-btn import-btn-primary" style="font-size:11px;padding:4px 10px" onclick="navigator.clipboard.writeText('${escapeAttr(payString)}');this.textContent='\u2713 Copied!'">${copyLabel}</button>
            <a href="${walletUri}" class="import-btn import-btn-secondary" style="font-size:11px;padding:4px 10px;text-decoration:none;text-align:center">Open in Wallet</a>
            <button class="import-btn import-btn-secondary" style="font-size:11px;padding:4px 10px" onclick="cancelPpqTopup()">Cancel</button>
          </div>
          <div id="ppq-topup-status" style="margin-top:6px;font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px"><span id="ppq-topup-dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;animation:ppq-pulse 1.5s ease-in-out infinite"></span> <span id="ppq-topup-countdown"></span></div>
        </div>
      </div>
      <details style="margin-top:6px"><summary style="font-size:11px;color:var(--text-muted);cursor:pointer">${detailLabel}</summary>
        <div style="font-family:monospace;font-size:9px;word-break:break-all;background:var(--bg-primary);padding:6px;border-radius:4px;border:1px solid var(--border);color:var(--text-secondary);max-height:80px;overflow-y:auto;user-select:all;cursor:text;margin-top:4px">${escapeHTML(payString)}</div>
      </details>
    </div>`;
    // Live countdown timer
    const expiresTs = result.expires_at ? result.expires_at * 1000 : 0;
    _ppqCountdownTimer = setInterval(function() {
      const cdEl = document.getElementById('ppq-topup-countdown');
      if (!cdEl || !expiresTs) return;
      const remaining = Math.max(0, Math.floor((expiresTs - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      cdEl.textContent = remaining > 0
        ? 'Waiting for payment\u2026 ' + mins + ':' + (secs < 10 ? '0' : '') + secs
        : 'Invoice expired';
      if (remaining <= 0) clearInterval(_ppqCountdownTimer);
    }, 1000);
    // Poll for payment
    _ppqTopupPollTimer = setInterval(async function() {
      try {
        const status = await checkPpqTopupStatus(invoiceId);
        if (!status) return;
        const s = (status.status || '').toLowerCase();
        if (s === 'paid' || s === 'complete' || s === 'settled' || s === 'processing') {
          clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null;
          clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null;
          // Show paid state
          const topupArea = document.getElementById('ppq-topup-area');
          if (topupArea) {
            topupArea.innerHTML = '<div style="margin-top:8px;padding:16px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--green);text-align:center"><div style="font-size:24px;margin-bottom:6px">\u2713</div><div style="font-size:13px;font-weight:600;color:var(--green)">Payment received!</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">$' + parseFloat(amount).toFixed(2) + ' added to your balance</div></div>';
          }
          showNotification('Top-up successful!', 'success');
          // Refresh balance
          const balance = await getPpqBalance();
          const balEl = document.getElementById('ppq-balance');
          if (balEl && balance != null) balEl.innerHTML = _ppqBalanceHtml(balance);
          setTimeout(function() { _returnToChatIfOnboarding(); }, 2000);
        } else if (s === 'expired' || s === 'invalid') {
          clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null;
          clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null;
          const statusEl = document.getElementById('ppq-topup-status');
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Invoice expired. Try again.</span>';
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  } catch (e) {
    area.innerHTML = `<div style="margin-top:8px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--red)">${escapeHTML(e.message)}</div>`;
  }
}

export function cancelPpqTopup() {
  if (_ppqTopupPollTimer) { clearInterval(_ppqTopupPollTimer); _ppqTopupPollTimer = null; }
  if (_ppqCountdownTimer) { clearInterval(_ppqCountdownTimer); _ppqCountdownTimer = null; }
  const area = document.getElementById('ppq-topup-area');
  if (area) area.style.display = 'none';
}

function renderSyncSection() {
  const enabled = isSyncEnabled();
  const relay = getSyncRelay();
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${enabled ? '16' : '8'}px">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Cross-device sync</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">E2E encrypted via Evolu CRDT</div>
      </div>
      <label class="chat-websearch-toggle-label" style="display:flex" aria-label="Toggle cross-device sync">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSync(this.checked)" style="display:none">
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
        <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px;width:100%" onclick="showMnemonicRestore()">Restore from mnemonic</button>
      </div>
      <div id="sync-restore-form" style="display:none;margin-bottom:16px">
        <textarea id="sync-restore-input" style="font-size:12px;width:100%;height:60px;resize:vertical;border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);padding:8px 10px;font-family:var(--font-mono, monospace);box-sizing:border-box" placeholder="Paste your 24-word mnemonic here..."></textarea>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="import-btn import-btn-primary" style="font-size:12px;padding:5px 14px;flex:1" onclick="doMnemonicRestore()">Restore</button>
          <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px" onclick="document.getElementById('sync-restore-form').style.display='none'">Cancel</button>
        </div>
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
async function toggleSync(enabled) {
  if (_syncToggling) return;
  _syncToggling = true;
  if (enabled) {
    showSyncSetupModal();
    // _syncToggling cleared by closeSyncSetup or syncSetupDone
  } else {
    try {
      _mnemonicCache = null;
      _mnemonicRetries = 0;
      clearTimeout(_mnemonicRetryTimer);
      await disableSync();
      const el = document.getElementById('sync-section');
      if (el) el.innerHTML = renderSyncSection();
    } finally {
      _syncToggling = false;
    }
  }
}

function showSyncSetupModal() {
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
  _syncToggling = false;
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
  _syncToggling = false;
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
  if (!input || !input.value.trim()) return;
  const mnemonic = input.value.trim();
  const words = mnemonic.split(/\s+/);
  if (words.length !== 24) {
    showNotification('Mnemonic must be exactly 24 words', 'error');
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
    _mnemonicRetries = 0;
  } else if (_mnemonicRetries < 30) {
    _mnemonicRetries++;
    el.textContent = 'Resolving...';
    _mnemonicRetryTimer = setTimeout(loadMnemonic, 1000);
  } else {
    el.textContent = 'Could not resolve mnemonic';
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

function showMnemonicRestore() {
  const form = document.getElementById('sync-restore-form');
  if (form) {
    form.style.display = 'block';
    const input = document.getElementById('sync-restore-input');
    if (input) input.focus();
  }
}

function doMnemonicRestore() {
  const input = document.getElementById('sync-restore-input');
  if (!input || !input.value.trim()) return;
  const mnemonic = input.value.trim();
  const words = mnemonic.split(/\s+/);
  if (words.length !== 24) {
    showNotification('Mnemonic must be exactly 24 words', 'error');
    return;
  }
  showConfirmDialog('Restore from mnemonic? This will replace your sync identity and reload the page.', async () => {
    const result = await restoreFromMnemonic(mnemonic);
    if (!result) {
      if (!isSyncEnabled()) showNotification('Sync not initialized — try disabling and re-enabling sync', 'error');
    }
  });
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
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Let AI agents query your labs via MCP, Hermes Agent, or OpenClaw</div>
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
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5">Use <a href="https://github.com/elkimek/getbased-mcp" target="_blank" rel="noopener" style="color:var(--accent)">getbased-mcp</a> to connect <a href="https://github.com/hermes-agent/hermes-agent" target="_blank" rel="noopener" style="color:var(--accent)">Hermes Agent</a>, <a href="https://openclaw.ai" target="_blank" rel="noopener" style="color:var(--accent)">OpenClaw</a>, or any MCP-compatible agent. Paste this token into your agent's config.</div>
      </div>
      <button class="import-btn import-btn-secondary" style="font-size:12px;padding:5px 14px;width:100%" onclick="regenerateMessengerToken()">Regenerate token</button>
    ` : `
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5">
        Let AI agents query your labs — coding agents, messenger bots, or any <a href="https://github.com/elkimek/getbased-mcp" target="_blank" rel="noopener" style="color:var(--accent)">MCP-compatible tool</a>. Only a read-only summary is shared — your data stays encrypted.
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

Object.assign(window, { toggleSync, toggleMnemonicVisibility, copyMnemonic, showMnemonicRestore, doMnemonicRestore, saveSyncRelay, closeSyncSetup, syncSetupNew, syncSetupRestore, syncSetupBack, syncSetupDoRestore, syncSetupDone, toggleMessenger, toggleMessengerToken, copyMessengerToken, regenerateMessengerToken });

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

Object.assign(window, {
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  toggleAIPause,
  renderAIProviderPanel,
  renderPrivacySection,
  togglePrivacyConfigure,
  toggleOllamaPII,
  updatePrivacyStatusCard,
  switchAIProvider,
  initSettingsModelFetch,
  initSettingsOllamaCheck,
  updateSettingsUI,
  testOllamaConnection,
  testPIIOllamaConnection,
  refreshVeniceBalance,
  updateVeniceModelPricing,
  toggleVeniceE2EE,
  updateOpenRouterModelPricing,
  updateRoutstrModelPricing,
  handleSaveVeniceKey,
  handleRemoveVeniceKey,
  renderVeniceModelDropdown,
  handleSaveOpenRouterKey,
  handleRemoveOpenRouterKey,
  renderOpenRouterModelDropdown,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange,
  handleSaveRoutstrKey,
  handleRemoveRoutstrKey,
  renderRoutstrModelDropdown,
  refreshRoutstrBalance,
  showRoutstrWalletFund,
  rsWalletFundCustomInput,
  doRoutstrWalletFundCustom,
  doRoutstrWalletFund,
  doRoutstrWalletReceiveCashu,
  showRoutstrWalletBackup,
  showRoutstrNodePicker,
  connectRoutstrNode,
  doRoutstrNodeDeposit,
  dismissRoutstrKeyReveal,
  showRoutstrTopup,
  rsShowCustomSatsInput,
  doRoutstrCustomTopup,
  doRoutstrLightningTopup,
  doRoutstrCashuTopup,
  cancelRoutstrTopup,
  handleCreatePpqAccount,
  dismissPpqKeyReveal,
  handleSavePpqKey,
  handleRemovePpqKey,
  renderPpqModelDropdown,
  updatePpqModelPricing,
  refreshPpqBalance,
  showPpqTopup,
  selectPpqMethod,
  doPpqTopup,
  ppqShowCustomInput,
  doPpqTopupCustom,
  cancelPpqTopup,
  refreshOpenRouterBalance,
  renderDataEntriesSection,
  refreshDataEntriesSection,
  resetCurrentProfileUsage,
  copyOllamaPullCmd,
  refreshModelAdvisor,
  applyHardwareOverride: applyHardwareOverrideFn,
  clearHardwareOverride: clearHardwareOverrideFn,
});

function refreshModelAdvisor() {
  const details = window._lastOllamaModelDetails || [];
  if (details.length) renderModelAdvisor(details, document.getElementById('local-ai-model-select'), !!window._lastIsOllamaServer);
}

function copyOllamaPullCmd(cmd) {
  navigator.clipboard.writeText(cmd).then(() => showNotification('Copied: ' + cmd, 'info'));
}

function applyHardwareOverrideFn(vram) {
  const v = parseFloat(vram);
  if (isNaN(v) || v <= 0) { showNotification('Enter a valid VRAM amount in GB', 'error'); return; }
  saveHardwareOverride(v);
  const details = window._lastOllamaModelDetails || [];
  if (details.length) renderModelAdvisor(details, document.getElementById('local-ai-model-select'), !!window._lastIsOllamaServer);
}

function clearHardwareOverrideFn() {
  saveHardwareOverride(null);
  const details = window._lastOllamaModelDetails || [];
  if (details.length) renderModelAdvisor(details, document.getElementById('local-ai-model-select'), !!window._lastIsOllamaServer);
}
