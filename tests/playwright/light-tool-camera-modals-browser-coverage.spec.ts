import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('lightToolCameraModalsCoverage');

test('light tool camera modals cover ambient sensor lux and darkness success paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const failures = await page.evaluate(async ({ modalsUrl }) => {
    const modals = await ((import(modalsUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/light-tool-camera-modals.js"), "openLuxMeter" | "openDarknessMeter" | "closeLuxMeter" | "closeDarknessMeter"> >);
    const failures:string[] = [];
    const check = (name:string, condition:unknown, detail:unknown = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };

    const savedReadings: {kind:string;value:unknown;meta:Record<string,unknown>|undefined}[] = [];
    const savedMediaDevices = navigator.mediaDevices;
    const savedPlay = HTMLMediaElement.prototype.play;
    const savedGetContext = HTMLCanvasElement.prototype.getContext;
    const savedSetTimeout = window.setTimeout;
    const savedClearTimeout = window.clearTimeout;
    const savedPerformanceNow = performance.now.bind(performance);
    const hadAmbientLightSensor = Object.prototype.hasOwnProperty.call(window, 'AmbientLightSensor');
    const savedAmbientLightSensor = (window as unknown as {AmbientLightSensor?:unknown}).AmbientLightSensor;
    const streamStops:string[] = [];
    const lockRequests:unknown[] = [];
    let fakeNow = 0;

    const delay = (ms:number) => new Promise(resolve => savedSetTimeout(resolve, ms));
    const waitFor = async (predicate:()=>unknown, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await delay(5);
      }
      return false;
    };
    const readDisplayedNumber = (selector:string) => Number((document.querySelector(selector)?.textContent || '').replace(/[^0-9.-]/g, ''));

    const deps = {
      saveMeasurement: async (kind:Parameters<ReturnType<typeof import("../../js/light-tool-camera-modal-runtime.js").getSaveMeasurement>>[0], value:Parameters<ReturnType<typeof import("../../js/light-tool-camera-modal-runtime.js").getSaveMeasurement>>[1], meta:Parameters<ReturnType<typeof import("../../js/light-tool-camera-modal-runtime.js").getSaveMeasurement>>[2]) => {
        savedReadings.push({ kind, value, meta });
      },
    };

    try {
      interface FakeAmbientLightSensor {illuminance:number;started?:boolean;stopped?:boolean}
      class FakeAmbientLightSensor extends EventTarget {
        constructor() {
          super();
          this.illuminance = 0;
          (FakeAmbientLightSensor as typeof FakeAmbientLightSensor & {instances:FakeAmbientLightSensor[]}).instances.push(this);
        }

        start() {
          this.started = true;
          savedSetTimeout(() => {
            this.illuminance = 750;
            this.dispatchEvent(new Event('reading'));
          }, 0);
        }

        stop() {
          this.stopped = true;
        }
      }
      (FakeAmbientLightSensor as typeof FakeAmbientLightSensor & {instances:FakeAmbientLightSensor[]}).instances = [];

      const luxCameraStops:string[] = [];
      const luxCameraTrack = {
        stop: () => luxCameraStops.push('camera'),
        getSettings: () => ({
          frameRate: 30,
          exposureMode: 'manual',
          whiteBalanceMode: 'manual',
          focusMode: 'manual',
        }),
        getCapabilities: () => ({
          exposureMode: ['manual'],
          whiteBalanceMode: ['manual'],
          focusMode: ['manual'],
        }),
        applyConstraints: async () => {},
      };
      const luxCameraStream = new MediaStream();
      Object.defineProperty(luxCameraStream, 'getTracks', { configurable: true, value: () => [luxCameraTrack] });
      Object.defineProperty(luxCameraStream, 'getVideoTracks', { configurable: true, value: () => [luxCameraTrack] });

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => luxCameraStream,
        },
      });
      HTMLMediaElement.prototype.play = async function play() {
        return undefined;
      };
      (window as unknown as {AmbientLightSensor?:unknown}).AmbientLightSensor = FakeAmbientLightSensor;

      await modals.openLuxMeter({ roomId: 'office' }, deps);
      const luxReady = await waitFor(() => readDisplayedNumber('#lux-value') === 750);
      const luxPanel = document.getElementById('lux-calibration-panel');
      check('AmbientLightSensor lux path renders live reading',
        luxReady
        && document.getElementById('lux-source-line')?.textContent.includes('phone\'s light sensor')
        && document.getElementById('lux-source-als')?.getAttribute('aria-pressed') === 'true'
        && document.getElementById('lux-zone')?.textContent === 'Bright indoor');
      check('AmbientLightSensor hides camera calibration controls',
        luxPanel instanceof HTMLElement && luxPanel.style.display === 'none');

      document.getElementById('lux-source-camera')?.click();
      const cameraSelected = await waitFor(() => document.getElementById('lux-source-camera')?.getAttribute('aria-pressed') === 'true'
        && document.getElementById('lux-source-line')?.textContent.includes('camera'));
      check('Lux source control can switch from sensor to camera',
        cameraSelected
        && (FakeAmbientLightSensor as typeof FakeAmbientLightSensor & {instances:FakeAmbientLightSensor[]}).instances[0]?.stopped === true
        && luxPanel instanceof HTMLElement
        && luxPanel.style.display !== 'none');

      document.getElementById('lux-source-als')?.click();
      const sensorReselected = await waitFor(() => (FakeAmbientLightSensor as typeof FakeAmbientLightSensor & {instances:FakeAmbientLightSensor[]}).instances.length === 2
        && readDisplayedNumber('#lux-value') === 750
        && document.getElementById('lux-source-als')?.getAttribute('aria-pressed') === 'true');
      check('Lux source control can return to the preferred sensor',
        sensorReselected
        && luxCameraStops.length === 1
        && luxPanel instanceof HTMLElement
        && luxPanel.style.display === 'none');

      document.getElementById('lux-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'lux'));
      const luxSaved = savedReadings.find(item => item.kind === 'lux');
      check('AmbientLightSensor save persists authoritative reading',
        !!luxSaved
        && luxSaved.value === 750
        && luxSaved.meta!.roomId === 'office'
        && luxSaved.meta!.confidence === 0.8
        && (luxSaved.meta!.extra as {source?:unknown}).source === 'AmbientLightSensor');
      check('AmbientLightSensor is stopped on close',
        (FakeAmbientLightSensor as typeof FakeAmbientLightSensor & {instances:FakeAmbientLightSensor[]}).instances.every(sensor => sensor.stopped === true)
        && !document.querySelector('[aria-label="Lux meter"]'));

      const makeTrack = () => ({
        stop: () => streamStops.push('darkness'),
        getSettings: () => ({
          frameRate: 30,
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
        applyConstraints: async (constraints:unknown) => {
          lockRequests.push(constraints);
        },
      });
      const makeStream = () => {
        const track = makeTrack();
        const stream = new MediaStream();
        Object.defineProperty(stream, 'getTracks', { configurable: true, value: () => [track] });
        Object.defineProperty(stream, 'getVideoTracks', { configurable: true, value: () => [track] });
        return stream;
      };
      const makeDarkFrame = (width:number, height:number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 16;
          data[i + 1] = 16;
          data[i + 2] = 16;
          data[i + 3] = 255;
        }
        return data;
      };

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => makeStream() },
      });
      delete (window as unknown as {AmbientLightSensor?:unknown}).AmbientLightSensor;
      HTMLMediaElement.prototype.play = async function play() {
        return undefined;
      };
      (HTMLCanvasElement.prototype as unknown as {getContext:(this:HTMLCanvasElement,type:string,options?:unknown)=>unknown}).getContext = function getContext(type, options) {
        if (type !== '2d') return (savedGetContext as (this:HTMLCanvasElement,type:string,options?:unknown)=>unknown).call(this, type, options);
        const canvas = this;
        return {
          drawImage: () => {},
          getImageData: () => ({ data: makeDarkFrame(canvas.width, canvas.height) }),
        };
      };
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => {
          fakeNow += 5000;
          return fakeNow;
        },
      });
      (window as unknown as {setTimeout:(callback:TimerHandler,ms?:number,...args:unknown[])=>number}).setTimeout = (callback, ms, ...args): number & Record<never,typeof ms> => savedSetTimeout(callback, 0, ...args);
      window.clearTimeout = id => savedClearTimeout(id);
      localStorage.setItem('labcharts-lux-calibration', '1.5');

      await modals.openDarknessMeter({ roomId: 'bedroom' }, deps);
      document.getElementById('dark-start')?.click();
      const darknessReady = await waitFor(() => document.getElementById('dark-start')?.textContent === 'Read again'
        && (document.getElementById('dark-save') as HTMLButtonElement|null)?.disabled === false);
      const darkStatus = document.getElementById('dark-status')?.textContent || '';
      check('Darkness meter computes long-exposure result',
        darknessReady
        && darkStatus.includes('Camera level')
        && darkStatus.includes('Not lux')
        && darkStatus.includes('Camera exposure held'));
      check('Darkness meter requests long-exposure camera lock',
        lockRequests.some(req => Array.isArray((req as {advanced?:unknown}|null|undefined)?.advanced)
          && ((req as {advanced:unknown[]}).advanced).some((entry:unknown) => (entry as {exposureTime?:unknown}).exposureTime === 333)
          && ((req as {advanced:unknown[]}).advanced).some((entry:unknown) => (entry as {iso?:unknown}).iso === 400)));
      document.getElementById('dark-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'darkness'));
      const darkSaved = savedReadings.find(item => item.kind === 'darkness');
      check('Darkness save persists a qualitative camera result',
        !!darkSaved
        && (darkSaved.value as number) > 6
        && (darkSaved.value as number) < 7
        && darkSaved.meta!.roomId === 'bedroom'
        && darkSaved.meta!.confidence === 0.4
        && (darkSaved.meta!.extra as {method?:unknown}).method === 'camera-relative'
        && (darkSaved.meta!.extra as {peakCameraLevel:number}).peakCameraLevel > 6
        && (darkSaved.meta!.extra as {isoLocked?:unknown}).isoLocked === true
        && (darkSaved.meta!.extra as {levelLabel:string}).levelLabel.includes('Low light'));
      const darknessClosed = await waitFor(() => streamStops.length === 1
        && !document.querySelector('[aria-label="Sleep darkness meter"]'));
      check('Darkness close stops stream and removes modal',
        darknessClosed);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: savedMediaDevices,
      });
      HTMLMediaElement.prototype.play = savedPlay;
      HTMLCanvasElement.prototype.getContext = savedGetContext;
      window.setTimeout = savedSetTimeout;
      window.clearTimeout = savedClearTimeout;
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: savedPerformanceNow,
      });
      if (hadAmbientLightSensor) (window as unknown as {AmbientLightSensor?:unknown}).AmbientLightSensor = savedAmbientLightSensor;
      else delete (window as unknown as {AmbientLightSensor?:unknown}).AmbientLightSensor;
      localStorage.removeItem('labcharts-lux-calibration');
      [modals.closeLuxMeter, modals.closeDarknessMeter].forEach(close => {
        try { close(); } catch (_) {}
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return failures;
  }, { modalsUrl: moduleUrl('/js/light-tool-camera-modals.js') });

  expect(failures).toEqual([]);
});
