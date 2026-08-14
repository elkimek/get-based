// @ts-check
// sun-spectrum-device.js — Spectral grid, optical modifiers, and device-mode physics.

export const SPECTRUM_WAVELENGTHS = (() => {
  const wavelengths = [];
  for (let nm = 280; nm <= 2500; nm += 5) wavelengths.push(nm);
  return wavelengths;
})();

// Standard clear soda-lime window glass transmission. Approximates Pilkington
// optical-data datasheets: total UVB block, partial UVA, mostly clear visible,
// tapering NIR. Single-pane; double glazing is not modeled.
export function glassTransmission(nm) {
  if (nm < 320) return 0.0;
  if (nm < 340) return 0.05;
  if (nm < 380) return 0.4;
  if (nm < 700) return 0.85;
  if (nm < 1100) return 0.7;
  if (nm < 2500) return 0.3;
  return 0.0;
}

// Per-band Gaussian sigma for LED/tube emission. UV emitters are narrower
// than the typical 25–35nm FWHM red/NIR LED band.
function peakSigmaForWavelength(nm) {
  if (nm < 320) return 4.3;
  if (nm < 410) return 5.9;
  if (nm < 500) return 8.5;
  return 12.7;
}

// Heuristic peak shares for devices that declare wavelengths but no explicit
// power split. Hybrid panels reserve most power for red/NIR, while pure UV
// devices assign their rated output to UV and blue bands.
export function heuristicPeakShares(peaks, deviceType) {
  const bandOf = nm => {
    if (nm < 320) return 'uvb';
    if (nm < 410) return 'uva';
    if (nm < 500) return 'blue';
    if (nm < 700) return 'red';
    return 'nir';
  };
  const type = String(deviceType || '').toLowerCase();
  const bands = peaks.map(bandOf);
  const hasUv = bands.some(band => band === 'uvb' || band === 'uva');
  const hasRedNir = bands.some(band => band === 'red' || band === 'nir');
  const isHybrid = hasUv && hasRedNir;

  let bandWeights;
  if (isHybrid) {
    bandWeights = { uvb: 0.05, uva: 0.05, blue: 0.05, red: 0.35, nir: 0.50 };
  } else if (type === 'uvb' || type === 'uva') {
    bandWeights = { uvb: 0.40, uva: 0.40, blue: 0.20, red: 0.0, nir: 0.0 };
  } else if (type === 'pbm' || type === 'pbm-targeted') {
    bandWeights = { uvb: 0.02, uva: 0.03, blue: 0.05, red: 0.40, nir: 0.50 };
  } else if (type === 'sad' || type === 'dawn') {
    bandWeights = { uvb: 0.0, uva: 0.05, blue: 0.45, red: 0.30, nir: 0.20 };
  } else {
    bandWeights = { uvb: 0.20, uva: 0.20, blue: 0.20, red: 0.20, nir: 0.20 };
  }
  const bandCount = {};
  for (const band of bands) bandCount[band] = (bandCount[band] || 0) + 1;
  const rawShares = bands.map(
    band => (bandWeights[band] || 0) / (bandCount[band] || 1),
  );
  const sum = rawShares.reduce((total, share) => total + share, 0);
  return sum > 0
    ? rawShares.map(share => share / sum)
    : peaks.map(() => 1 / peaks.length);
}

// Synthesize a sparse spectrum from declared device peaks and total irradiance.
// Each peak becomes a band-appropriate Gaussian whose integral matches its
// share of the device rating.
export function synthesizeDeviceSpectrum(device) {
  if (!device) {
    return {
      wavelengths: SPECTRUM_WAVELENGTHS,
      irradiance: SPECTRUM_WAVELENGTHS.map(() => 0),
    };
  }
  const peaks = Array.isArray(device.peakWavelengths) ? device.peakWavelengths : [];
  const totalWm2 = (Number(device.mwPerCm2At15cm) || 0) * 10;
  if (peaks.length === 0 || totalWm2 <= 0) {
    return {
      wavelengths: SPECTRUM_WAVELENGTHS,
      irradiance: SPECTRUM_WAVELENGTHS.map(() => 0),
    };
  }
  const rawShares = Array.isArray(device.peakShares)
      && device.peakShares.length === peaks.length
    ? device.peakShares.map(share => Math.max(0, Number(share) || 0))
    : null;
  let shares;
  if (rawShares) {
    const sum = rawShares.reduce((total, share) => total + share, 0);
    shares = sum > 0
      ? rawShares.map(share => share / sum)
      : heuristicPeakShares(peaks, device.type);
  } else {
    shares = heuristicPeakShares(peaks, device.type);
  }

  const irradiance = SPECTRUM_WAVELENGTHS.map(() => 0);
  for (let peakIndex = 0; peakIndex < peaks.length; peakIndex++) {
    const peak = peaks[peakIndex];
    if (!Number.isFinite(peak)) continue;
    const peakWm2 = shares[peakIndex] * totalWm2;
    const sigma = peakSigmaForWavelength(peak);
    const normalization = 1 / (sigma * Math.sqrt(2 * Math.PI));
    for (let index = 0; index < SPECTRUM_WAVELENGTHS.length; index++) {
      const nm = SPECTRUM_WAVELENGTHS[index];
      const gaussian = Math.exp(
        -Math.pow(nm - peak, 2) / (2 * sigma * sigma),
      ) * normalization;
      irradiance[index] += peakWm2 * gaussian;
    }
  }
  return { wavelengths: SPECTRUM_WAVELENGTHS, irradiance };
}

