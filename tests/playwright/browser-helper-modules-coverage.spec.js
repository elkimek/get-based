import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?browserHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/browser-helper-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/browser-helper-coverage', { waitUntil: 'load' });
}

test('browser helper coverage exercises url safety markdown brand assets and health goals', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ brandAssetsUrl, healthGoalsUrl, markdownUrl, urlSafetyUrl }) => {
    const [brandAssets, healthGoals, markdown, urlSafety] = await Promise.all([
      import(brandAssetsUrl),
      import(healthGoalsUrl),
      import(markdownUrl),
      import(urlSafetyUrl),
    ]);
    const outcomes = {};
    const isValidUrl = urlSafety.isValidExternalUrl;

    const blockedUrls = [
      'not a url',
      'ftp://example.com/file',
      'https://localhost/private',
      'https://127.0.0.1/private',
      'https://0.0.0.0/private',
      'https://api.local/private',
      'https://10.1.2.3/private',
      'https://172.16.0.1/private',
      'https://172.31.255.255/private',
      'https://192.168.0.1/private',
      'https://169.254.169.254/latest/meta-data',
      'https://100.64.1.2/private',
      'https://224.0.0.1/private',
      'https://168.63.129.16/metadata',
      'https://[::]/private',
      'https://[fc00::1]/private',
      'https://[fe80::1]/private',
    ];

    outcomes.urlAllowsPublicHttpsHosts = isValidUrl('https://example.com/path?q=1')
      && isValidUrl('https://[2606:4700:4700::1111]/dns-query');
    outcomes.urlBlocksPrivateMetadataAndInvalidHosts = blockedUrls.every(url => !isValidUrl(url));
    outcomes.urlOptionsControlHttpAndLocalhost = isValidUrl('http://example.com/api', { requireHttps: false })
      && !isValidUrl('http://example.com/api')
      && isValidUrl('http://localhost:11434/api', { requireHttps: false, allowLocalhost: true })
      && !isValidUrl('http://localhost:11434/api', { requireHttps: false });
    outcomes.urlBlocksEmbeddedPrivateIpv4Forms = !isValidUrl('https://[::ffff:c0a8:0101]/private')
      && !isValidUrl('https://[2002:c0a8:0101::]/private');

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
    const polarFallbackMark = brandAssets.brandMarkMono('polar');
    outcomes.brandMarksUseThemeAssetsAndFallbackMasks = withingsDarkMark.includes('/brands/withings/wordmark-on-dark.svg')
      && withingsDarkMark.includes('height="24"')
      && withingsLightMark.includes('/brands/withings/wordmark-on-light.svg')
      && withingsLightMark.includes('height="20"')
      && polarFallbackMark.includes('wearable-vendor-mark')
      && polarFallbackMark.includes('/brands/polar/mark-mono.svg')
      && brandAssets.brandMarkMono('missing') === '';
    outcomes.brandMetadataCoversOfficialFallbackAndUnknownVendors = brandAssets.brandAsset('whoop')?.mode === 'official'
      && brandAssets.brandAsset('missing') === null
      && brandAssets.brandHasSignIn('fitbit', 'dark') === true
      && brandAssets.brandHasSignIn('polar', 'dark') === false
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
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
