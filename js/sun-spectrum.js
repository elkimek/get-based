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
//   CIE S 026:2018 — α-opic action spectra incl. melanopic; K_mel,v ≈ 614 lx/(W/m²)
//   Bass-Paur 1985 — ozone absorption cross-section (legacy WMO dataset)
//   Karu 2010 / Hamblin 2018 — CCO red/NIR mechanism (no formal action spectrum)
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

// Erythemal action spectrum — McKinlay-Diffey 1987 (CIE Journal 6:17),
// codified as CIE S 007 / ISO 17166:1999. Peaks at 297nm, drops sharply.
function erythemalAt(nm) {
  if (nm < 250) return 0;
  if (nm <= 298) return 1.0;
  if (nm <= 328) return Math.pow(10, 0.094 * (298 - nm));
  if (nm <= 400) return Math.pow(10, 0.015 * (140 - nm));
  return 0;
}

// CIE 174:2006 previtamin-D3 action spectrum — peaks at 297nm, narrower window than erythemal
function vitaminDAt(nm) {
  if (nm < 252 || nm > 330) return 0;
  // Smoothed approximation of the CIE 174:2006 tabulated action spectrum
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
// Per-band Gaussian sigma for LED/tube emission. Pre-2026-05-08 a single
// 12.7 sigma (~30 nm FWHM) was applied to every peak. That's correct for
// red/NIR LEDs (typical FWHM 25–35 nm) but ~3× too wide for UVB/UVA LEDs
// (typical FWHM 8–12 nm). Wider σ spreads device output away from the
// action-spectrum peak and under-attributes the channel dose — Žofka
// audit 2026-05-08 caught this on a 295nm UVB session that produced
// ~3× less Vit-D IU than back-of-envelope biology predicted.
//
// Bandwidths sourced from typical commercial LED bin widths:
//   UVB 280–320 nm  → ~10 nm FWHM (σ 4.3)
//   UVA 320–410 nm  → ~14 nm FWHM (σ 5.9)
//   Blue/violet 410–500 nm → ~20 nm FWHM (σ 8.5)
//   Red/NIR 500+ nm → ~30 nm FWHM (σ 12.7)
function _peakSigmaForWavelength(nm) {
  if (nm < 320) return 4.3;
  if (nm < 410) return 5.9;
  if (nm < 500) return 8.5;
  return 12.7;
}

// Heuristic peakShares for devices that declare peakWavelengths but no
// explicit peakShares.
//
// Two distinct device classes need different defaults:
//
//   1. PURE UV/UVB device (only UV+blue peaks declared, no red/NIR) —
//      narrowband phototherapy tube or dedicated UV LED. The rated
//      mW/cm² IS the UV output. UV bands carry essentially all the
//      power.
//
//   2. HYBRID panel (UV+blue AND red/NIR peaks declared) — devices like
//      Mitochondriak Maxi UVB, Chroma Trinity. The rated mW/cm² is the
//      FULL-PANEL output across all diodes. UV LEDs are expensive +
//      low-efficiency, so manufacturers fit only a few; UVB is
//      typically <10% of total panel power, the rest is red/NIR.
//      Žofka audit 2026-05-08 round 6 caught this: a 30% UVB share for
//      type='uvb' hybrid panels saturated the per-session cap on every
//      duration, hiding any duration response.
//
// Detection: presence of UV peaks AND red/NIR peaks → hybrid; otherwise
// fall back to type-only classification.
//
// Per-band weights then distribute evenly across peaks present in that
// band (e.g. 4 NIR peaks share the NIR allotment). User-imported devices
// via AI extraction inherit this heuristic automatically — they get
// physics-correct shares from `type` + peak-wavelength layout alone,
// without the AI prompt needing to extract per-band power (which most
// spec sheets don't publish).
// Exported public alias of `_heuristicPeakShares` so that mode-aware
// callers (light-devices.js) can compute the per-peak power split on
// the FULL device first, then renormalize over the firing subset for
// a partial-mode session. Keeping the underscore-prefixed internal
// reference for backward compatibility within this module.
export function heuristicPeakShares(peaks, deviceType) {
  return _heuristicPeakShares(peaks, deviceType);
}

function _heuristicPeakShares(peaks, deviceType) {
  const bandOf = (nm) => {
    if (nm < 320) return 'uvb';
    if (nm < 410) return 'uva';
    if (nm < 500) return 'blue';
    if (nm < 700) return 'red';
    return 'nir';
  };
  const t = String(deviceType || '').toLowerCase();
  const bands = peaks.map(bandOf);
  const hasUv = bands.some(b => b === 'uvb' || b === 'uva');
  const hasRedNir = bands.some(b => b === 'red' || b === 'nir');
  const isHybrid = hasUv && hasRedNir;

  let bandWeights;
  if (isHybrid) {
    // Hybrid panel: UV diodes are the minority of total panel power.
    // Real-world ratios for panels like Mitochondriak Maxi UVB / Chroma
    // Trinity hover around UVB 5% / UVA 5% / blue 5% / red 35% / nir 50%.
    bandWeights = { uvb: 0.05, uva: 0.05, blue: 0.05, red: 0.35, nir: 0.50 };
  } else if (t === 'uvb' || t === 'uva') {
    // Pure UV/UVB device (no red/NIR peaks): rated power is the UV
    // output; UV+blue bands carry essentially all of it.
    bandWeights = { uvb: 0.40, uva: 0.40, blue: 0.20, red: 0.0, nir: 0.0 };
  } else if (t === 'pbm' || t === 'pbm-targeted') {
    bandWeights = { uvb: 0.02, uva: 0.03, blue: 0.05, red: 0.40, nir: 0.50 };
  } else if (t === 'sad' || t === 'dawn') {
    bandWeights = { uvb: 0.0, uva: 0.05, blue: 0.45, red: 0.30, nir: 0.20 };
  } else {
    bandWeights = { uvb: 0.20, uva: 0.20, blue: 0.20, red: 0.20, nir: 0.20 };
  }
  const bandCount = {};
  for (const b of bands) bandCount[b] = (bandCount[b] || 0) + 1;
  const raw = bands.map((b, i) => (bandWeights[b] || 0) / (bandCount[b] || 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  return sum > 0 ? raw.map(w => w / sum) : peaks.map(() => 1 / peaks.length);
}

export function synthesizeDeviceSpectrum(device) {
  if (!device) return { wavelengths: WAVELENGTHS, irradiance: WAVELENGTHS.map(() => 0) };
  const peaks = Array.isArray(device.peakWavelengths) ? device.peakWavelengths : [];
  // Convert mW/cm² → W/m² (×10) so units match reconstructSpectrum
  const totalWm2 = (Number(device.mwPerCm2At15cm) || 0) * 10;
  if (peaks.length === 0 || totalWm2 <= 0) {
    return { wavelengths: WAVELENGTHS, irradiance: WAVELENGTHS.map(() => 0) };
  }
  // Per-peak power split. Devices may declare `peakShares` (parallel to
  // peakWavelengths, sums to 1). When omitted, fall back to a type-aware
  // heuristic — never equal-N split, which silently understated UVB
  // channel-au by ~10× on hybrid red+UV panels and overstated red+NIR
  // on UVB-mode-dominant panels.
  const rawShares = Array.isArray(device.peakShares) && device.peakShares.length === peaks.length
    ? device.peakShares.map(s => Math.max(0, Number(s) || 0))
    : null;
  let shares;
  if (rawShares) {
    const sum = rawShares.reduce((a, b) => a + b, 0);
    shares = sum > 0 ? rawShares.map(s => s / sum) : _heuristicPeakShares(peaks, device.type);
  } else {
    shares = _heuristicPeakShares(peaks, device.type);
  }
  // Per-peak Gaussian: peak amplitude such that integral over wavelength
  // equals share × totalWm2. Gaussian integrand factor 1/(sigma·√(2π))
  // keeps ∫ E(λ)dλ ≈ peakWm2 over the band. Sigma is per-band so UVB/UVA
  // peaks aren't artificially smeared with the red/NIR FWHM.
  const irradiance = WAVELENGTHS.map(() => 0);
  for (let p = 0; p < peaks.length; p++) {
    const peak = peaks[p];
    if (!Number.isFinite(peak)) continue;
    const peakWm2 = shares[p] * totalWm2;
    const sigma = _peakSigmaForWavelength(peak);
    const norm = 1 / (sigma * Math.sqrt(2 * Math.PI));
    for (let i = 0; i < WAVELENGTHS.length; i++) {
      const nm = WAVELENGTHS[i];
      const g = Math.exp(-Math.pow(nm - peak, 2) / (2 * sigma * sigma)) * norm;
      irradiance[i] += peakWm2 * g;
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
export function reconstructSpectrum({ zenithDeg, ozoneDU = 300, altitudeM = 0, cloudCover = 0, aod = null } = {}) {
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
  const beta = (Number.isFinite(aod) && aod > 0) ? aod : 0.10;

  const irradiance = WAVELENGTHS.map((nm) => {
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

// Photosensitizing meds lower the burn threshold. Legacy boolean path
// uses a fixed 0.4 (≈2.5×) per AAD/Mayo Clinic guidance — kept for
// backward compatibility with callers that haven't migrated to the
// tier-based scale. New callers pass `medScale` directly (typically
// from sun.js photosensitiveMedScale(tier) → 1.0/0.7/0.4/0.25 for
// none/mild/moderate/severe). When medScale is supplied, photosensitive
// boolean is ignored.
const PHOTOSENSITIVE_MED_SCALE = 0.4;

export function fractionOfMED({ sed, fitzpatrick = 'III', photosensitive = false, medScale }) {
  const baseMED = MED_BY_FITZPATRICK[fitzpatrick] ?? MED_BY_FITZPATRICK.III;
  let scale;
  if (typeof medScale === 'number') scale = medScale;
  else if (photosensitive) scale = PHOTOSENSITIVE_MED_SCALE;
  else scale = 1.0;
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
// Saturation: pre-vit-D photoisomerizes back to inactive isomers
// (lumisterol, tachysterol) at high doses (Holick 2007). Above ~20,000
// IU the actual yield plateaus regardless of further exposure. We cap
// the displayed value to keep the UI honest about that ceiling.
const VITD_FITZPATRICK_SCALE = { I: 1.0, II: 1.0, III: 0.85, IV: 0.65, V: 0.45, VI: 0.30 };
// Bumped 40 → 60 in 2026-05 after a user (UVI 6 / 42 min / Type III /
// front-only) measured ~2000 IU against dminder's ~6000 IU at the same
// inputs. The earlier 40 was over-corrected from a high-zenith UVB
// over-estimation fix; in the UVI 5–7 sweet spot it under-reports by
// ~3×. 60 brings us into the NIWA / dminder reference band without
// breaking the low-UVI gate (still 0 below UVI 2).
const VITD_IU_PER_CHANNEL_AU = 60;
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
const VITD_PER_SESSION_BODYFRAC_CAP_IU = 30000;

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

// Genetic effect-size table for the vit-D pathway. Effect sizes are
// the median post-test 25(OH)D delta per literature; we apply them as
// a multiplier on the synthesis-IU output as a coarse but useful
// approximation of "how much of the modeled synthesis ends up
// circulating" for a user with these variants.
//
// Strictly speaking these affect different physiological steps —
// VDBP carrier capacity, 25-hydroxylation, 1α-hydroxylation, receptor
// affinity — not skin synthesis itself. Reporting them as a single
// IU multiplier conflates "produced at the keratinocyte" with
// "available in serum 25-OH-D." The honest framing in the UI is
// "effective serum response per modeled UV dose" rather than "skin
// synthesized." See the tooltip in sun.js for the user-facing copy.
//
// Effect sizes derived from rs2282679 / rs10741657 / rs10877012 /
// rs2228570 / rs12785878 — anchored to published 25(OH)D deltas
// (Wang 2010, Ahn 2010, Jolliffe 2018, Bu 2010, Slater 2017).
// References live in data/snp-health.json under each rsID.
const _VITD_GENETIC_EFFECTS = {
  // GC VDBP — most replicated vit-D SNP. TT carries ~4-8 nmol/L
  // lower 25(OH)D vs GG (Wang 2010). Coded as a 15% knockdown.
  rs2282679: { GG: 1.0,  GT: 0.95, TG: 0.95, TT: 0.85 },
  // CYP2R1 25-hydroxylase — converts cholecalciferol to 25(OH)D in
  // liver. GG ~6-7 nmol/L lower 25(OH)D (Wang 2010). 12% knockdown.
  rs10741657: { AA: 1.0,  AG: 0.95, GA: 0.95, GG: 0.88 },
  // CYP27B1 1α-hydroxylase — converts 25(OH)D → calcitriol. The TT
  // variant raises CYP27B1 expression and can compensate for low
  // serum 25(OH)D by accelerating activation (Bu 2010). Modest +5/+10%.
  rs10877012: { GG: 1.0,  GT: 1.05, TG: 1.05, TT: 1.10 },
  // VDR FokI — receptor isoform length affects DNA binding. Jolliffe
  // 2018 meta-analysis: little measurable effect on serum 25(OH)D;
  // small downstream effect on bone outcomes. Tiny knockdown.
  rs2228570: { GG: 1.0,  AG: 0.98, GA: 0.98, AA: 0.95 },
  // DHCR7 — 7-dehydrocholesterol reductase converts 7DHC (the
  // precursor) into cholesterol. Variants that elevate DHCR7 deplete
  // the skin substrate available for UVB-driven vit-D synthesis.
  // Slater 2017 reports ~3-5 nmol/L lower 25(OH)D for the high-DHCR7
  // allele. Conservative 5/8% knockdown.
  rs12785878: { TT: 1.0,  GT: 0.95, TG: 0.95, GG: 0.92 },
  // CYP24A1 — 24-hydroxylase, vit-D catabolism. T allele increases
  // clearance of 25(OH)D and 1,25(OH)2D → less in serum for the same
  // UV dose (Wang 2010, Ahn 2010). ~3-4 nmol/L lower 25(OH)D for TT.
  rs6013897:  { AA: 1.0,  AT: 0.97, TA: 0.97, TT: 0.92 },
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

// `rotatedSides` doubles the yield to acknowledge that flipping front↔back
// during the session lets fresh skin restart vit-D synthesis after the
// previous side approaches per-area saturation. Matches dminder's
// "100% naked over the session = both sides exposed" convention. The
// global VITD_SATURATION_IU cap still applies on top.
//
// `genetics` (optional) — the profile's genetics blob (see
// state.importedData.genetics). When supplied, applies a compound
// multiplier from `geneticVitaminDMultiplier`. When omitted/null, no
// genetic adjustment — existing callers see the prior behaviour and
// no-genotype users see no change. Pass explicitly from the call
// site since `state` is module-scoped (not on window) and importing
// it from here would create a circular dependency.
export function vitaminDIU(channelAu, fitzpatrick = 'III', uvi = null, rotatedSides = false, genetics = null) {
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
export function vitaminDIUPerSession(channelAu, fitzpatrick = 'III', uvi = null, rotatedSides = false, genetics = null, bodyFraction = null) {
  const raw = vitaminDIURaw(channelAu, fitzpatrick, uvi, rotatedSides, genetics);
  if (raw <= 0) return 0;
  const perSessionCap = (Number.isFinite(bodyFraction) && bodyFraction > 0)
    ? bodyFraction * VITD_PER_SESSION_BODYFRAC_CAP_IU
    : VITD_SATURATION_IU;
  // Both caps fire — daily ceiling is still hard biology, per-session
  // is the local skin-patch saturation. Per-session is the binding
  // cap for high-output devices; daily is the binding cap for very
  // long full-body summer sun.
  return Math.min(raw, perSessionCap, VITD_SATURATION_IU);
}

// Uncapped per-session IU. The 20,000 IU plateau is a DAILY biological
// ceiling (Holick 2007: above ~20k IU/day pre-vit-D photoisomerizes back
// to lumisterol/tachysterol). Capping per-session was wrong for multi-
// session rollups: two same-day 10-min UVB device sessions each capped
// at 20k summed to 40k in the 7-day total, blowing past the biological
// ceiling. Rollups should use this raw helper, group by local date, cap
// each day at VITD_SATURATION_IU, then sum the capped days.
//
// Single-session render paths still call vitaminDIU() (capped) — for
// one session the cap is the right ceiling.
export function vitaminDIURaw(channelAu, fitzpatrick = 'III', uvi = null, rotatedSides = false, genetics = null) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return 0;
  const skinScale = VITD_FITZPATRICK_SCALE[fitzpatrick] ?? VITD_FITZPATRICK_SCALE.III;
  const uviMult = _uviThresholdMultiplier(uvi);
  const rotMult = rotatedSides ? 2.0 : 1.0;
  const geneMult = geneticVitaminDMultiplier(genetics).mult;
  return channelAu * VITD_IU_PER_CHANNEL_AU * skinScale * uviMult * rotMult * geneMult;
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
export function vitaminDIURange(channelAu, fitzpatrick = 'III', uvi = null, zenith = null, rotatedSides = false) {
  const central = vitaminDIU(channelAu, fitzpatrick, uvi, rotatedSides);
  if (central === 0) return { central: 0, low: 0, high: 0 };
  // Per-zenith model uncertainty (multipliers for low/high band):
  //   high noon (z ≤ 35°)    → ±20%   (model in its sweet spot)
  //   morning/afternoon      → ±30%
  //   low sun (z > 55°)      → ±45%   (Bird-Riordan accuracy degrades)
  //   no zenith supplied     → ±35%   (legacy default — was 0.6/1.5)
  let lowMul = 0.65, highMul = 1.35;
  if (Number.isFinite(zenith)) {
    if (zenith <= 35) { lowMul = 0.80; highMul = 1.20; }
    else if (zenith <= 55) { lowMul = 0.70; highMul = 1.30; }
    else { lowMul = 0.55; highMul = 1.45; }
  }
  return {
    central: Math.round(central),
    low: Math.max(0, Math.round(central * lowMul)),
    high: Math.min(VITD_SATURATION_IU, Math.round(central * highMul)),
  };
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

// Retinal UV exposure — actinic-weighted dose at the eye (ICNIRP S(λ)
// approximated by the CIE erythemal action spectrum, which peaks at 297
// nm and drops to ~0.0001 at 400 nm). This is the right basis for the
// photokeratitis threshold; integrating *unweighted* UV would overstate
// the dose 30-100× because UVA (the dominant wavelength of total UV) is
// only weakly damaging vs UVB.
//
// Returns J/m² actinic UV at the eye. ICNIRP daily exposure limit is
// 30 J/m². Photokeratitis symptoms appear above ~50 J/m². Alert
// thresholds in sun.js use 15 J/m² (warning) and 30 J/m² (over limit).
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
export function retinalUVdose({ spectrum, eyeExposure, zenithDeg = null }) {
  if (!spectrum || !eyeExposure) return 0;
  const mode = eyeExposure.mode || 'indoor';
  if (mode !== 'direct') return 0;
  let elevationGate = 1.0;
  if (Number.isFinite(zenithDeg)) {
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
    const w = erythemalAt(nm); // actinic action spectrum (≈ ICNIRP S(λ))
    if (w <= 0) continue;
    actinic_irradiance += spectrum.irradiance[i] * w * dlambda;
  }
  return actinic_irradiance * seconds * elevationGate;
}

// Mode-aware effective-device builder. Devices like Mitochondriak Maxi
// UVB (UV+blue coupled to red/NIR) and Chroma Trinity (3 named modes —
// Ironforge / Lux Vital / D-Light) gate which LED groups fire per
// session via touchscreen / mode selection. Without this, every session
// is implicitly "all groups firing" — wrong for any vendor mode that
// fires a subset.
//
// Strategy:
//   1. Compute peak shares on the FULL device (preserves hybrid
//      detection: a hybrid panel firing only its red/NIR subset is
//      still a "hybrid panel running ~85% of total power", not a
//      pure-PBM device — the original 5/5/5/35/50 weights gave 85%
//      to red+NIR, so partial-mode irradiance scales by that).
//   2. Filter peakWavelengths + matching peakShares to the firing
//      subset.
//   3. Sum firing shares → that's the fraction of full-panel power
//      this mode delivers; scale mwPerCm2At15cm by it.
//   4. Renormalize firing shares so they sum to 1 (synthesize expects
//      a normalized split within the firing peaks).
//
// Returned device is structurally identical to the input — synthesize
// downstream stays mode-agnostic. mode='all-on' (or undefined modeId
// on a device with no `modes`) returns the device unchanged: identity.
//
// Coupling rules (e.g. Maxi UVB UV-requires-redNIR) are NOT enforced
// here — that's a session-creation concern. This builder honors
// whatever modeId is passed.
export function effectiveDeviceForMode(device, modeId) {
  if (!device || !Array.isArray(device.peakWavelengths) || device.peakWavelengths.length === 0) return device;
  if (!Array.isArray(device.modes) || device.modes.length === 0) return device;
  const mode = device.modes.find(m => m.id === modeId)
    || device.modes.find(m => m.default)
    || device.modes[0];
  if (!mode || !Array.isArray(mode.groups) || mode.groups.length === 0) return device;
  if (!Array.isArray(device.channelGroups)) return device;
  const firingPeakSet = new Set();
  for (const groupId of mode.groups) {
    const group = device.channelGroups.find(g => g.id === groupId);
    if (!group || !Array.isArray(group.peaks)) continue;
    for (const p of group.peaks) firingPeakSet.add(p);
  }
  const allPeaks = device.peakWavelengths;
  const allShares = Array.isArray(device.peakShares) && device.peakShares.length === allPeaks.length
    ? (() => { const s = device.peakShares.reduce((a, b) => a + b, 0); return s > 0 ? device.peakShares.map(x => x / s) : _heuristicPeakShares(allPeaks, device.type); })()
    : _heuristicPeakShares(allPeaks, device.type);
  const firingPeaks = [];
  const firingSharesRaw = [];
  for (let i = 0; i < allPeaks.length; i++) {
    if (firingPeakSet.has(allPeaks[i])) {
      firingPeaks.push(allPeaks[i]);
      firingSharesRaw.push(allShares[i]);
    }
  }
  if (firingPeaks.length === 0) return device;
  const firingFraction = firingSharesRaw.reduce((a, b) => a + b, 0);
  if (firingFraction <= 0) return device;
  const firingShares = firingSharesRaw.map(s => s / firingFraction);
  return {
    ...device,
    peakWavelengths: firingPeaks,
    peakShares: firingShares,
    mwPerCm2At15cm: (Number(device.mwPerCm2At15cm) || 0) * firingFraction,
  };
}

// Validate a (device, modeId) pair against the device's coupling rules.
// Returns { ok: true } when the mode satisfies all rules, otherwise
// { ok: false, error: '<human-readable reason>' }. Devices without
// `coupling` always pass.
export function validateModeCoupling(device, modeId) {
  if (!device || !Array.isArray(device.coupling) || device.coupling.length === 0) return { ok: true };
  if (!Array.isArray(device.modes) || device.modes.length === 0) return { ok: true };
  const mode = device.modes.find(m => m.id === modeId);
  if (!mode || !Array.isArray(mode.groups)) return { ok: true };
  const firing = new Set(mode.groups);
  for (const rule of device.coupling) {
    if (!rule || !rule.if || !Array.isArray(rule.requires)) continue;
    if (!firing.has(rule.if)) continue;
    for (const req of rule.requires) {
      if (!firing.has(req)) {
        const reason = rule.reason || `Group "${rule.if}" requires "${req}" to also be firing.`;
        return { ok: false, error: reason };
      }
    }
  }
  return { ok: true };
}

// ─── Public exports ────────────────────────────────────────────────────

export const SUN_CHANNELS = CHANNELS.map(({ id, key, label }) => ({ id, key, label }));
export { erythemalAt, vitaminDAt, melanopicAt, opn5At, ccoAt, noReleaseAt };

if (typeof window !== 'undefined') {
  Object.assign(window, {
    reconstructSpectrum,
    synthesizeDeviceSpectrum,
    effectiveDeviceForMode,
    validateModeCoupling,
    heuristicPeakShares,
    computeChannelDoses,
    erythemalSED,
    fractionOfMED,
    vitaminDIU,
    vitaminDIURaw,
    vitaminDIUPerSession,
    VITD_DAILY_SATURATION_IU,
    VITD_PER_SESSION_BODYFRAC_CAP_IU,
    vitaminDIURange,
    geneticVitaminDMultiplier,
    pbmJoulesPerCm2,
    circadianMelanopicLux,
    retinalUVdose,
    glassTransmission,
    sunscreenTransmission,
    SUN_CHANNELS,
  });
}