// Conservative typical-use sunscreen transmission. Label SPF is measured at
// a standardized 2 mg/cm2 application; real-world coverage and reapplication
// vary too much to grant the full laboratory extension in a burn calculator.
// sqrt(SPF) is used as a bounded effective-protection proxy, with weaker UVA
// protection. It intentionally errs toward *more* transmitted UV.
export function sunscreenTransmission(nm, spf) {
  const normalizedSpf = Number(spf) || 0;
  if (normalizedSpf <= 1) return 1.0;
  const typicalUseSpf = Math.sqrt(normalizedSpf);
  if (nm < 320) return 1.0 / typicalUseSpf;
  if (nm < 360) return Math.min(1, 1.4 / typicalUseSpf);
  if (nm < 400) return Math.min(1, 2.0 / typicalUseSpf);
  return 1.0;
}

// Build the effective firing subset for a named device mode while preserving
// the full-device power distribution.
export function effectiveDeviceForMode(device, modeId) {
  if (!device || !Array.isArray(device.peakWavelengths)
      || device.peakWavelengths.length === 0) {
    return device;
  }
  if (!Array.isArray(device.modes) || device.modes.length === 0) return device;
  const mode = device.modes.find(candidate => candidate.id === modeId)
    || device.modes.find(candidate => candidate.default)
    || device.modes[0];
  if (!mode || !Array.isArray(mode.groups) || mode.groups.length === 0) return device;
  if (!Array.isArray(device.channelGroups)) return device;

  const firingPeakSet = new Set();
  for (const groupId of mode.groups) {
    const group = device.channelGroups.find(candidate => candidate.id === groupId);
    if (!group || !Array.isArray(group.peaks)) continue;
    for (const peak of group.peaks) firingPeakSet.add(peak);
  }
  const allPeaks = device.peakWavelengths;
  const declaredPeakShares = Array.isArray(device.peakShares)
      && device.peakShares.length === allPeaks.length
      && device.peakShares.some(share => Number(share) > 0);
  const allShares = declaredPeakShares
    ? (() => {
      const sum = device.peakShares.reduce((total, share) => total + share, 0);
      return sum > 0
        ? device.peakShares.map(share => share / sum)
        : heuristicPeakShares(allPeaks, device.type);
    })()
    : heuristicPeakShares(allPeaks, device.type);
  const firingPeaks = [];
  const firingSharesRaw = [];
  for (let index = 0; index < allPeaks.length; index++) {
    if (firingPeakSet.has(allPeaks[index])) {
      firingPeaks.push(allPeaks[index]);
      firingSharesRaw.push(allShares[index]);
    }
  }
  if (firingPeaks.length === 0) return device;
  const firingFraction = firingSharesRaw.reduce(
    (total, share) => total + share,
    0,
  );
  if (firingFraction <= 0) return device;
  const firingShares = firingSharesRaw.map(share => share / firingFraction);
  return {
    ...device,
    peakWavelengths: firingPeaks,
    peakShares: firingShares,
    peakShareBasis: device.peakShareBasis || (declaredPeakShares ? 'declared' : 'heuristic'),
    mwPerCm2At15cm: (Number(device.mwPerCm2At15cm) || 0) * firingFraction,
  };
}

// Validate a device-mode pair against coupling requirements.
export function validateModeCoupling(device, modeId) {
  if (!device || !Array.isArray(device.coupling) || device.coupling.length === 0) {
    return { ok: true };
  }
  if (!Array.isArray(device.modes) || device.modes.length === 0) return { ok: true };
  const mode = device.modes.find(candidate => candidate.id === modeId);
  if (!mode || !Array.isArray(mode.groups)) return { ok: true };
  const firing = new Set(mode.groups);
  for (const rule of device.coupling) {
    if (!rule || !rule.if || !Array.isArray(rule.requires)) continue;
    if (!firing.has(rule.if)) continue;
    for (const requiredGroup of rule.requires) {
      if (!firing.has(requiredGroup)) {
        const reason = rule.reason
          || `Group "${rule.if}" requires "${requiredGroup}" to also be firing.`;
        return { ok: false, error: reason };
      }
    }
  }
  return { ok: true };
}
