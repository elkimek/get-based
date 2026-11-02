import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { expect, it } from 'vitest';
import { collectRawModuleAssets } from '../scripts/raw-module-assets.mjs';
import { productionRawModuleAssets, pruneSourceModuleAppShell } from '../scripts/build-production.mjs';
import { inlineServiceWorkerAssets } from '../scripts/service-worker-source.js';
import { parseAppShellEntries } from '../scripts/app-shell-budget.mjs';

it('retains recursive runtime imports, exports and literal lazy imports through cycles', async () => {
  const modules = new Map([
    ['/js/worker.js', `import './shared.js'; export { answer } from './export.js'; import('./lazy.js?retry=1'); import('https://cdn.test/model.js'); // import './comment.js'`],
    ['/js/shared.js', `import './worker.js'; import '../shared/deep.mjs'; const text = "import './text.js'";`],
    ['/js/export.js', 'export const answer = 42;'], ['/js/lazy.js', 'export {};'], ['/shared/deep.mjs', 'export {};'],
  ]);
  const reads: string[] = [];
  const result = await collectRawModuleAssets(new Set(['/js/worker.js']), async url => { reads.push(url); if (!modules.has(url)) throw new Error(url); return modules.get(url)!; });
  expect([...result].sort()).toEqual([...modules.keys()].sort());
  expect(reads).toHaveLength(modules.size);
});
it('rejects missing dependencies and unsupported local import types', async () => {
  await expect(collectRawModuleAssets(new Set(['/js/worker.js']), async url => { if (url.endsWith('missing.js')) throw new Error('Missing emitted module'); return `import './missing.js';`; })).rejects.toThrow('Missing emitted module');
  await expect(collectRawModuleAssets(new Set(['/js/worker.js']), async () => `import './data.json';`)).rejects.toThrow('not JavaScript');
});
it('retains the actual Knowledge Base and voice worker graph in the pruned production shell', async () => {
  const assets = await productionRawModuleAssets();
  for (const file of ['lens-local-worker', 'lens-local-utils', 'lens-local-store', 'lens-local-embedder-config', 'lens-local-ingest', 'lens-local-library-registry', 'caught-error', 'unique-id', 'voice-local-stt-worker', 'voice-local-tts-worker', 'voice-model-catalog']) expect(assets.has(`/js/${file}.js`)).toBe(true);
  const worker = inlineServiceWorkerAssets(await fs.readFile('service-worker.js', 'utf8'), await fs.readFile('service-worker-assets.js', 'utf8'));
  const pruned = pruneSourceModuleAppShell(worker, assets);
  for (const url of assets) {
    expect(pruned).toContain(`'${url}'`);
    expect(parseAppShellEntries(pruned)).toContain(url);
  }
  expect(pruned).not.toContain("'/js/main.js'");
  expect(() => pruneSourceModuleAppShell(worker.replace("'/js/caught-error.js',", ''), assets)).toThrow('missing from APP_SHELL');
});

it('never joins retained worker dependencies or vendor assets to a preceding line comment', () => {
  const source = `const APP_SHELL = [
  // PRODUCTION_BUNDLE_ASSETS_END
  '/js/bundled-a.js', '/js/keep-a.js', '/vendor/crypto.js',
  '/js/bundled-b.js', '/js/keep-b.js',
];`;
  const raw = new Set(['/js/keep-a.js', '/js/keep-b.js']);
  const pruned = pruneSourceModuleAppShell(source, raw);
  expect(parseAppShellEntries(pruned)).toEqual(['/js/keep-a.js', '/vendor/crypto.js', '/js/keep-b.js']);
  expect(pruned).toContain('// PRODUCTION_BUNDLE_ASSETS_END\n');
});


const rawURLSpellings = [
  "'/js/keep.js'",
  '"/js/keep.js"',
  '`/js/keep.js`',
  String.raw`'/j\x73/keep.js'`,
];

