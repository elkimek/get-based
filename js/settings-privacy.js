// @ts-check
// settings-privacy.js - Settings privacy and Sun data-source controls.

import { getOllamaPIIApiKey, getOllamaPIIUrl, getOllamaPIIModel } from './api.js';
import { isOllamaPIIEnabled, setOllamaPIIEnabled, checkOllamaPII } from './pii.js';
import { escapeAttr, isPIIReviewEnabled, isAnalyticsEnabled, showNotification } from './utils.js';
import {
  getSettingsMeteoConfig,
  saveSettingsMeteoConfig,
} from './settings-runtime.js';

export function renderPrivacySection() {
  const piiUrl = getOllamaPIIUrl();
  const piiApiKey = getOllamaPIIApiKey();
  const piiEnabled = isOllamaPIIEnabled();
  return `<div class="settings-action-row privacy-overview-row">
      <div class="privacy-overview-icon" aria-hidden="true">&#128274;</div>
      <div class="settings-copy">
        <div class="settings-copy-title">Privacy protection runs before text-based AI analysis</div>
        <div class="settings-copy-desc">Text imports use deterministic patterns and, optionally, a trusted self-hosted model (this device, LAN, or your remote server) to replace likely identifiers. Review remains recommended because automated detection can miss unusual layouts. Image imports cannot be scrubbed and always require a separate warning.</div>
      </div>
    </div>
    <div class="privacy-status-card" id="privacy-status-card">
      <div class="privacy-status-icon" id="privacy-status-icon">&#128274;</div>
      <div class="privacy-status-body">
        <div class="privacy-status-title" id="privacy-status-title">Checking...</div>
        <div class="privacy-status-detail" id="privacy-status-detail"></div>
      </div>
    </div>
    <div class="privacy-configure-toggle" data-settings-action="toggle-privacy-configure">
      <span class="privacy-configure-arrow" id="privacy-configure-arrow">&#9654;</span>
      Configure Local AI
    </div>
    <div class="privacy-configure-body" id="privacy-configure-body" style="display:none">
      <form id="pii-model-section">
        <input type="text" name="privacy-provider" value="local-ai" autocomplete="username" hidden>
        <div class="local-ai-status" id="pii-local-status">
          <span class="local-ai-status-dot" id="pii-local-dot"></span>
          <span id="pii-local-status-text">Click Test to check</span>
        </div>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted)">Privacy server API key <span style="font-size:11px">(optional, stored separately)</span></label>
          <input type="password" class="api-key-input" id="pii-local-apikey-input" value="${escapeAttr(piiApiKey)}" placeholder="Leave empty if not required" style="margin-top:4px" autocomplete="new-password">
        </div>
        <div style="margin-top:8px">
          <label style="font-size:12px;color:var(--text-muted)">Server address</label>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
            <input type="text" class="api-key-input" id="pii-local-url-input" value="${escapeAttr(piiUrl)}" placeholder="http://localhost:11434" style="flex:1">
            <button type="button" class="import-btn import-btn-secondary" data-settings-action="test-pii-ollama" style="white-space:nowrap">Test</button>
          </div>
        </div>
        <div id="pii-model-dropdown" style="margin-top:8px;display:none">
          <label style="font-size:12px;color:var(--text-muted)">Privacy model <span style="font-size:11px">(can be a smaller, faster model)</span></label>
          <select class="api-key-input" id="pii-model-select" style="margin-top:4px" data-settings-action="set-pii-model"></select>
        </div>
      </form>
    </div>
    <div class="settings-action-row privacy-setting-row">
      <div class="settings-copy">
        <div class="settings-copy-title">Use self-hosted AI for privacy protection</div>
        <div class="settings-copy-desc">Requires a server you trust; the original report is sent to that endpoint for scrubbing. Cloud-tagged models are blocked. When disabled, deterministic pattern matching is used instead.</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="pii-local-toggle" ${piiEnabled ? 'checked' : ''} data-settings-action="toggle-pii-local">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="settings-action-row privacy-setting-row">
      <div class="settings-copy">
        <div class="settings-copy-title">Review obfuscated text before sending to AI</div>
        <div class="settings-copy-desc">Pause after privacy protection runs so you can inspect what the AI is about to receive.</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="pii-review-toggle" ${isPIIReviewEnabled() ? 'checked' : ''} data-settings-action="toggle-pii-review">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

export function renderPrivacyAnalyticsSection() {
  return `<div class="settings-action-row">
    <div class="settings-copy">
      <div class="settings-copy-title">Send anonymous usage stats</div>
      <div class="settings-copy-desc">I track cookieless pageviews and outbound affiliate clicks only. No health data, viewed records, user identity, or health context is sent.</div>
      <div class="privacy-setting-note">Takes effect on next launch.</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="analytics-toggle" ${isAnalyticsEnabled() ? 'checked' : ''} data-settings-action="set-analytics">
      <span class="toggle-slider"></span>
    </label>
  </div>`;
}

function _renderMeteoModeOption(mode, label, desc) {
  const cur = getSettingsMeteoConfig().mode || 'auto';
  const checked = cur === mode;
  return `<label style="display:flex;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;${checked ? 'background:var(--bg-card);border-color:var(--accent);' : ''}">
    <input type="radio" name="meteo-mode" value="${mode}" ${checked ? 'checked' : ''} data-sun-source-action="set-meteo-mode" style="margin-top:3px">
    <span>
      <span style="font-size:13px;font-weight:500;color:var(--text-primary)">${label}</span>
      <br><span style="font-size:11px;color:var(--text-muted);line-height:1.4">${desc}</span>
    </span>
  </label>`;
}

// Render the Sun Data Source settings block. Lives on the Light & Sun
// page (called from views.showLight) - moved out of Settings -> Privacy
// in v1.7.x because the URL/bearer/mode fields are feature config, not
// privacy posture. The `Round location to ~11 km grid` toggle inside is
// privacy-flavored but stays here for cohesion.
export function renderSunDataSourceSettings() {
  const cfg = getSettingsMeteoConfig();
  return `<div class="local-ai-settings" id="sun-data-source-section">
    <h4 style="margin:0 0 6px 0;font-size:13px;color:var(--text-primary)">☀ Sun data source</h4>
    <div class="ai-provider-desc" style="margin-bottom:10px">Where the Light &amp; Sun lens fetches UV, ozone, clouds, and air-quality model data. It uses your privacy-rounded home postal area or country by default. Current device location is optional, rounded locally, and kept only for today.</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${_renderMeteoModeOption('auto', 'Default — CAMS enhanced', 'Direct CAMS UV plus CAMS ozone and aerosols, with recent satellite cloud correction where coverage exists and Open-Meteo weather context. Falls back to Open-Meteo UVI when CAMS is unavailable.')}
      ${_renderMeteoModeOption('open-meteo', 'Open-Meteo only', 'Skip the CAMS relay. Uses Open-Meteo model UVI and weather, without CAMS total-column ozone or satellite cloud enhancement.')}
      ${_renderMeteoModeOption('selfhost', 'Self-hosted server', 'You run your own getbased-uvdata box. Lat/lon never leaves your infrastructure. Paste the URL + bearer below.')}
    </div>
    <div id="meteo-selfhost-fields" style="margin-top:10px;${cfg.mode === 'selfhost' ? '' : 'display:none'}">
      <label style="font-size:12px;color:var(--text-muted)">Server URL</label>
      <input type="text" class="api-key-input" id="meteo-selfhost-url" value="${escapeAttr(cfg.selfhostUrl || '')}" placeholder="https://meteo.example.com" style="width:100%;margin-top:4px" data-sun-source-action="save-meteo-selfhost">
      <label style="font-size:12px;color:var(--text-muted);margin-top:8px;display:block">Bearer token (optional)</label>
      <input type="password" class="api-key-input" id="meteo-selfhost-bearer" value="${escapeAttr(cfg.selfhostBearer || '')}" placeholder="••••••••" style="width:100%;margin-top:4px" data-sun-source-action="save-meteo-selfhost" autocomplete="new-password">
    </div>
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-top:14px">
      <span style="font-size:13px">Round location to ~11 km grid before sending<br><span style="font-size:11px;color:var(--text-muted)">Default ON. Stops the data source from seeing your exact address. Disable for slightly sharper UV math.</span></span>
      <label class="toggle-switch" style="margin-top:2px">
        <input type="checkbox" id="meteo-privacy-rounding" ${(cfg.privacyRounding ?? 0.1) > 0 ? 'checked' : ''} data-sun-source-action="toggle-meteo-rounding">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>`;
}

function setMeteoMode(mode) {
  const cfg = getSettingsMeteoConfig();
  cfg.mode = mode;
  if (!saveSettingsMeteoConfig(cfg)) {
    notifyMeteoSaveUnavailable();
    return;
  }
  const fields = document.getElementById('meteo-selfhost-fields');
  if (fields) fields.style.display = mode === 'selfhost' ? '' : 'none';
}

function notifyMeteoSaveUnavailable() {
  showNotification('Sun data-source settings are still loading. Try again in a moment.', 'warning');
}

function saveMeteoSelfhost() {
  const cfg = getSettingsMeteoConfig();
  const url = /** @type {HTMLInputElement | null} */ (document.getElementById('meteo-selfhost-url'))?.value?.trim() || '';
  const bearer = /** @type {HTMLInputElement | null} */ (document.getElementById('meteo-selfhost-bearer'))?.value?.trim() || '';
  cfg.selfhostUrl = url;
  cfg.selfhostBearer = bearer;
  if (!saveSettingsMeteoConfig(cfg)) {
    notifyMeteoSaveUnavailable();
  }
}

function toggleMeteoRounding(enabled) {
  const cfg = getSettingsMeteoConfig();
  cfg.privacyRounding = enabled ? 0.1 : 0;
  if (!saveSettingsMeteoConfig(cfg)) {
    notifyMeteoSaveUnavailable();
  }
}

let sunDataSourceDelegatesInstalled = false;

function closestSunDataSourceControl(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-sun-source-action]');
  return el instanceof HTMLElement && el.closest('#sun-data-source-section') ? el : null;
}

function handleSunDataSourceChange(event) {
  const el = closestSunDataSourceControl(event);
  if (!el) return;
  const action = el.dataset.sunSourceAction;
  if (action === 'set-meteo-mode') {
    const mode = (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) ? el.value || 'auto' : 'auto';
    setMeteoMode(mode);
  } else if (action === 'save-meteo-selfhost') {
    saveMeteoSelfhost();
  } else if (action === 'toggle-meteo-rounding') {
    toggleMeteoRounding(el instanceof HTMLInputElement && el.checked);
  }
}

export function installSunDataSourceDelegates() {
  if (sunDataSourceDelegatesInstalled || typeof document === 'undefined') return;
  sunDataSourceDelegatesInstalled = true;
  document.addEventListener('change', handleSunDataSourceChange);
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
    // Expand the configure panel so user can set up Ollama.
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
  // If opt-in is off, always show basic.
  if (!isOllamaPIIEnabled()) { enhanced = false; }
  // If not passed explicitly, check PII Ollama.
  else if (enhanced === undefined) {
    try {
      const result = await checkOllamaPII();
      enhanced = result.available && result.models.length > 0;
    } catch { enhanced = false; }
  }
  if (enhanced) {
    const model = getOllamaPIIModel();
    card.className = 'privacy-status-card privacy-status-enhanced';
    if (icon) icon.innerHTML = '&#128274;';
    title.textContent = 'Enhanced protection';
    detail.textContent = `Trusted Local AI (${model}) adds contextual detection, followed by deterministic checks. Review the result before sending because no automated detector can guarantee every identifier is removed.`;
  } else {
    card.className = 'privacy-status-card privacy-status-basic';
    if (icon) icon.innerHTML = '&#128274;';
    title.textContent = 'Basic protection';
    detail.innerHTML = 'Deterministic pattern matching catches common labeled names, IDs, emails, phone numbers, and addresses. It may miss unusual layouts or non-English personal data.<br><span style="margin-top:4px;display:inline-block">A trusted Local AI model can add contextual detection, but review is still recommended.</span>';
  }
}
