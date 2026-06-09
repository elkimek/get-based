import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?lensWearablesHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/lens-wearables-helper-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/lens-wearables-helper-coverage', { waitUntil: 'load' });
}

test('lens and wearables helper coverage exercises chunking math and display formatting', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ lensUtilsUrl, wearablesFormattersUrl }) => {
    const [lensUtils, wearablesFormatters] = await Promise.all([
      import(lensUtilsUrl),
      import(wearablesFormattersUrl),
    ]);
    const outcomes = {};

    outcomes.chunkShortTextHonorsMinimumSize = lensUtils.chunkText('short', 800, 50, 50).length === 0
      && lensUtils.chunkText('hello world this is fifty plus characters exactly here', 800, 50, 50)
        .join('') === 'hello world this is fifty plus characters exactly here';

    const sentenceText = 'A'.repeat(600) + '. ' + 'B'.repeat(500);
    const sentenceChunks = lensUtils.chunkText(sentenceText, 800, 50, 50);
    outcomes.chunkSnapsToSentenceBoundary = sentenceChunks.length === 2
      && sentenceChunks[0].endsWith('.')
      && sentenceChunks[0].length < sentenceText.length;

    const wordChunks = lensUtils.chunkText('word '.repeat(400), 800, 50, 50);
    const tail = wordChunks[0]?.slice(-30) || '';
    outcomes.chunkPreservesOverlapAndProgresses = wordChunks.length > 1
      && wordChunks[1].includes(tail.slice(5))
      && wordChunks.every((chunk) => chunk.length >= 50);

    outcomes.cosineCoversLengthClampAndSigns = Math.abs(lensUtils.cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9
      && Math.abs(lensUtils.cosine([1, 0, 0], [0, 1, 0])) < 1e-9
      && Math.abs(lensUtils.cosine([1, 0, 0], [-1, 0, 0]) + 1) < 1e-9
      && lensUtils.cosine([2, 99], [3]) === 6;

    const vectors = [
      [1, 0, 0, 0],
      [0.99, 0.14, 0, 0],
      [0, 1, 0, 0],
      [-1, 0, 0, 0],
      [Math.SQRT1_2, Math.SQRT1_2, 0, 0],
    ];
    const candidates = [
      { i: 0, score: 0.95 },
      { i: 1, score: 0.94 },
      { i: 4, score: 0.70 },
      { i: 2, score: 0.50 },
      { i: 3, score: 0.10 },
    ];
    const getVec = (i) => vectors[i];
    const relevanceOnly = lensUtils.mmrSelect(candidates, 3, 1, getVec);
    const diversityOnly = lensUtils.mmrSelect(candidates, 2, 0, getVec);
    const balanced = lensUtils.mmrSelect(candidates, 3, 0.5, getVec);
    const noSelectionNeeded = lensUtils.mmrSelect(candidates.slice(0, 2), 3, 0.5, getVec);
    outcomes.mmrCoversRelevanceDiversityAndEarlyReturn = relevanceOnly.map((item) => item.i).join(',') === '0,1,4'
      && diversityOnly.map((item) => item.i).join(',') === '0,3'
      && balanced[0].i === 0
      && balanced.every((item) => item.i !== 1)
      && noSelectionNeeded.length === 2
      && noSelectionNeeded[1].i === 1;

    outcomes.formatValueCoversInvalidIntegerAndDecimalUnits =
      wearablesFormatters.formatValue(null, 'ms') === '\u2014'
      && wearablesFormatters.formatValue(Number.NaN, 'bpm') === '\u2014'
      && wearablesFormatters.formatValue(64.4, 'bpm') === '64'
      && wearablesFormatters.formatValue(97, '%') === '97'
      && wearablesFormatters.formatValue(45.6, 'min') === '46'
      && wearablesFormatters.formatValue(12, 'kg') === '12'
      && wearablesFormatters.formatValue(72.34, 'kg') === '72.3';

    const currentYear = new Date().getFullYear();
    const sameYearDate = wearablesFormatters.shortDate(`${currentYear}-04-24`);
    const priorYear = currentYear - 1;
    const priorYearDate = wearablesFormatters.shortDate(`${priorYear}-04-24`);
    outcomes.shortDateCoversSameYearPriorYearAndInvalidInput = sameYearDate.includes('24')
      && !sameYearDate.includes(String(currentYear))
      && priorYearDate.includes(String(priorYear))
      && wearablesFormatters.shortDate('not-a-date') === 'not-a-date'
      && wearablesFormatters.shortDate(null) === '';

    return outcomes;
  }, {
    lensUtilsUrl: moduleUrl('/js/lens-local-utils.js'),
    wearablesFormattersUrl: moduleUrl('/js/wearables-formatters.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
