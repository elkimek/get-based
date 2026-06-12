import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?browserHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/browser-helper-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/browser-helper-coverage', { waitUntil: 'load' });
}

test('browser helper coverage exercises url safety marker keys markdown brand assets and health goals', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ brandAssetsUrl, healthGoalsUrl, markdownUrl, urlSafetyUrl, utilsUrl }) => {
    const [brandAssets, healthGoals, markdown, urlSafety, utils] = await Promise.all([
      import(brandAssetsUrl),
      import(healthGoalsUrl),
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
      'diabetes.insulin_d',
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
      && utils.sanitizeMarkerKey('diabetes.insulin_d') === 'diabetes.insulin_d'
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
      utils.maybeShowAnalyticsConsent();
      utils.maybeShowAnalyticsConsent();
      const banner = document.getElementById('analytics-consent-banner');
      const analyticsBannerRendersOnce = document.querySelectorAll('#analytics-consent-banner').length === 1
        && banner?.getAttribute('role') === 'region'
        && document.body.classList.contains('analytics-consent-visible');
      utils.dismissAnalyticsConsent();
      const analyticsDismissMarksSeenAndRemovesBanner =
        localStorage.getItem('labcharts-analytics-consent-seen') === '1'
        && !document.getElementById('analytics-consent-banner')
        && !document.body.classList.contains('analytics-consent-visible');

      for (const key of analyticsKeys) localStorage.removeItem(key);
      utils.maybeShowAnalyticsConsent();
      utils.dismissAnalyticsConsentAndDisable();
      outcomes.analyticsConsentHelpersCoverStorageBannerAndDisable =
        analyticsCanEnable
        && analyticsCanDisable
        && analyticsBannerRendersOnce
        && analyticsDismissMarksSeenAndRemovesBanner
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
    markdownUrl: moduleUrl('/js/markdown.js'),
    urlSafetyUrl: moduleUrl('/js/url-safety.js'),
    utilsUrl: moduleUrl('/js/utils.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
