// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PrivacyPreferences, PrivacySettingsView } from '../js/settings-privacy-contract.js';
const services = vi.hoisted(() => ({
  enabled: false, model: 'local-text', url: 'http://localhost:11434',
  check: vi.fn<() => Promise<{ available: boolean; models: string[] }>>(),
  consent: null as { version: string; approvals: Record<string, { accepted: boolean; recipient: string }> } | null,
  routes: null as { version: string; confirmations: Record<string, { confirmed: boolean; endpointOrigin: string }> } | null,
}));
vi.mock('../js/api.js', () => ({ getOllamaPIIApiKey: () => '', getOllamaPIIUrl: () => services.url, getOllamaPIIModel: () => services.model }));
vi.mock('../js/pii.js', () => ({ isOllamaPIIEnabled: () => services.enabled, setOllamaPIIEnabled: (enabled: unknown) => { services.enabled = !!enabled; }, checkOllamaPII: services.check }));
vi.mock('../js/cloud-ai-consent.js', () => ({ CLOUD_AI_CONSENT_VERSION: 'current', AI_ROUTE_CONFIRMATION_VERSION: 'current',
  getCloudAIConsentRecord: () => services.consent, getAIRouteConfirmationRecord: () => services.routes, hasAcknowledgedAITransparency: () => true,
  withdrawCloudAIConsent: () => { services.consent = null; }, withdrawAIRouteConfirmations: () => { services.routes = null; },
}));
vi.mock('../js/utils.js', () => ({ escapeAttr: String, isPIIReviewEnabled: () => true, isAnalyticsEnabled: () => false, showNotification: vi.fn() }));
import PrivacySettings, { mount, unmount, flushSync } from '../js/components/PrivacySettings.svelte.native.js';
import { getPrivacySettingsView, getPrivacyConnectionView } from '../js/settings-privacy-view.js';
import { mountPrivacySettingsPanel, disposePrivacySettingsPanel } from '../js/settings-privacy-panel.js';
import { renderPrivacySection, getPrivacyConsentSnapshot, updatePrivacyStatusCard, toggleOllamaPII, togglePrivacyConfigure, withdrawCloudAIConsentFromSettings, withdrawAIRouteConfirmationsFromSettings } from '../js/settings-privacy.js';
let component: PrivacySettingsView | null = null;
const preferences = (): PrivacyPreferences => ({ url: services.url, apiKey: '<credential>', localEnabled: services.enabled, reviewEnabled: true, analyticsEnabled: false,
  consent: { transparencyAcknowledged: false, remoteRecipients: ['<img src=x onerror=alert(1)>'], privateRecipients: ['http://lan.local'] } });
