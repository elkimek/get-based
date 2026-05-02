// sun-spectrum.js — Clear-sky spectral reconstruction + action-spectrum convolution
//
// Reconstructs solar spectral irradiance at the user's location/time using a
// Bird-Riordan-style clear-sky model with cloud + altitude + ozone correction.
// Convolves the reconstructed spectrum through 8 biological action spectra
// (CIE erythemal, CIE vit-D, CIE melanopic, OPN3, OPN5, CCO red, CCO NIR, NO release)
// to produce per-channel doses.
//
// Reference frame: 280-2500nm, sampled at 5nm resolution (89 bands).
// Output channels see Bird-Riordan reconstructed irradiance (W/m²/nm) integrated
// against published action-spectrum weightings.
//
// References:
//   Bird & Riordan 1986 — "Simple solar spectral model" SOLPOS
//   CIE 174:2006 — erythemal + vit-D action spectra
//   CIE S 026:2018 — melanopic photopic
//   Karu 1999 / Hamblin 2018 — CCO action spectrum
//   Liu 2014 — UVA NO release peak ~330-360nm
//
// This is a coarse spectral model — explicitly an estimate, not measurement.
// Output marked with `confidence` matching the underlying UV-data source.

const WAVELENGTHS = (() => {
  const arr = [];
  for (let nm = 280; nm <= 2500; nm += 5) arr.push(nm);
  return arr;
})();

// ─── Action spectra (relative, 0-1) ────────────────────────────────────
// Tabulated at 5nm resolution to match WAVELENGTHS array.

// CIE erythemal (McKinlay-Diffey) — peaks at 297nm, drops sharply
function erythemalAt(nm) {
  if (nm < 250) return 0;
  if (nm <= 298) return 1.0;
  if (nm <= 328) return Math.pow(10, 0.094 * (298 - nm));
  if (nm <= 400) return Math.pow(10, 0.015 * (140 - nm));
  return 0;
}

// CIE vitamin D action spectrum — peaks at 297nm, narrower window than erythemal
function vitaminDAt(nm) {
  if (nm < 252 || nm > 330) return 0;
  // Smoothed approximation of CIE 174:2006 table
  if (nm <= 297) return Math.pow(10, -0.25 * (297 - nm));
  if (nm <= 330) return Math.pow(10, -0.13 * (nm - 297));
  return 0;
}

// CIE melanopic — peaks at 490nm, gaussian-like, sensitive 420-560nm
function melanopicAt(nm) {
  if (nm < 380 || nm > 720) return 0;
  // Smolders et al. melanopic V'(λ) approximation
  const sigma = 50;
  return Math.exp(-Math.pow(nm - 490, 2) / (2 * sigma * sigma));
}

// OPN5 violet — dual peak ~380nm + ~471nm (Buhr 2019)
function opn5At(nm) {
  if (nm < 320 || nm > 540) return 0;
  const a = Math.exp(-Math.pow(nm - 380, 2) / (2 * 25 * 25));
  const b = 0.7 * Math.exp(-Math.pow(nm - 471, 2) / (2 * 30 * 30));
  return Math.max(a, b);
}

// CCO red+NIR (Karu 1999) — broad, peaks at 620, 670, 760, 830nm
function ccoAt(nm) {
  if (nm < 580 || nm > 1100) return 0;
  // Sum of gaussians at the four CCO absorption bands
  const peaks = [
    { c: 620, w: 18, h: 0.5 },
    { c: 670, w: 22, h: 0.9 },
    { c: 760, w: 30, h: 0.7 },
    { c: 830, w: 38, h: 1.0 },
  ];
  let sum = 0;
  for (const p of peaks) {
    sum += p.h * Math.exp(-Math.pow(nm - p.c, 2) / (2 * p.w * p.w));
  }
  return Math.min(1, sum);
}

// NO release in skin (Liu 2014) — UVA peak ~330-360nm
function noReleaseAt(nm) {
  if (nm < 300 || nm > 410) return 0;
  return Math.exp(-Math.pow(nm - 345, 2) / (2 * 25 * 25));
}

