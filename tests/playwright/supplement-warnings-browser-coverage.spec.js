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

test('mitochondrial evidence browser coverage exercises loading lookup matching and context bounds', async ({ page }) => {
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
      let notOkFetchCalls = 0;
      window.fetch = async () => {
        notOkFetchCalls += 1;
        return new Response('[]', { status: 503 });
      };
      const notOk = await import(notOkUrl);
      outcomes.notOkImportStaysCold = notOkFetchCalls === 0;
      await notOk.preloadMitoCompoundData();
      outcomes.notOkDataLoadLeavesLookupEmpty = notOk.lookupMitoCompound('metformin') === null;
      outcomes.notOkDataLoadLeavesScanEmpty =
        notOk.scanSupplementsForWarnings([{ name: 'Metformin' }]).length === 0;
      outcomes.notOkDataLoadAttemptedOnDemand = notOkFetchCalls >= 1
        && notOk.hasMitoCompoundData() === false;

      let throwingFetchCalls = 0;
      window.fetch = async () => {
        throwingFetchCalls += 1;
        throw new Error('offline');
      };
      const thrown = await import(throwUrl);
      outcomes.throwingImportStaysCold = throwingFetchCalls === 0;
      await thrown.preloadMitoCompoundData();
      outcomes.throwingDataLoadLeavesLookupEmpty = thrown.lookupMitoCompound('metformin') === null;
      outcomes.throwingDataLoadLeavesScanEmpty =
        thrown.scanSupplementsForWarnings([{ name: 'Metformin' }]).length === 0;
      outcomes.throwingDataLoadAttemptedOnDemand = throwingFetchCalls >= 1
        && thrown.hasMitoCompoundData() === false;

      let successFetchCalls = 0;
      window.fetch = (...args) => {
        successFetchCalls += 1;
        return savedFetch(...args);
      };
      const warnings = await import(successUrl);
      outcomes.successImportStaysCold = successFetchCalls === 0
        && warnings.hasMitoCompoundData() === false;
      const firstColdScan = warnings.scanSupplementsForWarnings([{ name: 'Metformin' }]);
      const joinedLoad = warnings.preloadMitoCompoundData();
      outcomes.firstScanStartsSingleFlightLoad = firstColdScan.length === 0
        && joinedLoad === warnings.preloadMitoCompoundData()
        && successFetchCalls === 1;
      await joinedLoad;
      await waitUntil(
        () => warnings.lookupMitoCompound('metformin') !== null,
        'mitochondrial compound data',
      );
      outcomes.successfulLoadMarksDataReady = warnings.hasMitoCompoundData() === true;

      const metformin = warnings.lookupMitoCompound(' METFORMIN ');
      const berberine = warnings.lookupMitoCompound('daily berberine HCl capsules');
      const shortAliasExact = warnings.lookupMitoCompound('nr');
      const shortAliasInPhrase = warnings.lookupMitoCompound('daily nr capsules');

      outcomes.lookupExactNormalizesCaseAndTrim = metformin?.name === 'Metformin';
      outcomes.lookupTokenPhraseFindsAlias = berberine?.name === 'Berberine';
      outcomes.lookupShortExactKeywordWorks = shortAliasExact?.name === 'Nicotinamide riboside';
      outcomes.lookupShortKeywordDoesNotWordMatch = shortAliasInPhrase === null;
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
        { name: 'Omega-3 fish oil' },
        { name: 'unknown thing' },
      ]);
      const combinationEvidence = warnings.scanSupplementsForWarnings([
        { name: 'Combination', brand: 'Linezolid', ingredients: [
          { name: 'Sertraline 50 mg' },
          { name: 'Berberine HCl' },
        ] },
      ]);
      const metforminWarning = metforminWarnings.find(item => item.compound === 'Metformin');
      const metforminSearchUrl = metforminWarning?.searchUrl ? new URL(metforminWarning.searchUrl) : null;

      outcomes.scanNullReturnsEmpty = Array.isArray(emptyWarnings) && emptyWarnings.length === 0;
      outcomes.scanDedupesAliasesAndKeepsDistinctCompounds =
        metforminWarnings.filter(item => item.compound === 'Metformin').length === 1
        && metforminWarnings.some(item => item.compound === 'Omega-3 (EPA + DHA)');
      outcomes.scanTracksEveryActiveIngredient =
        combinationEvidence.some(item => item.compound === 'Sertraline')
        && combinationEvidence.some(item => item.compound === 'Berberine');
      outcomes.scanIgnoresBrandAsAnUncuratedCandidate =
        combinationEvidence.every(item => item.compound !== 'Linezolid');
      outcomes.scanBuildsClaimLevelRecord =
        metforminWarning?.summary.includes('acute oral metformin') === true
        && metforminWarning.studyLabel === 'Animal mechanism study'
        && metforminWarning.limitations.includes('does not show mitochondrial injury');
      outcomes.scanIncludesPubMedUrls =
        /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test(metforminWarning?.url || '');
      outcomes.scanIncludesSearchUrls =
        metforminSearchUrl?.hostname === 'pubmed.ncbi.nlm.nih.gov'
        && !!metforminSearchUrl.searchParams.get('term');
      outcomes.directionLabelsDoNotOverstateMechanisticWork =
        warnings.mitochondrialDirectionLabel('mechanism', 'animal_in_vivo') === 'Mechanism, not harm'
        && warnings.mitochondrialDirectionLabel('adverse', 'human_cells') === 'Adverse lab signal'
        && warnings.mitochondrialDirectionLabel('adverse', 'human_observational') === 'Human caution signal'
        && warnings.mitochondrialDirectionLabel('beneficial', 'human_trial') === 'Potential benefit'
        && warnings.mitochondrialDirectionLabel('null', 'human_trial') === 'No effect detected'
        && warnings.mitochondrialDirectionLabel('mixed', 'human_intervention_mechanistic') === 'Mixed finding';

      const boundedContext = warnings.buildMitochondrialEvidenceContext([
        { name: 'Combination', ingredients: [
          { name: 'Sertraline' }, { name: 'Berberine' }, { name: 'Metformin' },
          { name: 'PQQ' }, { name: 'Resveratrol' },
        ] },
      ], { maxItems: 2, maxChars: 1500 });
      outcomes.contextIsBoundedAndCaveated =
        boundedContext.length <= 1500
        && (boundedContext.match(/PMID/g) || []).length <= 2
        && boundedContext.includes('additional verified evidence record(s)')
        && boundedContext.includes('do not advise stopping prescription medication');

      outcomes.humanizeMappedVerbWithContext =
        warnings.humanizeEffect(
          { a: 'inhibits', f: 'Complex I', t: 'high dose' },
          { showContext: true },
        ) === 'may inhibit Complex I (high dose)';
      outcomes.humanizeMappedVerbNoContextField =
        warnings.humanizeEffect({ a: 'binds', f: 'CoQ10' }, { showContext: true }) === 'may bind CoQ10';
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
