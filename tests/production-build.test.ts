import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {parseModuleSpecifiers} from '../scripts/architecture-map.mjs';
import {parseAppShellEntries} from '../scripts/app-shell-budget.mjs';
import {buildSvelteKit} from '../scripts/build-sveltekit.mjs';
import {createStaticBuildFingerprint} from '../scripts/static-build-inputs.mjs';
import {handleBuildLog, productionRawModuleAssets, pruneSourceModuleAppShell} from '../scripts/static-build-assets.mjs';
import {inlineServiceWorkerAssets, readServiceWorkerSource} from '../scripts/service-worker-source.js';
import {enforceSvelteKitResourceBudget, measureSvelteKitResources} from '../scripts/sveltekit-resource-budget.mjs';

const root = process.cwd();
const origin = 'https://production-contract.invalid';
const generatedPattern = /^\/_app\/immutable\/(?:entry|chunks|nodes)\/[A-Za-z0-9_.-]+\.js$/;
const bootstrapPattern = /^\/js\/kit-bootstrap-[a-f0-9]{16}\.js$/;
let outputRoot: string;
let ownedOutput: string | undefined;
let metrics: Record<string, unknown>;
let worker: string;
let shell: string[];
let generated: string[];
let index: string;
let entryPoints: string[];
let sdkExternalImporter: string | undefined;
let resourceBudget: ReturnType<typeof enforceSvelteKitResourceBudget>;
const sources = new Map<string, string>();
const graph = new Map<string, ReturnType<typeof parseModuleSpecifiers>>();
const sourceMaps = new Map<string, readonly string[]>();

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  return value;
}
async function filesIn(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat().sort();
}
function target(specifier: string, importer: string): string {
  if (specifier === 'node:async_hooks') {
    assert.equal(importer, sdkExternalImporter, 'Only the independently qualified SDK fallback is external');
    return specifier;
  }
  const url = new URL(specifier, new URL(importer, origin));
  assert.equal(url.origin, origin, 'Generated imports stay within the static artifact');
  assert.equal(url.hash, '', 'Generated imports have no fragment-only identity');
  return url.pathname + url.search;
}
function closure(roots: readonly string[], dynamic: boolean): Set<string> {
  const reached = new Set<string>();
  const visit = (url: string): void => {
    if (reached.has(url)) return;
    reached.add(url);
    for (const edge of graph.get(url)?.dependencies ?? []) {
      if (dynamic || edge.kind === 'static') visit(target(edge.specifier, url));
    }
  };
  roots.forEach(visit);
  return reached;
}