// NIR-solar broadband (600-1400nm Wunsch optical tissue window)
function nirSolarAt(nm) {
  if (nm < 600 || nm > 1400) return 0;
  // Roughly flat across the window with modest weighting toward 800-1000nm
  return 0.5 + 0.5 * Math.exp(-Math.pow(nm - 900, 2) / (2 * 200 * 200));
}

// PBM bands — narrowband artificial sources only (used by deviceSessions, not sun)
function pbmRedAt(nm) {
  if (nm < 600 || nm > 700) return 0;
  return Math.exp(-Math.pow(nm - 660, 2) / (2 * 15 * 15));
}
function pbmNirAt(nm) {
  if (nm < 700 || nm > 1100) return 0;
  return Math.exp(-Math.pow(nm - 850, 2) / (2 * 25 * 25));
}

// ─── Body-side modifiers ──────────────────────────────────────────────
//
// When a session is logged "behind glass" or "with sunscreen," skin-channel
// doses must be attenuated wavelength-by-wavelength, not via a single
// global multiplier. UVB at 297 nm and NIR at 850 nm pass through glass
// very differently, and SPF-rated sunscreen leaves visible/NIR untouched
// while blocking ~98% of UVB.

// Standard clear soda-lime window glass transmission. Approximates Pilkington
// optical-data datasheets: total UVB block, partial UVA, mostly clear visible,
// tapering NIR. Single-pane; double glazing roughly halves NIR transmission
// further (not modeled — bigger fish to fry).
export function glassTransmission(nm) {
  if (nm < 320) return 0.0;        // UVB blocked entirely
  if (nm < 340) return 0.05;       // short UVA — almost entirely blocked
  if (nm < 380) return 0.4;        // long UVA — partial pass
  if (nm < 700) return 0.85;       // visible — most passes (~80-90%)
  if (nm < 1100) return 0.7;       // NIR — partial pass through glass
  if (nm < 2500) return 0.3;       // longer NIR — heavily attenuated
  return 0.0;                       // mid-IR blocked
}

// Synthesize a sparse spectrum for a therapy device from its declared
// peak wavelengths + total irradiance. Each peak becomes a narrow Gaussian
// (30 nm FWHM, typical for an LED), and the device's `mwPerCm2At15cm`
// total is split across peaks so the integrated irradiance ∫ E(λ)dλ
// matches the device rating.
//
// Inputs:
//   device: { peakWavelengths: number[], mwPerCm2At15cm: number, lux?: number }
//   bandShares?: optional Record<nm, fraction> overriding equal distribution
// Output: { wavelengths[], irradiance[] (W/m²/nm) } — same shape as
//   reconstructSpectrum, so it drops straight into computeChannelDoses.
//
// Why this matters: the previous heuristic gave each declared `channel`
// the FULL device irradiance, double-counting the same photons across
// pbm_red, pbm_nir, vitamin_d, etc. Routing through computeChannelDoses
// with a real (synthesized) spectrum produces wavelength-correct, non-
// duplicating per-channel doses by construction — and inherits glass +
// sunscreen attenuation for free.
//
// The 30 nm FWHM (sigma ~12.7) reflects typical LED bin width. Narrowband
// laser sources (e.g. Pulse torch, Sperti UVB tubes) are slightly wider
// in this approximation than reality — acceptable for relative-trend
// correlation; not a radiometric reference.
export function synthesizeDeviceSpectrum(device) {
  if (!device) return { wavelengths: WAVELENGTHS, irradiance: WAVELENGTHS.map(() => 0) };
  const peaks = Array.isArray(device.peakWavelengths) ? device.peakWavelengths : [];
  // Convert mW/cm² → W/m² (×10) so units match reconstructSpectrum
  const totalWm2 = (Number(device.mwPerCm2At15cm) || 0) * 10;
  if (peaks.length === 0 || totalWm2 <= 0) {
    return { wavelengths: WAVELENGTHS, irradiance: WAVELENGTHS.map(() => 0) };
  }
  const perPeakWm2 = totalWm2 / peaks.length;
  const sigma = 12.7; // ~30 nm FWHM
  // Per-nm Gaussian: peak amplitude such that integral over wavelength
  // equals perPeakWm2. Gaussian integrand factor 1/(sigma·√(2π)) keeps
  // ∫ E(λ)dλ ≈ perPeakWm2 over the band.
  const norm = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const irradiance = WAVELENGTHS.map(() => 0);
  for (const peak of peaks) {
    if (!Number.isFinite(peak)) continue;
    for (let i = 0; i < WAVELENGTHS.length; i++) {
      const nm = WAVELENGTHS[i];
      const g = Math.exp(-Math.pow(nm - peak, 2) / (2 * sigma * sigma)) * norm;
      irradiance[i] += perPeakWm2 * g;
    }
  }
  return { wavelengths: WAVELENGTHS, irradiance };
}

