import { expect, test } from './coverage-fixture.js';

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('sun spectrum browser coverage exercises reconstruction doses devices and safety conversions', async ({ page }) => {
  await page.route('**/sun-spectrum-blank', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/sun-spectrum-blank', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async () => {
    const legacyNames = [
      'reconstructSpectrum','synthesizeDeviceSpectrum','effectiveDeviceForMode','validateModeCoupling',
      'heuristicPeakShares','computeChannelDoses','erythemalSED','fractionOfMED',
      'vitaminDIU','vitaminDIURaw','vitaminDIUPerSession','VITD_DAILY_SATURATION_IU',
      'VITD_PER_SESSION_BODYFRAC_CAP_IU','vitaminDIURange','geneticVitaminDMultiplier',
      'pbmJoulesPerCm2','circadianMelanopicLux','retinalUVdose','glassTransmission',
      'sunscreenTransmission','SUN_CHANNELS',
    ];
    const mod = await import(`/js/sun-spectrum.js?browserCoverage=${Date.now()}`);
    const outcomes = {};
    const sum = values => values.reduce((total, value) => total + value, 0);
    const max = values => values.reduce((peak, value) => Math.max(peak, value), -Infinity);
    const approx = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;
    const positiveSpectrum = spectrum => Array.isArray(spectrum?.wavelengths)
      && spectrum.wavelengths.length === spectrum.irradiance.length
      && max(spectrum.irradiance) > 0;

    outcomes.moduleExportsAvailable = typeof mod.reconstructSpectrum === 'function'
      && typeof mod.vitaminDIUPerSession === 'function'
      && Array.isArray(mod.SUN_CHANNELS)
      && mod.SUN_CHANNELS.length === 8;
    outcomes.legacyWindowGlobalsStayAbsent = legacyNames.every(name => !(name in window));

      outcomes.channelMetadata = mod.SUN_CHANNELS.map(channel => channel.key).join('|')
        === 'vitamin_d|pomc|no_cv|violet_eye|circadian|nir_solar|pbm_red|pbm_nir';
      outcomes.actionSpectraBranches = mod.erythemalAt(260) === 1
        && mod.erythemalAt(310) > mod.erythemalAt(360)
        && mod.erythemalAt(450) === 0
        && mod.vitaminDAt(297) === 1
        && mod.vitaminDAt(240) === 0
        && mod.vitaminDAt(330) > 0
        && mod.melanopicAt(490) > mod.melanopicAt(650)
        && mod.opn5At(380) > 0.9
        && mod.ccoAt(830) > mod.ccoAt(560)
        && mod.noReleaseAt(345) > mod.noReleaseAt(430);

      outcomes.transmissionCurves = mod.glassTransmission(300) === 0
        && mod.glassTransmission(330) === 0.05
        && mod.glassTransmission(360) === 0.4
        && mod.glassTransmission(500) === 0.85
        && mod.glassTransmission(900) === 0.7
        && mod.glassTransmission(1500) === 0.3
        && mod.glassTransmission(2600) === 0
        && mod.sunscreenTransmission(300, 50) < mod.sunscreenTransmission(380, 50)
        && mod.sunscreenTransmission(430, 50) === 1
        && mod.sunscreenTransmission(300, 0) === 1;

      const night = mod.reconstructSpectrum({ zenithDeg: 92 });
      const clamped = mod.reconstructSpectrum({ zenithDeg: Number.NaN, ozoneDU: 0, altitudeM: Number.NaN, cloudCover: Number.NaN, aod: 0 });
      const clear = mod.reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300, altitudeM: 100, cloudCover: 0, aod: 0.08 });
      const hazy = mod.reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300, altitudeM: 100, cloudCover: 0.8, aod: 0.5 });
      const lowSun = mod.reconstructSpectrum({ zenithDeg: 82, ozoneDU: 300, altitudeM: -50, cloudCover: 2, aod: null });
      outcomes.reconstructSpectrumHandlesInputs = night.irradiance.every(value => value === 0)
        && positiveSpectrum(clamped)
        && positiveSpectrum(clear)
        && positiveSpectrum(lowSun)
        && sum(clear.irradiance) > sum(hazy.irradiance);

      const hybridShares = mod.heuristicPeakShares([295, 365, 450, 660, 850], 'uvb');
      const pureUvShares = mod.heuristicPeakShares([295, 311, 380], 'uvb');
      const pbmShares = mod.heuristicPeakShares([660, 850], 'pbm');
      const sadShares = mod.heuristicPeakShares([450, 660, 850], 'sad');
      const fallbackShares = mod.heuristicPeakShares([295, 660, 850], 'other');
      outcomes.heuristicSharesCoverDeviceClasses = approx(sum(hybridShares), 1)
        && approx(sum(pureUvShares), 1)
        && approx(sum(pbmShares), 1)
        && approx(sum(sadShares), 1)
        && approx(sum(fallbackShares), 1)
        && hybridShares[0] < hybridShares[3]
        && pureUvShares[0] + pureUvShares[1] > 0.4
        && pbmShares[1] > pbmShares[0]
        && sadShares[0] > sadShares[1];

      const emptyDevice = mod.synthesizeDeviceSpectrum(null);
      const noPowerDevice = mod.synthesizeDeviceSpectrum({ peakWavelengths: [660], mwPerCm2At15cm: 0 });
      const weightedDevice = mod.synthesizeDeviceSpectrum({
        peakWavelengths: [295, 365, 450, 660, 850],
        peakShares: [0, 0, 0, 0, 0],
        mwPerCm2At15cm: 100,
        type: 'uvb',
      });
      const overrideDevice = mod.synthesizeDeviceSpectrum({
        peakWavelengths: [295, Number.POSITIVE_INFINITY, 660],
        peakShares: [1, 2, 7],
        mwPerCm2At15cm: 50,
        type: 'pbm',
      });
      outcomes.synthesizeDeviceSpectrumBranches = emptyDevice.irradiance.every(value => value === 0)
        && noPowerDevice.irradiance.every(value => value === 0)
        && positiveSpectrum(weightedDevice)
        && positiveSpectrum(overrideDevice)
        && max(weightedDevice.irradiance) > max(overrideDevice.irradiance) * 0.1;

      const directDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'direct', lensTint: 'polarized' },
      });
      const bareDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'direct', lensTint: 'clear' },
      });
      const protectedDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'glass-window', lensTint: 'photochromic' },
        bodyModifiers: { glassBetween: true, sunscreenSPF: 30 },
      });
      const blueBlockerDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'direct', lensTint: 'blue-blocker' },
      });
      const amberDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'direct', lensTint: 'amber' },
      });
      const clearGlassesDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'direct', lensTint: 'clear-glasses' },
      });
      const sunglassesDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'sunglasses' },
      });
      const indoorDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'indoor' },
      });
      const closedEyeDoses = mod.computeChannelDoses({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 0.5,
        eyeExposure: { mode: 'closed-eyes' },
      });
      const zeroDoses = mod.computeChannelDoses({ spectrum: null, durationMin: 20 });
      outcomes.computeChannelDosesCoversBodyModifiers = directDoses.vitamin_d > 0
        && directDoses.circadian > 0
        && protectedDoses.vitamin_d < directDoses.vitamin_d
        && protectedDoses.circadian < directDoses.circadian
        && Object.values(zeroDoses).every(value => value === 0);
      outcomes.computeChannelDosesCoversEyeGates = bareDoses.circadian > directDoses.circadian
        && blueBlockerDoses.circadian > amberDoses.circadian
        && clearGlassesDoses.circadian > blueBlockerDoses.circadian
        && sunglassesDoses.circadian < amberDoses.circadian
        && indoorDoses.circadian === 0
        && closedEyeDoses.violet_eye === 0;

      const sedBare = mod.erythemalSED({ spectrum: clear, durationMin: 20, bodyExposureFraction: 1 });
      const sedProtected = mod.erythemalSED({
        spectrum: clear,
        durationMin: 20,
        bodyExposureFraction: 1,
        bodyModifiers: { glassBetween: true, sunscreenSPF: 50 },
      });
      outcomes.erythemalAndMedConversions = mod.erythemalSED({ spectrum: null, durationMin: 20 }) === 0
        && sedBare > sedProtected
        && mod.fractionOfMED({ sed: 1, fitzpatrick: 'I' }) > mod.fractionOfMED({ sed: 1, fitzpatrick: 'VI' })
        && mod.fractionOfMED({ sed: 1, fitzpatrick: 'III', photosensitive: true })
          > mod.fractionOfMED({ sed: 1, fitzpatrick: 'III' })
        && mod.fractionOfMED({ sed: 1, fitzpatrick: 'III', medScale: 0.25 })
          > mod.fractionOfMED({ sed: 1, fitzpatrick: 'III', photosensitive: true })
        && Number.isFinite(mod.fractionOfMED({ sed: 1, fitzpatrick: 'unknown' }));

      const genetics = {
        snps: {
          rs2282679: 'GG',
          rs10741657: { gene: 'CYP2R1', genotype: 'GG' },
          rs10877012: { gene: 'CYP27B1', genotype: 'TT' },
          rs2228570: { gene: 'VDR', genotype: 'AA' },
          rs12785878: { gene: 'DHCR7', genotype: 'GG' },
          rs6013897: { gene: 'CYP24A1', genotype: 'AA' },
          rs0000000: { gene: 'IGNORED', genotype: 'AA' },
        },
      };
      const geneResult = mod.geneticVitaminDMultiplier(genetics);
      outcomes.geneticVitaminDMultiplierBranches = mod.geneticVitaminDMultiplier(null).mult === 1
        && mod.geneticVitaminDMultiplier({}).contributors.length === 0
        && geneResult.mult < 1
        && geneResult.contributors.length === 4;

      outcomes.vitaminDConversions = mod.vitaminDIURaw(-1, 'II', 8) === 0
        && mod.vitaminDIU(100, 'II', 1.5) === 0
        && mod.vitaminDIU(100, 'II', 2.5) < mod.vitaminDIU(100, 'II', 3)
        && mod.vitaminDIU(100, 'VI', 8) < mod.vitaminDIU(100, 'II', 8)
        && mod.vitaminDIU(100, 'II', 8, true) === 2 * mod.vitaminDIU(100, 'II', 8, false)
        && mod.vitaminDIU(10000, 'II', 8) === mod.VITD_DAILY_SATURATION_IU
        && mod.vitaminDIURaw(100, 'II', 8, false, genetics) < mod.vitaminDIURaw(100, 'II', 8)
        && mod.vitaminDIUPerSession(10000, 'II', 8, false, null, 0.37) === Math.round(0.37 * mod.VITD_PER_SESSION_BODYFRAC_CAP_IU)
        && mod.vitaminDIUPerSession(10000, 'II', 8, false, null, null) === mod.VITD_DAILY_SATURATION_IU
        && mod.vitaminDIUPerSession(10, 'II', 8, false, null, 0.37) === mod.vitaminDIURaw(10, 'II', 8);

      const rangeZero = mod.vitaminDIURange(0, 'II', 8);
      const rangeNoon = mod.vitaminDIURange(100, 'II', 8, 30);
      const rangeMid = mod.vitaminDIURange(100, 'II', 8, 45);
      const rangeLow = mod.vitaminDIURange(100, 'II', 8, 70);
      const rangeUnknown = mod.vitaminDIURange(100, 'II', 8, null);
      outcomes.rangeAndDoseUnitConversions = rangeZero.central === 0
        && rangeNoon.low > rangeMid.low
        && rangeLow.low < rangeUnknown.low
        && mod.pbmJoulesPerCm2(10000) === 1
        && mod.pbmJoulesPerCm2(-5) === 0
        && mod.circadianMelanopicLux(directDoses.circadian, 20) > 0
        && mod.circadianMelanopicLux(0, 20) === 0
        && mod.circadianMelanopicLux(100, 0) === 0;

      outcomes.retinalUVdoseBranches = mod.retinalUVdose({ spectrum: null, eyeExposure: { mode: 'direct', durationSec: 60 } }) === 0
        && mod.retinalUVdose({ spectrum: clear, eyeExposure: null }) === 0
        && mod.retinalUVdose({ spectrum: clear, eyeExposure: { mode: 'sunglasses', durationSec: 60 } }) === 0
        && mod.retinalUVdose({ spectrum: clear, eyeExposure: { mode: 'direct', durationSec: 60 }, zenithDeg: 86 }) === 0
        && mod.retinalUVdose({ spectrum: clear, eyeExposure: { mode: 'direct', durationSec: 60 }, zenithDeg: 83 }) > 0
        && mod.retinalUVdose({ spectrum: clear, eyeExposure: { mode: 'direct', durationSec: 60 }, zenithDeg: 70 })
          > mod.retinalUVdose({ spectrum: clear, eyeExposure: { mode: 'direct', durationSec: 60 }, zenithDeg: 83 });

      const modeDevice = {
        peakWavelengths: [295, 365, 660, 850],
        peakShares: [0.05, 0.05, 0.40, 0.50],
        mwPerCm2At15cm: 100,
        type: 'uvb',
        channelGroups: [
          { id: 'uv', peaks: [295, 365] },
          { id: 'red', peaks: [660] },
          { id: 'nir', peaks: [850] },
        ],
        modes: [
          { id: 'all', groups: ['uv', 'red', 'nir'], default: true },
          { id: 'red-only', groups: ['red'] },
          { id: 'missing', groups: ['missing-group'] },
          { id: 'uv-only', groups: ['uv'] },
        ],
        coupling: [
          { if: 'uv', requires: ['red', 'nir'], reason: 'UV requires red and NIR' },
        ],
      };
      const redOnly = mod.effectiveDeviceForMode(modeDevice, 'red-only');
      const defaultMode = mod.effectiveDeviceForMode(modeDevice, 'not-found');
      const missingMode = mod.effectiveDeviceForMode(modeDevice, 'missing');
      outcomes.modeDeviceHelpers = mod.effectiveDeviceForMode(null, 'x') === null
        && mod.effectiveDeviceForMode({ peakWavelengths: [] }, 'x').peakWavelengths.length === 0
        && mod.effectiveDeviceForMode({ peakWavelengths: [660], mwPerCm2At15cm: 10 }, 'x').peakWavelengths[0] === 660
        && redOnly.peakWavelengths.length === 1
        && redOnly.peakWavelengths[0] === 660
        && approx(redOnly.peakShares[0], 1)
        && approx(redOnly.mwPerCm2At15cm, 40)
        && defaultMode.peakWavelengths.length === 4
        && missingMode === modeDevice;

      outcomes.modeCouplingValidation = mod.validateModeCoupling(null, 'x').ok === true
        && mod.validateModeCoupling({ coupling: [] }, 'x').ok === true
        && mod.validateModeCoupling({ coupling: [{}], modes: [{ id: 'x', groups: ['a'] }] }, 'x').ok === true
        && mod.validateModeCoupling(modeDevice, 'all').ok === true
        && mod.validateModeCoupling(modeDevice, 'red-only').ok === true
        && mod.validateModeCoupling(modeDevice, 'uv-only').ok === false
        && /UV requires/.test(mod.validateModeCoupling(modeDevice, 'uv-only').error);
    return outcomes;
  });

  expectAll(outcomes);
});