it.each(rawURLSpellings)('retains required raw URLs independent of literal spelling: %s', spelling => {
  const worker = `const APP_SHELL = ["/index.html", ${spelling}, "/js/bundled.js", "/vendor/sdk.js"];`;
  const pruned = pruneSourceModuleAppShell(worker, new Set(['/js/keep.js']));
  expect(parseAppShellEntries(pruned)).toEqual(['/index.html', '/js/keep.js', '/vendor/sdk.js']);
  expect(pruned).toContain(spelling);
});

it.each(rawURLSpellings)('prunes bundled URLs independent of literal spelling: %s', spelling => {
  const worker = `const APP_SHELL = ["/index.html", ${spelling}, "/vendor/sdk.js"];`;
  expect(parseAppShellEntries(pruneSourceModuleAppShell(worker, new Set())))
    .toEqual(['/index.html', '/vendor/sdk.js']);
});

it('rejects an absent required raw dependency even with other mixed-quoted entries', () => {
  const worker = 'const APP_SHELL = ["/js/other.js", "/vendor/sdk.js"];';
  expect(() => pruneSourceModuleAppShell(worker, new Set(['/js/keep.js'])))
    .toThrow('Raw module asset is missing from APP_SHELL: /js/keep.js');
});

it.each([
  ['first', '"/js/drop.js", "/js/keep.js"'],
  ['middle', '"/index.html", "/js/drop.js", "/js/keep.js"'],
  ['last without trailing comma', '"/js/keep.js", "/js/drop.js"'],
  ['last with trailing comma', '"/js/keep.js", "/js/drop.js",'],
  ['adjacent', '"/js/drop-a.js", "/js/drop-b.js", "/js/keep.js",'],
])('removes the %s entry without array holes or URL reordering', (_label, body) => {
  const source = `const APP_SHELL = [${body}];`;
  const result = parseAppShellEntries(pruneSourceModuleAppShell(source, new Set(['/js/keep.js'])));
  expect(result).toEqual(body.startsWith('"/index.html"') ? ['/index.html', '/js/keep.js'] : ['/js/keep.js']);
});

it('can remove every bundled entry without leaving an omitted element', () => {
  expect(parseAppShellEntries(pruneSourceModuleAppShell(
    'const APP_SHELL = ["/js/one.js", `/js/two.js`];', new Set(),
  ))).toEqual([]);
});

it('preserves every comment and all unrelated bytes around exact literal/comma removals', () => {
  const prefix = 'const decoy = "APP_SHELL = [\\\"/js/decoy.js\\\"]";\n';
  const suffix = '\nconst untouched = "/js/after.js";';
  const source = prefix + `const APP_SHELL = [
  // PRODUCTION_BUNDLE_ASSETS_END and "/js/comment.js",
  "/js/one.js" /* keep first separator comment */ ,
  "/js/keep.js", '/js/two.js', // keep this line comment
  "/vendor/sdk.js", "/js/three.js" /* keep final comment */
];` + suffix;
  const expected = prefix + `const APP_SHELL = [
  // PRODUCTION_BUNDLE_ASSETS_END and "/js/comment.js",
   /* keep first separator comment */\x20
  "/js/keep.js",  // keep this line comment
  "/vendor/sdk.js",  /* keep final comment */
];` + suffix;
  const actual = pruneSourceModuleAppShell(source, new Set(['/js/keep.js']));
  expect(actual).toBe(expected);
  expect(parseAppShellEntries(actual)).toEqual(['/js/keep.js', '/vendor/sdk.js']);
});

it.each([
  'const APP_SHELL = ["/js/same.js", "/js/same.js"];',
  String.raw`const APP_SHELL = ["/js/same.js", '/j\x73/same.js'];`,
  'const APP_SHELL = []; const APP_SHELL = [];',
  'const APP_SHELL = ["/js/open.js";',
  'const APP_SHELL = [, "/js/omitted.js"];',
  'const APP_SHELL = ["/js/first.js",,];',
  'const APP_SHELL = [runtimeURL];',
  'const APP_SHELL = [`/js/${name}.js`];',
  'const APP_SHELL = [...otherAssets];',
])('fails closed on an unqualified APP_SHELL: %s', source => {
  expect(() => pruneSourceModuleAppShell(source, new Set())).toThrow();
});

