import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path, label = 'supplementWarningsCoverage') =>
  `${path}?${label}=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect.soft(passed, name).toBe(true);
  }
}

test('supplement warning browser coverage exercises lookup scan urls and effect labels', async ({ page }) => {
  test.setTimeout(30_000);
  await openBlankPage(page, '/supplement-warnings-browser-coverage');

  const results = await page.evaluate(async ({ successUrl, notOkUrl, throwUrl }) => {
    const outcomes = {};
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 100; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const savedFetch = window.fetch;

    try {
      window.fetch = async () => new Response('[]', { status: 503 });
      const notOk = await import(notOkUrl);
      await wait(0);
      outcomes.notOkDataLoadLeavesLookupEmpty = notOk.lookupMitoCompound('metformin') === null;
      outcomes.notOkDataLoadLeavesScanEmpty =
        notOk.scanSupplementsForWarnings([{ name: 'Metformin' }]).length === 0;

      window.fetch = async () => { throw new Error('offline'); };
      const thrown = await import(throwUrl);
      await wait(0);
      outcomes.throwingDataLoadLeavesLookupEmpty = thrown.lookupMitoCompound('metformin') === null;
      outcomes.throwingDataLoadLeavesScanEmpty =
        thrown.scanSupplementsForWarnings([{ name: 'Metformin' }]).length === 0;

      window.fetch = savedFetch;
      const warnings = await import(successUrl);
      await waitUntil(
        () => warnings.lookupMitoCompound('metformin') !== null,
        'mitochondrial compound data',
      );

      const metformin = warnings.lookupMitoCompound(' METFORMIN ');
      const tylenol = warnings.lookupMitoCompound('daily tylenol tablets');
      const shortAliasExact = warnings.lookupMitoCompound('nac');
      const shortAliasInPhrase = warnings.lookupMitoCompound('daily nac');

      outcomes.lookupExactNormalizesCaseAndTrim = metformin?.name === 'Metformin';
      outcomes.lookupWordBoundaryFindsKeywordInPhrase = tylenol?.name === 'Acetaminophen';
      outcomes.lookupShortExactKeywordWorks = shortAliasExact?.name === 'N-Acetylcysteine';
      outcomes.lookupShortKeywordDoesNotWordMatch = shortAliasInPhrase === null;
      outcomes.lookupRejectsTooShortQueries = warnings.lookupMitoCompound('nr') === null;
      outcomes.lookupMissReturnsNull = warnings.lookupMitoCompound('made-up-compound') === null;

      outcomes.pubmedUrlFormatsPmid =
        warnings.pubmedUrl(39693440) === 'https://pubmed.ncbi.nlm.nih.gov/39693440/';
      outcomes.pubmedSearchUrlDecodesPlusBeforeEncoding =
        warnings.pubmedSearchUrl('alpha+lipoic acid+ROS') ===
        'https://pubmed.ncbi.nlm.nih.gov/?term=alpha%20lipoic%20acid%20ROS';

      const emptyWarnings = warnings.scanSupplementsForWarnings(null);
      const metforminWarnings = warnings.scanSupplementsForWarnings([
        { name: 'Metformin' },
        { name: 'glucophage' },
        { name: 'Coenzyme Q10' },
        { name: 'unknown thing' },
      ]);
      const paraquatWarnings = warnings.scanSupplementsForWarnings([{ name: 'Paraquat' }]);
      const fluoxetineWarnings = warnings.scanSupplementsForWarnings([{ name: 'fluoxetine' }]);
      const protectiveWarnings = warnings.scanSupplementsForWarnings([
        { name: 'CoQ10' },
        { name: 'Melatonin' },
        { name: 'Alpha-Lipoic Acid' },
      ]);
      const metforminWarning = metforminWarnings[0];
      const metforminSearchUrl = metforminWarning?.searchUrl ? new URL(metforminWarning.searchUrl) : null;

      outcomes.scanNullReturnsEmpty = Array.isArray(emptyWarnings) && emptyWarnings.length === 0;
      outcomes.scanDedupesAliases = metforminWarnings.length === 1;
      outcomes.scanUsesOriginalSupplementName = metforminWarning?.match === 'Metformin';
      outcomes.scanBuildsWarningFromLoadedEntry =
        metforminWarning?.warning.startsWith(`${metformin?.name}: `) === true
        && metforminWarning.effects.every(effect => metforminWarning.warning.includes(effect.f));
      outcomes.scanIncludesPubMedUrls =
        /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test(metforminWarning?.url || '');
      outcomes.scanIncludesSearchUrls =
        metforminSearchUrl?.hostname === 'pubmed.ncbi.nlm.nih.gov'
        && !!metforminSearchUrl.searchParams.get('term');
      outcomes.scanIgnoresProtectiveEffects = protectiveWarnings.length === 0;
      outcomes.scanTreatsRedoxCyclesAsHarmful =
        paraquatWarnings[0]?.effects.some(effect => effect.a === 'redox cycles') === true;
      outcomes.scanTreatsIncreasedRosAsHarmful =
        paraquatWarnings[0]?.effects.some(effect => effect.a === 'increases' && effect.f === 'ROS') === true;
      outcomes.scanTreatsDecreasedMembranePotentialAsHarmful =
        fluoxetineWarnings[0]?.effects.some(
          effect => effect.a === 'decreases' && effect.f === 'Membrane potential',
        ) === true;

      outcomes.humanizeMappedVerbWithContext =
        warnings.humanizeEffect(
          { a: 'inhibits', f: 'Complex I', t: 'high dose' },
          { showContext: true },
        ) === 'may inhibit Complex I (high dose)';
      outcomes.humanizeMappedVerbNoContextField =
        warnings.humanizeEffect({ a: 'binds', f: 'CoQ10' }, { showContext: true }) === 'binds CoQ10';
      outcomes.humanizeUnknownVerbSingularizes =
        warnings.humanizeEffect({ a: 'protects', f: 'Complex I' }) === 'may protect Complex I';
      outcomes.humanizeMissingActionDefaults =
        warnings.humanizeEffect({ f: 'Mitochondria' }) === 'may affect Mitochondria';
    } finally {
      window.fetch = savedFetch;
    }

    return outcomes;
  }, {
    successUrl: moduleUrl('/js/supplement-warnings.js', 'success'),
    notOkUrl: moduleUrl('/js/supplement-warnings.js', 'notOk'),
    throwUrl: moduleUrl('/js/supplement-warnings.js', 'throwing'),
  });

  expectAll(results);
});
