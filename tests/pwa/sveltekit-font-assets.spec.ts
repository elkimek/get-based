import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import {expect, test, type Page} from '@playwright/test';
import {parseAppShellEntries} from '../../scripts/app-shell-budget.mjs';
import {startKitServer} from './kit-server.js';

const artifact = path.resolve(process.env.GETBASED_KIT_ARTIFACT || '.local-notes/sveltekit-build');
const fontPrefix = '/vendor/fonts/';
const isFont = (url: string) => url.startsWith(fontPrefix) && url.endsWith('.woff2');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout: 30_000});
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 30_000}).toBe(true);
}
async function noCspErrors(page: Page) {
  expect(await page.evaluate(() => (window as Window & {fontCsp?: string[]}).fontCsp ?? [])).toEqual([]);
}

test.use({serviceWorkers: 'allow'});
test('shared font bytes retain every legacy alias and canonical face after offline cold launch', async ({page, context}, testInfo) => {
  test.setTimeout(150_000);
  const directory = path.join(artifact, 'vendor/fonts');
  const filenames = (await fs.readdir(directory)).filter(name => name.endsWith('.woff2')).sort();
  expect(filenames).toHaveLength(55);
  const hashes = new Map(await Promise.all(filenames.map(async name => [fontPrefix + name,
    createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')] as const)));
  const stylesheet = postcss.parse(await fs.readFile(path.join(directory, 'fonts.css'), 'utf8'));
  const referenced = new Set<string>();
  const families = new Map<string, Set<string>>();
  let faces = 0;
  stylesheet.walkAtRules('font-face', rule => {
    faces++;
    let family = '', weight = '';
    rule.walkDecls(declaration => {
      if (declaration.prop === 'font-family') family = declaration.value.replace(/^['"]|['"]$/g, '');
      if (declaration.prop === 'font-weight') weight = declaration.value;
      if (declaration.prop === 'src') {
        const filename = /^url\('\.\/([^']+)'\) format\('woff2'\)$/.exec(declaration.value)?.[1];
        expect(filename).toBeTruthy(); referenced.add(fontPrefix + filename!);
      }
    });
    if (!families.has(family)) families.set(family, new Set());
    families.get(family)!.add(weight);
  });
  expect(faces).toBe(55); expect(referenced.size).toBe(18);
  expect([...families.keys()].sort()).toEqual(['Inter', 'JetBrains Mono', 'Outfit', 'VT323']);
  const canonical = [...referenced].sort();
  const canonicalHashes = new Set(canonical.map(url => hashes.get(url)));
  expect(canonicalHashes.size).toBe(18); expect(canonicalHashes.has(undefined)).toBe(false);
  for (const [url, hash] of hashes) expect(canonicalHashes.has(hash), `public alias bytes: ${url}`).toBe(true);
  const precacheFonts = parseAppShellEntries(await fs.readFile(path.join(artifact, 'service-worker.js'), 'utf8')).filter(isFont).sort();
  expect(precacheFonts).toEqual(canonical);

  const errors: string[] = [];
  const attach = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  attach(page); context.on('page', attach);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({accepted: true,
      termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice',
      acceptedAt: '2026-10-15T00:00:00.000Z', appVersion: 'font-assets-test', location: 'local-test'}));
    for (const [key, value] of Object.entries({'labcharts-default-onboarded': 'profile-set',
      'labcharts-default-emptyTour': 'completed', 'labcharts-default-tour': 'completed',
      'labcharts-default-ai-reminder-dismissed': '1', 'labcharts-onboard-extras-done-default': '1',
      'labcharts-onboard-provider-skipped-default': '1', 'labcharts-analytics-consent-seen': '1'})) localStorage.setItem(key, value);
    (window as Window & {fontCsp?: string[]}).fontCsp = [];
    document.addEventListener('securitypolicyviolation', event => {
      (window as Window & {fontCsp?: string[]}).fontCsp!.push(event.violatedDirective);
    });
  });
  const server = await startKitServer(artifact);
  await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  try {
    await page.goto(server.origin + '/app?dev-sw=1', {waitUntil: 'load'}); await ready(page);
    const cachedFonts = await page.evaluate(async () => {
      const urls = new Set<string>();
      for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/vendor/fonts/') && url.pathname.endsWith('.woff2')) urls.add(url.pathname);
      }
      return [...urls].sort();
    });
    expect(cachedFonts).toEqual(canonical); await noCspErrors(page); expect(errors).toEqual([]);
    await page.close(); server.state.offline = true;
    const cold = await context.newPage();
    const offlineFontResponses: {url: string; probe: string | null; fromServiceWorker: boolean}[] = [];
    cold.on('response', response => {
      const url = new URL(response.url());
      if (isFont(url.pathname)) offlineFontResponses.push({url: url.pathname, probe: response.request().headers()['x-getbased-font-probe'] ?? null, fromServiceWorker: response.fromServiceWorker()});
    });
    await cold.goto(server.origin + '/app?dev-sw=1', {waitUntil: 'load'}); await ready(cold);
    const offlineHashes = await cold.evaluate(async urls => {
      const results: {url: string; status: number; sha256: string}[] = [];
      for (const url of urls) {
        const response = await fetch(url, {cache: 'reload', headers: {'X-Getbased-Font-Probe': url}});
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        results.push({url, status: response.status, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')});
      }
      return results;
    }, [...hashes.keys()].sort());
    expect(offlineHashes).toHaveLength(55);
    for (const result of offlineHashes) {expect(result.status).toBe(200); expect(result.sha256).toBe(hashes.get(result.url));}
    // Firefox reports the canonical response URL for a worker-returned alias.
    // Associate each original request by its unique header, preserving exact
    // per-alias service-worker evidence instead of relying on response URL text.
    expect(offlineFontResponses.filter(response => response.probe !== null)).toHaveLength(55);
    for (const url of hashes.keys()) {
      const responses = offlineFontResponses.filter(response => response.probe === url);
      expect(responses, `exact offline font probe: ${url}`).toHaveLength(1);
      expect(responses[0]!.fromServiceWorker, `offline worker font: ${url}`).toBe(true);
    }
    const afterAliasFonts = await cold.evaluate(async () => {
      const urls = new Set<string>();
      for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/vendor/fonts/') && url.pathname.endsWith('.woff2')) urls.add(url.pathname);
      }
      return [...urls].sort();
    });
    expect(afterAliasFonts).toEqual(canonical);
    const requests = [...families].flatMap(([family, weights]) => [...weights].map(weight => ({family, weight,
      text: family === 'Inter' || family === 'JetBrains Mono'
        ? 'Settings Žluťoučký kůň Ελληνικά ἀρχή Кириллица Ѣ Tiếng Việt'
        : 'Settings Žluťoučký kůň Tiếng Việt'})));
    const fontLoads = await cold.evaluate(async requests => {
      const results = [];
      for (const request of requests) {
        const descriptor = `${request.weight} 20px "${request.family}"`;
        const loaded = await document.fonts.load(descriptor, request.text);
        results.push({...request, count: loaded.length, loaded: loaded.every(face => face.status === 'loaded'), available: document.fonts.check(descriptor, request.text)});
      }
      await document.fonts.ready; return results;
    }, requests);
    expect(fontLoads).toHaveLength(11);
    for (const result of fontLoads) {expect(result.count, `${result.family} ${result.weight}`).toBeGreaterThan(0); expect(result.loaded).toBe(true); expect(result.available).toBe(true);}
    await noCspErrors(cold); expect(errors).toEqual([]);
    await testInfo.attach('offline-font-assets.json', {body: JSON.stringify({physicalUrls: [...hashes], canonical,
      precacheFonts, cachedFonts, afterAliasFonts, offlineHashes, offlineFontResponses, fontLoads,
      scope: 'Synthetic profile; actual first SW install and offline new-document launch; no external providers or live data.'}, null, 2), contentType: 'application/json'});
  } finally {await server.close();}
});
