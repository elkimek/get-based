// settings-privacy.js - Settings privacy and Sun data-source controls.

// Private operations preserve unchecked config fields and original coercion.
interface MeteoConfigOperations { mode?: unknown; selfhostUrl?: unknown; selfhostBearer?: unknown; privacyRounding?: number | null }

import { getOllamaPIIApiKey, getOllamaPIIUrl, getOllamaPIIModel } from './api.js';
import { isOllamaPIIEnabled, setOllamaPIIEnabled, checkOllamaPII } from './pii.js';
import {
  CLOUD_AI_CONSENT_VERSION,
  AI_ROUTE_CONFIRMATION_VERSION,
  getCloudAIConsentRecord,
  getAIRouteConfirmationRecord,
  hasAcknowledgedAITransparency,
  withdrawCloudAIConsent,
  withdrawAIRouteConfirmations,
} from './cloud-ai-consent.js';
import { isPIIReviewEnabled, isAnalyticsEnabled, showNotification } from './utils.js';
import type { PrivacyConsent, PrivacyPreferences } from './settings-privacy-contract.js';
import { getPrivacySettingsView } from './settings-privacy-view.js';
import { isOfficialGetbasedHost } from './url-safety.js';
import {
  getSettingsMeteoConfig,
  saveSettingsMeteoConfig,
} from './settings-runtime.js';

import { projectSunModeOption, projectSunCredential } from './sun-data-source-presentation.js';
import { renderSunDataSource } from './sun-data-source-rendering.js';

// Retain the public render entrypoint as a component host. Settings mounts its
// contents once; callers do not receive a second native implementation.
export function renderPrivacySection(): string {
  return '<div id="privacy-settings-content"></div>';
}

export function getPrivacyConsentSnapshot(): PrivacyConsent {
  const record = getCloudAIConsentRecord();
  const approvals = record?.version === CLOUD_AI_CONSENT_VERSION
    ? Object.values(record.approvals || {}).filter(approval => approval?.accepted === true) : [];
  const routeRecord = getAIRouteConfirmationRecord();
  const confirmations = routeRecord?.version === AI_ROUTE_CONFIRMATION_VERSION
    ? Object.values(routeRecord.confirmations || {}).filter(confirmation => confirmation?.confirmed === true) : [];
  return {
    transparencyAcknowledged: hasAcknowledgedAITransparency(),
    remoteRecipients: approvals.map(approval => String(approval.recipient || approval.provider || 'cloud provider')),
    privateRecipients: confirmations.map(confirmation => String(confirmation.endpointOrigin || confirmation.recipient || 'private-network endpoint')),
  };
}

export function getPrivacyPreferencesSnapshot(): PrivacyPreferences {
  return {
    url: getOllamaPIIUrl(), apiKey: getOllamaPIIApiKey(), localEnabled: isOllamaPIIEnabled(),
    reviewEnabled: isPIIReviewEnabled(), analyticsEnabled: isAnalyticsEnabled(), consent: getPrivacyConsentSnapshot(),
  };
}

export function withdrawCloudAIConsentFromSettings() {
  withdrawCloudAIConsent();
  getPrivacySettingsView()?.setConsent(getPrivacyConsentSnapshot());
  showNotification('Remote AI approval withdrawn. No future remote AI request will be sent until you approve again.', 'success', 5000);
}

export function withdrawAIRouteConfirmationsFromSettings() {
  withdrawAIRouteConfirmations();
  getPrivacySettingsView()?.setConsent(getPrivacyConsentSnapshot());
  showNotification('Private-network AI destinations cleared. Each endpoint must be confirmed again before a request is sent.', 'success', 5000);
}

function _renderMeteoModeOption(mode: unknown, label: unknown, desc: unknown) {
  const cur = (getSettingsMeteoConfig() as { mode?: unknown }).mode || 'auto';
  const checked = cur === mode;
  return projectSunModeOption(mode, label, desc, checked);
}

