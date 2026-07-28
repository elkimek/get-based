// @ts-check
// sun-spectrum-actions.js — Biological action-spectrum weighting curves.

// Erythemal action spectrum — McKinlay-Diffey 1987 (CIE Journal 6:17),
// codified as CIE S 007 / ISO 17166:1999. Peaks at 297nm, drops sharply.
export function erythemalAt(nm) {
  if (nm < 250) return 0;
  if (nm <= 298) return 1.0;
  if (nm <= 328) return Math.pow(10, 0.094 * (298 - nm));
  if (nm <= 400) return Math.pow(10, 0.015 * (140 - nm));
  return 0;
}

// CIE 174:2006 previtamin-D3 action spectrum — peaks at 297nm.
export function vitaminDAt(nm) {
  if (nm < 252 || nm > 330) return 0;
  if (nm <= 297) return Math.pow(10, -0.25 * (297 - nm));
  if (nm <= 330) return Math.pow(10, -0.13 * (nm - 297));
  return 0;
}

// CIE melanopic — peaks at 490nm, gaussian-like, sensitive 420-560nm.
export function melanopicAt(nm) {
  if (nm < 380 || nm > 720) return 0;
  const sigma = 50;
  return Math.exp(-Math.pow(nm - 490, 2) / (2 * sigma * sigma));
}

// OPN5 violet — dual peak ~380nm + ~471nm (Buhr 2019).
export function opn5At(nm) {
  if (nm < 320 || nm > 540) return 0;
  const a = Math.exp(-Math.pow(nm - 380, 2) / (2 * 25 * 25));
  const b = 0.7 * Math.exp(-Math.pow(nm - 471, 2) / (2 * 30 * 30));
  return Math.max(a, b);
}

// CCO red+NIR (Karu 1999) — broad, peaks at 620, 670, 760, 830nm.
export function ccoAt(nm) {
  if (nm < 580 || nm > 1100) return 0;
  const peaks = [
    { c: 620, w: 18, h: 0.5 },
    { c: 670, w: 22, h: 0.9 },
    { c: 760, w: 30, h: 0.7 },
    { c: 830, w: 38, h: 1.0 },
  ];
  let sum = 0;
  for (const peak of peaks) {
    sum += peak.h * Math.exp(-Math.pow(nm - peak.c, 2) / (2 * peak.w * peak.w));
  }
  return Math.min(1, sum);
}

// NO release in skin (Liu 2014) — UVA peak ~330-360nm.
export function noReleaseAt(nm) {
  if (nm < 300 || nm > 410) return 0;
  return Math.exp(-Math.pow(nm - 345, 2) / (2 * 25 * 25));
}

// NIR-solar broadband (600-1400nm Wunsch optical tissue window).
export function nirSolarAt(nm) {
  if (nm < 600 || nm > 1400) return 0;
  return 0.5 + 0.5 * Math.exp(-Math.pow(nm - 900, 2) / (2 * 200 * 200));
}

// PBM bands — narrowband artificial sources only.
export function pbmRedAt(nm) {
  if (nm < 600 || nm > 700) return 0;
  return Math.exp(-Math.pow(nm - 660, 2) / (2 * 15 * 15));
}

export function pbmNirAt(nm) {
  if (nm < 700 || nm > 1100) return 0;
  return Math.exp(-Math.pow(nm - 850, 2) / (2 * 25 * 25));
}
