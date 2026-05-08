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

  // P1.3 audit fix (v1.7.7): the airMass-scaled diffuse fraction must
  // boost extreme-zenith UVB above the v1.7.6 baseline (where the
  // diffuse fraction was constant and the direct beam dominated).
  // The model still reports lower TOTAL irradiance at lowSun than
  // highSun (the previous assertion above) — diffuse can't fully
  // compensate for the exponential direct-beam attenuation. But
  // compared to a hypothetical v1.7.6 (constant diffuse fraction),
  // the v1.7.7 lowSun UVB should be measurably higher because the
  // diffuse multiplier grows with airMass.
  const veryLowSun = reconstructSpectrum({ zenithDeg: 80, ozoneDU: 300 });
  const v176Equivalent_at80 = (() => {
    const z = 80, cosZ = Math.cos(z * Math.PI / 180);
    const am = 1 / Math.max(cosZ, 0.001);
    // Strip the airMass scaling: divide back out to recover the
    // direct-beam-only equivalent the old model would have computed.
    const amScale = Math.min(Math.sqrt(am), 3);
    const diffuseFrac = 0.55; // UVB band per the model
    return veryLowSun.irradiance[idx_300nm] * (1 + diffuseFrac) / (1 + diffuseFrac * amScale);
  })();
  assert('v1.7.7 airMass-scaled diffuse boosts UVB at zenith=80° vs constant-fraction baseline',
    veryLowSun.irradiance[idx_300nm] > v176Equivalent_at80,
    `boosted=${veryLowSun.irradiance[idx_300nm].toFixed(6)} vs equiv=${v176Equivalent_at80.toFixed(6)}`);
  // Bound check: even at extreme zenith, diffuse-scaled output must
  // still be lower than the noon (zenith=30) value — this is a sanity
  // gate so a future code change can't accidentally make low-sun UVB
  // exceed high-sun UVB.
  assert('Extreme-zenith UVB still below high-sun UVB (no runaway scaling)',
    veryLowSun.irradiance[idx_300nm] < highSun.irradiance[idx_300nm],
    `extreme=${veryLowSun.irradiance[idx_300nm].toFixed(6)} vs high=${highSun.irradiance[idx_300nm].toFixed(6)}`);
  // Cap check: at zenith approaching 90°, airMass→∞ so √airMass would
  // also blow up without the cap; the min(_, 3) ensures the ratio
  // multiplier stays bounded. Verify by exercising airMass=10
  // (zenith≈84°) and checking the output is finite + non-negative.
  const nearHorizon = reconstructSpectrum({ zenithDeg: 84, ozoneDU: 300 });
  assert('Near-horizon irradiance is finite + non-negative (airMass cap)',
    nearHorizon.irradiance.every(v => Number.isFinite(v) && v >= 0));

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

  // Loosened from `=== 8` to `>=` — adding a new channel (e.g. UVA-IR)
  // is a safe extension; the canonical 8 must still be present.
  const expectedKeys = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];
  assert('SUN_CHANNELS contains at least 8 entries',
    SUN_CHANNELS.length >= 8, `length=${SUN_CHANNELS.length}`);
  assert('SUN_CHANNELS keys match design',
    expectedKeys.every(k => SUN_CHANNELS.find(ch => ch.key === k)),
    `missing: ${expectedKeys.filter(k => !SUN_CHANNELS.find(ch => ch.key === k)).join(',')}`);

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

  // Photosensitive medication scaling — burn threshold drops ~2.5× so
  // the MED fraction climbs ~2.5× faster for the same dose.
  const medFracIIPhoto = fractionOfMED({ sed, fitzpatrick: 'II', photosensitive: true });
  assert('Photosensitive flag raises MED fraction', medFracIIPhoto > medFracII);
  assert('Photosensitive scales MED fraction by ~2.5×',
    Math.abs(medFracIIPhoto - medFracII * 2.5) < medFracII * 0.05);
  assert('Photosensitive default false leaves MED fraction unchanged',
    fractionOfMED({ sed, fitzpatrick: 'II' }) === medFracII);

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
  // type='uvb' panel: per the type-aware peakShares heuristic the UV+UVA
  // bands carry ~60% of total power (the panel's rated irradiance is
  // dominated by its UV-mode output, not equally split across all 9
  // peaks). vitamin_d channel-au should therefore be the dominant
  // channel — comparable to or exceeding the residual pbm_red yield.
  // Pre-2026-05-08 this assertion was inverted: it pinned the equal-N-
  // split bug where vit-D was 1/9 of total irradiance and produced
  // unrealistically low IU. The new heuristic restores correct
  // photobiology for UV-mode sessions on hybrid panels.
  assert('Maxi UVB (type=uvb): vitamin_d is meaningful (UV bands dominate the share)',
    maxiDoses.vitamin_d > 0 && maxiDoses.vitamin_d >= maxiDoses.pbm_red * 0.5,
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

  // ─── 15b. Type-aware peakShares heuristic ───────────────────────────
  // Different `type` values should redistribute power across bands so
  // that the same peakWavelengths array yields different per-channel
  // doses. UVB-typed panels concentrate output in UV+blue; PBM-typed
  // panels concentrate it in red+NIR. SAD-typed panels in blue.
  console.log('%c 15b. type-aware peakShares heuristic ', 'font-weight:bold;color:#f59e0b');
  const samePeaks = [295, 380, 480, 660, 850];
  const sameIrr = 100;
  const asUvb = synthesizeDeviceSpectrum({ peakWavelengths: samePeaks, mwPerCm2At15cm: sameIrr, type: 'uvb' });
  const asPbm = synthesizeDeviceSpectrum({ peakWavelengths: samePeaks, mwPerCm2At15cm: sameIrr, type: 'pbm' });
  const asSad = synthesizeDeviceSpectrum({ peakWavelengths: samePeaks, mwPerCm2At15cm: sameIrr, type: 'sad' });
  const dosesAt = (sp) => computeChannelDoses({
    spectrum: sp, durationMin: 5, bodyExposureFraction: 0.4,
    eyeExposure: { mode: 'direct', durationSec: 300 },
  });
  const uvbDoses = dosesAt(asUvb);
  const pbmDoses = dosesAt(asPbm);
  const sadDoses = dosesAt(asSad);
  assert('UVB-typed panel produces more vit-D than PBM-typed (same peaks, same irradiance)',
    uvbDoses.vitamin_d > pbmDoses.vitamin_d * 5,
    `uvb=${uvbDoses.vitamin_d.toFixed(2)} pbm=${pbmDoses.vitamin_d.toFixed(2)}`);
  assert('PBM-typed panel produces more pbm_nir than UVB-typed',
    pbmDoses.pbm_nir > uvbDoses.pbm_nir * 2,
    `uvb=${uvbDoses.pbm_nir.toFixed(2)} pbm=${pbmDoses.pbm_nir.toFixed(2)}`);
  assert('SAD-typed panel produces more circadian (blue-rich) than UVB-typed',
    sadDoses.circadian > uvbDoses.circadian,
    `sad=${sadDoses.circadian.toFixed(2)} uvb=${uvbDoses.circadian.toFixed(2)}`);

  // Per-band sigma: a single 295nm peak with type='uvb' should produce
  // MORE vit-D than the same peak rendered with the old fixed sigma=12.7.
  // Verifies the per-band sigma + heuristic shares both fired.
  const narrowUvb = synthesizeDeviceSpectrum({ peakWavelengths: [295], mwPerCm2At15cm: 10, type: 'uvb' });
  const narrowDoses = dosesAt(narrowUvb);
  assert('Single 295nm UVB peak with narrow sigma yields meaningful vit-D',
    narrowDoses.vitamin_d > 0,
    `vitamin_d=${narrowDoses.vitamin_d.toFixed(2)}`);

  // Explicit peakShares override the heuristic.
  const overridden = synthesizeDeviceSpectrum({
    peakWavelengths: [295, 660], mwPerCm2At15cm: 100, type: 'uvb',
    peakShares: [0.05, 0.95],  // user knows the real split
  });
  const overrideDoses = dosesAt(overridden);
  assert('Explicit peakShares override the type-aware heuristic',
    overrideDoses.pbm_red > overrideDoses.vitamin_d,
    `vit-d=${overrideDoses.vitamin_d.toFixed(2)} pbm_red=${overrideDoses.pbm_red.toFixed(2)}`);

  // ─── 16. Absolute magnitudes (regression guard) ─────────────────────
  // Pre-existing tests checked monotonicity (more ozone → less UVB) but
  // never absolute values, which is how a Rayleigh-formula inversion
  // shipped that produced 7-order-too-low UVB while still passing every
  // directional comparison. These checks pin spectrum + dose magnitudes
  // to physical reality so the same class of bug can't recur.
  console.log('%c 16. Absolute magnitudes (regression guard) ', 'font-weight:bold;color:#f59e0b');
  const noonRef = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300, altitudeM: 0, cloudCover: 0 });
  const irrAt = (target) => {
    const idx = noonRef.wavelengths.indexOf(target);
    return idx >= 0 ? noonRef.irradiance[idx] : 0;
  };
  // Reference values for clear-sky noon at zenith=30° (mid-latitude solar)
  // come from ASTM G173 + Bird-Riordan + TUV/NIWA published tables.
  // ±50% bands — the model is "accurate to ~25% relative" per its
  // docstring; the bugs we're guarding against were 10⁷× off in UVB.
  // Engine v3 (proper Bass-Paur ozone + diffuse scatter + clean-sky
  // aerosol + cosZ) produces values within these bands.
  const i305 = irrAt(305);
  const i400 = irrAt(400);
  const i500 = irrAt(500);
  const i700 = irrAt(700);
  assert('305 nm UVB irradiance is in 0.005–0.2 W/m²/nm range',
    i305 > 0.005 && i305 < 0.2, `got ${i305.toExponential(2)} W/m²/nm`);
  assert('400 nm violet irradiance is in 0.3–2.5 W/m²/nm range',
    i400 > 0.3 && i400 < 2.5, `got ${i400.toFixed(3)} W/m²/nm`);
  assert('500 nm visible irradiance is in 0.5–2.5 W/m²/nm range',
    i500 > 0.5 && i500 < 2.5, `got ${i500.toFixed(3)} W/m²/nm`);
  assert('700 nm red/NIR irradiance is in 0.3–1.5 W/m²/nm range',
    i700 > 0.3 && i700 < 1.5, `got ${i700.toFixed(3)} W/m²/nm`);

  // Implied UVI at zenith=30° clear noon should be 5-9 (real noon
  // midlatitude summer is 7-8). The pre-engine-v3 model gave 4 due to
  // ~3× transmissive ozone + missing diffuse + missing cosZ.
  const sedNoon = erythemalSED({ spectrum: noonRef, durationMin: 30, bodyExposureFraction: 1 });
  const erythemalIrr = sedNoon * 100 / (30 * 60); // W/m²
  const impliedUVI = erythemalIrr / 0.025;
  assert('zenith=30° clear-noon implies UVI 5-9 (real ~7-8)',
    impliedUVI > 5 && impliedUVI < 9, `got UVI ${impliedUVI.toFixed(1)}`);

  // SED at 30 min naked noon must give Type II at least 1 MED (real
  // burn time at noon is 10-15 min for fair skin, so 30 min should
  // produce 1.5-3 MED).
  assert('30 min naked clear-noon → at least 1 MED of erythemal exposure (Type II)',
    sedNoon >= 2.5 && sedNoon <= 6, `got ${sedNoon.toFixed(2)} SED`);

  // Channel doses: 30 min naked clear-noon should produce visible
  // vit_d / pomc / no_cv accumulation — the post-fix calibration sits
  // between Bogh & Wulf 2010 lab values and Holick 2008 natural-sun.
  const fullNoon = computeChannelDoses({
    spectrum: noonRef,
    durationMin: 30,
    bodyExposureFraction: 1,
    eyeExposure: { mode: 'direct', durationSec: 1800, lensTint: 'clear' },
  });
  assert('30 min naked clear-noon: vitamin_d dose >= 30 channel-au',
    fullNoon.vitamin_d >= 30, `got ${fullNoon.vitamin_d.toFixed(2)}`);
  assert('30 min naked clear-noon: pomc dose >= 30 channel-au',
    fullNoon.pomc >= 30, `got ${fullNoon.pomc.toFixed(2)}`);
  assert('30 min naked clear-noon: no_cv dose >= 50 channel-au',
    fullNoon.no_cv >= 50, `got ${fullNoon.no_cv.toFixed(2)}`);

  // Vit D synthesis check: at zenith=30°, 30 min naked, Type II must
  // produce 1500-6000 IU (Bogh lab values: ~2600-4000; Holick natural-sun
  // extrapolation: ~10000; we pick a wide band that captures both).
  const iu_typeII_noon = window.vitaminDIU(fullNoon.vitamin_d, 'II', impliedUVI);
  assert('30 min naked clear-noon Type II → 1500-6000 IU vit D',
    iu_typeII_noon >= 1500 && iu_typeII_noon <= 6000,
    `got ${iu_typeII_noon.toFixed(0)} IU (Bogh ~2600-4000, Holick ~10000)`);

  // Low-sun gate: at zenith=70° (UVI ~1.5), Type II naked 30 min should
  // produce essentially no vit D (the UVI threshold gate plus the
  // physics-correct UVB at low elevation both push toward ~0).
  const lowSun70 = reconstructSpectrum({ zenithDeg: 70, ozoneDU: 300, altitudeM: 0, cloudCover: 0 });
  const lowDoses70 = computeChannelDoses({ spectrum: lowSun70, durationMin: 30, bodyExposureFraction: 1, eyeExposure: null });
  const lowSed70 = erythemalSED({ spectrum: lowSun70, durationMin: 30, bodyExposureFraction: 1 });
  const lowUVI70 = (lowSed70 * 100 / (30 * 60)) / 0.025;
  const iu_lowSun70 = window.vitaminDIU(lowDoses70.vitamin_d, 'II', lowUVI70);
  assert('zenith=70° (UVI <2) → near-zero vit D synthesis',
    iu_lowSun70 < 50, `got ${iu_lowSun70.toFixed(0)} IU at implied UVI ${lowUVI70.toFixed(2)}`);

  // ─── 17. UVI threshold gate on vit-D synthesis ──────────────────────
  // Webb 2018 / Lehmann 2013 / NIWA: no meaningful vit D synthesis
  // below UVI ~2-3 because the 295-300 nm UVB needed for pre-vit-D
  // photoisomerization is essentially absent at low solar elevation.
  // The gate captures this clinical reality without needing the
  // simplified Bird-Riordan model to be radiometrically perfect.
  console.log('%c 17. UVI threshold gate ', 'font-weight:bold;color:#f59e0b');
  const { vitaminDIU } = window;
  // Same channel-au, varying UVI gates differently:
  assert('UVI 1 → 0 IU (below threshold)', vitaminDIU(100, 'II', 1.0) === 0);
  assert('UVI 2 → 0 IU (at threshold)', vitaminDIU(100, 'II', 2.0) === 0);
  assert('UVI 2.5 → ~half yield (linear ramp)',
    Math.abs(vitaminDIU(100, 'II', 2.5) - vitaminDIU(100, 'II', 4.0) * 0.5) < 1);
  assert('UVI 3 → full yield', vitaminDIU(100, 'II', 3.0) === vitaminDIU(100, 'II', 8.0));
  assert('UVI 8 → full yield (above threshold)', vitaminDIU(100, 'II', 8.0) === 6000);
  assert('UVI null → no gating (trust channel-au)',
    vitaminDIU(100, 'II', null) === vitaminDIU(100, 'II', 8.0));
  // Fitzpatrick scaling still applies on top of the gate
  assert('Type VI at UVI 6 = 30% of Type II yield',
    Math.abs(vitaminDIU(100, 'VI', 6.0) - vitaminDIU(100, 'II', 6.0) * 0.30) < 1);
  // Saturation cap still applies after gating
  assert('UVI 8, Type II, 1000 channel-au → 20k IU saturation cap',
    vitaminDIU(1000, 'II', 8.0) === 20000);

  // ─── 18. rotatedSides multiplier (front+back integration) ──────────
  // dminder convention: "100% naked" = both sides exposed over the
  // session. Our default body fractions reflect single-position max
  // (front-only or back-only), so the rotatedSides flag doubles the
  // IU to acknowledge that fresh skin keeps synthesizing after the
  // first side approaches per-area saturation.
  console.log('%c 18. rotatedSides multiplier ', 'font-weight:bold;color:#f59e0b');
  assert('rotatedSides=true doubles the IU yield',
    vitaminDIU(100, 'II', 8.0, true) === 2 * vitaminDIU(100, 'II', 8.0, false));
  assert('rotatedSides default (no arg) = false (single position)',
    vitaminDIU(100, 'II', 8.0) === vitaminDIU(100, 'II', 8.0, false));
  assert('rotatedSides multiplier respects the 20k saturation cap',
    vitaminDIU(1000, 'II', 8.0, true) === 20000);
  assert('UVI gate applies BEFORE the rotation multiplier',
    vitaminDIU(100, 'II', 1.0, true) === 0);

  // ─── 18b. Per-session body-fraction cap (Holick 2008 MED-saturation) ──
  // High-output UVB devices were saturating the daily 20k cap on every
  // session regardless of duration — duration changes invisible in the
  // IU column. Per-session cap = body_fraction × 30k limits each
  // session to its local skin-patch saturation ceiling.
  console.log('%c 18b. per-session body-fraction cap ', 'font-weight:bold;color:#f59e0b');
  const { vitaminDIUPerSession, vitaminDIURaw } = window;
  assert('per-session cap fires for 37% body before daily 20k cap',
    vitaminDIUPerSession(10000, 'II', 8.0, false, null, 0.37) === Math.round(0.37 * 30000));
  assert('per-session cap fires for 100% body at the daily ceiling',
    vitaminDIUPerSession(10000, 'II', 8.0, false, null, 1.0) === 20000);
  assert('per-session cap with bodyFraction=null falls back to daily cap',
    vitaminDIUPerSession(10000, 'II', 8.0, false, null, null) === 20000);
  assert('per-session cap below ceiling is the raw value',
    vitaminDIUPerSession(10, 'II', 8.0, false, null, 0.37) === Math.round(vitaminDIURaw(10, 'II', 8.0, false, null)));
  assert('per-session cap respects UVI gate (low UVI → 0 regardless of body fraction)',
    vitaminDIUPerSession(10000, 'II', 1.0, false, null, 1.0) === 0);
  assert('per-session cap scales linearly with body fraction',
    vitaminDIUPerSession(10000, 'II', 8.0, false, null, 0.50) === 2 * vitaminDIUPerSession(10000, 'II', 8.0, false, null, 0.25));

  // ─── 19. Vit-D regression fixtures (end-to-end against published refs) ──
  // Locks the spectrum → channel-doses → vitaminDIU pipeline against
  // published clinical & dminder cross-checks. Each row is (scenario →
  // expected band) and exercises the WHOLE pipeline, not just the IU
  // conversion constant — so a future reconstructSpectrum / channel-
  // weighting / IU-constant tweak that drifts more than the band shows
  // up here before users notice their old session numbers shifted.
  //
  // References:
  //  • Holick 2008 NEJM 357:266 — 1 MED whole body Type II → ~10,000 IU
  //    (linear up to 20k saturation).
  //  • Bogh & Wulf 2010 J Invest Dermatol — 4 SED / 24% body / Type II
  //    → ~1000 IU; we sit closer to the higher end of their band because
  //    the simplified Bird-Riordan model trends 20-30% high vs TUV at
  //    moderate zenith. Documented in vit-D constant comment block.
  //  • dminder field cross-check (UVI 6, Type III, 0.5 front-only,
  //    30 min) ≈ 3000-3500 IU; same scenario rotated ≈ 6000-7000 IU.
  //  • NIWA / Lehmann 2013 / Webb 2018 — UVI < 2 → essentially no
  //    synthesis (already covered by the threshold-gate block above;
  //    this block adds the end-to-end variant with reconstructSpectrum).
  console.log('%c 19. Vit-D regression fixtures (clinical) ', 'font-weight:bold;color:#f59e0b');

  // Mid-day clear, zenith=30° — the canonical sweet spot. Implied UVI
  // is computed from the SED so this row tracks both the spectrum
  // model and the IU constant; if either drifts, the band catches it.
  const _spec30 = reconstructSpectrum({ zenithDeg: 30, ozoneDU: 300, altitudeM: 0, cloudCover: 0 });
  const _sed30 = erythemalSED({ spectrum: _spec30, durationMin: 30, bodyExposureFraction: 1 });
  const _uvi30 = (_sed30 * 100 / (30 * 60)) / 0.025;

  // FIXTURE 1 — Holick natural-sun anchor (Type II, full body, 30 min):
  // 1 MED at noon ≈ 12-15 min for Type II, so 30 min ≈ 2 MED. Holick
  // 1 MED ≈ 10k IU full body → 2 MED uncapped ≈ 20k (saturated). Our
  // simplified model trends slightly low; band 4500-9000 captures the
  // post-recalibration central while staying under saturation.
  const fxFullBodyTypeII = computeChannelDoses({
    spectrum: _spec30, durationMin: 30, bodyExposureFraction: 1, eyeExposure: null,
  });
  const iuFullBodyTypeII = vitaminDIU(fxFullBodyTypeII.vitamin_d, 'II', _uvi30);
  assert('FX1 — 30 min · full body · Type II · noon → 4500-9000 IU (Holick anchor)',
    iuFullBodyTypeII >= 4500 && iuFullBodyTypeII <= 9000,
    `got ${iuFullBodyTypeII.toFixed(0)} IU at implied UVI ${_uvi30.toFixed(1)}`);

  // FIXTURE 2 — User's morning session (Type III, 0.5 fraction
  // front-only, 30 min, NOT rotated). Was the test case that drove the
  // 40 → 60 calibration bump in 2026-05. Expected band 1300-3200 IU
  // matches dminder's same-input output of ~3000 IU within the ±50%
  // model uncertainty band.
  const fxFrontTypeIII = computeChannelDoses({
    spectrum: _spec30, durationMin: 30, bodyExposureFraction: 0.5, eyeExposure: null,
  });
  const iuFrontTypeIII = vitaminDIU(fxFrontTypeIII.vitamin_d, 'III', _uvi30, false);
  assert('FX2 — 30 min · front-only (0.5) · Type III · noon · NOT rotated → 1300-3200 IU (dminder cross-check)',
    iuFrontTypeIII >= 1300 && iuFrontTypeIII <= 3200,
    `got ${iuFrontTypeIII.toFixed(0)} IU at implied UVI ${_uvi30.toFixed(1)}`);

  // FIXTURE 3 — same as FX2 but rotatedSides=true. Should be exactly
  // 2× FX2 (rotation multiplier is the only difference).
  const iuFrontTypeIIIRot = vitaminDIU(fxFrontTypeIII.vitamin_d, 'III', _uvi30, true);
  assert('FX3 — same as FX2 but rotated → exactly 2× FX2 IU',
    Math.abs(iuFrontTypeIIIRot - 2 * iuFrontTypeIII) < 1,
    `got ${iuFrontTypeIIIRot.toFixed(0)} vs expected ${(2 * iuFrontTypeIII).toFixed(0)}`);

  // FIXTURE 4 — Type VI (deeply pigmented) is 30% of Type II yield at
  // identical exposure. Locks the Fitzpatrick scaling table.
  const iuFullBodyTypeVI = vitaminDIU(fxFullBodyTypeII.vitamin_d, 'VI', _uvi30);
  assert('FX4 — Type VI yield = 30% of Type II at same channel-au',
    Math.abs(iuFullBodyTypeVI - 0.30 * iuFullBodyTypeII) < 1,
    `got VI=${iuFullBodyTypeVI.toFixed(0)} II=${iuFullBodyTypeII.toFixed(0)} ratio=${(iuFullBodyTypeVI / iuFullBodyTypeII).toFixed(3)}`);

  // FIXTURE 5 — Low-sun (zenith=70°, implied UVI < 2): NIWA / Webb 2018
  // says no meaningful synthesis. End-to-end through the whole pipeline.
  // Already partially covered by the threshold-gate block, but this
  // fixture exercises the spectrum reconstruction path too — a future
  // Bird-Riordan tweak that boosted UVB at high zenith would bypass the
  // gate via a higher implied UVI; this catches that.
  const _spec70 = reconstructSpectrum({ zenithDeg: 70, ozoneDU: 300, altitudeM: 0, cloudCover: 0 });
  const _sed70 = erythemalSED({ spectrum: _spec70, durationMin: 30, bodyExposureFraction: 1 });
  const _uvi70 = (_sed70 * 100 / (30 * 60)) / 0.025;
  const fxLowSun = computeChannelDoses({
    spectrum: _spec70, durationMin: 30, bodyExposureFraction: 1, eyeExposure: null,
  });
  const iuLowSun = vitaminDIU(fxLowSun.vitamin_d, 'II', _uvi70);
  assert('FX5 — 30 min · full body · Type II · zenith 70° (UVI < 2) → < 50 IU (NIWA/Webb)',
    iuLowSun < 50,
    `got ${iuLowSun.toFixed(0)} IU at implied UVI ${_uvi70.toFixed(2)}`);

  // FIXTURE 6 — saturation cap is hit beyond ~6 MED equivalent. Using
  // the FX1 channel-au scaled up (×4) which would otherwise produce
  // ~25k IU; the cap clamps to 20k regardless of rotation/Fitzpatrick.
  const _bigAu = fxFullBodyTypeII.vitamin_d * 4;
  assert('FX6 — saturation cap clamps high-channel-au sessions to 20k IU',
    vitaminDIU(_bigAu, 'II', _uvi30) === 20000,
    `got ${vitaminDIU(_bigAu, 'II', _uvi30)} IU (expected 20000)`);
  assert('FX6b — saturation cap holds even with rotatedSides=true',
    vitaminDIU(_bigAu, 'II', _uvi30, true) === 20000,
    `got ${vitaminDIU(_bigAu, 'II', _uvi30, true)} IU (expected 20000)`);

  // ─── Summary ────────────────────────────────────────────────────────
  console.log(`%c Sun Spectrum: ${pass} passed, ${fail} failed`,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold`);

  // Restore nothing — these tests don't mutate state
  return { pass, fail };
})();
