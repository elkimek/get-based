import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightToolCameraModalsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('light tool camera modals cover ambient sensor lux and darkness success paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const failures = await page.evaluate(async ({ modalsUrl }) => {
    const modals = await import(modalsUrl);
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };

    const savedReadings = [];
    const savedMediaDevices = navigator.mediaDevices;
    const savedPlay = HTMLMediaElement.prototype.play;
    const savedGetContext = HTMLCanvasElement.prototype.getContext;
    const savedSetTimeout = window.setTimeout;
    const savedClearTimeout = window.clearTimeout;
    const savedPerformanceNow = performance.now.bind(performance);
    const hadAmbientLightSensor = Object.prototype.hasOwnProperty.call(window, 'AmbientLightSensor');
    const savedAmbientLightSensor = window.AmbientLightSensor;
    const streamStops = [];
    const lockRequests = [];
    let fakeNow = 0;

    const delay = ms => new Promise(resolve => savedSetTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await delay(5);
      }
      return false;
    };
    const readDisplayedNumber = selector => Number((document.querySelector(selector)?.textContent || '').replace(/[^0-9.-]/g, ''));

    const deps = {
      saveMeasurement: async (kind, value, meta) => {
        savedReadings.push({ kind, value, meta });
      },
    };

    try {
      class FakeAmbientLightSensor extends EventTarget {
        constructor() {
          super();
          this.illuminance = 0;
          FakeAmbientLightSensor.instances.push(this);
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
      FakeAmbientLightSensor.instances = [];

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new Error('camera should not be used when AmbientLightSensor succeeds');
          },
        },
      });
      window.AmbientLightSensor = FakeAmbientLightSensor;

      await modals.openLuxMeter({ roomId: 'office' }, deps);
      const luxReady = await waitFor(() => readDisplayedNumber('#lux-value') === 750);
      const luxPanel = document.getElementById('lux-calibration-panel');
      check('AmbientLightSensor lux path renders live reading',
        luxReady
        && document.getElementById('lux-source-line')?.textContent.includes('ambient light sensor')
        && document.getElementById('lux-zone')?.textContent === 'Bright indoor');
      check('AmbientLightSensor hides camera calibration controls',
        luxPanel instanceof HTMLElement && luxPanel.style.display === 'none');
      document.getElementById('lux-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'lux'));
      const luxSaved = savedReadings.find(item => item.kind === 'lux');
      check('AmbientLightSensor save persists authoritative reading',
        !!luxSaved
        && luxSaved.value === 750
        && luxSaved.meta.roomId === 'office'
        && luxSaved.meta.confidence === 0.85
        && luxSaved.meta.extra.source === 'AmbientLightSensor');
      check('AmbientLightSensor is stopped on close',
        FakeAmbientLightSensor.instances[0]?.stopped === true
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
        applyConstraints: async constraints => {
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
      const makeDarkFrame = (width, height) => {
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
      delete window.AmbientLightSensor;
      HTMLMediaElement.prototype.play = async function play() {
        return undefined;
      };
      HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
        if (type !== '2d') return savedGetContext.call(this, type, options);
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
      window.setTimeout = (callback, ms, ...args) => savedSetTimeout(callback, 0, ...args);
      window.clearTimeout = id => savedClearTimeout(id);
      localStorage.setItem('labcharts-lux-calibration', '1.5');

      await modals.openDarknessMeter({ roomId: 'bedroom' }, deps);
      document.getElementById('dark-start')?.click();
      const darknessReady = await waitFor(() => document.getElementById('dark-start')?.textContent === 'Save reading');
      const darkStatus = document.getElementById('dark-status')?.textContent || '';
      check('Darkness meter computes long-exposure result',
        darknessReady
        && darkStatus.includes('lux average')
        && darkStatus.includes('Locked ISO'));
      check('Darkness meter requests long-exposure camera lock',
        lockRequests.some(req => Array.isArray(req?.advanced)
          && req.advanced.some(entry => entry.exposureTime === 333)
          && req.advanced.some(entry => entry.iso === 400)));
      document.getElementById('dark-start')?.onclick?.();
      await waitFor(() => savedReadings.some(item => item.kind === 'darkness'));
      const darkSaved = savedReadings.find(item => item.kind === 'darkness');
      check('Darkness save persists result with room and calibration metadata',
        !!darkSaved
        && darkSaved.value > 9
        && darkSaved.meta.roomId === 'bedroom'
        && darkSaved.meta.confidence === 0.7
        && darkSaved.meta.extra.peakLux > 9
        && darkSaved.meta.extra.isoLocked === true
        && darkSaved.meta.extra.calFactor === 1.5);
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
      if (hadAmbientLightSensor) window.AmbientLightSensor = savedAmbientLightSensor;
      else delete window.AmbientLightSensor;
      localStorage.removeItem('labcharts-lux-calibration');
      ['_closeLuxMeter', '_closeDark'].forEach(name => {
        try { if (typeof window[name] === 'function') window[name](); } catch (_) {}
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return failures;
  }, { modalsUrl: moduleUrl('/js/light-tool-camera-modals.js') });

  expect(failures).toEqual([]);
});
