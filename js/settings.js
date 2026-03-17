// settings.js — Settings modal (profile, display, AI provider, privacy)

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, isDebugMode, setDebugMode, isPIIReviewEnabled, setPIIReviewEnabled } from './utils.js';
import { getTheme, setTheme, getTimeFormat, setTimeFormat } from './theme.js';
import { formatCost, getProfileUsage, getGlobalUsage, resetProfileUsage } from './schema.js';
import { getApiKey, saveApiKey, getVeniceKey, saveVeniceKey, getOpenRouterKey, saveOpenRouterKey, /* ROUTSTR DISABLED: getRoutstrKey, saveRoutstrKey, */ getAIProvider, setAIProvider, getAnthropicModel, setAnthropicModel, getVeniceModel, setVeniceModel, getOpenRouterModel, setOpenRouterModel, /* ROUTSTR DISABLED: getRoutstrModel, setRoutstrModel, */ getOllamaMainModel, setOllamaMainModel, getOllamaPIIModel, setOllamaPIIModel, getOllamaPIIUrl, setOllamaPIIUrl, validateApiKey, validateVeniceKey, validateOpenRouterKey, /* ROUTSTR DISABLED: validateRoutstrKey, */ fetchAnthropicModels, fetchVeniceModels, fetchOpenRouterModels, /* ROUTSTR DISABLED: fetchRoutstrModels, */ renderModelPricingHint, isRecommendedModel, getAnthropicModelDisplay, getVeniceModelDisplay, getOpenRouterModelDisplay, fetchOpenRouterModelPricing, isAIPaused, setAIPaused /* ROUTSTR DISABLED: , getRoutstrModelDisplay */ } from './api.js';
import { getOllamaConfig, checkOllama, checkOpenAICompatible, saveOllamaConfig, isOllamaPIIEnabled, setOllamaPIIEnabled } from './pii.js';
import { detectHardware, assessModel, assessFitness, getBestModel, getUpgradeSuggestion, saveHardwareOverride, getHardwareOverride } from './hardware.js';
import { renderEncryptionSection, renderBackupSection, loadBackupSnapshots, updateKeyCache } from './crypto.js';


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
          <button class="ai-provider-btn${provider === 'openrouter' ? ' active' : ''}" data-provider="openrouter" onclick="switchAIProvider('openrouter')"><svg class="ai-provider-logo" viewBox="0 0 512 512" fill="currentColor" stroke="currentColor"><path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" stroke-width="90" fill="none"/><path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" stroke="none"/><path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" stroke-width="90" fill="none"/><path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" stroke="none"/></svg> OpenRouter</button>
          <button class="ai-provider-btn${provider === 'anthropic' ? ' active' : ''}" data-provider="anthropic" onclick="switchAIProvider('anthropic')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/></svg> Claude</button>
          <!-- ROUTSTR DISABLED — waiting for CORS fix (github.com/Routstr/routstr-core/issues/375)
          <button class="ai-provider-btn${provider === 'routstr' ? ' active' : ''}" data-provider="routstr" onclick="switchAIProvider('routstr')"><svg class="ai-provider-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Routstr</button>
          -->
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
  if (provider === 'anthropic') {
    const currentKey = getApiKey();
    let cachedModels = []; try { cachedModels = JSON.parse(localStorage.getItem('labcharts-anthropic-models') || '[]'); } catch(e) {}
    const currentModel = getAnthropicModel();
    let modelHtml;
    if (cachedModels.length > 0) {
      const opts = buildModelOptions('anthropic', cachedModels, currentModel, function(m) { return m.display_name || m.id; });
      modelHtml = `<div style="margin-top:12px" id="anthropic-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="anthropic-model-select" style="margin-top:4px" onchange="setAnthropicModel(this.value);updateAnthropicModelPricing(this.value)">${opts}</select>
        <div id="anthropic-model-pricing" style="margin-top:4px">${renderModelPricingHint('anthropic', currentModel)}</div>
      </div>`;
    } else {
      modelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="anthropic-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getAnthropicModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
    }
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Anthropic's AI models, run in the cloud. Requires an API key (pay-per-use).</div>
      <div class="api-key-status" id="api-key-status">
        ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
      </div>
      <input type="password" class="api-key-input" id="api-key-input" placeholder="sk-ant-api03-..." value="${currentKey}">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="import-btn import-btn-primary" id="save-api-key-btn" onclick="handleSaveApiKey()">Save & Validate</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveApiKey()">Remove Key</button>' : ''}
      </div>
      ${modelHtml}
      <div class="api-key-notice">Your API key is stored locally in your browser and sent directly to Anthropic's API. It never passes through any third-party server.</div>
    </div>`;
  }
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
      <input type="password" class="api-key-input" id="openrouter-key-input" placeholder="sk-or-..." value="${currentKey}">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="import-btn import-btn-primary" id="save-openrouter-key-btn" onclick="handleSaveOpenRouterKey()">Save & Validate</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveOpenRouterKey()">Remove Key</button>' : ''}
      </div>
      ${orModelHtml}
      <div class="api-key-notice">Your key is stored locally and sent directly to OpenRouter. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style="color:var(--accent)">Get an API key</a></div>
    </div>`;
  }
  /* ROUTSTR DISABLED — waiting for CORS fix (github.com/Routstr/routstr-core/issues/375)
  if (provider === 'routstr') { ... }
  */
  if (provider === 'venice') {
    const currentKey = getVeniceKey();
    const veniceModel = getVeniceModel();
    let cachedVeniceModels = []; try { cachedVeniceModels = JSON.parse(localStorage.getItem('labcharts-venice-models') || '[]'); } catch(e) {}
    let veniceModelHtml;
    if (cachedVeniceModels.length > 0) {
      const opts = buildModelOptions('venice', cachedVeniceModels, veniceModel, function(m) { return m.name || m.id; });
      veniceModelHtml = `<div style="margin-top:12px" id="venice-model-area">
        <label style="font-size:12px;color:var(--text-muted)">Model</label>
        <select class="api-key-input" id="venice-model-select" style="margin-top:4px" onchange="setVeniceModel(this.value);updateVeniceModelPricing(this.value)">${opts}</select>
        <div id="venice-model-pricing" style="margin-top:4px">${renderModelPricingHint('venice', veniceModel)}</div>
      </div>`;
    } else {
      veniceModelHtml = `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)" id="venice-model-area">Model: <span style="color:var(--text-primary)">${escapeHTML(getVeniceModelDisplay())}</span>${currentKey ? ' <span style="font-size:11px">(save key to load models)</span>' : ''}</div>`;
    }
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Privacy-focused cloud AI. Uncensored models, no data stored. Requires API key.</div>
      <div class="api-key-status" id="venice-key-status">
        ${currentKey ? '<span style="color:var(--green)">&#10003; Connected</span>' : '<span style="color:var(--text-muted)">No key set</span>'}
      </div>
      <input type="password" class="api-key-input" id="venice-key-input" placeholder="venice-..." value="${currentKey}">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="import-btn import-btn-primary" id="save-venice-key-btn" onclick="handleSaveVeniceKey()">Save & Validate</button>
        ${currentKey ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveVeniceKey()">Remove Key</button>' : ''}
      </div>
      ${veniceModelHtml}
      <div class="api-key-notice">Your key is stored locally and sent directly to Venice AI. No data is stored on their servers. <a href="https://venice.ai/settings/api" target="_blank" rel="noopener" style="color:var(--accent)">Get an API key</a></div>
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
        <input type="text" class="api-key-input" id="local-ai-url-input" value="${config.url}" placeholder="http://localhost:11434" style="flex:1">
        <button class="import-btn import-btn-secondary" onclick="testOllamaConnection()" style="white-space:nowrap">Test</button>
      </div>
    </div>
    <div style="margin-top:8px">
      <label style="font-size:12px;color:var(--text-muted)">API Key <span style="font-size:11px">(optional — most local servers don't need one)</span></label>
      <input type="password" class="api-key-input" id="local-ai-apikey-input" value="${escapeHTML(config.apiKey)}" placeholder="Leave empty if not required" style="margin-top:4px">
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
  const key = getApiKey();
  if (key && document.getElementById('anthropic-model-area')) {
    fetchAnthropicModels(key).then(function(models) { if (models.length) renderAnthropicModelDropdown(models); });
  }
  const orKey = getOpenRouterKey();
  if (orKey && document.getElementById('openrouter-model-area')) {
    fetchOpenRouterModels(orKey).then(function(models) { if (models.length) renderOpenRouterModelDropdown(models); });
  }
  /* ROUTSTR DISABLED
  const routstrKey = getRoutstrKey();
  if (routstrKey && document.getElementById('routstr-model-area')) {
    fetchRoutstrModels(routstrKey).then(function(models) { if (models.length) renderRoutstrModelDropdown(models); });
  }
  */
  const veniceKey = getVeniceKey();
  if (veniceKey && document.getElementById('venice-model-area')) {
    fetchVeniceModels(veniceKey).then(function(models) { if (models.length) renderVeniceModelDropdown(models); });
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
    text.textContent = (e instanceof TypeError || e.message?.includes('Failed to fetch'))
      ? 'Blocked by CORS — start Ollama with OLLAMA_ORIGINS=* ollama serve'
      : 'Not connected — check URL and ensure your server is running';
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
    text.textContent = (e instanceof TypeError || e.message?.includes('Failed to fetch'))
      ? 'Blocked by CORS — start Ollama with OLLAMA_ORIGINS=* ollama serve'
      : 'Not connected — check URL and ensure your server is running';
    updatePrivacyStatusCard();
  }
}

export function updateAnthropicModelPricing(modelId) {
  const el = document.getElementById('anthropic-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('anthropic', modelId || getAnthropicModel());
}

export function updateVeniceModelPricing(modelId) {
  const el = document.getElementById('venice-model-pricing');
  if (el) el.innerHTML = renderModelPricingHint('venice', modelId || getVeniceModel());
}

export async function handleSaveApiKey() {
  const input = document.getElementById('api-key-input');
  const btn = document.getElementById('save-api-key-btn');
  const status = document.getElementById('api-key-status');
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateApiKey(key);
  if (result.valid) {
    await saveApiKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models…</span>';
    const models = await fetchAnthropicModels(key);
    if (models.length) {
      renderAnthropicModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveApiKey() {
  localStorage.removeItem('labcharts-api-key');
  updateKeyCache('labcharts-api-key', null);
  localStorage.removeItem('labcharts-anthropic-models');
  localStorage.removeItem('labcharts-anthropic-model');
  showNotification('API key removed', 'info');
  openSettingsModal();
}

export function renderAnthropicModelDropdown(models) {
  const area = document.getElementById('anthropic-model-area');
  if (!area || !models.length) return;
  const currentModel = getAnthropicModel();
  const opts = buildModelOptions('anthropic', models, currentModel, function(m) { return m.display_name || m.id; });
  area.innerHTML = '<label style="font-size:12px;color:var(--text-muted)">Model</label>' +
    '<select class="api-key-input" id="anthropic-model-select" style="margin-top:4px" onchange="setAnthropicModel(this.value);updateAnthropicModelPricing(this.value)">' + opts + '</select>' +
    '<div id="anthropic-model-pricing" style="margin-top:4px">' + renderModelPricingHint('anthropic', currentModel) + '</div>';
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
    const models = await fetchVeniceModels(key);
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

/* ROUTSTR DISABLED — waiting for CORS fix (github.com/Routstr/routstr-core/issues/375)
export function updateRoutstrModelPricing(modelId) { ... }
export async function handleSaveRoutstrKey() { ... }
export function handleRemoveRoutstrKey() { ... }
export function renderRoutstrModelDropdown(models) { ... }
*/






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
  updateAnthropicModelPricing,
  updateVeniceModelPricing,
  updateOpenRouterModelPricing,
  // ROUTSTR DISABLED: updateRoutstrModelPricing,
  handleSaveApiKey,
  handleRemoveApiKey,
  renderAnthropicModelDropdown,
  handleSaveVeniceKey,
  handleRemoveVeniceKey,
  renderVeniceModelDropdown,
  handleSaveOpenRouterKey,
  handleRemoveOpenRouterKey,
  renderOpenRouterModelDropdown,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange,
  /* ROUTSTR DISABLED
  handleSaveRoutstrKey,
  handleRemoveRoutstrKey,
  renderRoutstrModelDropdown,
  */
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
