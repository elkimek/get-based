// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { _setTestSessionKey, encryptedSetItem } from '../js/crypto.js';
import { loadFocusCard } from '../js/focus-card.js';
import { renderSupplementImpact } from '../js/supplement-impact.js';

const fixture = vi.hoisted(() => ({
  provider: true,
  infer: vi.fn(async () => ({ text: '{"Fictional supplement":{"dot":"green","summary":"Saved supplement summary."}}' })),
  chart: {
    dates: ['2026-05-01', '2026-06-01'],
    categories: { chemistry: { markers: { example: {
      name: 'Synthetic marker', values: [20, 30], unit: 'mg/L', refMin: 10, refMax: 40,
    } } } },
  },
}));

vi.mock('../js/ai-feature-routing.js', async importOriginal => ({
  ...await importOriginal<typeof import('../js/ai-feature-routing.js')>(),
  hasAssistantFeatureProvider: () => fixture.provider,
  callAssistantFeatureAI: fixture.infer,
  getAssistantFeatureIdentity: () => null,
}));
vi.mock('../js/data.js', async importOriginal => ({
  ...await importOriginal<typeof import('../js/data.js')>(),
  getActiveData: () => fixture.chart,
  getFocusCardFingerprint: () => 'current-synthetic-fingerprint',
}));
vi.mock('../js/lab-context-disclosure.js', async importOriginal => ({
  ...await importOriginal<typeof import('../js/lab-context-disclosure.js')>(),
  createLabContextDisclosure: () => ({ project: (data: unknown) => data }),
}));

const testWindow = window as Window & { __WEARABLES_TEST?: boolean };
const profileId = 'audit-insight-cache';
const previous = { profile: state.currentProfile, data: state.importedData };
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  fixture.provider = true;
  fixture.infer.mockClear();
  state.currentProfile = profileId;
  state.importedData = createDefaultProfileData();
  testWindow.__WEARABLES_TEST = true;
  await _setTestSessionKey('fictional insight passphrase');
  localStorage.setItem('labcharts-encryption-enabled', 'true');
});
afterEach(async () => {
  await _setTestSessionKey(null);
  delete testWindow.__WEARABLES_TEST;
  state.currentProfile = previous.profile;
  state.importedData = previous.data;
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('replaces the loading state when a corrected profile has an older saved insight', async () => {
  document.body.innerHTML = '<div id="focus-card-body">Loading saved insight</div>';
  await encryptedSetItem(profileStorageKey(profileId, 'focusCard'), JSON.stringify({
    text: 'Old values', fingerprint: 'old-synthetic-fingerprint',
  }));
  await loadFocusCard({ refreshStale: false });
  expect(document.body.textContent).toContain('Your data changed');
  expect(document.body.textContent).not.toContain('Old values');
  expect(fixture.infer).not.toHaveBeenCalled();
});

it('loads a saved encrypted supplement insight even if the provider is unavailable', async () => {
  const supplement = { name: 'Fictional supplement', startDate: '2026-05-15', type: 'supplement' };
  state.importedData.supplements = [supplement];
  const key = profileStorageKey(profileId, 'suppImpact');
  document.body.innerHTML = renderSupplementImpact(supplement, 0);
  await vi.waitFor(() => expect(localStorage.getItem(key)).toMatch(/^v1:/));
  expect(fixture.infer).toHaveBeenCalledTimes(1);
  fixture.provider = false;
  document.body.innerHTML = renderSupplementImpact(supplement, 0);
  await vi.waitFor(() => expect(document.getElementById('supp-impact-summary-0')?.textContent).toBe('Saved supplement summary.'));
  expect(fixture.infer).toHaveBeenCalledTimes(1);
});
