import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import {expect, type Locator, type Page} from '@playwright/test';
import {createSvelteFacadePlugin} from '../../scripts/svelte-facade-plugin.mjs';

// Shared read-only static artifact, bundled state and native cache/profile receipts.
// Extracted from the maintained Changelog test; no synthetic application getters.
export const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export interface Asset {path: string; bytes: number; sha256: string}
export interface StateBinding {chunk: string; exportName: string; declaration: string; sourceSHA256: string; keys: string[]}
/** Read-only access to the real shared state export; never install a synthetic app getter. */
async function stateBinding(directory: string, mappings: Array<{module: string; chunks: string[]}>) {
  const original = await fs.readFile('js/state.js', 'utf8');
  function keys(object: ts.ObjectLiteralExpression) {
    return object.properties.map(property => {
      assert(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), 'Literal native state object properties');
      return property.name.text;
    });
  }
  function declarations(source: ts.SourceFile) {
    const found: Array<{name: string; keys: string[]}> = [];
    function walk(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        const names = node.initializer.properties.map(property => 'name' in property && property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null);
        if (names.includes('importedData') && names.includes('currentProfile') && names.includes('profiles')) found.push({name: node.name.text, keys: keys(node.initializer)});
      }
      node.forEachChild(walk);
    }
    walk(source); return found;
  }
  const native = withParsedSource(original, 'js/state.js', declarations);
  assert.equal(native.length, 1, 'Single source-owned state declaration'); assert.equal(native[0]!.name, 'state');
  const mapping = mappings.find(value => value.module === 'js/state.js'); assert(mapping);
  const candidates: StateBinding[] = [];
  for (const chunk of mapping.chunks) {
    const code = await fs.readFile(path.join(directory, chunk.slice(1)), 'utf8');
    withParsedSource(code, chunk.slice(1), source => {
      const matches = declarations(source).filter(value => JSON.stringify(value.keys) === JSON.stringify(native[0]!.keys));
      for (const candidate of matches) for (const statement of source.statements) {
        if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
        for (const exported of statement.exportClause.elements) if ((exported.propertyName ?? exported.name).text === candidate.name)
          candidates.push({chunk, exportName: exported.name.text, declaration: candidate.name, sourceSHA256: sha(original), keys: candidate.keys});
      }
    });
  }
  assert.equal(candidates.length, 1, 'Exactly one real source-mapped shared state export'); return candidates[0]!;
}

async function filesIn(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), {withFileTypes: true})) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(directory, name));
    else {assert(entry.isFile(), 'No non-file artifact entry'); files.push(name);}
  }
  return files.sort();
}
interface ArtifactSourceMap {sources: string[]; sourcesContent: Array<string | null>}
/** Optimized facade maps contain the exact loader wrapper and the complete authored
 * component, rather than the separately bundled development/coverage artifact. */