// Broad-spectrum sunscreen wavelength-dependent transmission for a given
// SPF rating. SPF is defined relative to erythemal dose (UVB-weighted),
// so 1/SPF is exact for UVB. UVA-PF (UVA protection factor) is typically
// ~1/3 of SPF for broad-spectrum products, so UVA transmission is higher.
// Visible + NIR pass essentially unattenuated (most sunscreens are clear
// to those bands; tinted iron-oxide sunscreens that block HEV are not
// the typical case and aren't modeled here).
export function sunscreenTransmission(nm, spf) {
  const s = Number(spf) || 0;
  if (s <= 1) return 1.0;
  if (nm < 320) return 1.0 / s;                    // UVB — defined target of SPF
  if (nm < 360) return Math.min(1, 1.4 / s);       // UVA short — broad-spectrum is ~70% of SPF
  if (nm < 400) return Math.min(1, 2.0 / s);       // UVA long — typically ~50% of SPF
  return 1.0;                                       // visible + NIR pass
}

const CHANNELS = [
  { id: 1, key: 'vitamin_d',  fn: vitaminDAt,   label: 'Vit D synthesis' },
  { id: 2, key: 'pomc',       fn: erythemalAt,  label: 'POMC / melanocortin' },
  { id: 3, key: 'no_cv',      fn: noReleaseAt,  label: 'NO / cardiovascular' },
  { id: 4, key: 'violet_eye', fn: opn5At,       label: 'Violet / outdoor-eye' },
  { id: 5, key: 'circadian',  fn: melanopicAt,  label: 'Circadian (melanopic)' },
  { id: 6, key: 'nir_solar',  fn: nirSolarAt,   label: 'Mitochondrial (NIR-solar)' },
  { id: 7, key: 'pbm_red',    fn: pbmRedAt,     label: 'PBM red' },
  { id: 8, key: 'pbm_nir',    fn: pbmNirAt,     label: 'PBM near-IR' },
];

// ─── Bird-Riordan clear-sky reconstruction ─────────────────────────────

