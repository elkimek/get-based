// test-sun-spectrum.js — Bird-Riordan reconstruction + action-spectrum convolution
// Run: fetch('tests/test-sun-spectrum.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Sun Spectrum Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const { reconstructSpectrum, computeChannelDoses, erythemalSED, fractionOfMED, retinalUVdose, SUN_CHANNELS } = window;

  // ─── 1. Spectrum shape ──────────────────────────────────────────────
  console.log('%c 1. Spectrum reconstruction ', 'font-weight:bold;color:#f59e0b');

  const noon = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300, altitudeM: 0, cloudCover: 0 });
  assert('Returns wavelengths array', Array.isArray(noon.wavelengths) && noon.wavelengths.length > 0);
  assert('Returns irradiance array', Array.isArray(noon.irradiance) && noon.irradiance.length === noon.wavelengths.length);
  assert('Spectrum spans 280–2500nm', noon.wavelengths[0] === 280 && noon.wavelengths[noon.wavelengths.length - 1] === 2500);
  assert('5nm resolution', noon.wavelengths[1] - noon.wavelengths[0] === 5);
  assert('Irradiance positive at midday', noon.irradiance.some(v => v > 0));

  // Sun below horizon → all zeros
  const night = reconstructSpectrum({ zenithDeg: 100, ozoneDU: 300 });
  assert('Sun below horizon → zero irradiance', night.irradiance.every(v => v === 0));

  // ─── 2. Atmospheric attenuation ─────────────────────────────────────
  console.log('%c 2. Atmospheric attenuation ', 'font-weight:bold;color:#f59e0b');

  // Higher zenith angle (lower sun) → less UVB at surface
  const highSun = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300 });
  const lowSun = reconstructSpectrum({ zenithDeg: 75, ozoneDU: 300 });
  const idx_300nm = highSun.wavelengths.indexOf(300);
  assert('Low sun → less UVB than high sun',
    lowSun.irradiance[idx_300nm] < highSun.irradiance[idx_300nm],
    `high=${highSun.irradiance[idx_300nm].toFixed(4)} vs low=${lowSun.irradiance[idx_300nm].toFixed(4)}`);

  // More ozone → less UVB
  const lowO3 = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 250 });
  const highO3 = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 400 });
  assert('More ozone → less UVB',
    highO3.irradiance[idx_300nm] < lowO3.irradiance[idx_300nm],
    `low=${lowO3.irradiance[idx_300nm].toFixed(4)} vs high=${highO3.irradiance[idx_300nm].toFixed(4)}`);

  // Cloud cover reduces total irradiance
  const clear = reconstructSpectrum({ zenithDeg: 30, cloudCover: 0 });
  const overcast = reconstructSpectrum({ zenithDeg: 30, cloudCover: 1 });
  const idx_500nm = clear.wavelengths.indexOf(500);
  assert('Overcast reduces visible irradiance',
    overcast.irradiance[idx_500nm] < clear.irradiance[idx_500nm] * 0.5);

  // Altitude correction increases UV
  const sea = reconstructSpectrum({ zenithDeg: 30, altitudeM: 0 });
  const mountain = reconstructSpectrum({ zenithDeg: 30, altitudeM: 3000 });
  assert('Higher altitude → more UVB',
    mountain.irradiance[idx_300nm] > sea.irradiance[idx_300nm]);

  // ─── 3. Channel dose calculation ────────────────────────────────────
  console.log('%c 3. Channel dose calculation ', 'font-weight:bold;color:#f59e0b');

  assert('SUN_CHANNELS has 8 entries', SUN_CHANNELS.length === 8);
  const expectedKeys = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];
  assert('SUN_CHANNELS keys match design',
    expectedKeys.every(k => SUN_CHANNELS.find(ch => ch.key === k)));

  const fullExposure = computeChannelDoses({
    spectrum: noon,
    durationMin: 15,
    bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 900, lensTint: 'clear' }
  });
  assert('All channels have non-negative doses',
    Object.values(fullExposure).every(v => v >= 0));
  assert('Vitamin D channel positive at noon UV',
    fullExposure.vitamin_d > 0);
  assert('Circadian channel positive with direct eye exposure',
    fullExposure.circadian > 0);
  assert('NIR-solar channel positive at noon',
    fullExposure.nir_solar > 0);

  // Body exposure scaling
  const halfBody = computeChannelDoses({
    spectrum: noon, durationMin: 15, bodyExposureFraction: 0.5,
    eyeExposure: { mode: 'direct', durationSec: 900 }
  });
  assert('Half body exposure → half vit-D dose',
    Math.abs(halfBody.vitamin_d - fullExposure.vitamin_d * 0.5) < fullExposure.vitamin_d * 0.01);

  // Eye-mode gating: sunglasses kills circadian channel
  const sunglasses = computeChannelDoses({
    spectrum: noon, durationMin: 15, bodyExposureFraction: 1,
    eyeExposure: { mode: 'sunglasses', durationSec: 900 }
  });
  assert('Sunglasses dramatically reduce circadian dose',
    sunglasses.circadian < fullExposure.circadian * 0.1);
  assert('Sunglasses leave skin channels intact',
    sunglasses.vitamin_d === fullExposure.vitamin_d);

  // No eye exposure → zero circadian
  const noEye = computeChannelDoses({
    spectrum: noon, durationMin: 15, bodyExposureFraction: 1, eyeExposure: null
  });
  assert('Null eye exposure → zero circadian dose', noEye.circadian === 0);
  assert('Null eye exposure → zero violet dose', noEye.violet_eye === 0);
  assert('Null eye exposure leaves skin channels intact',
    noEye.vitamin_d === fullExposure.vitamin_d);

  // Indoor mode → zero eye channels
  const indoor = computeChannelDoses({
    spectrum: noon, durationMin: 15, bodyExposureFraction: 1,
    eyeExposure: { mode: 'indoor', durationSec: 900 }
  });
  assert('Indoor eye mode → zero circadian', indoor.circadian === 0);

  // Glass-window mode → partial pass
  const glass = computeChannelDoses({
    spectrum: noon, durationMin: 15, bodyExposureFraction: 1,
    eyeExposure: { mode: 'glass-window', durationSec: 900 }
  });
  assert('Glass window → partial circadian', glass.circadian > 0 && glass.circadian < fullExposure.circadian);

  // Zero duration → zero everything
  const zeroDur = computeChannelDoses({
    spectrum: noon, durationMin: 0, bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 0 }
  });
  assert('Zero duration → zero doses',
    Object.values(zeroDur).every(v => v === 0));

  // ─── 4. Safety counters ─────────────────────────────────────────────
  console.log('%c 4. Safety counters ', 'font-weight:bold;color:#f59e0b');

  const sed = erythemalSED({ spectrum: noon, durationMin: 15, bodyExposureFraction: 1 });
  assert('SED is positive number', sed > 0 && Number.isFinite(sed));

  const sed_short = erythemalSED({ spectrum: noon, durationMin: 5, bodyExposureFraction: 1 });
  assert('Shorter session → lower SED', sed_short < sed);
  assert('SED scales linearly with duration',
    Math.abs(sed - sed_short * 3) < sed * 0.01);

  const medFracII = fractionOfMED({ sed, fitzpatrick: 'II' });
  const medFracVI = fractionOfMED({ sed, fitzpatrick: 'VI' });
  assert('Type II skin reaches MED faster than Type VI', medFracII > medFracVI);
  assert('Type VI MED fraction is much smaller', medFracVI < medFracII / 3);

  // Retinal UV — only counted in 'direct' eye mode
  const retDir = retinalUVdose({ spectrum: noon, eyeExposure: { mode: 'direct', durationSec: 60 } });
  const retSun = retinalUVdose({ spectrum: noon, eyeExposure: { mode: 'sunglasses', durationSec: 60 } });
  const retInd = retinalUVdose({ spectrum: noon, eyeExposure: { mode: 'indoor', durationSec: 60 } });
  assert('Direct eye exposure accumulates retinal UV', retDir > 0);
  assert('Sunglasses → zero retinal UV in our model', retSun === 0);
  assert('Indoor → zero retinal UV', retInd === 0);

  // ─── 5. Edge cases ──────────────────────────────────────────────────
  console.log('%c 5. Edge cases ', 'font-weight:bold;color:#f59e0b');

  // Sun below horizon → all channel doses zero
  const nightDoses = computeChannelDoses({
    spectrum: night, durationMin: 60, bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 3600 }
  });
  assert('Night spectrum → all channels zero',
    Object.values(nightDoses).every(v => v === 0));
  assert('Night SED is zero',
    erythemalSED({ spectrum: night, durationMin: 60, bodyExposureFraction: 1 }) === 0);

  // ─── Summary ────────────────────────────────────────────────────────
  console.log(`%c Sun Spectrum: ${pass} passed, ${fail} failed`,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);

  // Restore nothing — these tests don't mutate state
  return { pass, fail };
})();