// Render the Sun Data Source settings block. Lives on the Light & Sun
// page (called from views.showLight) - moved out of Settings -> Privacy
// in v1.7.x because the URL/bearer/mode fields are feature config, not
// privacy posture. The `Round location to ~11 km grid` toggle inside is
// privacy-flavored but stays here for cohesion.
export function getSunDataSourceSettingsView(): import('./sun-data-source-presentation.js').SunDataSourceView {
  const cfg = (getSettingsMeteoConfig() as MeteoConfigOperations);
  const officialHost = isOfficialGetbasedHost();
  return {
    officialHost,
    options: [
      _renderMeteoModeOption('auto', officialHost ? 'Private CAMS relay + fallback' : 'Deployment CAMS relay', officialHost
        ? 'Sends only ~11 km rounded coordinates and time through the fixed getbased CAMS route; falls back browser-direct to Open-Meteo.'
        : 'Uses this self-hosted deployment\'s CAMS relay, then falls back to browser-direct Open-Meteo.'),
      _renderMeteoModeOption('open-meteo', 'Browser-direct Open-Meteo', 'Your browser sends privacy-rounded coordinates directly to Open-Meteo. getbased and Vercel do not receive them.'),
      _renderMeteoModeOption('selfhost', 'Self-hosted server', 'You run your own getbased-uvdata box. Lat/lon never leaves your infrastructure. Paste the URL + bearer below.'),
    ],
    showSelfhost: cfg.mode === 'selfhost',
    url: projectSunCredential(cfg.selfhostUrl || ''),
    bearer: projectSunCredential(cfg.selfhostBearer || ''),
    rounding: officialHost ? null : (cfg.privacyRounding ?? 0.1) > 0,
  };
}
export function renderSunDataSourceSettings(){return renderSunDataSource(getSunDataSourceSettingsView());}

async function setMeteoMode(mode: unknown) {
  const cfg = (getSettingsMeteoConfig() as MeteoConfigOperations);
  cfg.mode = mode;
  if (!await saveSettingsMeteoConfig(cfg)) {
    notifyMeteoSaveUnavailable();
    return;
  }
  const fields = document.getElementById('meteo-selfhost-fields');
  if (fields) fields.style.display = mode === 'selfhost' ? '' : 'none';
}

function notifyMeteoSaveUnavailable() {
  showNotification('Sun data-source settings could not be saved securely. Try again in a moment.', 'warning');
}

async function saveMeteoSelfhost() {
  const cfg = (getSettingsMeteoConfig() as MeteoConfigOperations);
  const url = (document.getElementById('meteo-selfhost-url') as HTMLInputElement | null)?.value?.trim() || '';
  const bearer = (document.getElementById('meteo-selfhost-bearer') as HTMLInputElement | null)?.value?.trim() || '';
  cfg.selfhostUrl = url;
  cfg.selfhostBearer = bearer;
  if (!await saveSettingsMeteoConfig(cfg)) {
    notifyMeteoSaveUnavailable();
  }
}

async function toggleMeteoRounding(enabled: unknown) {
  const cfg = (getSettingsMeteoConfig() as MeteoConfigOperations);
  cfg.privacyRounding = enabled ? 0.1 : 0;
  if (!await saveSettingsMeteoConfig(cfg)) {
    notifyMeteoSaveUnavailable();
  }
}

let sunDataSourceDelegatesInstalled = false;

function closestSunDataSourceControl(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest('[data-sun-source-action]');
  return el instanceof HTMLElement && el.closest('#sun-data-source-section') ? el : null;
}

async function handleSunDataSourceChange(event: Event) {
  const el = closestSunDataSourceControl(event);
  if (!el) return;
  const action = el.dataset.sunSourceAction;
  if (action === 'set-meteo-mode') {
    const mode = (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) ? el.value || 'auto' : 'auto';
    await setMeteoMode(mode);
  } else if (action === 'save-meteo-selfhost') {
    await saveMeteoSelfhost();
  } else if (action === 'toggle-meteo-rounding') {
    await toggleMeteoRounding(el instanceof HTMLInputElement && el.checked);
  }
}

export function installSunDataSourceDelegates() {
  if (sunDataSourceDelegatesInstalled || typeof document === 'undefined') return;
  sunDataSourceDelegatesInstalled = true;
  document.addEventListener('change', handleSunDataSourceChange);
}

export function togglePrivacyConfigure() {
  getPrivacySettingsView()?.configure();
}

export function toggleOllamaPII(enabled: unknown) {
  setOllamaPIIEnabled(enabled);
  void updatePrivacyStatusCard();
  if (enabled) getPrivacySettingsView()?.configure(true);
}

let protectionGeneration = 0;
export async function updatePrivacyStatusCard(enhanced?: unknown): Promise<void> {
  const view = getPrivacySettingsView();
  const generation = ++protectionGeneration;
  if (!view) return;
  const url = getOllamaPIIUrl();
  const model = getOllamaPIIModel();
  if (!isOllamaPIIEnabled()) enhanced = false;
  else if (enhanced === undefined) {
    try {
      const result = await checkOllamaPII();
      enhanced = result.available && result.models.length > 0;
    } catch { enhanced = false; }
  }
  // A later toggle, model/config change or remount owns the new presentation.
  if (generation !== protectionGeneration || getPrivacySettingsView() !== view
    || getOllamaPIIUrl() !== url || getOllamaPIIModel() !== model) return;
  view.setProtection(!!enhanced && isOllamaPIIEnabled(), model);
}
