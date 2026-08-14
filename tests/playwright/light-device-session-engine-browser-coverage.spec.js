import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?lightDeviceSessionEngineCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('light device session engine browser coverage covers mode area distance and dose paths', async ({ page }) => {
  await openBlankPage(page, '/light-device-session-engine-coverage');

  const outcomes = await page.evaluate(async ({ engineUrl }) => {
    const engine = await import(engineUrl);
    const calls = [];
    const modeDevice = {
      id: 'panel-1',
      recommendedDistanceCm: 20,
      modes: [
        { id: 'all-on', default: true },
        { id: 'red-only' },
        { id: 'uv-only' },
      ],
    };

    const resolvedDefault = engine.resolveDeviceMode(modeDevice, 'missing');
    const resolvedValid = engine.resolveDeviceMode(modeDevice, 'red-only', {
      validateModeCoupling: (_device, mode) => ({ ok: mode !== 'red-only-blocked' }),
    });
    const resolvedRejected = engine.resolveDeviceMode(modeDevice, 'uv-only', {
      validateModeCoupling: (_device, mode) => ({ ok: mode !== 'uv-only' }),
    });

    const customRegions = [
      { key: 'left-arm', fraction: 0.07 },
      { key: 'right-arm', fraction: 0.08 },
      { key: 'face', fraction: 0.04 },
    ];
    const explicitArea = engine.bodyFractionForDeviceSession({
      bodyAreas: ['left-arm', 'right-arm', 'unknown-region'],
    }, customRegions);
    const fallbackTargetedArea = engine.bodyFractionForDeviceSession({
      bodyAreas: ['unknown-region'],
    }, customRegions);

    const spectrumDose = engine.computeDeviceSessionDoses({
      device: {
        ...modeDevice,
        peakWavelengths: [660, 850],
        mwPerCm2At15cm: 12,
      },
      durationMin: 5,
      distanceCm: 40,
      bodyAreas: ['arms-front', 'arms-back'],
      eyesProtected: false,
      mode: 'red-only',
    }, {
      validateModeCoupling: () => ({ ok: true }),
      effectiveDeviceForMode: (device, mode) => {
        calls.push(['effectiveDeviceForMode', mode]);
        return { ...device, activeMode: mode };
      },
      synthesizeDeviceSpectrum: device => {
        calls.push(['synthesizeDeviceSpectrum', device.activeMode]);
        return { wavelengths: [660, 850], irradiance: [2, 4] };
      },
      computeChannelDoses: input => {
        calls.push(['computeChannelDoses', {
          wavelengths: input.spectrum.wavelengths,
          irradiance: input.spectrum.irradiance,
          durationMin: input.durationMin,
          bodyExposureFraction: input.bodyExposureFraction,
          eyeMode: input.eyeExposure.mode,
          durationSec: input.eyeExposure.durationSec,
        }]);
        return {
          pbm_red: input.spectrum.irradiance[0] * input.durationMin * input.bodyExposureFraction,
          circadian: input.eyeExposure.durationSec,
        };
      },
    });

    const sadDirect = engine.computeDeviceSessionDoses({
      device: { type: 'sad', lux: 10000, recommendedDistanceCm: 15 },
      durationMin: 10,
      distanceCm: 15,
      eyesProtected: false,
    });
    const sadProtected = engine.computeDeviceSessionDoses({
      device: { type: 'sad', lux: 10000, recommendedDistanceCm: 15 },
      durationMin: 10,
      distanceCm: 15,
      eyesProtected: true,
    });

    const approx = (actual, expected) => Math.abs(actual - expected) < 1e-9;

    return {
      constantsExposeExpectedChannelsAndFractions:
        engine.DEVICE_BODY_AREA_FRACTIONS.face === 0.04
        && engine.DEVICE_BODY_AREA_FRACTIONS['whole-body'] === 0.92
        && engine.DEVICE_TYPE_CHANNELS.uvb.includes('vitamin_d')
        && engine.DEVICE_TYPE_CHANNELS.sad.length === 1
        && engine.DEVICE_TYPE_CHANNELS.sad[0] === 'circadian',
      modeResolutionHonorsDefaultValidAndRejectedModes:
        engine.resolveDeviceMode({}, 'manual') === 'manual'
        && engine.resolveDeviceMode({}, null) === null
        && resolvedDefault === 'all-on'
        && resolvedValid === 'red-only'
        && resolvedRejected === 'all-on',
      bodyAreaFractionUsesPreciseRegionsAndBroadFallbacks:
        approx(explicitArea, 0.15)
        && fallbackTargetedArea === engine.DEVICE_BODY_AREA_FRACTIONS.targeted
        && engine.bodyFractionForDeviceSession({ bodyArea: 'torso' }) === 0.13
        && engine.bodyFractionForDeviceSession({ bodyArea: 'unknown' }) === 0.10,
      distanceFactorRequiresMeasuredDataOrAnExplicitPointSourceModel:
        engine.deviceDistanceFactor({ recommendedDistanceCm: 20 }, 40) === 1
        && engine.deviceDistanceFactor({ recommendedDistanceCm: 20 }, 10) === 1
        && engine.deviceDistanceFactor({ recommendedDistanceCm: 20, distanceModel: 'point-source' }, 40) === 0.25
        && engine.deviceDistanceFactor({ recommendedDistanceCm: 20, distanceModel: 'point-source' }, 10) === 3
        && engine.deviceDistanceFactor({ recommendedDistanceCm: 15 }, Number.NaN) === 1,
      spectrumDosePathScalesIrradianceAndPassesEyeExposure:
        spectrumDose.mode === 'red-only'
        && approx(spectrumDose.bodyExposureFraction, 0.10)
        && approx(spectrumDose.distanceFactor, 1)
        && spectrumDose.eyeMode === 'closed-eyes'
        && spectrumDose.durationSec === 300
        && approx(spectrumDose.doses.pbm_red, 1)
        && spectrumDose.doses.circadian === 300
        && calls.some(call => call[0] === 'effectiveDeviceForMode' && call[1] === 'red-only')
        && calls.some(call => call[0] === 'synthesizeDeviceSpectrum' && call[1] === 'red-only')
        && calls.some(call => call[0] === 'computeChannelDoses'
          && JSON.stringify(call[1].irradiance) === JSON.stringify([2, 4])
          && call[1].eyeMode === 'closed-eyes'
          && call[1].durationSec === 300),
      sadLuxFallbackKeepsPhotopicLuxButDoesNotInventMelanopicDose:
        sadDirect.doses.circadian === undefined
        && sadDirect.metrics.photopicLux === 10000
        && sadDirect.metrics.melanopicEdiLux === null
        && sadDirect.metrics.melanopicStatus === 'spectrum-required'
        && Object.keys(sadProtected.doses).length === 0
        && sadProtected.eyeMode === 'closed-eyes',
    };
  }, {
    engineUrl: moduleUrl('/js/light-device-session-engine.js'),
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
