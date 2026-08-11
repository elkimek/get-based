// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDashboardLabWidgetRenderers } from '../js/dashboard-lab-widget-renderers.js';
import { invalidateActiveDataCache } from '../js/data.js';
import { getBuiltinMarkerId } from '../js/marker-schema.js';
import { profileStorageKey } from '../js/profile.js';
import { state } from '../js/state.js';

let savedState;

function createRenderers() {
  return createDashboardLabWidgetRenderers({
    markerHasData: marker => marker.values.some(value => value != null),
    rerenderDashboardFromWidgetChange: vi.fn(),
  });
}

function bioAgeData(value) {
  return {
    dates: ['2026-01-15'],
    categories: {
      calculatedRatios: {
        label: 'Calculated ratios',
        markers: {
          biologicalAge: {
            name: 'Biological Age',
            unit: 'yr',
            values: [value],
            refMin: 0,
            refMax: 100,
          },
        },
      },
    },
  };
}

describe('dashboard lab widget renderers', () => {
  beforeEach(() => {
    savedState = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      markerRegistry: state.markerRegistry,
      profileDob: state.profileDob,
    };
    state.currentProfile = 'dashboard-lab-renderer-test';
    state.importedData = {};
    state.markerRegistry = {};
    state.profileDob = '1985-01-15';
    localStorage.clear();
    document.body.innerHTML = '<div id="notification-container"></div>';
  });

  afterEach(() => {
    state.currentProfile = savedState.currentProfile;
    state.importedData = savedState.importedData;
    state.markerRegistry = savedState.markerRegistry;
    state.profileDob = savedState.profileDob;
    localStorage.clear();
    document.body.innerHTML = '';
    invalidateActiveDataCache();
    vi.restoreAllMocks();
  });

  it('renders finite biological age and falls back cleanly without a value', () => {
    const renderers = createRenderers();

    const available = renderers.renderDashboardBioAgeWidget({ data: bioAgeData(42.5) });
    expect(available).toContain('42.5');
    expect(available).toContain('yr vs chronological');

    const unavailable = renderers.renderDashboardBioAgeWidget({ data: bioAgeData(null) });
    expect(unavailable).toContain('Biological-age comparison unavailable');
    expect(unavailable).toContain('db-hero-bio-num">—');
  });

  it('recovers malformed quick-pin storage and toggles a safe marker id', () => {
    const renderers = createRenderers();
    const storageKey = profileStorageKey(state.currentProfile, 'dashboardQuickMarkerPinsV1');
    localStorage.setItem(storageKey, '{not-json');

    expect(renderers.isDashboardQuickMarkerPinned('lipids_apoB')).toBe(false);
    renderers.toggleDashboardQuickMarkerPin('lipids_apoB');
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(['lipids_apoB']);
    expect(renderers.isDashboardQuickMarkerPinned('lipids_apoB')).toBe(true);

    renderers.toggleDashboardQuickMarkerPin('lipids_apoB');
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual([]);
  });

  it('keeps quick pins attached to storage identity after a marker moves', () => {
    const glucoseId = getBuiltinMarkerId('biochemistry.glucose');
    state.importedData = {
      entries: [{ date: '2026-08-01', markers: { 'biochemistry.glucose': 5.2 } }],
      customMarkers: {},
      markerPlacements: { [glucoseId]: { categoryKey: 'lipids' } },
    };
    invalidateActiveDataCache();
    const renderers = createRenderers();
    const storageKey = profileStorageKey(state.currentProfile, 'dashboardQuickMarkerPinsV1');

    renderers.toggleDashboardQuickMarkerPin('lipids_glucose');

    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(['biochemistry_glucose']);
    expect(renderers.isDashboardQuickMarkerPinned('lipids_glucose')).toBe(true);
    expect(renderers.isDashboardQuickMarkerPinned('biochemistry_glucose')).toBe(true);

    renderers.toggleDashboardQuickMarkerPin('biochemistry_glucose');
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual([]);
  });
});