const previouslyQuoteRetained = [
  '/js/sidebar-presentation.js',
  '/js/components/ConditionalSidebarItem.svelte.html.js',
  '/js/components/SidebarCategoryItem.svelte.html.js',
  '/js/components/SidebarNavigation.svelte.html.js',
  '/js/dashboard-biometric-presentation.js',
  '/js/components/DashboardBiometricsOverview.svelte.native.js',
  '/js/components/DashboardBiometricSyncStatus.svelte.html.js',
  '/js/components/DashboardBiometricTile.svelte.html.js',
  '/js/components/DashboardBiometricsOverview.svelte.html.js',
  '/js/category-page-presentation.js',
  '/js/components/CategoryPageRangeEmptyState.svelte.html.js',
  '/js/components/CategoryMarkerDataGaps.svelte.html.js',
  '/js/components/CategoryPageChrome.svelte.html.js',
  '/js/components/CategoryPageViewBody.svelte.html.js',
  '/js/category-presentation.js',
  '/js/components/CategoryRangeRail.svelte.html.js',
  '/js/components/CategoryChartCard.svelte.html.js',
  '/js/components/CategoryTableColgroup.svelte.html.js',
  '/js/components/CategoryScrollableTable.svelte.html.js',
  '/js/components/CategoryDataTable.svelte.html.js',
  '/js/components/CategoryHeatmap.svelte.html.js',
  '/js/components/CategoryFattyAcids.svelte.html.js',
];

