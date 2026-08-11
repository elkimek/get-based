// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  state: {
    importedData: {},
    currentProfile: 'marker-placement-ui-test',
    currentView: 'biochemistry',
    markerRegistry: {},
  },
  saveImportedData: vi.fn(async () => true),
  invalidateActiveDataCache: vi.fn(),
  buildSidebar: vi.fn(),
  navigate: vi.fn(),
  showDetailModal: vi.fn(),
  showNotification: vi.fn(),
}));

function activeData() {
  const markerId = 'gb:marker:glucose';
  const destination = runtime.state.importedData.markerPlacements?.[markerId]?.categoryKey || 'biochemistry';
  const glucose = {
    markerId,
    storageDotKey: 'biochemistry.glucose',
    nativeCategoryKey: 'biochemistry',
    displayCategoryKey: destination,
    name: 'Glucose',
    unit: 'mmol/l',
    values: [5.2],
  };
  const categories = {
    biochemistry: { label: 'Biochemistry', icon: '🧪', markers: {} },
    lipids: {
      label: 'Lipids',
      icon: '❤️',
      markers: { cholesterol: { name: 'Cholesterol', values: [4.4] } },
    },
    hormones: { label: 'Hormones', icon: '⚗️', markers: {} },
    calculatedRatios: {
      label: 'Calculated Ratios',
      icon: '📐',
      calculated: true,
      markers: { ratio: { name: 'Ratio', values: [1] } },
    },
    singlePanel: {
      label: 'Single Panel',
      icon: '📍',
      singlePoint: true,
      markers: { sample: { name: 'Sample', values: [1] } },
    },
  };
  categories[destination].markers.glucose = glucose;
  return { dates: ['2026-08-01'], dateLabels: ['1 Aug 2026'], categories };
}

vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/data.js', () => ({
  getActiveData: () => activeData(),
  invalidateActiveDataCache: runtime.invalidateActiveDataCache,
  saveImportedData: runtime.saveImportedData,
}));
vi.mock('../js/marker-detail-runtime.js', () => ({
  buildMarkerDetailSidebarRuntime: runtime.buildSidebar,
  navigateMarkerDetailRuntime: runtime.navigate,
  openWithMarkerDetailStylesheet: open => Promise.resolve(open()),
  setDetailModalShell: (...classes) => {
    const modal = document.getElementById('detail-modal');
    modal.className = ['modal', ...classes].join(' ');
    return modal;
  },
}));
vi.mock('../js/modal-lifecycle.js', () => ({
  openModalOverlay: overlay => {
    overlay.classList.add('show');
    return overlay;
  },
}));
vi.mock('../js/utils.js', () => ({
  escapeAttr: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
  escapeHTML: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  safeMarkerId: value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(value),
  showNotification: runtime.showNotification,
}));

const {
  configureMarkerDetailPlacement,
  getMarkerPlacementChoices,
  openMarkerPlacementModal,
  renderMarkerPlacementSummary,
  restoreMarkerPlacement,
  saveMarkerPlacement,
} = await import('../js/marker-detail-placement.js');

