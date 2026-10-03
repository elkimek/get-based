// sun-spectrum-actions.js — Biological action-spectrum weighting curves.

// Gaussian proxy shared by the modeled optical action curves.
function gaussianWeight(nm: number, center: number, sigma: number) {
  return Math.exp(-Math.pow(nm - center, 2) / (2 * sigma * sigma));
}

// Erythemal action spectrum — McKinlay-Diffey 1987 (CIE Journal 6:17),
// codified as CIE S 007 / ISO 17166:1999. Peaks at 297nm, drops sharply.
export function erythemalAt(nm: number) {
  if (nm < 250) return 0;
  if (nm <= 298) return 1.0;
  if (nm <= 328) return Math.pow(10, 0.094 * (298 - nm));
  if (nm <= 400) return Math.pow(10, 0.015 * (140 - nm));
  return 0;
}

// ICNIRP 2004 UV-hazard relative spectral effectiveness S(lambda). This is
// deliberately separate from the CIE erythema curve: it peaks at 270 nm, and
// the 30 J/m2 effective exposure limit for unprotected skin/eye is defined
// with this weighting. ICNIRP supplies formulas for 210–400 nm; the short-wave
// anchors cover 180–210 nm. Our solar/device grid starts at 280 nm, but keeping
// the whole published domain makes this helper independently auditable.
const ACTINIC_UV_SHORT_TABLE: Array<[number, number]> = [
  [180, 0.012], [190, 0.019], [200, 0.030], [205, 0.051], [210, 0.075],
];

export function actinicUVAt(nm: number) {
  if (!Number.isFinite(nm) || nm < 180 || nm > 400) return 0;
  if (nm < 210) {
    for (let i = 0; i < ACTINIC_UV_SHORT_TABLE.length - 1; i++) {
      const [n1, v1] = ACTINIC_UV_SHORT_TABLE[i]!;
      const [n2, v2] = ACTINIC_UV_SHORT_TABLE[i + 1]!;
      if (nm < n1 || nm > n2) continue;
      const t = (nm - n1) / (n2 - n1);
      return v1 + t * (v2 - v1);
    }
  }
  if (nm <= 270) return Math.pow(0.959, 270 - nm);
  if (nm <= 300) return 1 - 0.36 * Math.pow((nm - 270) / 20, 1.64);
  return 0.3 * Math.pow(0.736, nm - 300) + Math.pow(10, 2 - 0.0163 * nm);
}

// CIE 174:2006 previtamin-D3 action spectrum — peaks at 297nm.
export function vitaminDAt(nm: number) {
  if (nm < 252 || nm > 330) return 0;
  if (nm <= 297) return Math.pow(10, -0.25 * (297 - nm));
  if (nm <= 330) return Math.pow(10, -0.13 * (nm - 297));
  return 0;
}

// Melanopic sensitivity proxy. This remains a smooth approximation for the
// exploratory channel and must not be presented as a calibrated CIE S 026
// measurement; official M-EDI output additionally requires a measured SPD.
export function melanopicAt(nm: number) {
  if (nm < 380 || nm > 720) return 0;
  const sigma = 50;
  return gaussianWeight(nm, 490, sigma);
}

// OPN5 violet — dual peak ~380nm + ~471nm (Buhr 2019).
export function opn5At(nm: number) {
  if (nm < 320 || nm > 540) return 0;
  const a = gaussianWeight(nm, 380, 25);
  const b = 0.7 * gaussianWeight(nm, 471, 30);
  return Math.max(a, b);
}

// CCO red+NIR (Karu 1999) — broad, peaks at 620, 670, 760, 830nm.
// Immutable model data shared across wavelength evaluations.
const CCO_PEAKS: ReadonlyArray<{ readonly c: number; readonly w: number; readonly h: number }> = [
  { c: 620, w: 18, h: 0.5 },
  { c: 670, w: 22, h: 0.9 },
  { c: 760, w: 30, h: 0.7 },
  { c: 830, w: 38, h: 1.0 },
];

export function ccoAt(nm: number) {
  if (nm < 580 || nm > 1100) return 0;
  const peaks = CCO_PEAKS;
  let sum = 0;
  for (const peak of peaks) {
    sum += peak.h * gaussianWeight(nm, peak.c, peak.w);
  }
  return Math.min(1, sum);
}

// NO release in skin (Liu 2014) — UVA peak ~330-360nm.
export function noReleaseAt(nm: number) {
  if (nm < 300 || nm > 410) return 0;
  return gaussianWeight(nm, 345, 25);
}

// NIR-solar broadband model (600-1400nm optical tissue window).
export function nirSolarAt(nm: number) {
  if (nm < 600 || nm > 1400) return 0;
  return 0.5 + 0.5 * gaussianWeight(nm, 900, 200);
}

// PBM bands — narrowband artificial sources only.
export function pbmRedAt(nm: number) {
  if (nm < 600 || nm > 700) return 0;
  return gaussianWeight(nm, 660, 15);
}

export function pbmNirAt(nm: number) {
  if (nm < 700 || nm > 1100) return 0;
  return gaussianWeight(nm, 850, 25);
}
