function parsePercentage(value, label) {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  const percentage = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error(`${label} must be a number greater than 0 and at most 100.`);
  }
  return percentage;
}

export function resolveCoverageMinimum({ baseline, envValue = '' } = {}) {
  const baselineMinimum = parsePercentage(
    baseline?.minimumFunctionPct,
    'coverage baseline minimumFunctionPct',
  );
  const overrideText = String(envValue || '').trim();
  if (!overrideText) {
    return {
      minimum: baselineMinimum,
      baselineMinimum,
      source: 'scripts/coverage-baseline.json',
    };
  }

  const overrideMinimum = parsePercentage(overrideText, 'COVERAGE_MIN');
  if (overrideMinimum < baselineMinimum) {
    throw new Error(
      `COVERAGE_MIN=${overrideMinimum} cannot lower the committed coverage baseline of ${baselineMinimum}.`,
    );
  }
  return {
    minimum: overrideMinimum,
    baselineMinimum,
    source: 'COVERAGE_MIN',
  };
}

export function enforceFunctionCoverage(actualFunctionPct, gate) {
  const actual = Number(actualFunctionPct);
  if (!Number.isFinite(actual) || actual < 0 || actual > 100) {
    throw new Error('Measured function coverage must be a number from 0 to 100.');
  }
  if (!gate || !Number.isFinite(gate.minimum)) {
    throw new Error('A valid function coverage gate is required.');
  }
  if (actual + Number.EPSILON < gate.minimum) {
    throw new Error(
      `Coverage gate failed: function coverage ${actual.toFixed(2)}% is below `
      + `${gate.minimum.toFixed(2)}% (${gate.source}).`,
    );
  }
  return {
    actual,
    minimum: gate.minimum,
    margin: actual - gate.minimum,
  };
}

// Validate every feature independently so a global increase cannot mask a loss
// in a smaller feature. Missing/new groups require an explicit baseline review.
export function enforceFeatureCoverage(features, baseline) {
  const floors = baseline?.features;
  if (!floors || typeof floors !== 'object' || Array.isArray(floors) || !Object.keys(floors).length) {
    throw new Error('Feature coverage baseline is required.');
  }
  if (!Array.isArray(features)) throw new Error('Measured feature coverage is required.');
  const seen = new Set();
  const results = features.map(feature => {
    const { name, fnTotal, fnCalled } = feature;
    if (seen.has(name)) throw new Error(`Duplicate coverage feature: ${name}`);
    seen.add(name);
    if (!Object.hasOwn(floors, name)) throw new Error(`Missing coverage baseline for feature: ${name}`);
    if (!Number.isSafeInteger(fnTotal) || fnTotal <= 0 || !Number.isSafeInteger(fnCalled)
      || fnCalled < 0 || fnCalled > fnTotal) throw new Error(`Invalid function counts for feature: ${name}`);
    const floor = floors[name];
    if (!floor || typeof floor !== 'object') throw new Error(`Invalid coverage baseline for feature: ${name}`);
    const minimum = parsePercentage(floor.minimumFunctionPct, `Feature ${name} minimumFunctionPct`);
    const { referenceCalled, referenceTotal } = floor;
    if (!Number.isSafeInteger(referenceTotal) || referenceTotal <= 0
      || !Number.isSafeInteger(referenceCalled) || referenceCalled < 0 || referenceCalled > referenceTotal) {
      throw new Error(`Invalid reference function counts for feature: ${name}`);
    }
    if (minimum < Math.floor(100 * referenceCalled / referenceTotal)) {
      throw new Error(`Feature ${name} floor is below its rounded reference measurement.`);
    }
    return { name, ...enforceFunctionCoverage(100 * fnCalled / fnTotal, { minimum, source: `feature: ${name}` }) };
  });
  for (const name of Object.keys(floors)) {
    if (!seen.has(name)) throw new Error(`Missing measured coverage feature: ${name}`);
  }
  return results;
}