it('keeps precisely the genuine raw graph and public files while pruning bundled source entries', async () => {
  const raw = await productionRawModuleAssets();
  expect([...raw].sort()).toEqual([
    '/js/analytics-bootstrap.js', '/js/caught-error.js',
    '/js/components/VersionUpdateBody.svelte.html.js', '/js/components/VersionUpdateCopy.svelte.html.js',
    '/js/extra-theme-bootstrap.js',
    '/js/knowledge-change-authorization.js', '/js/knowledge-document-commit.js', '/js/knowledge-document-model.js', '/js/knowledge-document-source.js',
    '/js/knowledge-file-descriptor.js', '/js/knowledge-import-commit.js', '/js/knowledge-import-model.js', '/js/knowledge-import-source.js',
    '/js/knowledge-library-commit.js', '/js/knowledge-library-proposals.js', '/js/knowledge-library-source.js', '/js/knowledge-reviewed-changes.js',
    '/js/legal-consent-bootstrap.js',
    '/js/lens-local-embedder-config.js', '/js/lens-local-ingest.js', '/js/lens-local-library-registry.js',
    '/js/lens-local-lock.js', '/js/lens-local-store.js', '/js/lens-local-utils.js', '/js/lens-local-worker-dispatch.js', '/js/lens-local-worker.js',
    '/js/service-worker-update.js', '/js/theme-bootstrap.js', '/js/unique-id.js',
    '/js/version-update-rendering.js', '/js/voice-local-stt-worker.js',
    '/js/voice-local-tts-worker.js', '/js/voice-model-catalog.js',
    '/shared/agent-data-contract.js', '/vendor/sha256.js',
  ]);
  expect(previouslyQuoteRetained).toHaveLength(22);
  const beforeFiles = await Promise.all(previouslyQuoteRetained.map(url => fs.readFile(url.slice(1))));
  const source = inlineServiceWorkerAssets(await fs.readFile('service-worker.js', 'utf8'), await fs.readFile('service-worker-assets.js', 'utf8'));
  const original = parseAppShellEntries(source);
  for (const url of previouslyQuoteRetained) {
    expect(original).toContain(url);
    expect(raw.has(url)).toBe(false);
  }
  const pruned = parseAppShellEntries(pruneSourceModuleAppShell(source, raw));
  expect(pruned.filter(url => url.startsWith('/js/') && url.endsWith('.js')).sort()).toEqual([...raw].filter(url => url.startsWith('/js/')).sort());
  const bundledShared = ['/shared/agent-host-protocol.js', '/shared/agent-tool-contract.js', '/shared/persona-control-contract.js', '/shared/ai-tool-protocol.js', '/shared/chat-tool-instructions.js', '/shared/chat-review-contract.js', '/shared/chat-turn-outcome.js', '/shared/chat-tool-activity.js', '/shared/agent-control-contract.js', '/shared/app-navigation-contract.js', '/shared/chat-control-policy.js', '/shared/comparison-view-contract.js', '/shared/context-preference-contract.js', '/shared/conversation-search-contract.js', '/shared/correlation-view-contract.js', '/shared/dashboard-control-contract.js', '/shared/history-view-contract.js', '/shared/lab-ordering-control-contract.js', '/shared/lab-overlay-contract.js', '/shared/meal-route-control-contract.js'];
  expect(original.filter(url => url.startsWith('/shared/'))).toEqual([bundledShared[0], bundledShared[1], '/shared/agent-data-contract.js', ...bundledShared.slice(2)]);
  expect(pruned.filter(url => url.startsWith('/shared/'))).toEqual(['/shared/agent-data-contract.js']);
  expect(pruned).toContain('/vendor/sha256.js');
  expect(pruned.filter(url => !/^\/(?:js|shared)\/.*\.js$/.test(url)))
    .toEqual(original.filter(url => !/^\/(?:js|shared)\/.*\.js$/.test(url)));
  for (const url of bundledShared) expect(raw.has(url)).toBe(false);
  for (const url of previouslyQuoteRetained) expect(pruned).not.toContain(url);
  const afterFiles = await Promise.all(previouslyQuoteRetained.map(url => fs.readFile(url.slice(1))));
  assert.deepEqual(afterFiles, beforeFiles);
});


it.each([
  ['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r'], ['line separator', '\u2028'], ['paragraph separator', '\u2029'],
])('preserves exact %s line endings in comments before commas and retained entries', (_name, lineEnd) => {
  const beforeComma = 'const APP_SHELL = ["/js/drop.js" // retain comment' + lineEnd + ', "/js/keep.js"];';
  const expectedBeforeComma = 'const APP_SHELL = [ // retain comment' + lineEnd + ' "/js/keep.js"];';
  const beforeRetained = 'const APP_SHELL = ["/js/drop.js", // retain comment' + lineEnd + '"/js/keep.js"];';
  const expectedBeforeRetained = 'const APP_SHELL = [ // retain comment' + lineEnd + '"/js/keep.js"];';
  const keep = new Set(['/js/keep.js']);
  expect(pruneSourceModuleAppShell(beforeComma, keep)).toBe(expectedBeforeComma);
  expect(pruneSourceModuleAppShell(beforeRetained, keep)).toBe(expectedBeforeRetained);
  expect(parseAppShellEntries(expectedBeforeComma)).toEqual(['/js/keep.js']);
  expect(parseAppShellEntries(expectedBeforeRetained)).toEqual(['/js/keep.js']);
});

it('retains transitive raw shared modules while pruning bundled shared siblings', () => {
  const input = 'const APP_SHELL = ["/js/worker.js", "/shared/needed.js", "/shared/bundled.js", "/shared/readme.txt", "/css/app.css"];';
  const output = pruneSourceModuleAppShell(input, new Set(['/js/worker.js', '/shared/needed.js']));
  expect(parseAppShellEntries(output)).toEqual(['/js/worker.js', '/shared/needed.js', '/shared/readme.txt', '/css/app.css']);
});
