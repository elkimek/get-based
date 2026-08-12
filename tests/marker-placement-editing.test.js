// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  const marker = {
    markerId: 'gb:marker:glucose',
    storageDotKey: 'biochemistry.glucose',
    name: 'Glucose',
    unit: 'mmol/l',
    refMin: 4,
    refMax: 6,
    values: [5.2],
  };
  return {
    marker,
    state: {
      importedData: { entries: [] },
      markerRegistry: { lipids_glucose: marker },
      unitSystem: 'EU',
      currentView: 'lipids',
    },
    saveManualMarkerValue: vi.fn(async () => true),
  };
});

vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/schema.js', () => ({
  convertUserInputToSI: vi.fn((dotKey, value) => value),
  convertSIToInputUnit: vi.fn((dotKey, value) => value),
}));
vi.mock('../js/utils.js', () => ({
  escapeHTML: value => String(value),
  escapeAttr: value => String(value),
  showNotification: vi.fn(),
  showConfirmDialog: vi.fn(async () => true),
  showPromptDialog: vi.fn(async () => 'note'),
}));
vi.mock('../js/data.js', () => ({
  getActiveData: () => ({
    dates: ['2026-08-01'],
    categories: { lipids: { markers: { glucose: runtime.marker } } },
  }),
  updateHeaderDates: vi.fn(),
  convertDisplayToSI: vi.fn((dotKey, value) => value),
}));
vi.mock('../js/marker-detail-actions.js', () => ({ markerDetailActionAttrs: vi.fn(() => '') }));
vi.mock('../js/marker-detail-runtime.js', () => ({
  buildMarkerDetailSidebarRuntime: vi.fn(),
  navigateMarkerDetailRuntime: vi.fn(),
}));
vi.mock('../js/marker-detail-store.js', () => ({
  deleteManualMarkerValue: vi.fn(),
  editManualMarkerValue: vi.fn(),
  getMarkerValueNote: vi.fn(),
  hasMarkerValueForDate: vi.fn(),
  revertManualMarkerValue: vi.fn(),
  revertRefRangeOverride: vi.fn(),
  saveManualMarkerValue: runtime.saveManualMarkerValue,
  saveMarkerNoteText: vi.fn(),
  saveMarkerValueNote: vi.fn(),
  saveRefRangeOverride: vi.fn(),
  deleteMarkerNoteText: vi.fn(),
  deleteMarkerValueNote: vi.fn(),
}));

const { saveManualEntry } = await import('../js/marker-detail-editing.js');

describe('moved marker editing compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.state.importedData = { entries: [] };
    document.body.innerHTML = `
      <input id="me-date" value="2026-08-01">
      <input id="me-value" value="5.4">
      <textarea id="me-note">fasting</textarea>
      <input id="me-unit" value="mmol/l">
    `;
  });

  it('writes a value to the immutable dotkey rather than the display category', async () => {
    await saveManualEntry('lipids_glucose');

    expect(runtime.saveManualMarkerValue).toHaveBeenCalledWith({
      dotKey: 'biochemistry.glucose',
      date: '2026-08-01',
      storedValue: 5.4,
      noteText: 'fasting',
      collectionContext: {
        sampleTime: null,
        fasting: null,
      },
    });
  });
});