beforeEach(() => {
  document.body.innerHTML = `<div id="settings-modal"><div id="settings-tab-privacy">${renderPrivacySection()}</div></div>`;
  services.enabled = false; services.model = 'local-text'; services.url = 'http://localhost:11434'; services.consent = null; services.routes = null;
  services.check.mockReset().mockResolvedValue({ available: true, models: ['local-text'] });
});
afterEach(async () => { disposePrivacySettingsPanel(); if (component) await unmount(component); component = null; document.body.replaceChildren(); });
it('renders consent names as text, labels every provider field and preserves drafts through status/consent changes', () => {
  component = mount(PrivacySettings, { target: document.getElementById('privacy-settings-content')!, props: { initial: preferences() } }); flushSync();
  expect(document.querySelector('img')).toBeNull(); expect(document.getElementById('cloud-ai-consent-controls')!.textContent).toContain('<img src=x');
  for (const id of ['pii-local-apikey-input', 'pii-local-url-input', 'pii-model-select']) expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull();
  const url = document.getElementById('pii-local-url-input') as HTMLInputElement; url.value = 'http://unsaved';
  flushSync(() => { component!.setConsent({ transparencyAcknowledged: true, remoteRecipients: [], privateRecipients: [] }); component!.setProtection(true, '<model>'); component!.setConnection({ status: 'connected', message: 'Verified', models: ['<model>'], selectedModel: '<model>' }); });
  expect(document.getElementById('pii-local-url-input')).toBe(url); expect(url.value).toBe('http://unsaved');
  expect(document.querySelector<HTMLSelectElement>('#pii-model-select')!.value).toBe('<model>');
  expect(document.querySelector<HTMLButtonElement>('[data-settings-action="withdraw-cloud-ai-consent"]')!.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('[data-settings-action="withdraw-ai-route-confirmations"]')!.disabled).toBe(true);
});
it('mounts exactly once, controls expansion, and invalidates a connection view when replaced', () => {
  mountPrivacySettingsPanel(); const input = document.getElementById('pii-local-url-input'); const oldView = getPrivacyConnectionView()!;
  togglePrivacyConfigure(); expect(document.getElementById('privacy-configure-body')!.style.display).toBe('block');
  expect(document.querySelector('[aria-controls="privacy-configure-body"]')!.getAttribute('aria-expanded')).toBe('true');
  mountPrivacySettingsPanel(); expect(document.getElementById('pii-local-url-input')).toBe(input);
  disposePrivacySettingsPanel(); mountPrivacySettingsPanel(); expect(oldView.isCurrent()).toBe(false);
  oldView.update({ message: 'stale', models: ['stale'] }); expect(document.getElementById('pii-local-status-text')!.textContent).toBe('Click Test to check');
  expect(getPrivacySettingsView()).not.toBeNull();
});
it('does not let an in-flight enhanced status override disabling privacy AI', async () => {
  services.enabled = true; let complete!: (value: { available: boolean; models: string[] }) => void;
  services.check.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  mountPrivacySettingsPanel(); toggleOllamaPII(false); complete({ available: true, models: ['local-text'] }); await Promise.resolve();
  expect(document.getElementById('privacy-status-title')!.textContent).toBe('Basic protection');
});
it('ignores an old status response after the component is replaced or its provider config changes', async () => {
  mountPrivacySettingsPanel(); services.enabled = true;
  let complete!: (value: { available: boolean; models: string[] }) => void;
  services.check.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const pending = updatePrivacyStatusCard(); services.url = 'http://new-server';
  complete({ available: true, models: ['local-text'] }); await pending;
  expect(document.getElementById('privacy-status-title')!.textContent).toBe('Basic protection');
  const previous = updatePrivacyStatusCard(); disposePrivacySettingsPanel(); services.enabled = false; mountPrivacySettingsPanel();
  complete({ available: true, models: ['local-text'] }); await previous;
  expect(document.getElementById('privacy-status-title')!.textContent).toBe('Basic protection');
});
it('withdraws independent destination records and immediately updates only their views', () => {
  services.consent = { version: 'current', approvals: { a: { accepted: true, recipient: 'remote.example' } } };
  services.routes = { version: 'current', confirmations: { a: { confirmed: true, endpointOrigin: 'http://lan' } } };
  mountPrivacySettingsPanel(); const url = document.getElementById('pii-local-url-input') as HTMLInputElement; url.value = 'draft';
  withdrawCloudAIConsentFromSettings(); expect(getPrivacyConsentSnapshot().remoteRecipients).toEqual([]);
  expect(getPrivacyConsentSnapshot().privateRecipients).toEqual(['http://lan']);
  expect(document.querySelector<HTMLButtonElement>('[data-settings-action="withdraw-cloud-ai-consent"]')!.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('[data-settings-action="withdraw-ai-route-confirmations"]')!.disabled).toBe(false);
  withdrawAIRouteConfirmationsFromSettings(); expect(getPrivacyConsentSnapshot().privateRecipients).toEqual([]); expect(url.value).toBe('draft');
});
it('excludes obsolete and unaccepted destination records from withdrawal controls', () => {
  services.consent = { version: 'old', approvals: { a: { accepted: true, recipient: 'old' } } };
  services.routes = { version: 'current', confirmations: { a: { confirmed: false, endpointOrigin: 'unconfirmed' } } };
  expect(getPrivacyConsentSnapshot()).toEqual({ transparencyAcknowledged: true, remoteRecipients: [], privateRecipients: [] });
});