beforeAll(async () => {
  // An explicit artifact never silently falls back to a fresh build. CI builds
  // once after catalog resolution and reuses these exact bytes for both gates.
  if (process.env.GETBASED_KIT_ARTIFACT) {
    outputRoot = await fs.realpath(process.env.GETBASED_KIT_ARTIFACT);
  } else {
    ownedOutput = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-production-kit-test-'));
    outputRoot = ownedOutput;
    await buildSvelteKit({outputRoot});
  }
  assert((await fs.stat(outputRoot)).isDirectory());
  for (const file of ['index.html', 'build-metrics.json', 'version.js', 'service-worker.js']) {
    assert((await fs.lstat(path.join(outputRoot, file))).isFile(), 'Regular artifact entry: ' + file);
  }
  metrics = object(JSON.parse(await fs.readFile(path.join(outputRoot, 'build-metrics.json'), 'utf8')));
  assert.equal(metrics.framework, 'SvelteKit 3 / Svelte 5');
  assert.equal(metrics.static, true);
  assert(typeof metrics.buildId === 'string' && /^[a-f0-9]{64}$/.test(metrics.buildId));
  const revision = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const inventory = execFileSync('git', ['--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding: 'utf8'}).split('\0');
  const current = await createStaticBuildFingerprint(root, revision, '', inventory);
  assert.equal(metrics.revision, revision, 'Artifact revision matches the checkout');
  assert.equal(metrics.verificationDigest, current.verificationDigest, 'Artifact matches every current authored/build input');
  assert.equal(metrics.sourceInputCount, current.sourceFiles.length, 'Complete current source inventory');
  const rawAssets = await productionRawModuleAssets();
  const rawWorker = pruneSourceModuleAppShell(inlineServiceWorkerAssets(
    await fs.readFile('service-worker.js', 'utf8'), await fs.readFile('service-worker-assets.js', 'utf8'),
  ), rawAssets);
  // These five bodies are intentionally assembled; their independent contracts
  // below check the document, identity, worker and companion. All copied public
  // bodies, including physically retained font/SQLite aliases, must stay exact.
  const assembled = new Set(['/app', '/index.html', '/version.js', '/service-worker-assets.js', '/getbased-companion.mjs']);
  for (const url of parseAppShellEntries(rawWorker)) {
    if (assembled.has(url)) continue;
    const supplied = await fs.realpath(path.join(outputRoot, url.slice(1)));
    assert(supplied.startsWith(outputRoot + path.sep), 'Public asset stays inside the artifact: ' + url);
    assert.deepEqual(await fs.readFile(supplied), await fs.readFile(path.join(root, url.slice(1))), 'Exact current public asset: ' + url);
  }
  worker = await readServiceWorkerSource(relative => fs.readFile(path.join(outputRoot, relative), 'utf8'));
  shell = parseAppShellEntries(worker);
  index = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
  const dom = new JSDOM(index);
  try {
    const preload = [...dom.window.document.querySelectorAll('link[rel="modulepreload"]')]
      .map(element => element.getAttribute('href')!);
    const bootstrap = [...dom.window.document.querySelectorAll('script[src]')]
      .map(element => element.getAttribute('src')!).filter(url => bootstrapPattern.test(url));
    assert.equal(bootstrap.length, 1, 'Exactly one external executable Kit bootstrap');
    const bootstrapSource = await fs.readFile(path.join(outputRoot, bootstrap[0]!.slice(1)), 'utf8');
    const bootstrapImports = parseModuleSpecifiers(bootstrapSource, bootstrap[0]!).dependencies;
    assert.equal(bootstrapImports.length, 2, 'Actual Kit start and application roots');
    assert(bootstrapImports.every(edge => edge.kind === 'dynamic'));
    entryPoints = [...new Set([...preload, ...bootstrapImports.map(edge => target(edge.specifier, bootstrap[0]!))])];
    assert(entryPoints.length > 0);
    const framework = (await filesIn(path.join(outputRoot, '_app'))).filter(file => file.endsWith('.js'));
    generated = [...framework.map(file => '/' + path.relative(outputRoot, file).replaceAll(path.sep, '/')), ...bootstrap].sort();
  } finally {
    dom.window.close();
  }
  for (const url of generated) {
    const source = await fs.readFile(path.join(outputRoot, url.slice(1)), 'utf8');
    sources.set(url, source);
    graph.set(url, parseModuleSpecifiers(source, url));
    if (generatedPattern.test(url)) {
      // Vite-generated facades/helpers can legitimately have no source map.
      // Authored owners below still require their real maps and lazy placement.
      const directives = [...source.matchAll(/^\/\/# sourceMappingURL=([^\r\n]*)\r?$/gm)];
      assert(directives.length <= 1, 'Unique generated source-map directive: ' + url);
      if (directives.length) {
        const directive = directives[0]!;
        assert(directive.index !== undefined);
        assert.equal(source.slice(directive.index + directive[0].length).trim(), '', 'Trailing generated source-map directive: ' + url);
        assert.equal(directive[1], path.posix.basename(url) + '.map', 'Exact adjacent generated source map: ' + url);
        const map = object(JSON.parse(await fs.readFile(path.join(outputRoot, url.slice(1) + '.map'), 'utf8')));
        assert(Array.isArray(map.sources));
        const entries: unknown[] = map.sources;
        assert(entries.every((entry): entry is string => typeof entry === 'string'));
        sourceMaps.set(url, entries);
      }
    }
  }
  // The locked Svelte server renderer has one optional Node import used by
  // its asynchronous render callback and caught by the SDK. It is an external
  // graph leaf, never an HTTP/precache resource. Qualify the complete existing
  // emitted SDK and mapped source bytes; no other bare, Node or foreign import
  // acquires this exception.
  const external = [...graph].flatMap(([url, module]) => module.dependencies
    .filter(edge => !edge.specifier.startsWith('.') && !edge.specifier.startsWith('/'))
    .map(edge => ({url, ...edge})));
  assert.equal(external.length, 1, 'Exactly one locked SDK external literal edge');
  const sdkEdge = external[0]!;
  assert.deepEqual({kind: sdkEdge.kind, specifier: sdkEdge.specifier}, {
    kind: 'dynamic', specifier: 'node:async_hooks',
  });
  assert.equal(object(JSON.parse(await fs.readFile('node_modules/svelte/package.json', 'utf8'))).version, '5.57.1');
  assert.equal(createHash('sha256').update(sources.get(sdkEdge.url)!).digest('hex'),
    'abdf1a51dd479b1c17b56a67452b1f4d8099bb32870b9ef0284c3800a0390ff8',
    'Complete accepted SDK chunk retains its async callback and caught import');
  const sdkMap = object(JSON.parse(await fs.readFile(path.join(outputRoot, sdkEdge.url.slice(1) + '.map'), 'utf8')));
  const sdkSources = sourceMaps.get(sdkEdge.url);
  assert(sdkSources, 'The SDK external has its real qualified source map');
  assert.deepEqual(sdkMap.sources, sdkSources);
  assert(Array.isArray(sdkMap.sourcesContent));
  const contents: unknown[] = sdkMap.sourcesContent;
  assert.equal(contents.length, sdkSources.length);
  for (const [file, expectedHash] of [
    ['render-context.js', 'a02c2b5342d85c65699188def837e12a34fbc737fcae20c8d5e7a59dd19a5b14'],
    ['renderer.js', 'd906ae970adb0270c41e539bfac06d327284c124e276a3fbc6ba5eee24472ae1'],
  ] as const) {
    const owner = 'node_modules/svelte/src/internal/server/' + file;
    const positions: number[] = sdkSources.flatMap((source, index) => source.endsWith('/' + owner) ? [index] : []);
    assert.equal(positions.length, 1, 'Unique actual mapped SDK owner: ' + owner);
    const installed = await fs.readFile(owner, 'utf8');
    assert.equal(createHash('sha256').update(installed).digest('hex'), expectedHash, 'Locked SDK source: ' + owner);
    assert.equal(contents[positions[0]!], installed, 'Actual generated map retains the complete installed SDK owner');
    if (file === 'render-context.js') {
      assert(installed.includes("als_import ??= import('node:async_hooks')"));
      assert(installed.includes('.then(noop, noop);'));
    } else {
      assert(installed.includes('init_render_context().then(() =>'));
      assert(installed.includes('with_render_context(() => Renderer.#render_async(component, options))'));
    }
  }
  sdkExternalImporter = sdkEdge.url;
  const policy: unknown = JSON.parse(await fs.readFile('scripts/sveltekit-resource-budget.json', 'utf8'));
  resourceBudget = enforceSvelteKitResourceBudget(await measureSvelteKitResources({
    serviceWorkerSource: worker, artifactRoot: outputRoot, generatedJavaScriptUrls: generated,
  }), policy);
  assert.deepEqual(metrics.resourceBudget, resourceBudget, 'Recorded policy, compression and offline bytes match independently measured bodies');
// One actual Vite+Kit/SSR/prerender build, companion build, source/public-byte
// qualification and Brotli accounting replaces two native builds. This bounds
// the integration hook, not any application performance or resource ceiling.
}, 90_000);

afterAll(async () => {
  if (ownedOutput) await fs.rm(ownedOutput, {recursive: true, force: true});
});

describe('shipping SvelteKit production build', () => {
  it('pins the same build identity into the app and worker without changing the release version', async () => {
    const version = await fs.readFile(path.join(outputRoot, 'version.js'), 'utf8');
    const source = await fs.readFile('version.js', 'utf8');
    const id = version.match(/APP_BUILD_ID = '([a-f0-9]{64})'/)?.[1];
    expect(id).toBe(metrics.buildId);
    expect(worker).toContain(`const BUILD_ID = '${id}';`);
    expect(version).toContain(source.trim());
    const bootstrap = generated.find(url => bootstrapPattern.test(url))!;
    expect(sources.get(bootstrap)).toContain(`version: "${id}"`);
    expect(JSON.parse(await fs.readFile(path.join(outputRoot, '_app/version.json'), 'utf8'))).toEqual({version: id});
  });

  it('changes cache identity for authored inputs and build tags while retaining revision as independent provenance', async () => {
    const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-production-identity-'));
    try {
      await fs.mkdir(path.join(fixture, 'js'));
      await fs.writeFile(path.join(fixture, 'js/entry.ts'), 'export const value = 1;\n');
      const identify = async (revision = 'a'.repeat(40), tag = '') => {
        const value = await createStaticBuildFingerprint(fixture, revision, tag, []);
        return {...value, hash: value.fingerprint.digest('hex')};
      };
      const first = await identify();
      expect(first.sourceFiles).toEqual(['js/entry.ts']);
      const nextRevision = await identify('b'.repeat(40));
      expect(nextRevision.hash).toBe(first.hash);
      expect(nextRevision.verificationDigest).not.toBe(first.verificationDigest);
      expect((await identify('a'.repeat(40), 'next-release')).hash).not.toBe(first.hash);
      await fs.writeFile(path.join(fixture, 'js/entry.ts'), 'export const value = 2;\n');
      const changed = await identify();
      expect(changed.hash).not.toBe(first.hash);
      expect(changed.verificationDigest).not.toBe(first.verificationDigest);
    } finally {
      await fs.rm(fixture, {recursive: true, force: true});
    }
  });

  it('keeps repository HTML pointed at the native development entry', async () => {
    const sourceIndex = await fs.readFile('index.html', 'utf8');
    expect(sourceIndex).toContain('<script type="module" src="js/main.js"></script>');
    expect(sourceIndex).not.toMatch(/<script type="module" src="js\/bundle-main-[^"]+\.js"><\/script>/);
  });

  it('rejects ineffective dynamic imports instead of shipping misleading lazy boundaries', () => {
    expect(() => handleBuildLog('warn', {
      code: 'INEFFECTIVE_DYNAMIC_IMPORT', message: 'already statically imported',
    }, () => {})).toThrow(/INEFFECTIVE_DYNAMIC_IMPORT/);
  });

  it('enforces the approved shipping resource policy and reports the complete generated graph', () => {
    expect(generated).toHaveLength(count(metrics.javascriptFiles));
    expect([...sources.values()].reduce((bytes, source) => bytes + Buffer.byteLength(source), 0)).toBe(metrics.javascriptDecodedBytes);
    expect(shell).toHaveLength(count(metrics.appShellResources));
    expect(resourceBudget.metrics.offlinePrecache.decodedBytes).toBe(metrics.appShellDecodedBytes);
    expect(resourceBudget.metrics.offlinePrecache.decodedBytes).toBeLessThanOrEqual(resourceBudget.checks.effectiveMaximumDecodedBytes);
    expect(closure(entryPoints, false).size).toBeGreaterThan(0);
    expect(closure(entryPoints, true).size).toBeGreaterThan(closure(entryPoints, false).size);
    // Startup and first-use transfer are independently enforced for every one
    // of 12 real browser journeys by the ordinary performance:check CI step.
  });

  it('keeps every inbound sync reconciliation owner out of the startup static closure', () => {
    const startup = closure(entryPoints, false);
    const reachable = closure(entryPoints, true);
    for (const owner of ['routstr-balance-settlement', 'sync-apply', 'sync-chat-merge', 'sync-evolu8-candidate', 'wearables-credential-vault']) {
      const chunks: string[] = [];
      for (const [url, entries] of sourceMaps) {
        if (entries.some(source => source.endsWith('/js/' + owner + '.js'))) chunks.push(url);
      }
      expect(chunks, owner + ' has one real emitted owner').toHaveLength(1);
      expect(startup.has(chunks[0]!), owner + ' is not eager').toBe(false);
      expect(reachable.has(chunks[0]!), owner + ' remains a reachable lazy feature').toBe(true);
    }
  });

  it('points production HTML at hashed Kit entries while preserving the early welcome paint and CSP', () => {
    const dom = new JSDOM(index);
    try {
      const scripts = [...dom.window.document.querySelectorAll('script')];
      expect(scripts.filter(script => bootstrapPattern.test(script.getAttribute('src') ?? ''))).toHaveLength(1);
      expect(scripts.filter(script => script.textContent?.trim() && script.type !== 'application/json')).toEqual([]);
      expect(scripts.some(script => script.getAttribute('src') === '/js/legal-consent-bootstrap.js')).toBe(true);
      expect(entryPoints.some(url => /^\/_app\/immutable\/entry\/start\.[A-Za-z0-9_-]+\.js$/.test(url))).toBe(true);
      expect(entryPoints.some(url => /^\/_app\/immutable\/entry\/app\.[A-Za-z0-9_-]+\.js$/.test(url))).toBe(true);
    } finally {
      dom.window.close();
    }
    expect(index).not.toContain('<script type="module" src="js/main.js"></script>');
    expect(index).toContain('data-prerendered-welcome');
    expect(index).toContain('data-dashboard-welcome-action="open-chat"');
    expect(index).toContain('Chat starts with the basics');
  });

  it('emits the standalone Linux companion download beside the hosted app', async () => {
    const companion = await fs.readFile(path.join(outputRoot, 'getbased-companion.mjs'), 'utf8');
    expect(companion.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(companion).toContain('getbased-companion install');
  });

  it('keeps emitted chunk names and all parsed generated references inside the complete static artifact', async () => {
    const names = new Set(generated);
    expect(names.size).toBe(metrics.javascriptFiles);
    let references = 0;
    for (const url of generated) {
      expect(generatedPattern.test(url) || bootstrapPattern.test(url), url).toBe(true);
      for (const edge of graph.get(url)!.dependencies) {
        references++;
        if (edge.specifier === 'node:async_hooks') {
          expect(edge.kind).toBe('dynamic');
          expect(target(edge.specifier, url)).toBe('node:async_hooks');
          continue;
        }
        expect(edge.specifier.startsWith('.') || edge.specifier.startsWith('/'), edge.specifier).toBe(true);
        const dependency = target(edge.specifier, url);
        const pathname = new URL(dependency, origin).pathname;
        const actual = await fs.realpath(path.join(outputRoot, pathname.slice(1)));
        expect(actual.startsWith(outputRoot + path.sep), dependency).toBe(true);
        expect((await fs.stat(actual)).isFile(), dependency).toBe(true);
        if (pathname.startsWith('/_app/')) expect(names.has(pathname), dependency).toBe(true);
      }
    }
    expect(references).toBeGreaterThan(0);
  });

  it('pre-caches every generated lazy chunk and preserves every exact raw worker dependency for installed offline use', async () => {
    expect(new Set(shell).size).toBe(shell.length);
    for (const url of generated) expect(shell.filter(entry => entry === url), url).toHaveLength(1);
    for (const url of ['/js/main.js', '/js/views.js', '/js/chat-layout.js', '/js/agent-chat-client.js']) expect(shell).not.toContain(url);
    for (const url of [
      '/js/theme-bootstrap.js', '/js/extra-theme-bootstrap.js', '/js/analytics-bootstrap.js',
      '/js/legal-consent-bootstrap.js', '/js/service-worker-update.js', '/js/lens-local-worker.js',
      '/js/lens-local-utils.js', '/js/lens-local-store.js', '/service-worker-runtime.js',
    ]) expect(shell.filter(entry => entry === url), url).toHaveLength(1);
    for (const url of await productionRawModuleAssets()) expect(shell.filter(entry => entry === url), url).toHaveLength(1);
    expect(await fs.readFile(path.join(outputRoot, 'service-worker-runtime.js'), 'utf8')).toContain('installServiceWorkerRuntime');
    expect(resourceBudget.metrics.offlinePrecache.resources).toBe(shell.length);
    expect(resourceBudget.metrics.offlinePrecache.decodedBytes).toBeLessThanOrEqual(resourceBudget.checks.maximumDecodedBytes);
    expect(resourceBudget.metrics.offlinePrecache.decodedBytes).toBeLessThanOrEqual(resourceBudget.checks.maximumReferenceGrowthDecodedBytes);
  });

  it('keeps both Evolu runtimes beside their complete database workers in production', () => {
    const generatedSource = [...sources.values()].join('\n');
    expect(generatedSource).toContain('../vendor/evolu/evolu-bundle.js');
    expect(generatedSource).toContain('../vendor/evolu8/evolu-bundle.js');
    expect(generatedSource).not.toContain('Db.worker.js');
    for (const url of [
      '/vendor/evolu/evolu-bundle.js', '/vendor/evolu/Db.worker.js',
      '/vendor/evolu8/evolu-bundle.js', '/vendor/evolu8/Db.worker.js', '/vendor/evolu8/Shared.worker.js',
    ]) expect(shell.filter(entry => entry === url), url).toHaveLength(1);
  });

  it('keeps the cold Latin body font from repainting the mobile LCP text', async () => {
    const fonts = await fs.readFile('vendor/fonts/fonts.css', 'utf8');
    expect(fonts).toMatch(/font-weight: 400;\s+font-display: optional;\s+src: url\('\.\/inter-400-7\.woff2'\)/);
  });
});
