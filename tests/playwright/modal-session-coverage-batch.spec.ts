import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('modalSessionCoverage');

test('marker detail modal covers custom marker create delete and focus restore paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ markerUrl }) => {
    const [{ state }, data, markerModal, markerRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      (import(markerUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/marker-detail-modal.js'), "configureMarkerDetailModal" | "rememberModalTrigger" | "closeModal" | "openCreateMarkerModal" | "pickNewCatIcon" | "saveCustomMarker" | "deleteCustomMarker">>,
      import('/js/marker-detail-runtime.js'),
    ]);
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[] = [];
    const clone = (value: unknown) => value == null ? value : ((JSON.parse as (text: unknown) => unknown)(JSON.stringify(value)) as unknown);
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const saved = {
      importedData: clone(state.importedData),
      currentView: state.currentView,
      activeDetailMarkerId: state._activeDetailMarkerId,
      navigate: (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate,
    };
    const previousMarkerRuntime = markerRuntime.configureMarkerDetailRuntime({
      buildSidebar: () => calls.push(['sidebar']),
    });

    const ensureShell = () => {
      if (!document.getElementById('modal-overlay')) {
        document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-overlay' }));
      }
      if (!document.getElementById('detail-modal')) {
        document.body.appendChild(Object.assign(document.createElement('div'), { id: 'detail-modal', className: 'modal' }));
      }
    };

    try {
      ensureShell();
      state.currentView = 'dashboard';
      (state as unknown as {importedData: unknown}).importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        markerLabels: {},
        refOverrides: {},
      };
      data.invalidateActiveDataCache();
      (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate = (route: unknown) => calls.push(['navigate', route]);
      markerModal.configureMarkerDetailModal({
        navigate: (route: unknown) => calls.push(['dep-navigate', route]),
        isDashboardQuickMarkerPinned: (id: string) => id === 'custom7ToxicMetals_leadBurden',
        showEmojiPicker: (el: unknown, callback:(emoji:string)=>unknown) => {
          calls.push(['emoji-picker', (el as {id: unknown})?.id || '']);
          callback('X');
        },
      });

      const trigger = document.createElement('button');
      trigger.id = 'marker-trigger';
      trigger.textContent = 'Trigger';
      document.body.appendChild(trigger);
      trigger.focus();
      markerModal.rememberModalTrigger();
      markerModal.closeModal();
      outcomes.closeRestoresRememberedFocus = document.activeElement === trigger;

      await markerModal.openCreateMarkerModal();
      const catSelect = document.getElementById('cm-category');
      if (catSelect) {
        (catSelect as unknown as {value: string}).value = '__new__';
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      outcomes.newCategoryRowAppears = document.getElementById('cm-new-cat-row')?.style.display === 'flex';
      const iconEl = document.getElementById('cm-new-cat-icon');
      markerModal.pickNewCatIcon(iconEl);
      outcomes.pickNewCatIconStoresCustomGlyph = iconEl?.textContent?.trim() === 'X'
        && iconEl?.dataset.custom === '1'
        && calls.some(call => (call as unknown[])[0] === 'emoji-picker' && (call as unknown[])[1] === 'cm-new-cat-icon');

      markerModal.saveCustomMarker();
      outcomes.emptyMarkerNameIsRejected = !Object.keys(state.importedData.customMarkers || {}).length
        && Array.from(document.querySelectorAll<HTMLElement>('.notification-toast')).some(el => el.textContent.includes('Please enter a marker name'));

      (document.getElementById('cm-new-cat') as HTMLInputElement).value = '7 Toxic Metals!';
      (document.getElementById('cm-name') as HTMLInputElement).value = 'Lead Burden';
      (document.getElementById('cm-unit') as HTMLInputElement).value = 'ug/L';
      (document.getElementById('cm-ref-min') as HTMLInputElement).value = '0';
      (document.getElementById('cm-ref-max') as HTMLInputElement).value = '5';
      (document.getElementById('cm-opt-min') as HTMLInputElement).value = '0';
      (document.getElementById('cm-opt-max') as HTMLInputElement).value = '2';
      markerModal.saveCustomMarker();
      await delay(180);
      data.invalidateActiveDataCache();

      const createdKey = 'custom7ToxicMetals.leadBurden';
      const created = state.importedData.customMarkers?.[createdKey];
      outcomes.createStoresCustomMarkerDefinition = created?.name === 'Lead Burden'
        && /^custom:[A-Za-z0-9_-]+$/.test(created?.markerId || '')
        && created?.unit === 'ug/L'
        && created?.refMax === 5
        && created?.categoryLabel === '7 Toxic Metals!'
        && created?.icon === 'X';
      outcomes.createStoresOptimalOverride = state.importedData.refOverrides?.[createdKey]?.optimalMax === 2;
      outcomes.createCallsSidebarAndOpensManualEntry = calls.some(call => (call as unknown[])[0] === 'sidebar')
        && !!document.getElementById('me-value')
        && !!document.getElementById('me-date');

      state.importedData.customMarkers['custom7ToxicMetals.mercuryBurden'] = {
        name: 'Mercury Burden',
        unit: 'ug/L',
        categoryLabel: '7 Toxic Metals!',
      };
      (state.importedData as unknown as {entries: unknown}).entries = [{
        date: '2026-06-07',
        markers: {
          custom7ToxicMetals: { leadBurden: 4, mercuryBurden: 1 },
        },
      }];
      (state.importedData as unknown as {markerNotes: unknown}).markerNotes = {
        [createdKey]: 'track retest',
        'custom7ToxicMetals.mercuryBurden': 'keep',
      };
      (state.importedData as unknown as {markerLabels: unknown}).markerLabels = {
        [createdKey]: 'Lead renamed',
      };
      state.importedData.refOverrides[createdKey] = { refMin: 0, refMax: 4 };
      data.invalidateActiveDataCache();

      const deleteLead = markerModal.deleteCustomMarker('custom7ToxicMetals_leadBurden');
      await Promise.resolve();
      document.getElementById('confirm-ok')?.click();
      await deleteLead;
      outcomes.deleteOneCustomMarkerLeavesSibling = !state.importedData.customMarkers?.[createdKey]
        && !!state.importedData.customMarkers?.['custom7ToxicMetals.mercuryBurden']
        && !state.importedData.markerNotes?.[createdKey]
        && !state.importedData.markerLabels?.[createdKey]
        && !state.importedData.refOverrides?.[createdKey]
        && calls.some(call => (call as unknown[])[0] === 'dep-navigate' && (call as unknown[])[1] === 'dashboard');

      const deleteMercury = markerModal.deleteCustomMarker('custom7ToxicMetals_mercuryBurden');
      await Promise.resolve();
      document.getElementById('confirm-ok')?.click();
      await deleteMercury;
      outcomes.deleteLastCustomMarkerClearsCategory = !Object.keys(state.importedData.customMarkers || {})
        .some(key => key.startsWith('custom7ToxicMetals.'));
    } finally {
      (state as unknown as {importedData: unknown}).importedData = saved.importedData;
      state.currentView = saved.currentView;
      state._activeDetailMarkerId = saved.activeDetailMarkerId;
      markerRuntime.configureMarkerDetailRuntime(previousMarkerRuntime);
      if (saved.navigate) (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate = saved.navigate;
      else delete (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate;
      data.invalidateActiveDataCache();
      markerModal.configureMarkerDetailModal({
        navigate: (...args: unknown[]) => (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate?.(...args),
        isDashboardQuickMarkerPinned: () => false,
        toggleDashboardQuickMarkerPin: (id: string) => (globalThis as unknown as {toggleDashboardQuickMarkerPin?:((id:string)=>unknown)|undefined}).toggleDashboardQuickMarkerPin?.(id),
        renameMarker: (id: string) => (globalThis as unknown as {renameMarker?:((id:string)=>unknown)|undefined}).renameMarker?.(id),
        revertMarkerName: (id: string) => (globalThis as unknown as {revertMarkerName?:((id:string)=>unknown)|undefined}).revertMarkerName?.(id),
        askAIAboutMarker: (id: string) => (globalThis as unknown as {askAIAboutMarker?:((id:string)=>unknown)|undefined}).askAIAboutMarker?.(id),
        showEmojiPicker: () => {},
      });
      document.querySelectorAll<HTMLElement>('.notification-container,.confirm-overlay').forEach(el => el.remove());
      document.getElementById('marker-trigger')?.remove();
    }

    return outcomes;
  }, { markerUrl: moduleUrl('/js/marker-detail-modal.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sun session UI covers chip units and detailed dialog validation paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunSessionUrl }) => {
    const [{ state }, sunUI] = await Promise.all([
      import('/js/state.js'),
      (import(sunSessionUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sun-session-ui.js'), "configureSunSessionUI" | "renderChannelChips" | "openDetailedSessionDialog">>,
    ]);
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[] = [];
    const saved = {
      currentView: state.currentView,
      importedData: ((JSON.parse as (text: unknown) => unknown)(JSON.stringify(state.importedData)) as unknown),
      navigate: (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate,
    };

    try {
      state.currentView = 'light';
      (state as unknown as {importedData: unknown}).importedData = {
        ...state.importedData,
        genetics: { snps: [] },
        sunDefaults: { ...(state.importedData?.sunDefaults || {}), fitzpatrick: 'II', completedAt: Date.now() },
      };
      const vitaminDIU = () => 900;
      const vitaminDIUPerSession = () => 1550;
      const pbmJoulesPerCm2 = () => 12.4;
      const circadianMelanopicLux = () => 12600;
      (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate = (route: unknown) => calls.push(['navigate', route]);

      sunUI.configureSunSessionUI({
        getSessions: () => [],
        deleteSession: async (id: string) => calls.push(['delete', id]),
        updateSession: async (id: string, patch: unknown) => calls.push(['update', id, patch]),
        logCompletedSession: async (opts: unknown) => {
          calls.push(['log', opts]);
          return 'logged-session';
        },
        hydrateSession: async (id: string) => calls.push(['hydrate', id]),
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'test' }),
        refreshSurfaces: () => calls.push(['refresh']),
        wireBackdropClose: () => calls.push(['wire']),
        trapModalFocus: () => calls.push(['trap']),
        summarizeBodyExposure: (sess: unknown) => `${((sess as {bodyExposure: unknown}).bodyExposure as {regions?:unknown[]})?.regions?.length || 0} regions`,
        formatElapsed: () => '0:10',
        exposurePresets: [{ key: 'face_hands', label: 'Face + hands' }],
        eyeModes: [{ key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Eyes uncovered' }],
        lensTints: [{ key: 'clear', label: 'Clear' }],
        postureOptions: [{ key: 'standing', label: 'Standing' }],
        surfaceOptions: [{ key: 'grass', label: 'Grass' }],
        channelDisplay: {
          vitamin_d: { icon: 'D', label: 'Vitamin D', dailyTarget: 300, what: 'Vitamin D' },
          circadian: { icon: 'C', label: 'Circadian', dailyTarget: 100, what: 'Circadian' },
          nir_solar: { icon: 'N', label: 'NIR', dailyTarget: 100, what: 'NIR' },
          no_cv: { icon: 'NO', label: 'NO', dailyTarget: 100, what: 'NO' },
          pomc: { icon: 'P', label: 'POMC', dailyTarget: 100, what: 'POMC' },
          violet_eye: { icon: 'V', label: 'Violet', dailyTarget: 100, what: 'Violet' },
        },
        channelTier: (value:number) => value >= 100 ? 3 : value > 0 ? 2 : 0,
        tierLabel: (tier:number) => ['none', 'low', 'moderate', 'high'][tier] || 'none',
        formatChannelUnit: (key: string, value:number) => `${Math.round(value)} ${key}`,
        tooShortForChannelVerdictMin: 2,
        vitaminDIU,
        vitaminDIUPerSession,
        pbmJoulesPerCm2,
        circadianMelanopicLux,
      });

      const chipHost = document.createElement('div');
      chipHost.innerHTML = sunUI.renderChannelChips({
        vitamin_d: 80,
        circadian: 70,
        nir_solar: 60,
        no_cv: 240,
        pomc: 60,
        violet_eye: 30,
      }, {
        durationMin: 25,
        safety: { fitzpatrick: 'II' },
        atmosphere: { uvIndex: 7 },
        bodyExposure: { fraction: 0.22, rotatedSides: true },
      });
      outcomes.channelChipsRenderRealUnitValues = chipHost.textContent.includes('~1.6k IU')
        && chipHost.textContent.includes('~13k est. mel lx')
        && !chipHost.querySelector<HTMLElement>('[data-channel="no_cv"] .sun-chip-value')
        && !chipHost.textContent.includes('%')
        && !!chipHost.querySelector<HTMLElement>('.sun-chip-more');

      const shortHost = document.createElement('div');
      shortHost.innerHTML = sunUI.renderChannelChips({ vitamin_d: 80, circadian: 70 }, { durationMin: 1 });
      outcomes.shortSessionSuppressesChipValues = shortHost.querySelectorAll<HTMLElement>('.sun-chip-value').length === 0;

      sunUI.openDetailedSessionDialog();
      const overlay = document.querySelector<HTMLElement>('.sun-detailed-modal')?.closest('.modal-overlay');
      const start = overlay?.querySelector<HTMLElement>('#det-started-at');
      const end = overlay?.querySelector<HTMLElement>('#det-ended-at');
      if (start && end) {
        (start as unknown as {value: string}).value = '2026-06-07T10:00';
        (end as unknown as {value: string}).value = '2026-06-07T09:00';
        end.dispatchEvent(new Event('input', { bubbles: true }));
      }
      outcomes.invalidDurationHintUpdatesInline = overlay?.querySelector<HTMLElement>('#det-duration-hint')?.textContent
        .includes('Ended must be after Started') === true;
      overlay?.querySelector<HTMLElement>('#det-save')?.click();
      await Promise.resolve();
      outcomes.invalidDetailedSessionDoesNotLog = !calls.some(call => (call as unknown[])[0] === 'log')
        && Array.from(document.querySelectorAll<HTMLElement>('.notification-toast')).some(el => el.textContent.includes('Ended at must be after Started'));
      overlay?.remove();
    } finally {
      state.currentView = saved.currentView;
      (state as unknown as {importedData: unknown}).importedData = saved.importedData;
      if (saved.navigate) (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate = saved.navigate;
      else delete (window as unknown as {navigate?:((...args:unknown[])=>unknown)|undefined}).navigate;
      sunUI.configureSunSessionUI({
        getSessions: () => [],
        deleteSession: async () => false,
        updateSession: async () => null,
        logCompletedSession: async () => null,
        hydrateSession: async () => null,
        getSunCoords: () => null,
        refreshSurfaces: () => {},
        wireBackdropClose: () => {},
        trapModalFocus: () => {},
        summarizeBodyExposure: () => 'Body unset',
        formatElapsed: () => '0:00',
        exposurePresets: [],
        eyeModes: [],
        lensTints: [],
        postureOptions: [],
        surfaceOptions: [],
        channelDisplay: {},
        channelTier: () => 0,
        tierLabel: () => 'none',
        formatChannelUnit: () => '',
        tooShortForChannelVerdictMin: 2,
        vitaminDIU: null,
        vitaminDIUPerSession: null,
        pbmJoulesPerCm2: null,
        circadianMelanopicLux: null,
      });
      document.querySelectorAll<HTMLElement>('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, { sunSessionUrl: moduleUrl('/js/sun-session-ui.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('device session dialog covers validation unit mode start and save paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ deviceSessionUrl }) => {
    const [{ state }, deviceSessionModal] = await Promise.all([
      import('/js/state.js'),
      (import(deviceSessionUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/light-device-session-modal.js'), "openDeviceSessionDialog">>,
    ]);
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[] = [];
    const saved = {
      unitSystem: state.unitSystem,
      importedData: ((JSON.parse as (text: unknown) => unknown)(JSON.stringify(state.importedData || {})) as unknown),
    };
    let activeSession:{id:string}|null = null;
    const devices = [{
      id: 'panel-coverage',
      brand: 'CoverageLight',
      model: 'Dual 900',
      recommendedDistanceCm: 30,
      lastSession: {
        durationMin: 18,
        distanceCm: 30,
        bodyArea: 'legs',
        eyesProtected: false,
        mode: 'red',
      },
      modes: [
        { id: 'combo', label: 'Combo', default: true },
        { id: 'red', label: 'Red only' },
        { id: 'nir', label: 'NIR only' },
        { id: 'blocked', label: 'Blocked' },
      ],
    }];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate: () => unknown | Promise<unknown>, attempts = 80) => {
      for (let i = 0; i < attempts; i++) {
        if (predicate()) return true;
        await delay(5);
      }
      return false;
    };
    const waitForCall = async (kind: unknown):Promise<unknown> => {
      await waitFor(() => calls.some(call => (call as unknown[])[0] === kind));
      return (calls.find(call => (call as unknown[])[0] === kind) as unknown[] | undefined)?.[1] || null;
    };

    try {
      state.unitSystem = 'US';
      (state as unknown as {importedData: unknown}).importedData = {
        ...state.importedData,
        sunDefaults: {},
      };
      const validateModeCoupling = (_device: unknown, mode: unknown) => ({ ok: mode !== 'blocked' });
      const renderBodySilhouette = (selected:Parameters<typeof import("../../js/sun-body-silhouette.js").renderBodySilhouette>[0]) => `
        <button type="button" class="body-region-test" data-region="legs-front" aria-pressed="${selected.has('legs-front')}">Legs front</button>
        <button type="button" class="body-region-test" data-region="arms-front" aria-pressed="${selected.has('arms-front')}">Arms front</button>
      `;
      const bindBodySilhouette = (slot:Parameters<typeof import("../../js/sun-body-silhouette.js").bindBodySilhouette>[0], selected:Parameters<typeof import("../../js/sun-body-silhouette.js").bindBodySilhouette>[1], callback:Parameters<typeof import("../../js/sun-body-silhouette.js").bindBodySilhouette>[2]) => {
        slot.querySelectorAll<HTMLElement>('[data-region]').forEach(btn => {
          btn.addEventListener('click', () => {
            const region = btn.dataset.region;
            if (!region) return;
            if (selected.has(region)) selected.delete(region);
            else selected.add(region);
            callback!(selected);
          });
        });
      };

      const deps = {
        hydrateDevicesFromPresets: async () => calls.push(['hydrate-devices']),
        getDevices: () => devices,
        logDeviceSession: async (payload: unknown) => {
          await delay(0);
          calls.push(['log', payload]);
          return { id: 'saved-device-session' };
        },
        getActiveDeviceSession: () => activeSession,
        startDeviceSession: async (payload: unknown) => {
          await delay(0);
          calls.push(['start', payload]);
          activeSession = { id: 'active-device' };
          return 'active-device';
        },
        ensureActiveDeviceTicker: () => calls.push(['ticker']),
        validateModeCoupling,
        renderBodySilhouette,
        bindBodySilhouette,
        navigate: (route: unknown) => calls.push(['navigate', route]),
        openLightSetup: () => calls.push(['open-light-setup']),
      };

      const blockedDeviceDialog = await (deviceSessionModal.openDeviceSessionDialog as (id:Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[0],deps:Omit<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>,"logDeviceSession"|"getActiveDeviceSession"> & {logDeviceSession?: (...args:Parameters<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>)=>Promise<Pick<NonNullable<Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>>>,"id">>;getActiveDeviceSession?:()=>{id:string}|null})=>ReturnType<typeof deviceSessionModal.openDeviceSessionDialog>)('panel-coverage', deps);
      outcomes.unconfirmedFitzpatrickBlocksDeviceSession = blockedDeviceDialog === false
        && calls.some(call => (call as unknown[])[0] === 'open-light-setup')
        && !calls.some(call => (call as unknown[])[0] === 'hydrate-devices')
        && !document.querySelector<HTMLElement>('[aria-label="Log device session"]');
      (state.importedData as unknown as {sunDefaults: unknown}).sunDefaults = { fitzpatrick: 'III', completedAt: Date.now() };

      await (deviceSessionModal.openDeviceSessionDialog as (id:Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[0],deps:Omit<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>,"logDeviceSession"|"getActiveDeviceSession"> & {logDeviceSession?: (...args:Parameters<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>)=>Promise<Pick<NonNullable<Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>>>,"id">>;getActiveDeviceSession?:()=>{id:string}|null})=>ReturnType<typeof deviceSessionModal.openDeviceSessionDialog>)('panel-coverage', deps);
      let overlay = document.querySelector<HTMLElement>('[aria-label="Log device session"]')?.closest('.modal-overlay');
      const modeButtons = overlay?.querySelectorAll<HTMLElement>('.dev-mode-btn') || [];
      const distance = overlay?.querySelector<HTMLElement>('#dev-session-distance');
      outcomes.dialogUsesLastSessionAndFiltersModes = !!overlay
        && (overlay.querySelector<HTMLElement>('#dev-session-duration') as unknown as {value: string})?.value === '18'
        && (overlay.querySelector<HTMLElement>('#dev-session-mode') as unknown as {value: string})?.value === 'red'
        && modeButtons.length === 3
        && !overlay.textContent.includes('Blocked')
        && !!overlay.querySelector<HTMLElement>('.body-region-test')
        && (overlay.querySelector<HTMLElement>('#dev-session-eyes') as unknown as {checked: boolean})?.checked === false
        && overlay.querySelector<HTMLElement>('#dev-session-area-hint')?.textContent.includes('Legs');

      overlay?.querySelector<HTMLElement>('.dev-mode-btn[data-mode="nir"]')?.click();
      outcomes.modeClickUpdatesHiddenInputAndAria = (overlay?.querySelector<HTMLElement>('#dev-session-mode') as unknown as {value: string})?.value === 'nir'
        && overlay!.querySelector<HTMLElement>('.dev-mode-btn[data-mode="nir"]')?.getAttribute('aria-checked') === 'true';

      if (distance) {
        const initialInches = Number((distance as unknown as {value: string}).value);
        overlay!.querySelector<HTMLElement>('.dev-unit-btn[data-unit="cm"]')?.click();
        const convertedCm = Number((distance as unknown as {value: string}).value);
        overlay!.querySelector<HTMLElement>('.dev-unit-btn[data-unit="in"]')?.click();
        outcomes.unitToggleConvertsBothDirections = distance.dataset.unit === 'in'
          && Math.abs(initialInches - 11.8) < 0.05
          && Math.abs(convertedCm - 30) < 0.05
          && overlay!.querySelector<HTMLElement>('.dev-unit-btn[data-unit="in"]')?.getAttribute('aria-selected') === 'true';
      } else {
        outcomes.unitToggleConvertsBothDirections = false;
      }

      overlay?.querySelector<HTMLElement>('#dev-session-clear')?.click();
      overlay?.querySelector<HTMLElement>('#dev-session-save')?.click();
      outcomes.emptyRegionBlocksSave = !calls.some(call => (call as unknown[])[0] === 'log')
        && overlay?.querySelector<HTMLElement>('#dev-session-area-hint')?.textContent.includes('Pick at least one region');
      overlay?.remove();

      activeSession = { id: 'already-running' };
      await (deviceSessionModal.openDeviceSessionDialog as (id:Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[0],deps:Omit<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>,"logDeviceSession"|"getActiveDeviceSession"> & {logDeviceSession?: (...args:Parameters<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>)=>Promise<Pick<NonNullable<Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>>>,"id">>;getActiveDeviceSession?:()=>{id:string}|null})=>ReturnType<typeof deviceSessionModal.openDeviceSessionDialog>)('panel-coverage', deps);
      overlay = document.querySelector<HTMLElement>('[aria-label="Log device session"]')?.closest('.modal-overlay');
      overlay?.querySelector<HTMLElement>('#dev-session-start')?.click();
      await delay(20);
      outcomes.activeSessionBlocksNewTimer = !!overlay
        && document.body.contains(overlay)
        && !calls.some(call => (call as unknown[])[0] === 'start');
      activeSession = null;
      overlay?.querySelector<HTMLElement>('#dev-session-start')?.click();
      const startPayload = await waitForCall('start');
      outcomes.startTimerUsesDefaultsAndNavigates = !!startPayload
        && (startPayload as {deviceId?:unknown}).deviceId === 'panel-coverage'
        && (startPayload as {mode?:unknown}).mode === 'red'
        && (startPayload as {bodyArea?:unknown}).bodyArea === 'legs'
        && (startPayload as {bodyAreas:{includes(value:unknown):unknown}}).bodyAreas.includes('legs-front')
        && calls.some(call => (call as unknown[])[0] === 'ticker')
        && calls.some(call => (call as unknown[])[0] === 'navigate' && (call as unknown[])[1] === 'light');

      await (deviceSessionModal.openDeviceSessionDialog as (id:Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[0],deps:Omit<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>,"logDeviceSession"|"getActiveDeviceSession"> & {logDeviceSession?: (...args:Parameters<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>)=>Promise<Pick<NonNullable<Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof deviceSessionModal.openDeviceSessionDialog>[1]>["logDeviceSession"]>>>>,"id">>;getActiveDeviceSession?:()=>{id:string}|null})=>ReturnType<typeof deviceSessionModal.openDeviceSessionDialog>)('panel-coverage', deps);
      overlay = document.querySelector<HTMLElement>('[aria-label="Log device session"]')?.closest('.modal-overlay');
      (overlay!.querySelector<HTMLElement>('#dev-session-duration')! as unknown as {value: string}).value = '7';
      overlay!.querySelector<HTMLElement>('.dev-mode-btn[data-mode="combo"]')?.click();
      overlay!.querySelector<HTMLElement>('#dev-session-save')?.click();
      const logPayload = await waitForCall('log');
      outcomes.saveSessionUsesModeDurationAndRegions = !!logPayload
        && (logPayload as {durationMin?:unknown}).durationMin === 7
        && (logPayload as {mode?:unknown}).mode === 'combo'
        && (logPayload as {bodyArea?:unknown}).bodyArea === 'legs'
        && Math.abs(((logPayload as {distanceCm:unknown}).distanceCm as number) - 30) < 0.1
        && (logPayload as {eyesProtected?:unknown}).eyesProtected === false;
      outcomes.hydratesDevicesOnEachOpen = calls.filter(call => (call as unknown[])[0] === 'hydrate-devices').length === 3;
    } finally {
      state.unitSystem = saved.unitSystem;
      (state as unknown as {importedData: unknown}).importedData = saved.importedData;
      document.querySelectorAll<HTMLElement>('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, { deviceSessionUrl: moduleUrl('/js/light-device-session-modal.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light sessions view covers all-sessions modal refresh scroll and row events', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sessionsUrl }) => {
    const sessionsView = (await import(sessionsUrl) as unknown) as Pick<typeof import('../../js/light-sessions-view.js'), "configureLightSessionsView" | "renderUnifiedSessionsList" | "installLightSessionsActionDelegates" | "_openAllSessionsModal">;
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[] = [];
    const base = Date.UTC(2026, 5, 7, 12, 0);
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const resetDeps = () => (sessionsView.configureLightSessionsView as (deps:Parameters<typeof sessionsView.configureLightSessionsView>[0] & Record<string,unknown>)=>ReturnType<typeof sessionsView.configureLightSessionsView>)({
      getSessions: () => [],
      getDeviceSessions: () => [],
      getDevices: () => [],
      renderSunSessionRow: () => '',
      openDeviceSessionDetail: () => {},
      deleteDeviceSession: () => {},
      renderDeviceSessionAIInline: () => '',
      channelDisplay: {},
      channelTier: () => 0,
      formatChannelUnit: () => '',
    });

    let sunSessions = [
      { id: 'sun-a', startedAt: base - 60000, endedAt: base, durationMin: 15, doses: { vitamin_d: 2 } },
      { id: 'sun-b', startedAt: base - 3600000, endedAt: base - 3000000, durationMin: 10, doses: { circadian: 2 } },
      { id: 'sun-active', startedAt: base + 1000, endedAt: null, durationMin: 0 },
    ];
    let deviceSessions = [
      { id: 'dev-a', deviceId: 'panel-a', startedAt: base - 120000, endedAt: base - 60000, durationMin: 12, distanceCm: 20, bodyArea: 'face', eyesProtected: true, doses: { pbm_red: 5 }, mode: 'red' },
      { id: 'dev-b', deviceId: 'missing-device', startedAt: base - 7200000, endedAt: base - 6900000, durationMin: 8, distanceCm: 30, bodyArea: 'torso', eyesProtected: false, doses: { pbm_nir: 3 } },
      { id: 'dev-active', deviceId: 'panel-a', startedAt: base + 2000, endedAt: null, durationMin: 0 },
    ];

    try {
      (sessionsView.configureLightSessionsView as (deps:Parameters<typeof sessionsView.configureLightSessionsView>[0] & Record<string,unknown>)=>ReturnType<typeof sessionsView.configureLightSessionsView>)({
        getSessions: () => sunSessions,
        getDeviceSessions: () => deviceSessions,
        getDevices: () => [{
          id: 'panel-a',
          brand: 'PanelCo',
          model: 'Red 900',
          modes: [{ id: 'red', label: 'Red only', default: true }, { id: 'nir', label: 'NIR' }],
        }],
        channelDisplay: {
          pbm_red: { icon: 'R', label: 'Red', what: 'Red light' },
          pbm_nir: { icon: 'N', label: 'NIR', what: 'Near infrared' },
        },
        channelTier: (value:number) => value > 0 ? 2 : 0,
        formatChannelUnit: (key: string, value:number) => `${Math.round(value)} ${key}`,
        renderSunSessionRow: (sess: unknown) => `<div class="sun-session light-session-row light-session-sun" data-id="${(sess as {id: unknown}).id}" role="button" tabindex="0" aria-label="Sun ${(sess as {id: unknown}).id}">
          <div class="sun-session-head"><span class="sun-session-date">${(sess as {id: unknown}).id}</span></div>
        </div>`,
        openDeviceSessionDetail: (id: string) => calls.push(['detail', id]),
        deleteDeviceSession: (id: string) => calls.push(['delete', id]),
        renderDeviceSessionAIInline: (sess: unknown) => `<span class="ai-inline">AI ${(sess as {id: unknown}).id}</span>`,
      });

      const inlineHost = document.createElement('div');
      inlineHost.innerHTML = sessionsView.renderUnifiedSessionsList();
      sessionsView.installLightSessionsActionDelegates(inlineHost);
      // Active sessions are pinned elsewhere, so history sees four completed
      // rows (2 sun + 2 device) and caps the inline list to the first three.
      const inlineRows = inlineHost.querySelectorAll<HTMLElement>('.sun-session');
      outcomes.inlineListCapsAndShowsMore = inlineRows.length === 3
        && inlineHost.textContent.includes('View all 4 sessions')
        && !!inlineHost.querySelector<HTMLElement>('.light-sessions-list-unified');
      outcomes.inlineListUsesDelegatedActions = !!inlineHost.querySelector<HTMLElement>('[data-light-sessions-action="show-all"]')
        && !inlineHost.innerHTML.includes('onclick=')
        && !inlineHost.innerHTML.includes('onkeydown=');

      sessionsView._openAllSessionsModal();
      let overlay = document.querySelector<HTMLElement>('.light-sessions-modal-overlay');
      if (overlay) sessionsView.installLightSessionsActionDelegates(overlay);
      outcomes.modalSummaryCountsBothKinds = overlay?.textContent.includes('All sessions (4)') === true
        && overlay?.textContent.includes('2 outdoor · 2 device') === true
        && overlay?.querySelectorAll<HTMLElement>('.sun-session').length === 4;

      const devADelete = overlay?.querySelector<HTMLElement>('.light-session-device[data-id="dev-a"] .sun-session-delete');
      devADelete?.click();
      outcomes.historyRowsLeaveDeletionToDetail = !devADelete
        && document.body.contains(overlay)
        && !calls.some(call => (call as unknown[])[0] === 'delete');

      deviceSessions = [
        ...deviceSessions,
        { id: 'dev-c', deviceId: 'panel-a', startedAt: base + 3000, endedAt: base + 6000, durationMin: 5, distanceCm: 18, bodyArea: 'hands', eyesProtected: true, doses: { pbm_red: 9 }, mode: 'nir' },
      ];
      window.dispatchEvent(new Event('labcharts-ai-verdict-updated'));
      await delay(0);
      overlay = document.querySelector<HTMLElement>('.light-sessions-modal-overlay');
      outcomes.aiVerdictEventRefreshesOpenModal = overlay?.textContent.includes('All sessions (5)') === true
        && overlay?.textContent.includes('NIR') === true;

      const body = overlay?.querySelector<HTMLElement>('.light-sessions-modal-body');
      outcomes.modalWheelBodyExists = !!body;
      const wheelPrevented = body
        ? body.dispatchEvent(new WheelEvent('wheel', {
            deltaY: 120,
            cancelable: true,
            bubbles: true,
          })) === false
        : false;
      outcomes.modalWheelIsHandled = outcomes.modalWheelBodyExists && wheelPrevented;

      overlay?.querySelector<HTMLElement>('.light-session-device[role="button"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await delay(0);
      outcomes.deviceRowClickClosesModal = !document.body.contains(overlay)
        && calls.some(call => (call as unknown[])[0] === 'detail');

      sessionsView._openAllSessionsModal();
      overlay = document.querySelector<HTMLElement>('.light-sessions-modal-overlay');
      if (overlay) sessionsView.installLightSessionsActionDelegates(overlay);
      const keyRow = overlay?.querySelector<HTMLElement>('.light-session-device[role="button"]');
      keyRow?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.deviceRowKeyboardClosesModal = !(document.body.contains as (node:Node|null|undefined)=>boolean)(overlay);
    } finally {
      resetDeps();
      document.querySelectorAll<HTMLElement>('.light-sessions-modal-overlay').forEach(el => el.remove());
    }

    return outcomes;
  }, { sessionsUrl: moduleUrl('/js/light-sessions-view.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('glass transmission modal covers denied measurement fallback and close cleanup', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ modalsUrl }) => {
    const modals = (await import(modalsUrl) as unknown) as Pick<typeof import('../../js/light-tool-camera-modals.js'), "openGlassTransmission" | "closeGlassTransmission">;
    const outcomes: Record<string, unknown> = {};
    const savedMediaDevices = navigator.mediaDevices;
    const saved: unknown[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } },
      });
      await modals.openGlassTransmission({ roomId: 'window' }, {
        saveMeasurement: async (kind: unknown, value: unknown, meta: unknown) => saved.push({ kind, value, meta }),
      });
      const overlay = document.querySelector<HTMLElement>('[aria-label="Glass transmission test"]')?.closest('.modal-overlay');
      outcomes.glassModalStartsDisabled = !!overlay
        && overlay.querySelector<HTMLButtonElement>('#glass-save')?.disabled === true
        && overlay.querySelector<HTMLElement>('#glass-result')?.textContent === '';
      overlay?.querySelector<HTMLElement>('#glass-measure-inside')?.click();
      overlay?.querySelector<HTMLElement>('#glass-measure-outside')?.click();
      await delay(20);
      outcomes.deniedReadingsMarkBothSteps = overlay?.querySelector<HTMLElement>('#glass-reading-inside')?.textContent === 'denied'
        && overlay?.querySelector<HTMLElement>('#glass-reading-outside')?.textContent === 'denied';
      outcomes.deniedReadingsDoNotEnableSave = overlay?.querySelector<HTMLButtonElement>('#glass-save')?.disabled === true
        && saved.length === 0;
      modals.closeGlassTransmission();
      outcomes.closeGlassRemovesOverlay = !(document.body.contains as (node:Node|null|undefined)=>boolean)(overlay);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: savedMediaDevices,
      });
      try { modals.closeGlassTransmission(); } catch (_) {}
      document.querySelectorAll<HTMLElement>('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, { modalsUrl: moduleUrl('/js/light-tool-camera-modals.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
