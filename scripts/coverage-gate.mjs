function parsePercentage(value, label) {
  const percentage = Number.parseFloat(String(value));
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
