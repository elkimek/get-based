type PlacementFixtureData={entries?:Array<{date:string;markers:Record<string,number>}>;customMarkers?:Record<string,{markerId:string;name:string;singlePoint?:boolean}>;markerPlacements?:Record<string,{categoryKey:string}>;markerNotes?:Record<string,string>};
type PlacementFixtureMarker={name:string;values:number[];markerId?:string;storageDotKey?:string;nativeCategoryKey?:string;displayCategoryKey?:string;unit?:string};
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  state: {
    importedData: {} as PlacementFixtureData,
    currentProfile: 'marker-placement-ui-test',
    currentView: 'biochemistry',
    markerRegistry: {},
  },
  saveImportedDataForProfile: vi.fn<(profile?: string, data?: unknown, options?: unknown) => Promise<boolean>>(async () => true),
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
  const categories:Record<string,{label:string;icon:string;markers:Record<string,PlacementFixtureMarker>;calculated?:boolean;singlePoint?:boolean}> = {
    biochemistry: { label: 'Biochemistry', icon: '🧪', markers: {} },
    lipids: {
      label: 'Lipids',
      icon: '❤️',
      markers: { cholesterol: { name: 'Cholesterol', values: [4.4] } },
    },
    hormones: {
      label: 'Hormones',
      icon: '⚗️',
      markers: { testosterone: { name: 'Testosterone', values: [18] } },
    },
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
  categories[destination]!.markers.glucose = glucose;
  return { dates: ['2026-08-01'], dateLabels: ['1 Aug 2026'], categories };
}

vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/data.js', () => ({
  getActiveData: () => activeData(),
  invalidateActiveDataCache: runtime.invalidateActiveDataCache,
  saveImportedDataForProfile: runtime.saveImportedDataForProfile,
}));
vi.mock('../js/lab-display-store.js', async () => {
  const core = await import('../js/lab-display-core.js');
  return {
    readNativeLabDisplay: async (_profile: string, resource: import('../js/lab-display-core.js').LabDisplayResource, id: string, allowed?: () => boolean) => {
      if (allowed?.() === false) throw new Error('Origin changed');
      return {version:1,resource,record:core.labDisplayRecord(runtime.state.importedData,resource,id),choices:core.nativeLabDisplayChoices(runtime.state.importedData,resource,id),revision:'0'.repeat(64)};
    },
    commitNativeLabDisplay: async (profile: string, expected: import('../js/lab-display-core.js').LabDisplaySnapshot, command: import('../js/lab-display-core.js').LabDisplayCommand, allowed?: () => boolean) => {
      if (allowed?.() === false) throw new Error('Origin changed');
      const origin = runtime.state.importedData, next = structuredClone(origin), result = core.applyNativeLabDisplay(next as Parameters<typeof core.applyNativeLabDisplay>[0], expected.resource, expected.record.id, command);
      if (!await runtime.saveImportedDataForProfile(profile, next, { forceProfileScope: true, reason: 'lab-display' }) || allowed?.() === false) throw new Error('The placement could not be saved in this editor.');
      Object.assign(origin, next); return result;
    },
  };
});
vi.mock('../js/marker-detail-runtime.js', () => ({
  buildMarkerDetailSidebarRuntime: runtime.buildSidebar,
  navigateMarkerDetailRuntime: runtime.navigate,
  openWithMarkerDetailStylesheet: (open:()=>unknown) => Promise.resolve(open()),
  setDetailModalShell: (...classes:unknown[]) => {
    const modal = document.getElementById('detail-modal');
    modal!.className = ['modal', ...classes].join(' ');
    return modal;
  },
}));
vi.mock('../js/modal-lifecycle.js', () => ({
  openModalOverlay: (overlay:HTMLElement) => {
    overlay.classList.add('show');
    return overlay;
  },
}));
vi.mock('../js/utils.js', () => ({
  escapeAttr: (value:unknown) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
  escapeHTML: (value:unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  safeMarkerId: (value:unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(value),
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
    runtime.saveImportedDataForProfile.mockResolvedValue(true);
    runtime.state.currentProfile = 'marker-placement-ui-test';
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

    expect(context!.choices.map(choice => choice.categoryKey)).toContain('lipids');
    expect(context!.choices.map(choice => choice.categoryKey)).not.toContain('calculatedRatios');
    expect(context!.choices.map(choice => choice.categoryKey)).not.toContain('singlePanel');

    await openMarkerPlacementModal('biochemistry_glucose');

    const modal = document.getElementById('detail-modal');
    const select = (document.getElementById('marker-placement-category') as HTMLSelectElement);
    expect(modal!.textContent).toContain('Only where this marker appears will change.');
    expect(modal!.textContent).toContain('Values, history, units, notes, reference ranges, backups, shares, imports, and sync');
    expect(select.value).toBe('biochemistry');
    expect([...select.options].map(option => option.value)).toEqual(['biochemistry', 'lipids', 'hormones']);
    expect([...select.options].map(option => option.textContent)).toEqual(['Biochemistry', 'Lipids', 'Hormones']);
    expect([...select.options].map(option => option.value)).not.toContain('calculatedRatios');
  });

  it('moves and restores a marker without rewriting user data', async () => {
    const originalEntries = structuredClone(runtime.state.importedData.entries);
    const originalNotes = structuredClone(runtime.state.importedData.markerNotes);
    await openMarkerPlacementModal('biochemistry_glucose');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'lipids';

    await saveMarkerPlacement('biochemistry_glucose');

    expect(runtime.state.importedData.markerPlacements).toEqual({
      'gb:marker:glucose': { categoryKey: 'lipids' },
    });
    expect(runtime.state.importedData.entries).toEqual(originalEntries);
    expect(runtime.state.importedData.markerNotes).toEqual(originalNotes);
    expect(runtime.saveImportedDataForProfile).toHaveBeenCalledWith(
      'marker-placement-ui-test',
      runtime.state.importedData,
      { forceProfileScope: true, reason: 'lab-display' },
    );
    expect(runtime.navigate).toHaveBeenCalledWith('lipids', expect.any(Object));
    expect(runtime.showDetailModal).toHaveBeenCalledWith('lipids_glucose');

    const moved = activeData().categories.lipids!.markers.glucose;
    const summary = renderMarkerPlacementSummary('lipids_glucose', moved!, activeData().categories);
    expect(summary).toContain('Originally Biochemistry');
    expect(summary).toContain('restore-marker-placement');

    await restoreMarkerPlacement('lipids_glucose');

    expect(runtime.state.importedData.markerPlacements).toEqual({});
    expect(runtime.state.importedData.entries).toEqual(originalEntries);
    expect(runtime.state.importedData.markerNotes).toEqual(originalNotes);
    expect(runtime.navigate).toHaveBeenLastCalledWith('biochemistry', expect.any(Object));
    expect(runtime.showDetailModal).toHaveBeenLastCalledWith('biochemistry_glucose');
  });

  it('keeps live placement unchanged when durable persistence fails', async () => {
    delete runtime.state.importedData.markerPlacements;
    runtime.saveImportedDataForProfile.mockResolvedValueOnce(false);
    await openMarkerPlacementModal('biochemistry_glucose');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'lipids';

    await expect(saveMarkerPlacement('biochemistry_glucose')).resolves.toBe(false);

    expect(runtime.state.importedData.markerPlacements).toBeUndefined();
    expect(runtime.invalidateActiveDataCache).not.toHaveBeenCalled();
    expect(runtime.navigate).not.toHaveBeenCalled();
    expect(runtime.showDetailModal).not.toHaveBeenCalled();
  });

  it('serializes commands and rejects a queued action from a retired marker view', async () => {
    runtime.state.importedData.markerPlacements = {
      'gb:marker:glucose': { categoryKey: 'lipids' },
    };
    let finishSave!:(value:boolean)=>void;
    runtime.saveImportedDataForProfile.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    await openMarkerPlacementModal('lipids_glucose');
    const restoreControl = document.querySelector<HTMLButtonElement>('[data-marker-detail-action="restore-marker-placement"]');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'hormones';

    const moving = saveMarkerPlacement('lipids_glucose');
    const restoring = restoreMarkerPlacement('lipids_glucose');

    expect((document.getElementById('marker-placement-category') as HTMLSelectElement).disabled).toBe(true);
    expect(restoreControl!.disabled).toBe(true);
    await vi.waitFor(() => expect(runtime.saveImportedDataForProfile).toHaveBeenCalledTimes(1));
    expect(runtime.saveImportedDataForProfile).toHaveBeenCalledTimes(1);
    finishSave(true);
    await expect(moving).resolves.toBe(true);
    await expect(restoring).resolves.toBe(false);

    expect(runtime.state.importedData.markerPlacements).toEqual({'gb:marker:glucose':{categoryKey:'hormones'}});
    expect(runtime.saveImportedDataForProfile).toHaveBeenCalledTimes(1);
    expect(runtime.navigate).toHaveBeenCalledTimes(1);
    expect(runtime.showDetailModal).toHaveBeenLastCalledWith('hormones_glucose');
  });

  it('preserves origin and replacement data when a pending save fails after a profile switch', async () => {
    let finishSave!:(value:boolean)=>void;
    runtime.saveImportedDataForProfile.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    await openMarkerPlacementModal('biochemistry_glucose');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'lipids';
    const initiatingData = runtime.state.importedData;

    const moving = saveMarkerPlacement('biochemistry_glucose');
    await vi.waitFor(() => expect(runtime.saveImportedDataForProfile).toHaveBeenCalledTimes(1));
    runtime.state.currentProfile = 'other-profile';
    runtime.state.importedData = { markerPlacements: { 'custom:other': { categoryKey: 'hormones' } } };
    finishSave(false);
    await expect(moving).resolves.toBe(false);

    expect(initiatingData.markerPlacements).toEqual({});
    expect(runtime.state.importedData.markerPlacements).toEqual({
      'custom:other': { categoryKey: 'hormones' },
    });
    expect(runtime.navigate).not.toHaveBeenCalled();
    expect(runtime.showDetailModal).not.toHaveBeenCalled();
  });

  it('allows an independent profile placement while another profile is saving', async () => {
    let finishFirstSave!:(value:boolean)=>void;
    runtime.saveImportedDataForProfile.mockImplementationOnce(() => new Promise(resolve => { finishFirstSave = resolve; }));
    const firstProfileData = runtime.state.importedData;
    const secondProfileData = structuredClone(firstProfileData);
    await openMarkerPlacementModal('biochemistry_glucose');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'lipids';
    const firstMove = saveMarkerPlacement('biochemistry_glucose');
    await vi.waitFor(() => expect(runtime.saveImportedDataForProfile).toHaveBeenCalledTimes(1));

    runtime.state.currentProfile = 'second-profile';
    runtime.state.importedData = secondProfileData;
    await openMarkerPlacementModal('biochemistry_glucose');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'hormones';
    await expect(saveMarkerPlacement('biochemistry_glucose')).resolves.toBe(true);

    expect(secondProfileData.markerPlacements).toEqual({
      'gb:marker:glucose': { categoryKey: 'hormones' },
    });
    expect(runtime.saveImportedDataForProfile).toHaveBeenCalledWith(
      'second-profile',
      secondProfileData,
      { forceProfileScope: true, reason: 'lab-display' },
    );
    expect(runtime.showDetailModal).toHaveBeenLastCalledWith('hormones_glucose');

    finishFirstSave(true);
    await expect(firstMove).resolves.toBe(false);
    expect(firstProfileData.markerPlacements).toEqual({});
    expect(runtime.navigate).toHaveBeenCalledTimes(1);
  });

  it('does not reopen stale marker UI after the placement flow is dismissed', async () => {
    let finishSave!:(value:boolean)=>void;
    runtime.saveImportedDataForProfile.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    await openMarkerPlacementModal('biochemistry_glucose');
    (document.getElementById('marker-placement-category') as HTMLSelectElement).value = 'lipids';

    const moving = saveMarkerPlacement('biochemistry_glucose');
    await vi.waitFor(() => expect(runtime.saveImportedDataForProfile).toHaveBeenCalledTimes(1));
    document.getElementById('modal-overlay')!.classList.remove('show');
    finishSave(true);
    await expect(moving).resolves.toBe(false);

    expect(runtime.state.importedData.markerPlacements).toEqual({});
    expect(runtime.navigate).not.toHaveBeenCalled();
    expect(runtime.showDetailModal).not.toHaveBeenCalled();
  });
});