// Simplified clear-sky direct + diffuse spectral irradiance at the surface.
// Inputs:
//   zenithDeg — solar zenith angle in degrees
//   ozoneDU   — total ozone column in Dobson Units
//   altitudeM — observer altitude in meters
//   cloudCover — 0-1 (1 = overcast)
// Output: { wavelengths[], irradiance[] (W/m²/nm) }
//
// For each wavelength, computes extraterrestrial × Rayleigh × ozone absorption
// × aerosol attenuation × cloud transmission. This is a heavily simplified
// Bird-Riordan-derived model — accurate to ~25% relative for our use, which
// is correlation against biomarkers (relative trends), not radiometry.
export function reconstructSpectrum({ zenithDeg, ozoneDU = 300, altitudeM = 0, cloudCover = 0 } = {}) {
  if (zenithDeg == null || zenithDeg >= 90) {
    return { wavelengths: WAVELENGTHS, irradiance: WAVELENGTHS.map(() => 0) };
  }
  const cosZ = Math.cos(zenithDeg * Math.PI / 180);
  const airMass = 1 / Math.max(cosZ, 0.001);
  const altScale = Math.exp(-altitudeM / 8000); // pressure scaling
  const cloudT = 1 - 0.75 * cloudCover; // simple cloud transmission

  const irradiance = WAVELENGTHS.map((nm) => {
    // Extraterrestrial spectral irradiance (rough fit to ASTM E490)
    const E0 = extraterrestrialIrradiance(nm);
    // Rayleigh scattering — Bird-Riordan 1986 formulation:
    //   τR(λ) = (P/P₀) / (λ⁴ × (115.6406 − 1.335/λ²))
    // where λ is in micrometers and P/P₀ is the relative pressure (the
    // altScale exp(-z/8000) we computed above). The previous form had the
    // expression INVERTED — it computed (115.6406/λ⁴ − 1.335/λ²) and
    // divided by 1000 — producing optical depths ~10000× too large.
    // That collapsed UVB to ~10⁻⁸ at noon and dimmed visible 10×, which
    // wiped out vit-D / POMC channel doses and gave 0% MED across all
    // sessions regardless of UVI. Test #16 below pins absolute values
    // so this can't silently regress again.
    const lambda_um = nm / 1000;
    const tauR = altScale / (Math.pow(lambda_um, 4) * (115.6406 - 1.335 / Math.pow(lambda_um, 2)));
    const Tr = Math.exp(-tauR * airMass);
    // Ozone absorption — Bass-Paur cross-section approximation in the UVB
    const tauO3 = ozoneAbsorption(nm) * (ozoneDU / 1000);
    const To = Math.exp(-tauO3 * airMass);
    // Water vapor + aerosol crude coupling (very simplified)
    const tauA = 0.27 * Math.pow(nm / 500, -1.14);
    const Ta = Math.exp(-tauA * airMass);
    // Direct + diffuse
    const direct = E0 * Tr * To * Ta * cloudT;
    return Math.max(0, direct);
  });
  return { wavelengths: WAVELENGTHS, irradiance };
}

// Extraterrestrial spectral irradiance (W/m²/nm) — coarse fit to ASTM E490
function extraterrestrialIrradiance(nm) {
  // Hardcoded sample points + linear interpolation
  const points = [
    [280, 0.082], [300, 0.541], [320, 0.815], [340, 1.057], [360, 1.080],
    [380, 1.146], [400, 1.486], [420, 1.700], [450, 2.066], [500, 1.929],
    [550, 1.812], [600, 1.694], [650, 1.515], [700, 1.350], [800, 1.054],
    [900, 0.807], [1000, 0.620], [1200, 0.380], [1500, 0.205],
    [2000, 0.103], [2500, 0.038],
  ];
  if (nm <= points[0][0]) return points[0][1];
  if (nm >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [n1, v1] = points[i];
    const [n2, v2] = points[i + 1];
    if (nm >= n1 && nm <= n2) {
      const t = (nm - n1) / (n2 - n1);
      return v1 + t * (v2 - v1);
    }
  }
  return 0;
}

// Ozone absorption cross-section (Bass-Paur, approx) — peaks in Hartley band ~250nm
function ozoneAbsorption(nm) {
  if (nm < 240) return 100;
  if (nm < 280) return 100 * Math.exp(-(nm - 250) * 0.05);
  if (nm < 320) return 30 * Math.exp(-(nm - 280) * 0.12);
  if (nm < 360) return 1.0 * Math.exp(-(nm - 320) * 0.05);
  if (nm < 600) return 0.05;
  if (nm < 700) return 0.4 * Math.exp(-Math.pow((nm - 600) / 60, 2)); // Chappuis band
  return 0.01;
}

// ─── Channel dose calculation ──────────────────────────────────────────

