import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunCorrelationsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sun correlations browser coverage computes Pearson pairs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ correlationsUrl }) => {
    const [{ state }, correlations] = await Promise.all([
      import('/js/state.js'),
      import(correlationsUrl),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const outcomes = {};
    const now = Date.now();
    const weekMs = 7 * 86400 * 1000;
    const dayMs = 86400 * 1000;
    const session = (weekOffset, vitaminD) => ({
      id: `sun-correlation-${weekOffset}`,
      endedAt: now - weekOffset * weekMs - 5000,
      doses: { vitamin_d: vitaminD },
    });
    const entry = (weekOffset, vitaminD) => ({
      date: new Date(now - weekOffset * weekMs - dayMs).toISOString().slice(0, 10),
      markers: { 'vitamins.vitaminD': vitaminD },
    });

    try {
      state.currentProfile = `sun-correlations-browser-${Date.now()}`;
      state.importedData = {
        sunSessions: [
          session(0, 8),
          session(1, 7),
          session(2, 5),
          session(3, 4),
          session(4, 3),
          session(5, 1),
        ],
        deviceSessions: [],
        entries: [
          entry(0, 80),
          entry(1, 75),
          entry(2, 65),
          entry(3, 55),
          entry(4, 45),
          entry(5, 35),
        ],
      };

      const result = correlations.computeSunCorrelations({ weeks: 12 });
      const pair = result.pairs.find(item =>
        item.channel === 'vitamin_d' && item.biomarkerKey === 'vitamins.vitaminD'
      );
      outcomes.positivePearsonPairSurfaces =
        !!pair
        && pair.biomarker === '25-OH vitamin D'
        && pair.r > 0.95
        && pair.n >= 4
        && pair.lag === 0;
      outcomes.pairsAreSortedAndSchemaIsStable =
        result.weeks === 12
        && typeof result.computedAt === 'number'
        && result.pairs.every((item, index) =>
          index === 0 || Math.abs(result.pairs[index - 1].r) >= Math.abs(item.r)
        )
        && result.pairs.every(item =>
          typeof item.channel === 'string'
          && typeof item.biomarker === 'string'
          && typeof item.biomarkerKey === 'string'
          && typeof item.r === 'number'
          && item.r >= -1
          && item.r <= 1
          && item.n >= 4
        );
    } finally {
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
    }

    return outcomes;
  }, { correlationsUrl: moduleUrl('/js/sun-correlations.js') });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
