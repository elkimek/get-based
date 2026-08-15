import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightToolsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(results) {
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
}

test('light tools browser coverage exercises storage render and modal flows', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ lightToolsUrl, stateUrl }) => {
    const [lightTools, { state }] = await Promise.all([
      import(lightToolsUrl),
      import(stateUrl),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentView: state.currentView,
      mediaDevices: navigator.mediaDevices,
      play: HTMLMediaElement.prototype.play,
      getContext: HTMLCanvasElement.prototype.getContext,
      requestAnimationFrame: window.requestAnimationFrame,
      cancelAnimationFrame: window.cancelAnimationFrame,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      performanceNowDescriptor: Object.getOwnPropertyDescriptor(performance, 'now'),
      performanceNow: performance.now,
      hadAmbientLightSensor: Object.prototype.hasOwnProperty.call(window, 'AmbientLightSensor'),
      AmbientLightSensor: window.AmbientLightSensor,
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const results = {};
    const analyzeCalls = [];
    const spectrumCalls = [];
    const refreshCalls = [];
    const navigateCalls = [];
    const loggedSessions = [];
    const hydrateCalls = [];
    let testSunCoords = null;
    let testSolarZenithAngle = null;
    let testSessions = [];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, timeoutMs = 1000, label = 'browser coverage condition') => {
      const started = Date.now();
      while (!predicate()) {
        if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
        await wait(10);
      }
    };
    const hasDeleted = id => Array.isArray(state.importedData?._deleted?.lightMeasurements)
      && state.importedData._deleted.lightMeasurements.includes(id);

    try {
      document.querySelectorAll('.modal-overlay.show').forEach(el => el.remove());
      state.currentView = 'light';
      state.importedData = {
        entries: [],
        lightMeasurements: [
          { id: 'old-lux', tool: 'lux', roomId: 'room-1', value: 100, capturedAt: 1000 },
          { id: 'new-lux', tool: 'lux', roomId: 'room-1', value: 400, capturedAt: 2000 },
          { id: 'audit-one', tool: 'audit', value: 1, capturedAt: 1000 },
          { id: 'audit-two', tool: 'audit', value: 2, capturedAt: 2000 },
        ],
        lightEnvironment: {
          rooms: [
            { id: 'room-1', name: 'Office' },
            { id: 'room-2', name: 'Bedroom' },
          ],
          screens: [],
        },
      };
      lightTools.configureLightTools({
        maybeAnalyzeMeasurementAfterSave: entry => analyzeCalls.push(entry.tool),
        suggestRoomSourceFromSpectrum: async (roomId, value) => {
          spectrumCalls.push({ roomId, value });
        },
        refreshLightEnvironmentAssessment: () => refreshCalls.push('refresh'),
        navigate: (...args) => navigateCalls.push(args),
        getSunCoords: () => testSunCoords,
        solarZenithAngle: (...args) => testSolarZenithAngle ? testSolarZenithAngle(...args) : null,
        logCompletedSession: async payload => {
          loggedSessions.push(payload);
          return null;
        },
        getSessions: () => testSessions,
        hydrateSession: async id => hydrateCalls.push(id),
        getRooms: () => state.importedData?.lightEnvironment?.rooms || [],
        addRoom: async label => {
          const id = `test-room-${label.toLowerCase().replace(/\s+/g, '-')}`;
          if (!state.importedData.lightEnvironment) state.importedData.lightEnvironment = { rooms: [], screens: [] };
          state.importedData.lightEnvironment.rooms.push({ id, name: label });
          return id;
        },
      });

      const migrated = lightTools.getMeasurements();
      results.migrationKeepsLatestRoomTool = migrated.some(item => item.id === 'new-lux')
        && !migrated.some(item => item.id === 'old-lux');
      results.migrationKeepsAuditHistory = migrated.filter(item => item.tool === 'audit').length === 2;
      results.migrationTombstonesDroppedMeasurement = hasDeleted('old-lux');

      const firstLux = await lightTools.saveMeasurement('lux', 500, {
        roomId: 'room-1',
        confidence: 0.81,
        label: 'desk',
        notes: 'baseline',
        extra: { source: 'manual-test' },
      });
      const secondLux = await lightTools.saveMeasurement('lux', 620, { roomId: 'room-1' });
      results.saveSupersedesPriorSameRoomTool = !lightTools.getMeasurements().some(item => item.id === firstLux.id)
        && lightTools.getMeasurements().some(item => item.id === secondLux.id)
        && hasDeleted(firstLux.id);

      const auditA = await lightTools.saveMeasurement('audit', 1, { extra: { rooms: [] } });
      const auditB = await lightTools.saveMeasurement('audit', 2, { extra: { rooms: [] } });
      results.auditSavesRemainHistorical = lightTools.getMeasurements().some(item => item.id === auditA.id)
        && lightTools.getMeasurements().some(item => item.id === auditB.id);

      await lightTools.saveMeasurement('spectrum', 'warm-led', { roomId: 'room-2' });
      results.saveHooksRun = analyzeCalls.includes('spectrum')
        && spectrumCalls.some(call => call.roomId === 'room-2' && call.value === 'warm-led')
        && refreshCalls.length === 5;
      results.roomFilterHandlesRoomAndMissingId = lightTools.getMeasurementsForRoom('room-1').every(item => item.roomId === 'room-1')
        && lightTools.getMeasurementsForRoom(null).length === 0;
      results.deleteMeasurementRemovesAndReports = await lightTools.deleteMeasurement(secondLux.id)
        && !(await lightTools.deleteMeasurement('missing-id'))
        && !lightTools.getMeasurements().some(item => item.id === secondLux.id);

      const modalBlocker = document.createElement('div');
      modalBlocker.className = 'modal-overlay show';
      document.body.append(modalBlocker);
      await lightTools.saveMeasurement('cct', 2700, { roomId: 'room-2' });
      await wait(80);
      results.navigateSkipsWhileModalOpen = !navigateCalls.some(call => call[0] === 'light'
        && call[1]?.scrollAnchor === '[data-id="room-2"]');
      modalBlocker.remove();
      await lightTools.saveMeasurement('darkness', 0.2, { roomId: 'room-2' });
      await waitUntil(() => navigateCalls.some(call => call[0] === 'light'
        && call[1]?.scrollAnchor === '[data-id="room-2"]'), 2500, 'room-scoped light navigation');
      results.navigateUsesRoomScrollAnchor = navigateCalls.some(call => call[0] === 'light'
        && call[1]?.scrollAnchor === '[data-id="room-2"]');

      const populatedHtml = lightTools.renderLightTools();
      results.renderShowsMeasuredStatus = populatedHtml.includes('measurements')
        && populatedHtml.includes('2 rooms mapped')
        && populatedHtml.includes('Recommended next');
      results.renderUsesDelegatedToolActions = populatedHtml.includes('data-light-tools-action="open-tool"')
        && populatedHtml.includes('data-light-tool-id="lux"')
        && !populatedHtml.includes('onclick=');
      const guideHost = document.createElement('div');
      guideHost.innerHTML = lightTools.aimingGuideHTML('lux');
      document.body.append(guideHost);
      const guide = guideHost.querySelector('.tool-aiming-guide');
      lightTools.dismissAimingGuide('lux');
      results.aimingGuideDismissHidesRenderedCard = guide?.style.display === 'none';
      results.aimingGuideDismissPersistsFlag =
        localStorage.getItem('labcharts-aim-guide-lux') === 'dismissed';
      results.aimingGuideDismissSuppressesFutureHtml = lightTools.aimingGuideHTML('lux') === '';
      results.aimingGuideDismissGlobalRemoved = typeof window._dismissAimingGuide === 'undefined';
      let selectorLikeDismissThrew = false;
      try {
        lightTools.dismissAimingGuide('lux"], .tool-aiming-guide');
      } catch (_) {
        selectorLikeDismissThrew = true;
      }
      results.aimingGuideDismissIgnoresSelectorSyntax =
        selectorLikeDismissThrew === false && guide?.style.display === 'none';
      guideHost.remove();
      localStorage.removeItem('labcharts-aim-guide-lux');
      state.importedData.lightMeasurements = [];
      state.importedData.lightEnvironment.rooms = [];
      const emptyHtml = lightTools.renderLightTools();
      results.renderShowsEmptyStatus = emptyHtml.includes('No measurements yet')
        && emptyHtml.includes('Camera frames stay local')
        && emptyHtml.includes('Map rooms to attach readings');
      results.goldenHourMinutesClamp = lightTools.normalizeGoldenHourMinutes('bad') === 15
        && lightTools.normalizeGoldenHourMinutes('-3') === 1
        && lightTools.normalizeGoldenHourMinutes('500') === 120
        && lightTools.normalizeGoldenHourMinutes('45') === 45;

      testSunCoords = null;
      testSolarZenithAngle = null;
      testSessions = [{ id: 'session-one' }];
      lightTools.openSunriseLogger();
      const noLocationOverlay = document.querySelector('[aria-label="Golden hour log"]')?.closest('.modal-overlay');
      document.getElementById('sunrise-save')?.click();
      await wait(30);
      results.sunriseLoggerBlocksSaveWithoutLocation =
        loggedSessions.length === 0
        && !!document.querySelector('[aria-label="Golden hour log"]');
      noLocationOverlay?.remove();

      testSunCoords = { lat: 50.08, lon: 14.43, source: 'profile' };
      testSolarZenithAngle = date => {
        const hour = date.getHours() + date.getMinutes() / 60;
        return hour >= 6 && hour < 18 ? 80 : 100;
      };
      const sunriseNavigateStart = navigateCalls.length;
      lightTools.openSunriseLogger();
      const sunriseOverlay = document.querySelector('[aria-label="Golden hour log"]')?.closest('.modal-overlay');
      const durationInput = document.getElementById('sunrise-duration');
      if (durationInput) durationInput.value = '500';
      document.getElementById('sunrise-save')?.click();
      await waitUntil(() => navigateCalls.slice(sunriseNavigateStart)
        .some(call => call[0] === 'light' && !call[1]), 2500, 'sunrise log navigation');
      results.sunriseLoggerSavesClampedSession = !document.querySelector('[aria-label="Golden hour log"]')
        && loggedSessions[0]?.eyeExposure?.durationSec === 120 * 60
        && loggedSessions[0]?.bodyExposure?.preset === 'face_hands'
        && hydrateCalls.includes('session-one');
      results.sunriseLoggerNavigatesLight = navigateCalls.slice(sunriseNavigateStart)
        .some(call => call[0] === 'light' && !call[1]);
      sunriseOverlay?.remove();

      lightTools.openSunriseLogger();
      const timedSunriseText = document.querySelector('[aria-label="Golden hour log"]')?.textContent || '';
      results.sunriseLoggerWithCoordsShowsClockTimes =
        timedSunriseText.includes('sunrise') && timedSunriseText.includes('sunset');
      document.querySelector('[aria-label="Golden hour log"]')?.closest('.modal-overlay')?.remove();

      const streamStops = [];
      const makeTrack = () => ({
        stop: () => streamStops.push('stop'),
        getSettings: () => ({
          frameRate: 120,
          exposureMode: 'manual',
          whiteBalanceMode: 'manual',
          focusMode: 'manual',
        }),
        getCapabilities: () => ({
          exposureMode: ['manual'],
          whiteBalanceMode: ['manual'],
          focusMode: ['manual'],
          exposureTime: { min: 1, max: 500 },
          iso: { min: 50, max: 800 },
          colorTemperature: { min: 2000, max: 8000 },
        }),
        applyConstraints: async () => {},
      });
      const makeStream = () => {
        const stream = new MediaStream();
        const track = makeTrack();
        Object.defineProperty(stream, 'getTracks', { configurable: true, value: () => [track] });
        Object.defineProperty(stream, 'getVideoTracks', { configurable: true, value: () => [track] });
        return stream;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => makeStream() },
      });
      HTMLMediaElement.prototype.play = async function play() {
        return undefined;
      };
      HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
        if (type !== '2d') return saved.getContext.call(this, type, options);
        const canvas = this;
        return {
          drawImage: () => {},
          getImageData: () => {
            const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
            for (let i = 0; i < data.length; i += 4) {
              data[i] = 190;
              data[i + 1] = 170;
              data[i + 2] = 130;
              data[i + 3] = 255;
            }
            return { data };
          },
        };
      };
      window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
      window.cancelAnimationFrame = id => clearTimeout(id);
      class FakeAmbientLightSensor extends EventTarget {
        constructor() {
          super();
          this.illuminance = 440;
        }
        start() {
          setTimeout(() => this.dispatchEvent(new Event('reading')), 0);
        }
        stop() {}
      }
      window.AmbientLightSensor = FakeAmbientLightSensor;

      await lightTools.openLuxMeter({ roomId: 'room-1' });
      await wait(10);
      results.openLuxMeterFacadeCreatesAndClosesModal =
        !!document.querySelector('[aria-label="Lux meter"]');
      lightTools.closeLuxMeter();
      await lightTools.openFlickerDetector({ roomId: 'room-1' });
      results.openFlickerFacadeCreatesAndClosesModal =
        !!document.querySelector('[aria-label="Flicker detector"]');
      lightTools.closeFlickerDetector();
      let fakeNow = 0;
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => {
          fakeNow += 10_000;
          return fakeNow;
        },
      });
      window.setTimeout = (callback, _delay, ...args) => saved.setTimeout.call(window, callback, 0, ...args);
      await lightTools.openDarknessMeter({ roomId: 'room-2' });
      document.getElementById('dark-start')?.click();
      await waitUntil(() => document.getElementById('dark-start')?.textContent === 'Read again'
        && document.getElementById('dark-save')?.disabled === false, 1000, 'qualitative darkness result');
      results.openDarknessFacadeCreatesAndClosesModal =
        !!document.querySelector('[aria-label="Sleep darkness meter"]');
      lightTools.closeDarknessMeter();
      window.setTimeout = saved.setTimeout;
      window.clearTimeout = saved.clearTimeout;
      if (saved.performanceNowDescriptor) {
        Object.defineProperty(performance, 'now', saved.performanceNowDescriptor);
      } else {
        try { delete performance.now; } catch (_) {
          Object.defineProperty(performance, 'now', {
            configurable: true,
            value: saved.performanceNow,
          });
        }
      }
      await lightTools.openCCTMeter({ roomId: 'room-2' });
      results.openCCTFacadeCreatesAndClosesModal =
        !!document.querySelector('[aria-label="Color temperature meter"]');
      lightTools.closeCCTMeter();
      await lightTools.openSpectrumClassifier({ roomId: 'room-2' });
      results.openSpectrumFacadeCreatesAndClosesModal =
        !!document.querySelector('[aria-label="Spectrum classifier"]');
      lightTools.closeSpectrumClassifier();
      await lightTools.openGlassTransmission({ roomId: 'room-2' });
      document.getElementById('glass-measure-inside')?.click();
      await waitUntil(() => (document.getElementById('glass-reading-inside')?.textContent || '').includes('camera level'), 2500, 'glass camera-level reading');
      results.openGlassFacadeCreatesAndClosesModal =
        !!document.querySelector('[aria-label="Glass transmission test"]');
      lightTools.closeGlassTransmission();
      results.cameraFacadeStreamsStoppedOnClose = streamStops.length >= 5;

      const streamStopsBeforeMissingCanvas = streamStops.length;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => makeStream() },
      });
      HTMLCanvasElement.prototype.getContext = () => null;
      await lightTools.openEyeLevelAudit();
      document.getElementById('audit-toggle')?.click();
      await waitUntil(() => (document.getElementById('audit-status')?.textContent || '')
        .includes('Camera processing is unavailable'), 1000, 'audit missing-canvas message');
      results.auditMissingCanvasStopsStreamAndShowsMessage =
        streamStops.length === streamStopsBeforeMissingCanvas + 1;
      lightTools.closeEyeLevelAudit();

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new Error('denied by test');
          },
        },
      });
      await lightTools.openEyeLevelAudit();
      const auditOverlay = document.querySelector('[aria-label="Home audit"]')?.closest('.modal-overlay');
      document.getElementById('audit-toggle')?.click();
      await wait(20);
      results.auditDeniedPathShowsCameraMessage = (document.getElementById('audit-status')?.textContent || '')
        .includes('Camera access denied');
      lightTools.closeEyeLevelAudit();
      results.auditCloseRemovesOverlay = !document.querySelector('[aria-label="Home audit"]');
      auditOverlay?.remove();
    } finally {
      state.importedData = saved.importedData;
      state.currentView = saved.currentView;
      lightTools.configureLightTools({
        maybeAnalyzeMeasurementAfterSave: () => {},
        suggestRoomSourceFromSpectrum: async () => {},
        refreshLightEnvironmentAssessment: () => {},
        navigate: () => {},
        getSunCoords: () => null,
        solarZenithAngle: null,
        logCompletedSession: null,
        getSessions: () => [],
        hydrateSession: async () => {},
        getRooms: () => [],
        addRoom: async () => null,
      });
      HTMLMediaElement.prototype.play = saved.play;
      HTMLCanvasElement.prototype.getContext = saved.getContext;
      window.requestAnimationFrame = saved.requestAnimationFrame;
      window.cancelAnimationFrame = saved.cancelAnimationFrame;
      window.setTimeout = saved.setTimeout;
      window.clearTimeout = saved.clearTimeout;
      if (saved.performanceNowDescriptor) {
        Object.defineProperty(performance, 'now', saved.performanceNowDescriptor);
      } else {
        try { delete performance.now; } catch (_) {
          Object.defineProperty(performance, 'now', {
            configurable: true,
            value: saved.performanceNow,
          });
        }
      }
      if (saved.hadAmbientLightSensor) window.AmbientLightSensor = saved.AmbientLightSensor;
      else delete window.AmbientLightSensor;
      try {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: saved.mediaDevices,
        });
      } catch (_) {}
      [
        lightTools.closeLuxMeter,
        lightTools.closeFlickerDetector,
        lightTools.closeDarknessMeter,
        lightTools.closeCCTMeter,
        lightTools.closeSpectrumClassifier,
        lightTools.closeGlassTransmission,
        lightTools.closeEyeLevelAudit,
      ].forEach(close => {
        try { close(); } catch (_) {}
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return results;
  }, {
    lightToolsUrl: moduleUrl('/js/light-tools.js'),
    stateUrl: '/js/state.js',
  });

  expectAll(results);
});
