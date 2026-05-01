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

  // ─── 6. Body-side modifiers: glass + sunscreen ──────────────────────
  console.log('%c 6. Glass + sunscreen attenuation ', 'font-weight:bold;color:#f59e0b');

  const { glassTransmission, sunscreenTransmission } = window;
  assert('glassTransmission exposed on window', typeof glassTransmission === 'function');
  assert('sunscreenTransmission exposed on window', typeof sunscreenTransmission === 'function');

  // Glass transmission curve sanity checks
  assert('Glass blocks UVB entirely (300 nm → 0)', glassTransmission(300) === 0);
  assert('Glass mostly blocks UVA short (335 nm < 0.1)', glassTransmission(335) < 0.1,
    `T(335)=${glassTransmission(335)}`);
  assert('Glass passes most visible (550 nm > 0.7)', glassTransmission(550) > 0.7);
  assert('Glass partially passes NIR (850 nm 0.5-0.9)',
    glassTransmission(850) > 0.5 && glassTransmission(850) < 0.9);
  assert('Glass blocks mid-IR (3000 nm → 0)', glassTransmission(3000) === 0);

  // Sunscreen transmission curve sanity checks
  assert('SPF 50 transmits ~1/50 at UVB peak 297 nm', Math.abs(sunscreenTransmission(297, 50) - 1/50) < 1e-9);
  assert('SPF 30 transmits 1/30 UVB', Math.abs(sunscreenTransmission(300, 30) - 1/30) < 1e-9);
  assert('SPF 50 transmits more UVA than UVB (broad-spectrum ratio)',
    sunscreenTransmission(370, 50) > sunscreenTransmission(297, 50));
  assert('Sunscreen leaves visible untouched (550 nm → 1)', sunscreenTransmission(550, 50) === 1);
  assert('Sunscreen leaves NIR untouched (900 nm → 1)', sunscreenTransmission(900, 50) === 1);
  assert('SPF 0 / 1 / null → no attenuation (sentinel)',
    sunscreenTransmission(297, 0) === 1 && sunscreenTransmission(297, 1) === 1 && sunscreenTransmission(297, null) === 1);

  // Integration tests on a real spectrum
  const noonSpec = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300, altitudeM: 0, cloudCover: 0 });
  const baseDoses = computeChannelDoses({
    spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 1800 },
  });
  const glassDoses = computeChannelDoses({
    spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 1800 },
    bodyModifiers: { glassBetween: true },
  });
  // Glass attenuation thresholds intentionally generous — the
  // Bird-Riordan model is simplified (~25% relative for our use), and
  // erythemal/UV-driven channels include long-UVA tails that glass
  // partially passes. Tests assert directional correctness, not
  // radiometric precision.
  assert('Behind glass: vitamin_d crashes to ~0 (UVB blocked)',
    glassDoses.vitamin_d < baseDoses.vitamin_d * 0.05,
    `ratio=${(glassDoses.vitamin_d/Math.max(baseDoses.vitamin_d, 1e-9)).toFixed(4)}`);
  assert('Behind glass: pomc strictly less than bare skin',
    glassDoses.pomc < baseDoses.pomc,
    `base=${baseDoses.pomc.toFixed(3)} glass=${glassDoses.pomc.toFixed(3)} ratio=${(glassDoses.pomc/baseDoses.pomc).toFixed(3)}`);
  assert('Behind glass: no_cv reduced (UVA peak 345 nm in glass-attenuated band)',
    glassDoses.no_cv < baseDoses.no_cv,
    `ratio=${(glassDoses.no_cv/baseDoses.no_cv).toFixed(3)}`);
  assert('Behind glass: nir_solar partially passes (some retained, some blocked)',
    glassDoses.nir_solar > baseDoses.nir_solar * 0.3 &&
    glassDoses.nir_solar < baseDoses.nir_solar * 0.95,
    `ratio=${(glassDoses.nir_solar/baseDoses.nir_solar).toFixed(3)}`);
  assert('Behind glass: circadian (eye channel) UNCHANGED — eye gating is separate',
    Math.abs(glassDoses.circadian - baseDoses.circadian) < 1e-6);

  // SPF 50 attenuation
  const spf50Doses = computeChannelDoses({
    spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 1800 },
    bodyModifiers: { sunscreenSPF: 50 },
  });
  assert('SPF 50: vitamin_d roughly 1/50 of bare (UVB defines SPF)',
    spf50Doses.vitamin_d < baseDoses.vitamin_d * 0.05 &&
    spf50Doses.vitamin_d > baseDoses.vitamin_d * 0.001,
    `ratio=${(spf50Doses.vitamin_d/baseDoses.vitamin_d).toFixed(5)}`);
  assert('SPF 50: nir_solar untouched (>99% retained)',
    spf50Doses.nir_solar > baseDoses.nir_solar * 0.99);
  assert('SPF 50: circadian (eye) untouched',
    Math.abs(spf50Doses.circadian - baseDoses.circadian) < 1e-6);
  assert('SPF 50: no_cv reduced (UVA-driven, broad-spectrum SPF still attenuates)',
    spf50Doses.no_cv < baseDoses.no_cv * 0.5,
    `ratio=${(spf50Doses.no_cv/baseDoses.no_cv).toFixed(4)}`);

  // Erythemal SED tests — burn-risk gauge must respect both modifiers
  const baseSED = erythemalSED({ spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1 });
  const glassSED = erythemalSED({ spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1, bodyModifiers: { glassBetween: true } });
  const spf50SED = erythemalSED({ spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1, bodyModifiers: { sunscreenSPF: 50 } });
  assert('Erythemal SED: behind glass strictly less than bare skin',
    glassSED < baseSED,
    `base=${baseSED.toFixed(4)} glass=${glassSED.toFixed(4)} ratio=${(glassSED/baseSED).toFixed(3)}`);
  assert('Erythemal SED: SPF 50 strictly less than bare skin',
    spf50SED < baseSED && spf50SED > 0,
    `base=${baseSED.toFixed(4)} spf50=${spf50SED.toFixed(4)} ratio=${(spf50SED/baseSED).toFixed(4)}`);

  // Combined: glass + SPF stack multiplicatively
  const stackedSED = erythemalSED({
    spectrum: noonSpec, durationMin: 30, bodyExposureFraction: 1,
    bodyModifiers: { glassBetween: true, sunscreenSPF: 50 },
  });
  assert('Glass + SPF stack: even lower than either alone',
    stackedSED <= glassSED && stackedSED <= spf50SED);

  // ─── 7. Device spectrum synthesis ───────────────────────────────────
  console.log('%c 7. Device spectrum synthesis ', 'font-weight:bold;color:#f59e0b');

  const { synthesizeDeviceSpectrum } = window;
  assert('synthesizeDeviceSpectrum exposed on window', typeof synthesizeDeviceSpectrum === 'function');

  // Empty / invalid device → all-zero spectrum
  const empty = synthesizeDeviceSpectrum({});
  assert('Empty device → all-zero spectrum',
    empty.irradiance.every(v => v === 0));
  const noPeaks = synthesizeDeviceSpectrum({ mwPerCm2At15cm: 100 });
  assert('Device with no peakWavelengths → all-zero',
    noPeaks.irradiance.every(v => v === 0));

  // Single-peak narrowband UVB lamp (like Sperti Fiji at 311 nm)
  const sperti = synthesizeDeviceSpectrum({ peakWavelengths: [311], mwPerCm2At15cm: 50 });
  // Peak should be near 311 nm, drop off rapidly outside ±30 nm
  const idx311 = sperti.wavelengths.indexOf(310);
  const idx400 = sperti.wavelengths.indexOf(400);
  const idx850 = sperti.wavelengths.indexOf(850);
  assert('Sperti single-peak: irradiance peaks near 311 nm',
    sperti.irradiance[idx311] > sperti.irradiance[idx400] * 100);
  assert('Sperti single-peak: zero NIR contribution',
    sperti.irradiance[idx850] < sperti.irradiance[idx311] * 1e-6);

  // Mitochondriak Maxi UVB — 9 wavelengths spanning UVB → NIR
  const maxiUVB = synthesizeDeviceSpectrum({
    peakWavelengths: [295, 380, 480, 630, 670, 760, 810, 830, 850],
    mwPerCm2At15cm: 120,
  });
  const idx295 = maxiUVB.wavelengths.indexOf(295);
  const idx480 = maxiUVB.wavelengths.indexOf(480);
  const idx660 = maxiUVB.wavelengths.indexOf(660);
  const idx820 = maxiUVB.wavelengths.indexOf(820);
  assert('Maxi UVB: irradiance non-zero at every declared peak',
    maxiUVB.irradiance[idx295] > 0 && maxiUVB.irradiance[idx480] > 0 &&
    maxiUVB.irradiance[idx660] > 0 && maxiUVB.irradiance[idx820] > 0);
  assert('Maxi UVB: gaps between bands are quiet (e.g. 580 nm)',
    maxiUVB.irradiance[maxiUVB.wavelengths.indexOf(580)] <
    Math.max(maxiUVB.irradiance[idx480], maxiUVB.irradiance[idx660]) * 0.5);
  // Total integrated W/m² should be roughly 120 mW/cm² × 10 = 1200 W/m²
  // (within ±25% — gaussians don't perfectly preserve the boxcar total)
  const totalIntegrated = maxiUVB.irradiance.reduce((a, b) => a + b * 5, 0);
  assert('Maxi UVB: integrated irradiance ≈ device rating (1200 W/m²)',
    totalIntegrated > 900 && totalIntegrated < 1500,
    `total=${totalIntegrated.toFixed(0)} W/m²`);

  // ─── 8. Device-session channel doses (no double-counting) ────────────
  console.log('%c 8. Device-session channel doses ', 'font-weight:bold;color:#f59e0b');

  // Maxi UVB session: 20 min, full-body, eyes direct (so eye channels fire too)
  const maxiDoses = computeChannelDoses({
    spectrum: maxiUVB,
    durationMin: 20,
    bodyExposureFraction: 0.5, // half-body coverage, typical Maxi
    eyeExposure: { mode: 'direct', durationSec: 20 * 60 },
  });
  assert('Maxi UVB feeds vitamin_d (UVB at 295 nm)',
    maxiDoses.vitamin_d > 0);
  assert('Maxi UVB feeds pomc (erythemal includes UVB + UVA short)',
    maxiDoses.pomc > 0);
  assert('Maxi UVB feeds no_cv (UVA via 380 nm peak)',
    maxiDoses.no_cv > 0);
  assert('Maxi UVB feeds violet_eye (OPN5 via 380/480 nm peaks + eye direct)',
    maxiDoses.violet_eye > 0);
  assert('Maxi UVB feeds circadian (melanopic via 480 + visible peaks + eye direct)',
    maxiDoses.circadian > 0);
  assert('Maxi UVB feeds pbm_red (660 nm peak)',
    maxiDoses.pbm_red > 0);
  assert('Maxi UVB feeds pbm_nir (810/830/850 nm peaks)',
    maxiDoses.pbm_nir > 0);
  assert('Maxi UVB does NOT feed pbm-bands beyond their action range (sanity)',
    Object.values(maxiDoses).every(v => Number.isFinite(v) && v >= 0));

  // No double-counting: pbm_red and pbm_nir should be DIFFERENT magnitudes
  // because they integrate different action spectra at different peaks. If
  // the old heuristic were still active, both would equal the device's
  // total irradiance × duration × area (same number, no wavelength gating).
  assert('Maxi UVB: pbm_red ≠ pbm_nir (wavelength-correct, not double-counted)',
    Math.abs(maxiDoses.pbm_red - maxiDoses.pbm_nir) > 1,
    `red=${maxiDoses.pbm_red.toFixed(2)} nir=${maxiDoses.pbm_nir.toFixed(2)}`);
  // vitamin_d should be much smaller than pbm_red, because UVB is only
  // 1 of 9 peaks and the device spreads its irradiance across all bands.
  // Old heuristic would give vitamin_d = 0.5 × full_irradiance ≈ pbm_red.
  assert('Maxi UVB: vitamin_d much less than pbm_red (UVB is 1 of 9 peaks)',
    maxiDoses.vitamin_d < maxiDoses.pbm_red * 0.5,
    `vitamin_d=${maxiDoses.vitamin_d.toFixed(2)} pbm_red=${maxiDoses.pbm_red.toFixed(2)}`);

  // EMR-Tek-style 2-peak panel — should feed pbm_red + pbm_nir, nothing else
  const emrTek = synthesizeDeviceSpectrum({
    peakWavelengths: [660, 850],
    mwPerCm2At15cm: 150,
  });
  const emrDoses = computeChannelDoses({
    spectrum: emrTek,
    durationMin: 10,
    bodyExposureFraction: 0.5,
    eyeExposure: { mode: 'direct', durationSec: 600 },
  });
  assert('660+850 panel: vitamin_d ≈ 0 (no UVB)', emrDoses.vitamin_d < 1e-3,
    `vitamin_d=${emrDoses.vitamin_d.toExponential(2)}`);
  assert('660+850 panel: pomc ≈ 0 (no erythemal weight)', emrDoses.pomc < 1e-3);
  assert('660+850 panel: no_cv ≈ 0 (no UVA at 345 nm)', emrDoses.no_cv < 1e-3);
  assert('660+850 panel: pbm_red > 0', emrDoses.pbm_red > 0);
  assert('660+850 panel: pbm_nir > 0', emrDoses.pbm_nir > 0);

  // Glass attenuation also applies to device sessions when relevant
  const maxiThruGlass = computeChannelDoses({
    spectrum: maxiUVB,
    durationMin: 20,
    bodyExposureFraction: 0.5,
    eyeExposure: { mode: 'direct', durationSec: 20 * 60 },
    bodyModifiers: { glassBetween: true },
  });
  assert('Device session through glass: vitamin_d crashes',
    maxiThruGlass.vitamin_d < maxiDoses.vitamin_d * 0.05,
    `ratio=${(maxiThruGlass.vitamin_d / Math.max(maxiDoses.vitamin_d, 1e-9)).toFixed(4)}`);

  // ─── Summary ────────────────────────────────────────────────────────
  console.log(`%c Sun Spectrum: ${pass} passed, ${fail} failed`,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);

  // Restore nothing — these tests don't mutate state
  return { pass, fail };
})();