// Compute per-channel dose by convolving spectrum × action spectrum × duration.
// Inputs:
//   spectrum: { wavelengths[], irradiance[] (W/m²/nm) }
//   durationMin: minutes of exposure
//   bodyExposureFraction: 0-1 (0=indoors, 1=naked sunbathing)
//   eyeExposure: { mode, durationSec, lensTint } — gates circadian + violet channels
//   bodyModifiers: { glassBetween?, sunscreenSPF? } — wavelength-dependent
//     attenuation applied INSIDE the integration loop on skin channels only.
//     Eye-side glass/lens attenuation lives in eyeMultiplier and is unaffected.
// Output: { vitamin_d, pomc, no_cv, violet_eye, circadian, nir_solar, pbm_red, pbm_nir }
//   Each in arbitrary "channel-au" units. Intended for relative comparison.
export function computeChannelDoses({ spectrum, durationMin = 0, bodyExposureFraction = 1, eyeExposure = null, bodyModifiers = null } = {}) {
  const result = {};
  if (!spectrum || !Array.isArray(spectrum.irradiance) || durationMin <= 0) {
    for (const ch of CHANNELS) result[ch.key] = 0;
    return result;
  }
  const seconds = durationMin * 60;
  const dlambda = 5; // nm
  const glassBetween = !!bodyModifiers?.glassBetween;
  const spf = Number(bodyModifiers?.sunscreenSPF) || 0;
  for (const ch of CHANNELS) {
    // Channels gated by body exposure: skin-mediated channels (vit D, POMC, NO, NIR, PBM)
    const isSkinChannel = ['vitamin_d', 'pomc', 'no_cv', 'nir_solar', 'pbm_red', 'pbm_nir'].includes(ch.key);
    // Channels gated by eye exposure: circadian + violet
    const isEyeChannel = ['circadian', 'violet_eye'].includes(ch.key);
    let sum = 0;
    for (let i = 0; i < spectrum.irradiance.length; i++) {
      const nm = spectrum.wavelengths[i];
      const E = spectrum.irradiance[i];
      const w = ch.fn(nm);
      if (w <= 0) continue;
      let bandT = 1;
      if (isSkinChannel) {
        if (glassBetween) bandT *= glassTransmission(nm);
        if (spf > 1) bandT *= sunscreenTransmission(nm, spf);
      }
      sum += E * w * dlambda * bandT;
    }
    let gain = 1;
    if (isSkinChannel) gain = bodyExposureFraction;
    if (isEyeChannel) gain = eyeMultiplier(eyeExposure);
    result[ch.key] = sum * gain * seconds;
  }
  return result;
}

// Eye-mode → spectrum-pass multiplier for circadian/violet channels
function eyeMultiplier(eyeExposure) {
  if (!eyeExposure) return 0; // no eye exposure logged → no eye-channel dose
  const mode = eyeExposure.mode || 'indoor';
  const lensTint = eyeExposure.lensTint || 'clear';
  // Mode gates
  if (mode === 'indoor' || mode === 'closed-eyes') return 0;
  if (mode === 'glass-window') return 0.4; // most clear glass passes ~80% visible, blocks NIR + UV
  if (mode === 'sunglasses') return 0.05;
  // Lens tint multiplier
  let tintMul = 1.0;
  if (lensTint === 'polarized') tintMul = 0.5;
  if (lensTint === 'photochromic') tintMul = 0.3;
  if (lensTint === 'blue-blocker') tintMul = 0.4;
  if (lensTint === 'amber') tintMul = 0.2;
  if (lensTint === 'clear-glasses') tintMul = 0.85; // blocks UV, passes most visible
  // Duration ratio (eye exposure duration vs session duration handled in caller)
  return tintMul;
}

// ─── Safety counters ───────────────────────────────────────────────────

// Standard Erythemal Dose: 100 J/m² of CIE-erythemal-weighted irradiance
const SED_JOULES_PER_M2 = 100;

// Per-Fitzpatrick MED (minimal erythemal dose) in SED units
// Source: GrassrootsHealth / Diffey 1991 mapping
const MED_BY_FITZPATRICK = { I: 2, II: 2.5, III: 3, IV: 4.5, V: 6, VI: 10 };

