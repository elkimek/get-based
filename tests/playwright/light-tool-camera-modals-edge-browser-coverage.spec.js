import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightToolCameraModalsEdgeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('light tool camera modals cover camera fallback calibration flicker cct spectrum and glass paths', async ({ page }) => {
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
    const savedRequestAnimationFrame = window.requestAnimationFrame;
    const savedCancelAnimationFrame = window.cancelAnimationFrame;
    const savedSetTimeout = window.setTimeout;
    const savedClearTimeout = window.clearTimeout;
    const savedLuxCalibration = localStorage.getItem('labcharts-lux-calibration');
    const savedLuxCalibrationConfirmed = localStorage.getItem('labcharts-lux-calibration-confirmed');
    const hadAmbientLightSensor = Object.prototype.hasOwnProperty.call(window, 'AmbientLightSensor');
    const savedAmbientLightSensor = window.AmbientLightSensor;
    const stoppedTracks = [];
    const lockRequests = [];
    let mode = 'lux-camera';
    let glassCalls = 0;
    let glassPhase = 'inside';

    const delay = ms => new Promise(resolve => savedSetTimeout(resolve, ms));
    const waitFor = async (predicate, label, attempts = 140) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await delay(5);
      }
      failures.push(`Timed out waiting for ${label}`);
      return false;
    };
    const dispatchInput = input => input.dispatchEvent(new Event('input', { bubbles: true }));
    const delegatedModalChecks = [];
    const recordDelegatedClose = (label, action) => {
      const overlay = document.querySelector('.light-tool-overlay');
      const html = overlay?.innerHTML || '';
      delegatedModalChecks.push({
        label,
        ok: !!overlay
          && !/\bon(?:click|keydown|submit|change|input)=/.test(html)
          && overlay.querySelectorAll(`[data-light-tool-modal-action="${action}"]`).length >= 2,
      });
    };

    const deps = {
      saveMeasurement: async (kind, value, meta) => {
        savedReadings.push({ kind, value, meta });
      },
    };

    const makeFrame = (width, height, rgbForRow) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        const [r, g, b] = rgbForRow(y);
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
      return data;
    };
    const frameForMode = (width, height) => {
      if (mode === 'flicker') {
        return makeFrame(width, height, y => (y % 2 === 0 ? [240, 240, 240] : [20, 20, 20]));
      }
      if (mode === 'cct') {
        return makeFrame(width, height, () => [20, 80, 220]);
      }
      if (mode === 'spectrum-camera') {
        return makeFrame(width, height, y => (y % 2 === 0 ? [40, 240, 40] : [10, 60, 10]));
      }
      if (mode === 'glass') {
        const luma = glassPhase === 'inside' ? 20 : 40;
        return makeFrame(width, height, () => [luma, luma, luma]);
      }
      return makeFrame(width, height, () => [10, 10, 10]);
    };

    const makeStream = () => {
      const track = {
        stop: () => stoppedTracks.push(mode),
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
        applyConstraints: async constraints => {
          lockRequests.push({ mode, constraints });
        },
      };
      const stream = new MediaStream();
      Object.defineProperty(stream, 'getTracks', { configurable: true, value: () => [track] });
      Object.defineProperty(stream, 'getVideoTracks', { configurable: true, value: () => [track] });
      return stream;
    };

    try {
      delete window.AmbientLightSensor;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (mode === 'lux-manual' || mode === 'spectrum-manual') {
              throw new Error('camera denied for coverage');
            }
            if (mode === 'glass') {
              glassCalls += 1;
              glassPhase = glassCalls === 1 ? 'inside' : 'outside';
            }
            return makeStream();
          },
        },
      });
      HTMLMediaElement.prototype.play = async function play() {
        return undefined;
      };
      HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
        if (type !== '2d') return savedGetContext.call(this, type, options);
        const canvas = this;
        return {
          drawImage: () => {},
          getImageData: () => ({ data: frameForMode(canvas.width, canvas.height) }),
        };
      };
      window.requestAnimationFrame = callback => savedSetTimeout(() => callback(performance.now()), 0);
      window.cancelAnimationFrame = id => savedClearTimeout(id);
      window.setTimeout = (callback, ms, ...args) => savedSetTimeout(callback, Math.min(Number(ms) || 0, 5), ...args);
      window.clearTimeout = id => savedClearTimeout(id);
      localStorage.setItem('labcharts-lux-calibration', '1');

      mode = 'lux-camera';
      await modals.openLuxMeter({ roomId: 'camera-room' }, deps);
      recordDelegatedClose('lux camera modal', 'close-lux');
      await waitFor(
        () => document.getElementById('lux-value')?.textContent !== '\u2014',
        'camera lux reading'
      );
      const cameraLuxLine = document.getElementById('lux-source-line')?.textContent || '';
      const calInput = document.getElementById('lux-cal-reference');
      if (calInput) {
        calInput.value = '800';
        dispatchInput(calInput);
      }
      document.getElementById('lux-cal-apply')?.click();
      await waitFor(
        () => document.getElementById('lux-cal-current')?.textContent === '2.00x'
          || document.getElementById('lux-cal-current')?.textContent === '2.00\u00d7',
        'lux calibration apply'
      );
      document.getElementById('lux-cal-reset')?.click();
      await waitFor(
        () => document.getElementById('lux-cal-current')?.textContent === 'not calibrated'
          && localStorage.getItem('labcharts-lux-calibration-confirmed') == null,
        'lux calibration reset'
      );
      if (calInput) calInput.value = '800';
      document.getElementById('lux-cal-apply')?.click();
      await waitFor(
        () => document.getElementById('lux-cal-current')?.textContent === '2.00x'
          || document.getElementById('lux-cal-current')?.textContent === '2.00\u00d7',
        'lux recalibration apply'
      );
      document.getElementById('lux-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'lux' && item.meta.roomId === 'camera-room'), 'camera lux save');
      const cameraLux = savedReadings.find(item => item.kind === 'lux' && item.meta.roomId === 'camera-room');
      check('Lux camera fallback calibrates resets and saves',
        cameraLuxLine.includes('Camera brightness proxy only')
        && !!cameraLux
        && cameraLux.value === 800
        && cameraLux.meta.extra.source === 'camera-estimate'
        && Math.abs(cameraLux.meta.extra.calibrationFactor - 2) < 0.0001
        && cameraLux.meta.extra.calibrationConfirmed === true,
        JSON.stringify({ cameraLuxLine, cameraLux }));

      mode = 'lux-manual';
      await modals.openLuxMeter({ roomId: 'manual-room' }, deps);
      recordDelegatedClose('lux manual modal', 'close-lux');
      await waitFor(() => !!document.getElementById('lux-manual-input'), 'manual lux input');
      const manualInput = document.getElementById('lux-manual-input');
      manualInput.value = '55';
      dispatchInput(manualInput);
      document.getElementById('lux-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'lux' && item.meta.roomId === 'manual-room'), 'manual lux save');
      const manualLux = savedReadings.find(item => item.kind === 'lux' && item.meta.roomId === 'manual-room');
      check('Lux manual fallback saves entered reading',
        !!manualLux
        && manualLux.value === 55
        && manualLux.meta.confidence === 0.85
        && manualLux.meta.extra.source === 'manual-entry');

      mode = 'flicker';
      await modals.openFlickerDetector({ roomId: 'flicker-room' }, deps);
      recordDelegatedClose('flicker modal', 'close-flicker');
      await waitFor(
        () => /flicker|banding/i.test(document.getElementById('flicker-result')?.textContent || ''),
        'flicker result'
      );
      document.getElementById('flicker-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'flicker'), 'flicker save');
      const flicker = savedReadings.find(item => item.kind === 'flicker');
      check('Flicker detector computes banding severity and saves',
        !!flicker
        && flicker.value >= 2
        && flicker.meta.roomId === 'flicker-room'
        && flicker.meta.extra.bandingRatio > 0.1
        && flicker.meta.extra.stripes >= 2
        && lockRequests.some(item => item.mode === 'flicker'
          && item.constraints?.advanced?.some(entry => entry.exposureTime === 83)));

      mode = 'cct';
      await modals.openCCTMeter({ roomId: 'cct-room' }, deps);
      recordDelegatedClose('cct modal', 'close-cct');
      await waitFor(() => /^~\d+\s*K$/.test(document.getElementById('cct-value')?.textContent || ''), 'cct result');
      document.getElementById('cct-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'cct'), 'cct save');
      const cct = savedReadings.find(item => item.kind === 'cct');
      check('CCT meter saves a rounded cool camera-RGB estimate',
        !!cct
        && cct.value >= 6500
        && cct.meta.roomId === 'cct-room'
        && cct.meta.extra.cameraBlueRatioProxy > 0.3
        && cct.meta.extra.method === 'camera-rgb-proxy'
        && cct.meta.extra.pwmActive === false);

      mode = 'spectrum-camera';
      await modals.openSpectrumClassifier({ roomId: 'spectrum-camera-room' }, deps);
      recordDelegatedClose('spectrum camera modal', 'close-spec');
      await waitFor(
        () => /Green-biased|confidence/i.test(document.getElementById('spec-result')?.textContent || ''),
        'spectrum camera classification'
      );
      document.getElementById('spec-save')?.click();
      await waitFor(
        () => savedReadings.some(item => item.kind === 'spectrum' && item.meta.roomId === 'spectrum-camera-room'),
        'spectrum camera save'
      );
      const spectrumCamera = savedReadings.find(item => item.kind === 'spectrum' && item.meta.roomId === 'spectrum-camera-room');
      check('Spectrum classifier keeps camera RGB broad and source-agnostic',
        !!spectrumCamera
        && spectrumCamera.value === 'Green-biased source with banding'
        && spectrumCamera.meta.extra.reason.includes('source technology is not identified')
        && spectrumCamera.meta.extra.method === 'camera-rgb-proxy');

      mode = 'spectrum-manual';
      await modals.openSpectrumClassifier({ roomId: 'spectrum-room' }, deps);
      recordDelegatedClose('spectrum manual modal', 'close-spec');
      await waitFor(() => !!document.querySelector('[data-spec-manual="Cool LED (4000K+)"]'), 'spectrum manual choices');
      document.querySelector('[data-spec-manual="Cool LED (4000K+)"]')?.click();
      document.getElementById('spec-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'spectrum' && item.meta.roomId === 'spectrum-room'), 'spectrum save');
      const spectrum = savedReadings.find(item => item.kind === 'spectrum' && item.meta.roomId === 'spectrum-room');
      check('Spectrum classifier manual fallback saves selected source',
        !!spectrum
        && spectrum.value === 'Cool LED (4000K+)'
        && spectrum.meta.roomId === 'spectrum-room'
        && spectrum.meta.extra.reason.includes('manual selection'));

      mode = 'glass';
      await modals.openGlassTransmission({ roomId: 'glass-room' }, deps);
      recordDelegatedClose('glass modal', 'close-glass');
      document.getElementById('glass-measure-inside')?.click();
      await waitFor(() => /camera level/.test(document.getElementById('glass-reading-inside')?.textContent || ''), 'glass inside reading');
      document.getElementById('glass-measure-outside')?.click();
      await waitFor(() => !(document.getElementById('glass-save')?.disabled), 'glass result');
      document.getElementById('glass-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'glass-transmission'), 'glass save');
      const glass = savedReadings.find(item => item.kind === 'glass-transmission');
      check('Glass transmission computes ratio and saves with source samples',
        !!glass
        && Math.abs(glass.value - 0.5) < 0.01
        && glass.meta.roomId === 'glass-room'
        && glass.meta.confidence === 0.45
        && glass.meta.extra.method === 'two-sample-camera-ratio'
        && glass.meta.extra.inside < glass.meta.extra.outside);
      const failedDelegatedChecks = delegatedModalChecks.filter(item => !item.ok);
      check('Camera tool modals render delegated close controls without inline handlers',
        failedDelegatedChecks.length === 0,
        failedDelegatedChecks.map(item => item.label).join(', '));
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: savedMediaDevices,
      });
      HTMLMediaElement.prototype.play = savedPlay;
      HTMLCanvasElement.prototype.getContext = savedGetContext;
      window.requestAnimationFrame = savedRequestAnimationFrame;
      window.cancelAnimationFrame = savedCancelAnimationFrame;
      window.setTimeout = savedSetTimeout;
      window.clearTimeout = savedClearTimeout;
      if (hadAmbientLightSensor) window.AmbientLightSensor = savedAmbientLightSensor;
      else delete window.AmbientLightSensor;
      if (savedLuxCalibration == null) localStorage.removeItem('labcharts-lux-calibration');
      else localStorage.setItem('labcharts-lux-calibration', savedLuxCalibration);
      if (savedLuxCalibrationConfirmed == null) localStorage.removeItem('labcharts-lux-calibration-confirmed');
      else localStorage.setItem('labcharts-lux-calibration-confirmed', savedLuxCalibrationConfirmed);
      [
        modals.closeLuxMeter,
        modals.closeFlickerDetector,
        modals.closeCCTMeter,
        modals.closeSpectrumClassifier,
        modals.closeGlassTransmission,
      ].forEach(close => {
        try { close(); } catch (_) {}
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return failures;
  }, { modalsUrl: moduleUrl('/js/light-tool-camera-modals.js') });

  expect(failures).toEqual([]);
});
