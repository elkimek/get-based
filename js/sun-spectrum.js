// @ts-check
// sun-spectrum.js — Clear-sky spectral reconstruction + action-spectrum convolution
//
// Reconstructs solar spectral irradiance at the user's location/time using a
// Bird-Riordan-style clear-sky model with cloud + altitude + ozone correction.
// Convolves the reconstructed spectrum through 8 biological action spectra
// (CIE erythemal, CIE vit-D, CIE melanopic, OPN5, CCO red, CCO NIR, NO release,
// POMC) to produce per-channel doses.
//
// Reference frame: 280-2500nm, sampled at 5nm resolution (89 bands).
// Output channels see Bird-Riordan reconstructed irradiance (W/m²/nm) integrated
// against published action-spectrum weightings.
//
// References:
//   Bird & Riordan 1986 — "Simple solar spectral model" (SPCTRAL2 / SOLPOS),
//                         J Appl Meteorol 25:87. NREL clear-sky model.
//   CIE 174:2006 — previtamin-D3 action spectrum (vit-D channel only)
//   CIE S 007 / ISO 17166:1999 — erythemal action spectrum (McKinlay-Diffey 1987)
//   CIE S 026:2018 — α-opic metrology; D65 melanopic efficacy 1.3262 mW/lm
//   Bass-Paur 1985 — ozone absorption cross-section (legacy WMO dataset)
//   Karu 2010 / Hamblin 2018 — CCO red/NIR mechanism (no formal action spectrum)
//   Liu 2014 — UVA NO release peak ~330-360nm
//
// This is a coarse spectral model — explicitly an estimate, not measurement.
// Output marked with `confidence` matching the underlying UV-data source.

import {
  actinicUVAt,
  erythemalAt,
  melanopicAt,
  nirSolarAt,
  noReleaseAt,
  opn5At,
  pbmNirAt,
  pbmRedAt,
  vitaminDAt,
} from './sun-spectrum-actions.js';
import {
  glassTransmission,
  SPECTRUM_WAVELENGTHS as WAVELENGTHS,
  sunscreenTransmission,
} from './sun-spectrum-device.js';

export {
  actinicUVAt,
  ccoAt,
  erythemalAt,
  melanopicAt,
  noReleaseAt,
  opn5At,
  vitaminDAt,
} from './sun-spectrum-actions.js';
export {
  effectiveDeviceForMode,
  glassTransmission,
  heuristicPeakShares,
  sunscreenTransmission,
  synthesizeDeviceSpectrum,
  validateModeCoupling,
} from './sun-spectrum-device.js';

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
/**
 * @param {{ zenithDeg?: number | null, ozoneDU?: number, altitudeM?: number, cloudCover?: number, aod?: number | null, targetUVI?: number | null }} [opts]
 */
