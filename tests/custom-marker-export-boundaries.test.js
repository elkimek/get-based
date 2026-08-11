// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveLegacyCustomMarkerId } from '../js/custom-marker-identity.js';

const runtime = vi.hoisted(() => ({
  encryptedGetItem: vi.fn(),
  profiles: [{
    id: 'profile-1',
    name: 'Primary',
    location: { country: 'CZ', zip: '' },
    tags: [],
    notes: '',
    status: 'active',
  }],
}));

vi.mock('../js/state.js', () => ({ state: { currentProfile: 'profile-1', importedData: {} } }));
vi.mock('../js/utils.js', () => ({
  showConfirmDialog: vi.fn(),
  showNotification: vi.fn(),
}));
vi.mock('../js/data.js', () => ({
  filterDatesByRange: vi.fn(),
  getActiveData: vi.fn(),
  invalidateActiveDataCache: vi.fn(),
  saveImportedData: vi.fn(),
  updateHeaderDates: vi.fn(),
}));
vi.mock('../js/profile.js', () => ({
  createDefaultProfileData: vi.fn(),
  createProfile: vi.fn(),
  getProfiles: () => runtime.profiles,
  migrateProfileData: vi.fn(),
  profileStorageKey: (profileId, suffix) => `labcharts-${profileId}-${suffix}`,
  saveProfiles: vi.fn(),
  switchProfile: vi.fn(),
}));
vi.mock('../js/crypto.js', () => ({
  encryptedGetItem: runtime.encryptedGetItem,
  encryptedRemoveItem: vi.fn(),
}));
vi.mock('../js/profile-storage-cleanup.js', () => ({
  clearProfileStorage: vi.fn(),
  listStoredProfileIds: vi.fn(),
}));
vi.mock('../js/lab-entry-mutations.js', () => ({ findOrCreateLabEntry: vi.fn() }));
vi.mock('../js/lab-entry.js', () => ({ setLabEntryMarker: vi.fn() }));
vi.mock('../js/nostr-discovery.js', () => ({ getSelectedNodeUrl: () => null }));
vi.mock('../js/export-report.js', () => ({ generateReportAISummary: vi.fn() }));
vi.mock('../js/export-report-html.js', () => ({
  buildReportHTML: vi.fn(),
  exportPDFReport: vi.fn(),
}));
vi.mock('../js/export-runtime.js', () => ({
  clearDemoLoadingProfile: vi.fn(),
  destroyWalletRuntimeDB: vi.fn(),
  markDemoLoadingProfile: vi.fn(),
  refreshImportRuntimeShell: vi.fn(),
}));

const { buildAllDataBundle, buildClientExportObject } = await import('../js/export.js');

describe('custom marker export boundaries', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    runtime.encryptedGetItem.mockImplementation(async key => {
      if (key === 'labcharts-profile-1-imported') {
        return JSON.stringify({
          entries: [{
            date: '2026-07-01',
            markers: { 'oatEnergy.acetoaceticAcid': 12.5 },
          }],
          customMarkers: {
            'oatEnergy.acetoaceticAcid': {
              name: 'Acetoacetic Acid',
              futureField: { preserve: true },
            },
          },
          markerPlacements: {
            [deriveLegacyCustomMarkerId('oatEnergy.acetoaceticAcid')]: {
              categoryKey: 'biochemistry',
            },
          },
        });
      }
      return null;
    });
  });

  it('includes migrated ids in client exports used by sharing', async () => {
    const exported = await buildClientExportObject('profile-1');

    expect(exported.customMarkers['oatEnergy.acetoaceticAcid']).toMatchObject({
      markerId: deriveLegacyCustomMarkerId('oatEnergy.acetoaceticAcid'),
      name: 'Acetoacetic Acid',
      futureField: { preserve: true },
    });
    expect(exported.entries[0].markers).toEqual({ 'oatEnergy.acetoaceticAcid': 12.5 });
    expect(exported.markerPlacements).toEqual({
      [deriveLegacyCustomMarkerId('oatEnergy.acetoaceticAcid')]: {
        categoryKey: 'biochemistry',
      },
    });
  });

  it('includes the same ids in full database backups', async () => {
    const bundle = JSON.parse(await buildAllDataBundle());
    const definition = bundle.profiles[0].data.customMarkers['oatEnergy.acetoaceticAcid'];

    expect(definition.markerId)
      .toBe(deriveLegacyCustomMarkerId('oatEnergy.acetoaceticAcid'));
    expect(bundle.profiles[0].data.entries[0].markers)
      .toEqual({ 'oatEnergy.acetoaceticAcid': 12.5 });
    expect(bundle.profiles[0].data.markerPlacements).toEqual({
      [definition.markerId]: { categoryKey: 'biochemistry' },
    });
  });
});
