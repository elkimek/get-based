import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?browserHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/browser-helper-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/browser-helper-coverage', { waitUntil: 'load' });
}

test('browser helper coverage exercises url safety marker keys markdown legal lens brand assets and health goals', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({
    brandAssetsUrl,
    healthGoalsUrl,
    legalConsentUrl,
    lensLocalStoreUrl,
    markdownUrl,
    urlSafetyUrl,
    utilsUrl,
  }) => {
    const [brandAssets, healthGoals, legalConsent, lensLocalStore, markdown, urlSafety, utils] = await Promise.all([
      import(brandAssetsUrl),
      import(healthGoalsUrl),
      import(legalConsentUrl),
      import(lensLocalStoreUrl),
      import(markdownUrl),
      import(urlSafetyUrl),
      import(utilsUrl),
    ]);
    const outcomes = {};
    const isValidUrl = urlSafety.isValidExternalUrl;

    const blockedUrlCases = [
      ['invalidInput', 'not a url'],
      ['ftpProtocol', 'ftp://example.com/file'],
      ['localhost', 'https://localhost/private'],
      ['loopbackIpv4', 'https://127.0.0.1/private'],
      ['zeroIpv4', 'https://0.0.0.0/private'],
      ['localDomain', 'https://api.local/private'],
      ['rfc1918Ten', 'https://10.1.2.3/private'],
      ['rfc1918172Start', 'https://172.16.0.1/private'],
      ['rfc1918172End', 'https://172.31.255.255/private'],
      ['rfc1918C', 'https://192.168.0.1/private'],
      ['linkLocalMetadata', 'https://169.254.169.254/latest/meta-data'],
      ['carrierGradeNat', 'https://100.64.1.2/private'],
      ['multicastIpv4', 'https://224.0.0.1/private'],
      ['azureMetadata', 'https://168.63.129.16/metadata'],
      ['zeroIpv6', 'https://[::]/private'],
      ['ulaIpv6', 'https://[fc00::1]/private'],
      ['linkLocalIpv6', 'https://[fe80::1]/private'],
    ];

    outcomes.urlAllowsPublicHttpsHosts = isValidUrl('https://example.com/path?q=1')
      && isValidUrl('https://[2606:4700:4700::1111]/dns-query');
    for (const [name, url] of blockedUrlCases) {
      outcomes[`urlBlocks_${name}`] = !isValidUrl(url);
    }
    outcomes.urlOptionsControlHttpAndLocalhost = isValidUrl('http://example.com/api', { requireHttps: false })
      && !isValidUrl('http://example.com/api')
      && isValidUrl('http://localhost:11434/api', { requireHttps: false, allowLocalhost: true })
      && !isValidUrl('http://localhost:11434/api', { requireHttps: false });
    outcomes.urlBlocksEmbeddedPrivateIpv4Forms = !isValidUrl('https://[::ffff:c0a8:0101]/private')
      && !isValidUrl('https://[2002:c0a8:0101::]/private');

    outcomes.safeMarkerIdAcceptsStrictMarkerIds = [
      'biochemistry.glucose',
      'diabetes.insulin_legacy',
      'biochemistry_glucose',
      'metabolomix.5_h_indoleacetic_acid',
      'cat_marker_with_underscores',
    ].every(id => utils.safeMarkerId(id) === id);
    outcomes.safeMarkerIdDocumentsInjectionSafeDotSegmentIds = [
      '.',
      '.foo',
      'foo.',
    ].every(id => utils.safeMarkerId(id) === id);
    outcomes.safeMarkerIdRejectsInlineHandlerAndProtoInputs = [
      "foo.b'ar",
      'foo.b"ar',
      'foo.b\\ar',
      'foo.<script>',
      'foo. bar',
      'foo.\nbar',
      'foo.bar()',
      '',
      `a.${'b'.repeat(200)}`,
      '__proto__.bar',
      'foo.__proto__',
      'foo.constructor',
      'prototype.bar',
      '__proto__',
      null,
      undefined,
      42,
      {},
    ].every(id => utils.safeMarkerId(id) === null);
    outcomes.sanitizeMarkerKeyCleansAllowedPartsAndRejectsUnsafeShapes =
      utils.sanitizeMarkerKey('biochemistry.glucose') === 'biochemistry.glucose'
      && utils.sanitizeMarkerKey("bio'chem.glu cose") === 'biochem.glucose'
      && utils.sanitizeMarkerKey('diabetes.insulin_legacy') === 'diabetes.insulin_legacy'
      && [
        'biochemistryglucose',
        '.glucose',
        'biochemistry.',
        null,
        42,
        '\'"<>.glucose',
        'biochemistry.\'"<>',
        '__proto__.bar',
        'foo.__proto__',
        'foo.constructor',
        'prototype.foo',
      ].every(key => utils.sanitizeMarkerKey(key) === null);

    const analyticsKeys = ['labcharts-analytics-disabled', 'labcharts-analytics-consent-seen'];
    const oldAnalytics = {};
    for (const key of analyticsKeys) oldAnalytics[key] = localStorage.getItem(key);
    try {
      for (const key of analyticsKeys) localStorage.removeItem(key);
      document.body.classList.remove('analytics-consent-visible');
      document.getElementById('analytics-consent-banner')?.remove();

      utils.setAnalyticsEnabled(true);
      const analyticsCanEnable = utils.isAnalyticsEnabled()
        && localStorage.getItem('labcharts-analytics-disabled') === 'false';
      utils.setAnalyticsEnabled(false);
      const analyticsCanDisable = !utils.isAnalyticsEnabled()
        && localStorage.getItem('labcharts-analytics-disabled') === 'true';

      utils.setAnalyticsEnabled(true);
      const blocker = document.createElement('div');
      blocker.id = 'context-hub-overlay';
      blocker.className = 'confirm-overlay show';
      document.body.appendChild(blocker);
      utils.maybeShowAnalyticsConsent();
      const analyticsDefersBehindModal =
        utils.isStartupNudgeBlocked()
        && !document.getElementById('analytics-consent-banner')
        && !document.body.classList.contains('analytics-consent-visible');
      blocker.remove();
      utils.maybeShowAnalyticsConsent();
      const resumedBanner = document.getElementById('analytics-consent-banner');
      const analyticsResumesAfterModal =
        !!resumedBanner
        && document.querySelectorAll('#analytics-consent-banner').length === 1
        && document.body.classList.contains('analytics-consent-visible');
      resumedBanner?.remove();
      document.body.classList.remove('analytics-consent-visible');

      utils.maybeShowAnalyticsConsent();
      utils.maybeShowAnalyticsConsent();
      const banner = document.getElementById('analytics-consent-banner');
      const analyticsBannerRendersOnce = document.querySelectorAll('#analytics-consent-banner').length === 1
        && banner?.getAttribute('role') === 'region'
        && !!banner?.querySelector('[data-analytics-consent-action="dismiss"]')
        && !!banner?.querySelector('[data-analytics-consent-action="disable"]')
        && document.body.classList.contains('analytics-consent-visible');
      banner?.querySelector('[data-analytics-consent-action="dismiss"]')?.click();
      const analyticsDismissMarksSeenAndRemovesBanner =
        localStorage.getItem('labcharts-analytics-consent-seen') === '1'
        && !document.getElementById('analytics-consent-banner')
        && !document.body.classList.contains('analytics-consent-visible');
      utils.maybeShowAnalyticsConsent();
      const analyticsSeenConsentSuppressesBanner =
        localStorage.getItem('labcharts-analytics-consent-seen') === '1'
        && !document.getElementById('analytics-consent-banner')
        && !document.body.classList.contains('analytics-consent-visible');

      for (const key of analyticsKeys) localStorage.removeItem(key);
      utils.maybeShowAnalyticsConsent();
      document.querySelector('#analytics-consent-banner [data-analytics-consent-action="disable"]')?.click();
      outcomes.analyticsConsentHelpersCoverStorageBannerAndDisable =
        analyticsCanEnable
        && analyticsCanDisable
        && analyticsDefersBehindModal
        && analyticsResumesAfterModal
        && analyticsBannerRendersOnce
        && analyticsDismissMarksSeenAndRemovesBanner
        && analyticsSeenConsentSuppressesBanner
        && localStorage.getItem('labcharts-analytics-disabled') === 'true'
        && localStorage.getItem('labcharts-analytics-consent-seen') === '1'
        && !document.getElementById('analytics-consent-banner')
        && !document.body.classList.contains('analytics-consent-visible');
    } finally {
      document.getElementById('analytics-consent-banner')?.remove();
      document.body.classList.remove('analytics-consent-visible');
      for (const key of analyticsKeys) {
        if (oldAnalytics[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldAnalytics[key]);
      }
    }

    const normalizedLibraries = lensLocalStore.normaliseLibraryRegistry({
      activeId: 'missing',
      revision: '4',
      updatedAt: '10',
      libraries: [
        { id: 'lib-primary', name: '', createdAt: 5, model: 'small' },
        { id: 'lib-primary', name: 'Duplicate' },
        { id: 'bad id', name: 'Unsafe' },
      ],
    });
    const sameLibraries = lensLocalStore.normaliseLibraryRegistry({
      ...normalizedLibraries,
      libraries: normalizedLibraries?.libraries.map(record => ({ ...record })),
    });
    outcomes.lensLocalStoreNormalizesValidatesComparesAndMatchesModels =
      normalizedLibraries?.activeId === 'lib-primary'
      && normalizedLibraries.libraries[0].name === 'primary'
      && normalizedLibraries.revision === 4
      && lensLocalStore.sameLibraryRegistry(normalizedLibraries, sameLibraries)
      && lensLocalStore.normaliseLibraryRecord({ id: 'default', createdAt: 1 })?.name === 'My Library'
      && lensLocalStore.isSafeLibraryId('safe_library-1')
      && !lensLocalStore.isSafeLibraryId('unsafe library')
      && lensLocalStore.fallbackLibraryName('lib-recovered_name') === 'recovered name'
      && lensLocalStore.modelKeyFromManifest(
        { modelId: 'model-small', dim: 384 },
        { small: { id: 'model-small', dim: 384 } },
      ) === 'small';

    const legalKey = 'labcharts-legal-acceptance';
    const oldLegalAcceptance = localStorage.getItem(legalKey);
    try {
      localStorage.removeItem(legalKey);
      document.getElementById('legal-consent-overlay')?.remove();
      document.body.classList.remove('legal-consent-visible');
      const firstShow = legalConsent.maybeShowLegalConsentGate();
      const checkbox = document.getElementById('legal-consent-checkbox');
      const acceptButton = document.querySelector('[data-legal-consent-action="accept"]');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      const buttonEnabled = acceptButton.disabled === false;
      acceptButton.click();
      const accepted = legalConsent.getLegalAcceptance();
      outcomes.legalConsentGatePersistsAndClosesThroughDelegatedEvents =
        firstShow === true
        && buttonEnabled
        && accepted?.accepted === true
        && typeof accepted.acceptedAt === 'string'
        && legalConsent.hasAcceptedCurrentLegal()
        && !legalConsent.isLegalConsentGateVisible()
        && !document.body.classList.contains('legal-consent-visible');
    } finally {
      document.getElementById('legal-consent-overlay')?.remove();
      document.body.classList.remove('legal-consent-visible');
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      if (oldLegalAcceptance == null) localStorage.removeItem(legalKey);
      else localStorage.setItem(legalKey, oldLegalAcceptance);
    }

    const inlineHtml = markdown.applyInlineMarkdown(
      '**bold** and *italic* with `code`, [safe](https://example.com/"quoted"), [bad](javascript:alert(1)), https://docs.example/path and <script>'
    );
    outcomes.inlineMarkdownEscapesFormatsAndLinks = inlineHtml.includes('<strong>bold</strong>')
      && inlineHtml.includes('<em>italic</em>')
      && inlineHtml.includes('<code>code</code>')
      && inlineHtml.includes('href="https://example.com/&quot;quoted&quot;"')
      && inlineHtml.includes('href="#"')
      && inlineHtml.includes('href="https://docs.example/path"')
      && inlineHtml.includes('&lt;script&gt;')
      && !inlineHtml.includes('javascript:');

    const blockHtml = markdown.renderMarkdown([
      '# Heading',
      '> quoted **text**',
      '| Marker | Value |',
      '|---|---|',
      '| LDL | <img src=x onerror=alert(1)> |',
      '- first',
      '+ second',
      '1. ordered',
      '2) also ordered',
      '---',
      '```js',
      'const x = <tag>;',
      '```',
      '```',
      'plain *callout*',
      '```',
      'paragraph line',
      'continued',
    ].join('\n'));
    const fixture = document.getElementById('fixture');
    fixture.innerHTML = blockHtml;
    outcomes.blockMarkdownCoversRenderShapes = blockHtml.includes('class="chat-h1"')
      && blockHtml.includes('<blockquote class="chat-blockquote">')
      && blockHtml.includes('<table class="chat-table">')
      && blockHtml.includes('<ul class="chat-list">')
      && blockHtml.includes('<ol class="chat-list">')
      && blockHtml.includes('<hr class="chat-hr">')
      && blockHtml.includes('<pre class="chat-code-block">')
      && blockHtml.includes('<div class="chat-callout">')
      && blockHtml.includes('<div class="chat-para">paragraph line continued</div>');
    outcomes.renderedMarkdownDoesNotCreateDangerousTags = !fixture.querySelector('script,img')
      && fixture.textContent.includes('LDL')
      && fixture.textContent.includes('const x = <tag>;');

    document.documentElement.setAttribute('data-theme', 'dark');
    const withingsDarkMark = brandAssets.brandMarkMono('withings', { size: 24 });
    document.documentElement.setAttribute('data-theme', 'light');
    const withingsLightMark = brandAssets.brandMarkMono('withings', { size: 20 });
    document.documentElement.setAttribute('data-theme', 'dark');
    const appleHealthFallbackMark = brandAssets.brandMarkMono('apple_health');
    outcomes.brandMarksUseThemeAssetsAndFallbackMasks = withingsDarkMark.includes('/brands/withings/wordmark-on-dark.svg')
      && withingsDarkMark.includes('height="24"')
      && withingsLightMark.includes('/brands/withings/wordmark-on-light.svg')
      && withingsLightMark.includes('height="20"')
      && appleHealthFallbackMark.includes('wearable-vendor-mark')
      && appleHealthFallbackMark.includes('/brands/apple-health/mark-mono.svg')
      && brandAssets.brandMarkMono('missing') === '';
    outcomes.brandMetadataCoversOfficialFallbackAndUnknownVendors = brandAssets.brandAsset('whoop')?.mode === 'official'
      && brandAssets.brandAsset('missing') === null
      && brandAssets.brandHasSignIn('fitbit', 'dark') === true
      && brandAssets.brandHasSignIn('apple_health', 'dark') === false
      && brandAssets.brandSignInUrl('fitbit', 'light').endsWith('/brands/fitbit/sign-in-dark.png')
      && brandAssets.brandSignInUrl('missing') === null
      && brandAssets.brandColor('withings') === '#00B0EA'
      && brandAssets.brandColor('oura') === null;

    outcomes.healthGoalsFormatsCurrentArray = healthGoals.formatHealthGoalsText([
      { text: ' Lower A1c ' },
      { text: '' },
      { text: null },
      { text: 'Lift twice' },
      { text: 'Hydrate' },
      { text: 'Sleep earlier' },
    ]) === 'Lower A1c; Lift twice; Hydrate';
    outcomes.healthGoalsHonorsCustomLimit = healthGoals.formatHealthGoalsText([
      { text: 'One' },
      { text: 'Two' },
      { text: 'Three' },
    ], 2) === 'One; Two';
    outcomes.healthGoalsFormatsLegacyObject = healthGoals.formatHealthGoalsText({ goals: ' Reduce winter SAD ' }) === 'Reduce winter SAD';
    outcomes.healthGoalsHandlesMissingStorageShapes = healthGoals.formatHealthGoalsText(null) === ''
      && healthGoals.formatHealthGoalsText({}) === ''
      && healthGoals.formatHealthGoalsText({ goals: null }) === '';

    return outcomes;
  }, {
    brandAssetsUrl: moduleUrl('/js/brand-assets.js'),
    healthGoalsUrl: moduleUrl('/js/health-goals-utils.js'),
    legalConsentUrl: moduleUrl('/js/legal-consent.js'),
    lensLocalStoreUrl: moduleUrl('/js/lens-local-store.js'),
    markdownUrl: moduleUrl('/js/markdown.js'),
    urlSafetyUrl: moduleUrl('/js/url-safety.js'),
    utilsUrl: moduleUrl('/js/utils.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