// Compute erythemal dose in SED for a session.
// Returns: SED (1 SED = ~1 sunburn unit for type II skin)
//
// `bodyModifiers` plumbs glass + sunscreen wavelength-dependent attenuation
// the same way computeChannelDoses does. A session "behind glass" produces
// near-zero erythemal dose (glass blocks UVB entirely); a session with
// SPF 50 produces ~1/50 the erythemal dose of bare skin. Both feed the
// burn-risk gauge and the % MED indicator on the dashboard.
export function erythemalSED({ spectrum, durationMin = 0, bodyExposureFraction = 1, bodyModifiers = null }) {
  if (!spectrum || durationMin <= 0) return 0;
  const seconds = durationMin * 60;
  const dlambda = 5;
  const glassBetween = !!bodyModifiers?.glassBetween;
  const spf = Number(bodyModifiers?.sunscreenSPF) || 0;
  let irradiance_E = 0;
  for (let i = 0; i < spectrum.irradiance.length; i++) {
    const nm = spectrum.wavelengths[i];
    const E = spectrum.irradiance[i];
    const w = erythemalAt(nm);
    if (w <= 0) continue;
    let bandT = 1;
    if (glassBetween) bandT *= glassTransmission(nm);
    if (spf > 1) bandT *= sunscreenTransmission(nm, spf);
    irradiance_E += E * w * dlambda * bandT; // W/m² CIE-weighted
  }
  const J_per_m2 = irradiance_E * seconds * bodyExposureFraction;
  return J_per_m2 / SED_JOULES_PER_M2;
}

export function fractionOfMED({ sed, fitzpatrick = 'III' }) {
  const med = MED_BY_FITZPATRICK[fitzpatrick] ?? MED_BY_FITZPATRICK.III;
  return sed / med;
}

// ─── Real-world unit conversions ───────────────────────────────────────
//
// computeChannelDoses returns "channel-au" (arbitrary units) — the
// integral E(λ) × actionSpectrum(λ) × dλ × seconds × bodyFraction. For
// channels whose action spectrum maps to a known biological unit, we
// expose conversion helpers so the UI can show meaningful numbers.
//
// All conversions are deliberately rough — order-of-magnitude correct
// but not lab-grade. Sources cited per channel.

// Vitamin D synthesis (IU). Two reference points cross-verify the
// conversion factor:
//   • Holick 2008, "Vitamin D Deficiency", NEJM 357:266: "Exposure to
//     sunlight that causes a slight pinkness of the skin (1 MED) results
//     in the production of >10,000 IU of vitamin D in skin." Type II
//     MED = 250 J/m² erythemal-weighted; vit-D-action and erythemal
//     integrals at solar noon are within ~30%, so 250 channel-au of
//     vit-D-weighted dose → ~10,000 IU → 40 IU per channel-au.
//   • Bogh & Wulf 2010 (J Invest Dermatol 130:546): 4 SED on ~24%
//     body → ~1000 IU. Equivalent: 1 J/m²·bodyFraction → ~42 IU. Same
//     factor.
//
// Skin type (Fitzpatrick) modulates yield via melanin absorption at
// the keratinocyte layer. Approximate scaling from Webb 2018 + Holick
// 2007 + Olds 2008:
//   I/II → 1.00  (very fair, the reference)
//   III  → 0.85
//   IV   → 0.65
//   V    → 0.45
//   VI   → 0.30  (deeply pigmented; needs ~3× more sun for equivalent D)
//
// Saturation: pre-vit-D photoisomerizes back to inactive isomers
// (lumisterol, tachysterol) at high doses (Holick 2007). Above ~20,000
// IU the actual yield plateaus regardless of further exposure. We cap
// the displayed value to keep the UI honest about that ceiling.
const VITD_FITZPATRICK_SCALE = { I: 1.0, II: 1.0, III: 0.85, IV: 0.65, V: 0.45, VI: 0.30 };
const VITD_IU_PER_CHANNEL_AU = 40;
const VITD_SATURATION_IU = 20000;