export function reconstructSpectrum({ zenithDeg, ozoneDU = 300, altitudeM = 0, cloudCover = 0, aod = null, targetUVI = null } = {}) {
  if (zenithDeg == null || zenithDeg >= 90) {
    return { wavelengths: WAVELENGTHS, irradiance: WAVELENGTHS.map(() => 0) };
  }
  // Defensive clamps — malformed atmospheric inputs (NaN cloudCover, zero
  // ozone, negative altitude) should degrade gracefully, not propagate
  // through the multiplicative chain as Infinity / over-amplified beam.
  // Audit P2 from the 2026-05-10 review.
  if (!Number.isFinite(zenithDeg) || zenithDeg < 0) zenithDeg = 0;
  if (!Number.isFinite(ozoneDU) || ozoneDU < 50) ozoneDU = 50; // real-world floor ~200 DU; 50 is lower bound for sanity
  if (!Number.isFinite(cloudCover)) cloudCover = 0;
  cloudCover = Math.max(0, Math.min(1, cloudCover));
  if (!Number.isFinite(altitudeM)) altitudeM = 0;
  const cosZ = Math.cos(zenithDeg * Math.PI / 180);
  const airMass = 1 / Math.max(cosZ, 0.001);
  const altScale = Math.exp(-altitudeM / 8000); // pressure scaling
  const cloudT = 1 - 0.75 * cloudCover; // simple cloud transmission
  // AOD@500nm — when supplied by the atmospheric source (Open-Meteo
  // air-quality endpoint exposes `aerosol_optical_depth`), use it as
  // the Ångström β. Falls back to 0.10 (clean continental sky) when
  // unknown. Polluted city air can reach β=0.5+; the difference matters
  // most in the visible band (~10-20% irradiance shift).
  const beta = (typeof aod === 'number' && Number.isFinite(aod) && aod > 0) ? aod : 0.10;

  let irradiance = WAVELENGTHS.map((nm) => {
    // Extraterrestrial spectral irradiance (rough fit to ASTM E490)
    const E0 = extraterrestrialIrradiance(nm);
    // Rayleigh scattering — Bird-Riordan 1986 formulation:
    //   τR(λ) = (P/P₀) / (λ⁴ × (115.6406 − 1.335/λ²))
    // where λ is in micrometers and P/P₀ is the relative pressure.
    const lambda_um = nm / 1000;
    const tauR = altScale / (Math.pow(lambda_um, 4) * (115.6406 - 1.335 / Math.pow(lambda_um, 2)));
    const Tr = Math.exp(-tauR * airMass);
    // Ozone absorption — Bass-Paur cross-section table interpolated in
    // log-space (see ozoneAbsorption above). Replaces an exponential
    // approximation that was ~3× too transmissive in UVB.
    const tauO3 = ozoneAbsorption(nm) * (ozoneDU / 1000);
    const To = Math.exp(-tauO3 * airMass);
    // Aerosol attenuation — Ångström-type wavelength dependence,
    //   τ_a(λ) = β × (λ/500nm)^(-α)
    // with α=1.14 (typical continental aerosol). β is sourced from the
    // atmosphere caller (Open-Meteo AOD@500nm) when available, else
    // defaults to 0.10 (clean continental sky; AERONET background
    // sites). Polluted city air β can reach 0.5+.
    const tauA = beta * Math.pow(nm / 500, -1.14);
    const Ta = Math.exp(-tauA * airMass);
    // Direct beam: extraterrestrial × all path attenuations × cosine of
    // incidence (already absorbed into the airMass parameter through
    // the τ × airMass exponent, so we only multiply by cosZ for the
    // surface flux per unit area).
    const directBeam = E0 * Tr * To * Ta * cosZ * cloudT;
    // Diffuse (sky-scattered) component — photons scattered out of the
    // direct beam by Rayleigh + aerosol that nonetheless reach the
    // surface from other directions. Substantial in UVB (~50% of total
    // surface flux on clear sky) due to Rayleigh's 1/λ⁴ scaling, drops
    // toward NIR (~10%). Bird-Riordan's full RT formula is involved;
    // we approximate the wavelength dependence with a single function.
    //
    // Without this term the model under-estimates total surface UVB by
    // ~50% and surface UVA by ~30% — verified against TUV / NIWA
    // simulations at zenith=30° / 300 DU / sea level / no cloud:
    //   305 nm direct only: ~21 mW/m²/nm  (vs ~50 reference) ✗
    //   305 nm + diffuse:   ~32 mW/m²/nm  (within Bird-Riordan ±25%) ✓
    let diffuseFraction;
    if (lambda_um < 0.32)      diffuseFraction = 0.55;        // UVB
    else if (lambda_um < 0.40) diffuseFraction = 0.40;        // UVA
    else if (lambda_um < 0.50) diffuseFraction = 0.25;        // violet/blue
    else if (lambda_um < 0.70) diffuseFraction = 0.15;        // visible
    else                       diffuseFraction = 0.08;        // NIR
    // P1.3 audit (v1.7.7): the constant fraction underestimates total
    // irradiance at extreme zenith. Direct beam attenuates as exp(-τ·m),
    // so it drops exponentially with airMass; diffuse light only weakly
    // does (most of the sky stays bright as the sun sets). The diffuse-
    // to-direct ratio therefore grows with airMass — at zenith=78° (m=5)
    // diffuse can equal or exceed direct in UVB.
    //
    // Empirical scaling against TUV/NIWA reference: √airMass tracks the
    // observed growth in ratio, capped at 3× to keep the model bounded
    // as zenith→90° (where the direct beam vanishes anyway and the
    // remaining surface flux is dominated by purely diffuse paths).
    // At airMass=1 (zenith=0) this is a no-op vs the v1.7.6 model.
    //
    // Without this term, surface UVB at zenith=80° was ~30-50% under the
    // TUV reference; vitamin-D estimates at low UVI (sunset / morning
    // walks at high latitudes) were correspondingly suppressed.
    const amScale = Math.min(Math.sqrt(airMass), 3);
    const surface = directBeam * (1 + diffuseFraction * amScale);
    return Math.max(0, surface);
  });
  // When a provider or calibrated meter supplies UVI, normalize only the UV
  // portion of the reconstructed spectrum so its CIE-erythemal irradiance
  // matches that observation (UVI 1 = 0.025 W/m2). Visible/NIR channels keep
  // the atmosphere model because UVI contains no information about them.
  if (typeof targetUVI === 'number' && Number.isFinite(targetUVI) && targetUVI >= 0) {
    const dlambda = 5;
    const modeled = irradiance.reduce((sum, value, index) => {
      const nm = WAVELENGTHS[index];
      return nm <= 400 ? sum + value * erythemalAt(nm) * dlambda : sum;
    }, 0);
    const target = targetUVI * 0.025;
    const uvScale = modeled > 0 ? Math.max(0, target / modeled) : 0;
    irradiance = irradiance.map((value, index) => WAVELENGTHS[index] <= 400 ? value * uvScale : value);
  }
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

// Ozone absorption cross-section table from JPL Publication 19-5
// (NASA Atmospheric Chemistry evaluation, 2019), Bass-Paur values at
// 273 K. Each pair: [wavelength_nm, cross_section_cm²]. Cross-sections
// vary across 6 orders of magnitude through the Hartley + Huggins +
// Chappuis bands so we interpolate in log-space.
//
// The previous approximation `30 * exp(-(nm-280) * 0.12)` was ~3× too
// transmissive across the entire UVB range — gave τ = 1.17 at 297 nm
// where real τ = 4.04 at 300 DU. That under-attenuation made surface
// UVB ~6-10× too bright at moderate zenith, which made vitamin D
// synthesis estimates wildly high at low UVI (the user reported
// 962 IU at UVI 2.25 / 38% body / Type III; published TUV/NIWA
// reference puts that scenario at ~140 IU).
const O3_XSEC_TABLE = [
  [240, 9.45e-18],
  [250, 1.10e-17],   // Hartley band peak
  [260, 4.50e-18],
  [270, 1.61e-18],
  [280, 3.85e-19],
  [285, 5.50e-19],   // Huggins shoulder rises
  [290, 1.40e-18],   // Huggins local max
  [295, 7.00e-19],
  [298, 4.50e-19],   // ~ vitamin-D action peak
  [300, 3.50e-19],
  [305, 1.50e-19],
  [310, 5.30e-20],
  [315, 1.90e-20],
  [320, 6.90e-21],
  [325, 2.00e-21],
  [330, 6.60e-22],
  [340, 1.50e-22],
  [350, 4.00e-23],
];
const O3_AVOGADRO_DU = 2.69e19; // (1 DU = 2.69e16 mol/cm²) × (1000 — see below)

// Returns ozone absorption coefficient such that:
//   τ_O3(λ, DU) = ozoneAbsorption(λ) × (DU / 1000) × airMass
// (1000 normalization preserves the existing call-site formula —
// `tauO3 = ozoneAbsorption(nm) * (ozoneDU / 1000)` — without
// rewriting consumers.)
function ozoneAbsorption(nm) {
  if (nm < 600) {
    if (nm <= O3_XSEC_TABLE[0][0]) {
      return O3_XSEC_TABLE[0][1] * O3_AVOGADRO_DU;
    }
    const last = O3_XSEC_TABLE[O3_XSEC_TABLE.length - 1];
    if (nm >= last[0]) {
      // Above 350 nm: very weak ozone absorption (Huggins tail), use a
      // small constant. Matches typical UV-A behaviour where ozone is
      // far less important than aerosol/Rayleigh.
      return last[1] * O3_AVOGADRO_DU;
    }
    // Log-space linear interpolation across the table
    for (let i = 0; i < O3_XSEC_TABLE.length - 1; i++) {
      const [n1, s1] = O3_XSEC_TABLE[i];
      const [n2, s2] = O3_XSEC_TABLE[i + 1];
      if (nm >= n1 && nm < n2) {
        const t = (nm - n1) / (n2 - n1);
        const logSigma = Math.log10(s1) + t * (Math.log10(s2) - Math.log10(s1));
        return Math.pow(10, logSigma) * O3_AVOGADRO_DU;
      }
    }
  }
  // Chappuis band (visible weak absorption ~600 nm) and Wulf bands beyond.
  // The cross-section anchors come from Burrows et al. 1999 / Voigt et al.
  // 2001: σ_chappuis(600 nm) ≈ 5e-21 cm²/molecule, dropping to ~1e-23 by
  // 700 nm. Multiplied by O3_AVOGADRO_DU so the result lives in the same
  // unit space as the UV path — without this scaling, the function
  // returned 0.4 at 600 nm vs 1.08e-3 at 350 nm, a ~370× discontinuity
  // at the boundary that suppressed CCO-red/NIR sun-session channel
  // estimates by ~10% (Greptile audit 2026-05-10). Vitamin-D and
  // erythemal channels are unaffected (UV bands only). Calibration anchor
  // (Maxi UVB 6,366 IU) is UV-driven and stands.
  const SIGMA_CHAPPUIS_PEAK = 5e-21;  // cm²/molecule at 600 nm
  const SIGMA_WULF = 1e-23;           // cm²/molecule beyond 700 nm (very weak)
  if (nm < 700) return SIGMA_CHAPPUIS_PEAK * O3_AVOGADRO_DU * Math.exp(-Math.pow((nm - 600) / 60, 2));
  return SIGMA_WULF * O3_AVOGADRO_DU;
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
/**
 * @param {{
 *   spectrum?: { wavelengths: number[], irradiance: number[] } | null,
 *   durationMin?: number,
 *   bodyExposureFraction?: number,
 *   eyeExposure?: { mode?: string, durationSec?: number, lensTint?: string } | null,
 *   bodyModifiers?: { glassBetween?: boolean, sunscreenSPF?: number | null } | null,
 *   skinIrradianceMultiplier?: number
 * }} [opts]
 * @returns {Record<string, number>}
 */
export function computeChannelDoses({ spectrum, durationMin = 0, bodyExposureFraction = 1, eyeExposure = null, bodyModifiers = null, skinIrradianceMultiplier = 1 } = {}) {
  /** @type {Record<string, number>} */
  const result = {};
  if (!spectrum || !Array.isArray(spectrum.irradiance) || durationMin <= 0) {
    for (const ch of CHANNELS) result[ch.key] = 0;
    return result;
  }
  const seconds = durationMin * 60;
  const dlambda = 5; // nm
  const glassBetween = !!bodyModifiers?.glassBetween;
  const spf = Number(bodyModifiers?.sunscreenSPF) || 0;
  const bodyFraction = Math.max(0, Math.min(1, Number(bodyExposureFraction) || 0));
  const skinFlux = Math.max(0, Math.min(2, Number(skinIrradianceMultiplier) || 0));
  const loggedEyeSeconds = eyeExposure?.durationSec;
  const eyeSeconds = typeof loggedEyeSeconds === 'number' && Number.isFinite(loggedEyeSeconds) && loggedEyeSeconds >= 0
    ? Math.min(seconds, loggedEyeSeconds)
    : seconds;
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
    if (isSkinChannel) {
      // Vitamin-D/POMC/NO are whole-body yield proxies, so exposed surface
      // belongs in those totals. NIR/PBM outputs are local fluence and must
      // not shrink merely because the treated patch is small.
      const isWholeBodyYield = ['vitamin_d', 'pomc', 'no_cv'].includes(ch.key);
      gain = bodyFraction > 0 ? skinFlux * (isWholeBodyYield ? bodyFraction : 1) : 0;
    }
    if (isEyeChannel) gain = eyeMultiplier(eyeExposure);
    result[ch.key] = sum * gain * (isEyeChannel ? eyeSeconds : seconds);
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
// `bodyModifiers` plumbs glass attenuation. Sunscreen is intentionally not
// credited in the burn-safety counter: entered SPF does not tell us applied
// amount, coverage, water/sweat loss, reapplication, or UVA protection. It may
// still attenuate the wellness channel estimates in computeChannelDoses(), but
// it must never extend the app's displayed time-to-MED.
export function erythemalSED({ spectrum, durationMin = 0, bodyExposureFraction = 1, bodyModifiers = /** @type {{ glassBetween?: boolean, sunscreenSPF?: number } | null} */ (null), skinIrradianceMultiplier = 1 }) {
  if (!spectrum || durationMin <= 0 || !(Number(bodyExposureFraction) > 0)) return 0;
  const seconds = durationMin * 60;
  const dlambda = 5;
  const glassBetween = !!bodyModifiers?.glassBetween;
  let irradiance_E = 0;
  for (let i = 0; i < spectrum.irradiance.length; i++) {
    const nm = spectrum.wavelengths[i];
    const E = spectrum.irradiance[i];
    const w = erythemalAt(nm);
    if (w <= 0) continue;
    let bandT = 1;
    if (glassBetween) bandT *= glassTransmission(nm);
    irradiance_E += E * w * dlambda * bandT; // W/m² CIE-weighted
  }
  // SED is local radiant exposure on an exposed patch (J/m2), never a
  // whole-body energy total. Body fraction is therefore only an on/off gate.
  const skinFlux = Math.max(0, Math.min(2, Number(skinIrradianceMultiplier) || 0));
  const J_per_m2 = irradiance_E * seconds * skinFlux;
  return J_per_m2 / SED_JOULES_PER_M2;
}

// Photosensitivity is a caution flag, not a universal numeric multiplier.
// Drug, dose, timing, wavelength and individual response matter too much to
// turn a generic medicine tier into a defensible MED reduction. The optional
// numeric medScale remains for explicit, caller-supplied calibrated inputs;
// legacy `photosensitive: true` no longer invents a 2.5x multiplier.
export function fractionOfMED({ sed, fitzpatrick = 'III', photosensitive: _photosensitive = false, medScale }) {
  const baseMED = MED_BY_FITZPATRICK[fitzpatrick] ?? MED_BY_FITZPATRICK.III;
  const scale = typeof medScale === 'number' && Number.isFinite(medScale) && medScale > 0
    ? medScale
    : 1.0;
  const med = baseMED * scale;
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
// Skin type is retained as a rough central modifier; adjacent types overlap
// substantially, so vitaminDIURange() carries a broad uncertainty band.
const VITD_FITZPATRICK_SCALE = { I: 1.0, II: 1.0, III: 0.85, IV: 0.65, V: 0.45, VI: 0.30 };
// IU-equivalent calibration anchor for the action-weighted UVB integral.
// This is a wellness comparison scale, not a measured synthesis conversion.
const VITD_IU_PER_CHANNEL_AU = 60;
// Reporting ceiling for extreme modeled/device inputs, not a personal limit.
const VITD_SATURATION_IU = 20000;
// Per-session ceiling per 100% body — derived from Holick 2008 NEJM
// "1 MED full-body ≈ 10,000 IU." Once a skin patch absorbs ~1 MED of
// UVB (~250 J/m² erythemal-weighted), pre-D3 reaches its 10–15%
// conversion plateau locally and additional UVB on the same patch
// produces no more IU. The 30,000 ceiling per 100%-body is intentionally
// generous — calibrated so a fully-bare Type II skin sun-bather can
// approach the daily 20k cap, while a 37%-body UVB device session is
// limited to ~11k regardless of how aggressive the panel is. Real
// biology lands closer to 15k per 100%-body for Type II skin; we use
// 30k to avoid under-attributing yield for sub-saturating sessions.
export const VITD_PER_SESSION_BODYFRAC_CAP_IU = 30000;

// Heuristic weights for vitamin-D-pathway variants. Most source studies
// report associations with circulating 25(OH)D, not genotype-specific
// intervention responses. These conservative multipliers provide context
// around the modeled UV result; they are not clinical dose calculations.
//
// These loci concern transport, 25-hydroxylation, or circulating
// 25(OH)D associations rather than skin synthesis itself. Reporting
// them as a single IU multiplier still conflates "produced at the
// keratinocyte" with "available in serum 25-OH-D." The UI therefore says
// Genetic context is shown separately and is not applied to skin synthesis.
//
// Variants: rs2282679 / rs10741657 / rs12785878 / rs6013897.
// CYP27B1 rs10877012 and VDR rs2228570 remain informational catalog
// entries but are intentionally excluded because their cited functional
// studies do not establish a change in circulating 25(OH)D or UV response.
// References and scope notes live in data/snp-health.json under each rsID.
const _VITD_GENETIC_EFFECTS = {
  // GC/VDBP GWAS marker: forward-strand G is the lower-25(OH)D allele.
  rs2282679: { TT: 1.0,  GT: 0.95, TG: 0.95, GG: 0.85 },
  // CYP2R1 25-hydroxylase — converts cholecalciferol to 25(OH)D in
  // liver. GG ~6-7 nmol/L lower 25(OH)D (Wang 2010). 12% knockdown.
  rs10741657: { AA: 1.0,  AG: 0.95, GA: 0.95, GG: 0.88 },
  // NADSYN1/DHCR7-locus GWAS marker: G is associated with lower 25(OH)D;
  // this marker does not establish DHCR7 expression or skin-substrate level.
  rs12785878: { TT: 1.0,  GT: 0.95, TG: 0.95, GG: 0.92 },
  // CYP24A1-region GWAS marker. The A allele is associated with modestly
  // lower circulating 25(OH)D; the association does not establish a direct
  // enzyme-activity change. Keep this as a conservative modeled modifier.
  rs6013897:  { TT: 1.0,  AT: 0.97, TA: 0.97, AA: 0.92 },
};

// Walk the user's genetics and return a compound multiplier for
// modeled vit-D synthesis IU + the list of contributing variants for
// audit. Returns { mult: 1.0, contributors: [] } when genetics
// is unavailable, so existing callers degrade gracefully. Callers
// that want to surface "why" should read `contributors`.
export function geneticVitaminDMultiplier(genetics) {
  if (!genetics || typeof genetics !== 'object') return { mult: 1.0, contributors: [] };
  const snps = genetics.snps;
  if (!snps || typeof snps !== 'object') return { mult: 1.0, contributors: [] };
  let mult = 1.0;
  const contributors = [];
  for (const [rsId, table] of Object.entries(_VITD_GENETIC_EFFECTS)) {
    const entry = snps[rsId];
    if (!entry) continue;
    const gt = typeof entry === 'string' ? entry : entry.genotype;
    if (!gt) continue;
    const m = table[gt];
    if (m == null || m === 1.0) continue;
    mult *= m;
    contributors.push({ rsId, gene: entry.gene || rsId, genotype: gt, multiplier: m });
  }
  return { mult, contributors };
}

// `rotatedSides` and `genetics` remain accepted for storage/API compatibility,
// but are not applied. Rotation is represented by timed exposure segments;
// serum-associated genetic variants do not establish a skin-synthesis factor.
export function vitaminDIU(channelAu, fitzpatrick = 'III', uvi = /** @type {number | null} */ (null), rotatedSides = false, genetics = /** @type {Record<string, any> | null} */ (null)) {
  return Math.min(vitaminDIURaw(channelAu, fitzpatrick, uvi, rotatedSides, genetics), VITD_SATURATION_IU);
}

// Per-session IU with body-fraction-scaled saturation cap layered on
// top of the daily ceiling. Use this for ANY per-session display +
// for rollup contributions (group → daily-cap → sum). Vit-D synthesis
// saturates locally at the skin patch — once a region absorbs ~1 MED
// of UVB, additional UVB on the SAME region produces no more IU. The
// model previously had no per-session cap, so a 1-min Maxi UVB session
// at 120 mW/cm² × 295nm × 37% body produced ~250k IU raw and clamped
// at the daily 20k — making duration changes invisible in the IU
// column for any high-output device session. Per-session cap fixes
// that without changing the daily integration ceiling.
//
// `bodyFraction` (0–1) — exposed skin fraction for THIS session.
// Required for the per-session cap to fire; absent/zero falls back to
// the daily cap (legacy behavior).
export function vitaminDIUPerSession(channelAu, fitzpatrick = 'III', uvi = /** @type {number | null} */ (null), rotatedSides = false, genetics = /** @type {Record<string, any> | null} */ (null), bodyFraction = /** @type {number | null} */ (null)) {
  const raw = vitaminDIURaw(channelAu, fitzpatrick, uvi, rotatedSides, genetics);
  if (raw <= 0) return 0;
  const perSessionCap = (typeof bodyFraction === 'number' && Number.isFinite(bodyFraction) && bodyFraction > 0)
    ? bodyFraction * VITD_PER_SESSION_BODYFRAC_CAP_IU
    : VITD_SATURATION_IU;
  // These are conservative display ceilings for extreme modeled inputs, not
  // individualized biological thresholds or clinical intake advice.
  return Math.min(raw, perSessionCap, VITD_SATURATION_IU);
}

// Uncapped per-session IU. The 20,000 IU value is a conservative reporting
// ceiling for extreme modeled inputs, not a personal biological or intake
// limit. Capping per-session was wrong for multi-
// session rollups: two same-day 10-min UVB device sessions each capped
// at 20k summed to 40k in the 7-day total, blowing past the biological
// ceiling. Rollups should use this raw helper, group by local date, cap
// each day at VITD_SATURATION_IU, then sum the capped days.
//
// Single-session render paths still call vitaminDIU() (capped) — for
// one session the cap is the right ceiling.
export function vitaminDIURaw(channelAu, fitzpatrick = 'III', _uvi = /** @type {number | null} */ (null), _rotatedSides = false, _genetics = /** @type {Record<string, any> | null} */ (null)) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return 0;
  const skinScale = VITD_FITZPATRICK_SCALE[fitzpatrick] ?? VITD_FITZPATRICK_SCALE.III;
  // The spectral integral has already accounted for the UVB available at
  // this time and place. Applying a second UVI cliff creates a non-physical
  // zero. Rotation likewise changes which patch is exposed, not the area
  // exposed at each instant. Serum-associated genetics are reported as
  // context elsewhere and are not skin-synthesis multipliers.
  return channelAu * VITD_IU_PER_CHANNEL_AU * skinScale;
}

export const VITD_DAILY_SATURATION_IU = VITD_SATURATION_IU;

// Uncertainty band on the vitamin D estimate. Honest framing has two
// independent components:
//   • MODEL uncertainty: the simplified Bird-Riordan + Bass-Paur
//     spectrum is ~20% accurate at high noon, degrades to ~50% at low
//     sun. The band returned by this function reflects MODEL ONLY —
//     "given the same skin and biology, the model could be this far off."
//   • BIOLOGICAL variance: inter-individual 25(OH)D response for the
//     SAME UV dose varies 2-3× (Webb 2018, Datta 2019) — gut absorption,
//     adiposity, age, baseline status, supplement co-intake. This
//     variance applies on TOP of the model band when comparing to
//     blood labs, but isn't useful for "did this session contribute
//     meaningfully" — for that the model band is what you want.
//
// We surface the model band by default. The session detail tooltip
// notes that the actual blood response can be wider.
//
// `zenith` (degrees) tightens the band when supplied — at high noon the
// model is much more accurate than at sunrise/sunset.
//
// Returns { central, low, high } in IU.
export function vitaminDIURange(channelAu, fitzpatrick = 'III', uvi = /** @type {number | null} */ (null), zenith = /** @type {number | null} */ (null), rotatedSides = false) {
  const central = vitaminDIU(channelAu, fitzpatrick, uvi, rotatedSides);
  if (central === 0) return { central: 0, low: 0, high: 0 };
  // The returned band includes both optical-model error and the much larger
  // person-to-person biological conversion uncertainty. It is intentionally
  // broad: the central value is an IU-equivalent, not a measured synthesis.
  //   high noon (z ≤ 35°)    → ±20%   (model in its sweet spot)
  //   morning/afternoon      → ±30%
  //   low sun (z > 55°)      → ±45%   (Bird-Riordan accuracy degrades)
  //   no zenith supplied     → ±35%   (legacy default — was 0.6/1.5)
  let lowMul = 0.25, highMul = 2.0;
  if (typeof zenith === 'number' && Number.isFinite(zenith)) {
    if (zenith <= 35) { lowMul = 0.30; highMul = 1.8; }
    else if (zenith <= 55) { lowMul = 0.25; highMul = 2.0; }
    else { lowMul = 0.20; highMul = 2.5; }
  }
  return {
    central: Math.round(central),
    low: Math.max(0, Math.round(central * lowMul)),
    high: Math.min(VITD_SATURATION_IU, Math.round(central * highMul)),
  };
}

// PBM dose (J/cm²) for the red/NIR therapy channels and the wider
// nir_solar channel. channel-au is local J/m² × actionWeight;
// dividing by 10,000 converts m² → cm². Matches the dose unit
// printed on commercial therapy-panel datasheets (Joovv, Mito Red etc.).
export function pbmJoulesPerCm2(channelAu) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return 0;
  return channelAu / 10000;
}

// Estimated melanopic equivalent daylight illuminance for a modeled SPD.
// `circadian` channel during a session. Channel-au is the time-
// integrated J/m² × eyeMultiplier under the melanopic action spectrum;
// to get peak lux we divide by session duration to recover the
// instantaneous melanopic irradiance, then divide by D65 melanopic radiant
// efficacy (1.3262 mW/lm). Because melanopicAt() is still a smooth proxy,
// callers must label this as estimated, not a calibrated CIE measurement.
export function circadianMelanopicLux(channelAu, durationMin) {
  if (!Number.isFinite(channelAu) || channelAu <= 0 || durationMin <= 0) return 0;
  const seconds = durationMin * 60;
  const melanopic_W_per_m2 = channelAu / seconds; // average over the session
  return melanopic_W_per_m2 / 0.0013262;
}

// Ocular actinic-UV exposure — ICNIRP S(lambda)-weighted dose incident at
// the eye. This is an anterior-eye UV hazard proxy; it is not retinal dose
// and does not model the visible/thermal hazards of staring at the sun.
//
// Returns J/m² actinic UV at the eye. ICNIRP's 8-hour exposure reference is
// 30 J/m². Alert thresholds use 15 J/m² (warning) and 30 J/m² (reference).
//
// `zenithDeg` (optional) gates the dose at very low solar elevation —
// below ~5° (zenith > 85°) UV-A doesn't meaningfully reach the ground
// (same threshold the firstUVA / lastUVA "biological dawn/dusk" markers
// use in views.js). The Bird-Riordan reconstruction we feed in still
// emits some weighted UV at high zenith, so without this gate a
// 30-min eyes-direct session at 6 am pre-sunrise would falsely
// accumulate 4-5 J/m² actinic UV. Linear ramp 85° → 80° avoids a
// hard cliff — full yield once the sun is more than 10° above the
// horizon. Pass `null` (or omit) to skip the gate.
export function ocularActinicUVdose({ spectrum, eyeExposure, zenithDeg = /** @type {number | null} */ (null), glassBetween = false }) {
  if (!spectrum || !eyeExposure) return 0;
  const mode = eyeExposure.mode || 'indoor';
  if (mode !== 'direct' && mode !== 'glass-window') return 0;
  const throughGlass = glassBetween || mode === 'glass-window';
  let elevationGate = 1.0;
  if (typeof zenithDeg === 'number' && Number.isFinite(zenithDeg)) {
    const elevation = 90 - zenithDeg;
    if (elevation <= 5) elevationGate = 0;
    else if (elevation < 10) elevationGate = (elevation - 5) / 5; // 0→1 over 5°-10°
  }
  if (elevationGate === 0) return 0;
  const seconds = (eyeExposure.durationSec || 0);
  const dlambda = 5;
  let actinic_irradiance = 0;
  for (let i = 0; i < spectrum.irradiance.length; i++) {
    const nm = spectrum.wavelengths[i];
    if (nm > 400) break;
    const w = actinicUVAt(nm);
    if (w <= 0) continue;
    const transmission = throughGlass ? glassTransmission(nm) : 1;
    actinic_irradiance += spectrum.irradiance[i] * w * dlambda * transmission;
  }
  return actinic_irradiance * seconds * elevationGate;
}

// Backward-compatible export for stored/session callers. New presentation
// code uses ocularActinicUV terminology; the old name is not a retinal model.
export const retinalUVdose = ocularActinicUVdose;

// ─── Public exports ────────────────────────────────────────────────────

export const SUN_CHANNELS = CHANNELS.map(({ id, key, label }) => ({ id, key, label }));