export async function qualifyArtifactModuleSource(module: string, mappedSource: string | null,
  maps: readonly ArtifactSourceMap[]): Promise<void> {
  if (!/\.svelte\.(?:native|html)\.js$/.test(module)) {
    assert.equal(mappedSource, await fs.readFile(module, 'utf8'), 'Fresh canonical emitted source in actual artifact: ' + module);
    return;
  }
  const producerRoot = process.env['GETBASED_KIT_PRODUCER_ROOT'];
  if (process.env['GITHUB_ACTIONS'] === 'true' && process.env['GETBASED_EXPECTED_KIT_BUILD_ID'])
    assert(producerRoot, 'Verified CI transport requires its producer root');
  if (producerRoot !== undefined) assert(producerRoot.length > 1 && producerRoot.length <= 4096
    && !/[\\\0\r\n]/.test(producerRoot) && path.posix.isAbsolute(producerRoot)
    && path.posix.normalize(producerRoot) === producerRoot && !producerRoot.endsWith('/'), 'Canonical private artifact producer root');
  const plugin = createSvelteFacadePlugin({root: process.cwd(), client: 'kit', ...(producerRoot === undefined ? {} : {facadeRoot: producerRoot})});
  const wrapper = await plugin.load(path.resolve(module));
  assert.equal(typeof wrapper, 'string', 'Exact registered canonical Svelte facade wrapper: ' + module);
  assert.equal(mappedSource, wrapper, 'Fresh canonical optimized Svelte facade wrapper: ' + module);
  const authored = module.replace(/\.(?:native|html)\.js$/, '');
  const current = await fs.readFile(authored, 'utf8');
  let owners = 0;
  for (const map of maps) for (let index = 0; index < map.sources.length; index++) {
    if (!map.sources[index]!.endsWith('/' + authored)) continue;
    assert.equal(map.sourcesContent[index], current, 'Fresh complete authored Svelte owner in actual artifact: ' + authored);
    owners++;
  }
  assert(owners > 0, 'Actual artifact omits authored Svelte owner: ' + authored);
}
/** Require the real bundled sources, not source-module URLs pruned by Kit. */
export async function artifactInputs(modules: readonly string[], stylesheets: readonly string[]) {
  const directory = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const files: Asset[] = [], mappings: Array<{module: string; sourceBytes: number; sourceSHA256: string; chunks: string[]}> = [];
  const names = await filesIn(directory);
  for (const name of names) {
    const raw = await fs.readFile(path.join(directory, name)); files.push({path: '/' + name, bytes: raw.length, sha256: sha(raw)});
  }
  const maps = await Promise.all(names.filter(name => name.startsWith('_app/immutable/') && name.endsWith('.js.map'))
    .map(async name => ({name, map: JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as {sources: string[]; sourcesContent: Array<string | null>}})));
  for (const module of modules) {
    const current = await fs.readFile(module, 'utf8'), chunks: string[] = [];
    for (const {name, map} of maps) for (let index = 0; index < map.sources.length; index++) {
      if (!map.sources[index]!.endsWith('/' + module)) continue;
      await qualifyArtifactModuleSource(module, map.sourcesContent[index] ?? null, maps.map(entry => entry.map));
      chunks.push('/' + name.slice(0, -4));
    }
    assert(chunks.length > 0, 'Actual artifact omits feature module: ' + module);
    mappings.push({module, sourceBytes: Buffer.byteLength(current), sourceSHA256: sha(current), chunks: [...new Set(chunks)]});
  }
  for (const css of stylesheets)
    assert.deepEqual(await fs.readFile(path.join(directory, css)), await fs.readFile(css), 'Fresh canonical CSS in static artifact: ' + css);
  const sw = await fs.readFile(path.join(directory, 'service-worker.js'), 'utf8');
  const version = await fs.readFile(path.join(directory, 'version.js'), 'utf8');
  const shellMatch = sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/), buildId = sw.match(/const BUILD_ID = '([^']+)';/)?.[1];
  assert(shellMatch && buildId, 'Actual static worker shell/build identity');
  assert(version.includes("self.APP_BUILD_ID = '" + buildId + "';"), 'Worker/version build identity');
  const shell = JSON.parse(shellMatch[1]!) as string[];
  const cachePaths = shell.filter(url => /^\/_app\/immutable\/.*\.(js|css)$/.test(url));
  cachePaths.push(...shell.filter(url => url.endsWith('.css') && !url.startsWith('/_app/immutable/')), '/index.html', '/version.js');
  for (const required of stylesheets.map(css => '/' + css)) assert(cachePaths.includes(required), 'Native feature CSS cached');
  assert.equal(new Set(cachePaths).size, cachePaths.length, 'Unique cached runtime dependencies');
  for (const url of cachePaths) {assert(shell.includes(url)); assert(files.some(file => file.path === url));}
  for (const mapping of mappings) for (const url of mapping.chunks) assert(cachePaths.includes(url), 'feature chunk in actual APP_SHELL');
  const servedSw = sw.replace(/const BUILD_ID = '[^']*';/, "const BUILD_ID = 'kit-test-a';")
    .replace('const APP_SHELL = [', "const APP_SHELL = [\n  '/js/bundle-legacy-probe-AAA.js',");
  const servedVersion = version.replace(/self.APP_BUILD_ID = '[^']*';/, "self.APP_BUILD_ID = 'kit-test-a';");
  const state = await stateBinding(directory, mappings);
  const actualVersion = (await fs.readFile('version.js', 'utf8')).match(/self\.APP_VERSION = ['"]([^'"]+)['"];/)?.[1];
  assert(actualVersion, 'Actual canonical application version');
  return {directory, buildId, state, appVersion: actualVersion, files, artifactSHA256: sha(JSON.stringify(files)), mappings, cachePaths,
    servedWorkerSHA256: sha(servedSw), servedVersion: {path: '/version.js', bytes: Buffer.byteLength(servedVersion), sha256: sha(servedVersion)}};
}
export async function profile(page: Page, binding: StateBinding) {
  return page.evaluate(async ({chunk, exportName}) => {
    const namespace = await import(chunk) as Record<string, unknown>;
    const live = namespace[exportName];
    if (typeof live !== 'object' || live === null || !('importedData' in live) || !('profiles' in live) || !('currentProfile' in live)) throw new Error('Missing actual bundled native state');
    const key = 'labcharts-default-imported';
    if (live.currentProfile !== 'default' || localStorage.getItem('labcharts-active-profile') !== 'default'
      || localStorage.getItem('labcharts-encryption-enabled') === 'true' || localStorage.getItem(key) !== null) throw new Error('Native IDB default profile boundary');
    const open = indexedDB.open('labcharts-blobs', 1); open.onupgradeneeded = () => open.transaction?.abort();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);});
    try {
      const tx = db.transaction('kv', 'readonly'), request = tx.objectStore('kv').get(key);
      const rawCommitted = await new Promise<string>((resolve, reject) => {
        tx.oncomplete = () => typeof request.result === 'string' ? resolve(request.result) : reject(new Error('Missing whole committed profile'));
        tx.onabort = () => reject(tx.error || new Error('Native IDB read aborted')); tx.onerror = () => reject(tx.error || request.error);
      });
      return {live: JSON.parse(JSON.stringify(live.importedData)) as Record<string, unknown>,
        profiles: JSON.parse(JSON.stringify(live.profiles)) as unknown, current: live.currentProfile,
        rawCommitted, stored: JSON.parse(rawCommitted) as Record<string, unknown>,
        rawProfiles: localStorage.getItem('labcharts-profiles'), active: localStorage.getItem('labcharts-active-profile')};
    } finally {db.close();}
  }, binding);
}
export async function cacheReceipt(page: Page, artifact: Awaited<ReturnType<typeof artifactInputs>>) {
  const observed = await page.evaluate(async paths => {
    if (!navigator.serviceWorker.controller) throw new Error('Native controlling worker required');
    const entries = [];
    for (const path of paths) {
      const response = await caches.match(new URL(path, location.origin).href);
      if (!response?.ok) throw new Error('Missing actual cached feature dependency: ' + path);
      const bytes = await response.arrayBuffer();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      entries.push({path, bytes: bytes.byteLength, sha256});
    }
    return {controller: navigator.serviceWorker.controller.scriptURL, keys: await caches.keys(), entries,
      registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => registration.active?.scriptURL ?? null)};
  }, artifact.cachePaths);
  expect(new URL(observed.controller).pathname).toBe('/service-worker.js'); expect(observed.registrations).toEqual([observed.controller]);
  for (const entry of observed.entries) expect(entry).toEqual(entry.path === '/version.js'
    ? artifact.servedVersion : artifact.files.find(file => file.path === entry.path));
  return observed;
}
export async function activate(page: Page, control: Locator) {
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await control.tap(); else await control.click();
}