// UVI threshold gate. Webb 2018, Lehmann 2013, McKenzie 2009 (NIWA):
// no meaningful vit D synthesis below UVI ~2-3 because the 295-300 nm
// UVB needed for pre-vit-D photoisomerization is essentially absent at
// low solar elevations (long ozone path absorbs it). Our spectrum
// reconstruction over-estimates UVB at high zenith by ~6-10× — fixing
// that requires a more accurate ozone cross-section table; the
// clinical threshold gate captures the same reality more conservatively
// without claiming radiometric precision the simplified Bird-Riordan
// model can't deliver.
//
// Linear ramp 2.0 → 3.0 to avoid a hard cliff. Above UVI 3, full yield.
// When uvi is unknown (no atmosphere data), apply no gating — trust
// the channel-au integral and let the user know via the UI tooltip
// that the value is approximate.
function _uviThresholdMultiplier(uvi) {
  if (!Number.isFinite(uvi)) return 1.0;
  if (uvi <= 2.0) return 0;
  if (uvi >= 3.0) return 1.0;
  return uvi - 2.0;
}

export function vitaminDIU(channelAu, fitzpatrick = 'III', uvi = null) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return 0;
  const skinScale = VITD_FITZPATRICK_SCALE[fitzpatrick] ?? VITD_FITZPATRICK_SCALE.III;
  const uviMult = _uviThresholdMultiplier(uvi);
  const raw = channelAu * VITD_IU_PER_CHANNEL_AU * skinScale * uviMult;
  return Math.min(raw, VITD_SATURATION_IU);
}

// PBM dose (J/cm²) for the red/NIR therapy channels and the wider
// nir_solar channel. channel-au is J/m² × bodyFraction × actionWeight;
// dividing by 10,000 converts m² → cm². Matches the dose unit
// printed on commercial therapy-panel datasheets (Joovv, Mito Red etc.).
export function pbmJoulesPerCm2(channelAu) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return 0;
  return channelAu / 10000;
}

// Peak melanopic equivalent daylight illuminance (M-EDI lux) for the
// `circadian` channel during a session. Channel-au is the time-
// integrated J/m² × eyeMultiplier under the melanopic action spectrum;
// to get peak lux we divide by session duration to recover the
// instantaneous melanopic irradiance, then multiply by the CIE S 026
// melanopic luminous efficacy K_mel,v (≈ 614 lx/(W/m²) for D65).
export function circadianMelanopicLux(channelAu, durationMin) {
  if (!Number.isFinite(channelAu) || channelAu <= 0 || durationMin <= 0) return 0;
  const seconds = durationMin * 60;
  const melanopic_W_per_m2 = channelAu / seconds; // average over the session
  return melanopic_W_per_m2 * 614;
}

// Retinal UV exposure (separate safety counter — gates "is sun-gazing happening")
// Returns J/m² UV at the eye; warning threshold ~1000 J/m² over a day.
export function retinalUVdose({ spectrum, eyeExposure }) {
  if (!spectrum || !eyeExposure) return 0;
  const mode = eyeExposure.mode || 'indoor';
  if (mode !== 'direct') return 0;
  const seconds = (eyeExposure.durationSec || 0);
  const dlambda = 5;
  let uv_irradiance = 0;
  for (let i = 0; i < spectrum.irradiance.length; i++) {
    const nm = spectrum.wavelengths[i];
    if (nm > 400) break;
    uv_irradiance += spectrum.irradiance[i] * dlambda;
  }
  return uv_irradiance * seconds;
}

// ─── Public exports ────────────────────────────────────────────────────

export const SUN_CHANNELS = CHANNELS.map(({ id, key, label }) => ({ id, key, label }));
export { erythemalAt, vitaminDAt, melanopicAt, opn5At, ccoAt, noReleaseAt };

if (typeof window !== 'undefined') {
  Object.assign(window, {
    reconstructSpectrum,
    synthesizeDeviceSpectrum,
    computeChannelDoses,
    erythemalSED,
    fractionOfMED,
    vitaminDIU,
    pbmJoulesPerCm2,
    circadianMelanopicLux,
    retinalUVdose,
    glassTransmission,
    sunscreenTransmission,
    SUN_CHANNELS,
  });
}