describe('marker placement UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.saveImportedData.mockResolvedValue(true);
    runtime.state.importedData = {
      entries: [{ date: '2026-08-01', markers: { 'biochemistry.glucose': 5.2 } }],
      customMarkers: {
        'singlePanel.sample': {
          markerId: 'custom:single',
          name: 'Sample',
          singlePoint: true,
        },
      },
      markerPlacements: {},
      markerNotes: { 'biochemistry.glucose': 'Keep the immutable key' },
    };
    document.body.innerHTML = `
      <div id="modal-overlay">
        <div class="modal" id="detail-modal"></div>
      </div>
    `;
    configureMarkerDetailPlacement({ showDetailModal: runtime.showDetailModal });
  });

  it('offers only compatible categories and explains the storage-safe change', async () => {
    const context = getMarkerPlacementChoices('biochemistry_glucose');

    expect(context.choices.map(choice => choice.categoryKey)).toContain('lipids');
    expect(context.choices.map(choice => choice.categoryKey)).not.toContain('calculatedRatios');
    expect(context.choices.map(choice => choice.categoryKey)).not.toContain('singlePanel');

    await openMarkerPlacementModal('biochemistry_glucose');

    const modal = document.getElementById('detail-modal');
    const select = document.getElementById('marker-placement-category');
    expect(modal.textContent).toContain('Only where this marker appears will change.');
    expect(modal.textContent).toContain('Values, history, units, notes, reference ranges, backups, shares, imports, and sync');
    expect(select.value).toBe('biochemistry');
    expect([...select.options].map(option => option.value)).not.toContain('calculatedRatios');
  });

  it('moves and restores a marker without rewriting user data', async () => {
    const originalEntries = structuredClone(runtime.state.importedData.entries);
    const originalNotes = structuredClone(runtime.state.importedData.markerNotes);
    await openMarkerPlacementModal('biochemistry_glucose');
    document.getElementById('marker-placement-category').value = 'lipids';

    await saveMarkerPlacement('biochemistry_glucose');

    expect(runtime.state.importedData.markerPlacements).toEqual({
      'gb:marker:glucose': { categoryKey: 'lipids' },
    });
    expect(runtime.state.importedData.entries).toEqual(originalEntries);
    expect(runtime.state.importedData.markerNotes).toEqual(originalNotes);
    expect(runtime.saveImportedData).toHaveBeenCalledTimes(1);
    expect(runtime.navigate).toHaveBeenCalledWith('lipids', expect.any(Object));
    expect(runtime.showDetailModal).toHaveBeenCalledWith('lipids_glucose');

    const moved = activeData().categories.lipids.markers.glucose;
    const summary = renderMarkerPlacementSummary('lipids_glucose', moved, activeData().categories);
    expect(summary).toContain('Originally Biochemistry');
    expect(summary).toContain('restore-marker-placement');

    await restoreMarkerPlacement('lipids_glucose');

    expect(runtime.state.importedData.markerPlacements).toEqual({});
    expect(runtime.state.importedData.entries).toEqual(originalEntries);
    expect(runtime.state.importedData.markerNotes).toEqual(originalNotes);
    expect(runtime.navigate).toHaveBeenLastCalledWith('biochemistry', expect.any(Object));
    expect(runtime.showDetailModal).toHaveBeenLastCalledWith('biochemistry_glucose');
  });

  it('rolls placement metadata back when persistence fails', async () => {
    delete runtime.state.importedData.markerPlacements;
    runtime.saveImportedData.mockResolvedValueOnce(false);
    await openMarkerPlacementModal('biochemistry_glucose');
    document.getElementById('marker-placement-category').value = 'lipids';

    await expect(saveMarkerPlacement('biochemistry_glucose')).resolves.toBe(false);

    expect(runtime.state.importedData.markerPlacements).toBeUndefined();
    expect(runtime.invalidateActiveDataCache).toHaveBeenCalled();
    expect(runtime.navigate).not.toHaveBeenCalled();
    expect(runtime.showDetailModal).not.toHaveBeenCalled();
  });

  it('single-flights move and restore so persistence and navigation cannot race', async () => {
    runtime.state.importedData.markerPlacements = {
      'gb:marker:glucose': { categoryKey: 'lipids' },
    };
    let finishSave;
    runtime.saveImportedData.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    await openMarkerPlacementModal('lipids_glucose');
    const restoreControl = document.querySelector('[data-marker-detail-action="restore-marker-placement"]');
    document.getElementById('marker-placement-category').value = 'hormones';

    const moving = saveMarkerPlacement('lipids_glucose');
    const restoring = restoreMarkerPlacement('hormones_glucose');

    expect(document.getElementById('marker-placement-category').disabled).toBe(true);
    expect(restoreControl.disabled).toBe(true);
    await expect(restoring).resolves.toBe(false);
    expect(runtime.saveImportedData).toHaveBeenCalledTimes(1);
    finishSave(true);
    await expect(moving).resolves.toBe(true);

    expect(runtime.state.importedData.markerPlacements).toEqual({
      'gb:marker:glucose': { categoryKey: 'hormones' },
    });
    expect(runtime.navigate).toHaveBeenCalledTimes(1);
    expect(runtime.showDetailModal).toHaveBeenLastCalledWith('hormones_glucose');
  });
});
