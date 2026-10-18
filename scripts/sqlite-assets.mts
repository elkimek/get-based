import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseAppShellEntries } from './app-shell-budget.mjs';

// A closed, independently byte-qualified migration between these public trees.
// Neither Evolu runtime nor its workers are interchangeable; only these four
// complete SQLite payload pairs may share one current-build cache entry.
const SQLITE_PAIRS = [
  ['sqlite3-bundler-friendly.mjs', 454803,
    '1d1cea8bbf10d173ab29d003e1197db2aca7f29a23a7a4320f5cfe77ce4e3243'],
  ['sqlite3.wasm', 1036167,
    'e0e94e4ac5221c19aefe7e59fe88ceab93bff56ec1d966c21c6cf39ac0f26735'],
  ['sqlite3-opfs-async-proxy.js', 21051,
    'cf58af5a6384d81dc958fd7933be7517d6521e51918c629be2686b6713d656dd'],
  ['sqlite3-worker1-bundler-friendly.mjs', 1533,
    '7b771d35011172c6e24cafad78dec56704fc36584715d633adab8d8af7bea259'],
] as const;

interface SqliteAssetOptions {
  sourceRoot: string;
  assetRoot?: string;
  read?: (file: string) => Promise<Buffer>;
}
interface PackageProvenance {
  version: string;
  integrity: string;
}
interface Manifest {
  schemaVersion: number;
  packages: Record<string, PackageProvenance>;
  assets: Array<{ source: string; output: string; sha256: string }>;
}
interface Inventory {
  components: Array<{ name: string; version: string; files: string[] }>;
}
export interface PrecacheSqlitePlan {
  urls: string[];
  aliases: Readonly<Record<string, string>>;
}

export async function planPrecacheSqliteAssets(
  urls: readonly string[],
  { sourceRoot, assetRoot, read = fs.readFile }: SqliteAssetOptions,
): Promise<PrecacheSqlitePlan> {
  assert.equal(new Set(urls).size, urls.length, 'Unique original SQLite app shell');
  const root = path.resolve(sourceRoot);
  const fromRoot = (file: string) => read(path.join(root, file));
  const [manifestText, lockText, inventoryText] = await Promise.all([
    fromRoot('vendor/evolu8/manifest.json'),
    fromRoot('package-lock.json'),
    fromRoot('vendor/components.json'),
  ]);
  const manifest = JSON.parse(manifestText.toString('utf8')) as Manifest;
  const lock = JSON.parse(lockText.toString('utf8')) as {
    packages: Record<string, PackageProvenance>;
  };
  const inventory = JSON.parse(inventoryText.toString('utf8')) as Inventory;
  assert.equal(manifest.schemaVersion, 1, 'Qualified Evolu8 SQLite manifest');
  const locked = lock.packages['node_modules/@evolu/sqlite-wasm'];
  assert(locked?.integrity, 'Locked SQLite package integrity');
  assert.equal(locked.version, '2.2.4');
  assert.deepEqual(
    manifest.packages['@evolu/sqlite-wasm'],
    { version: locked.version, integrity: locked.integrity },
    'SQLite manifest/lock provenance',
  );

  const aliases: Record<string, string> = {};
  for (const [file, expectedBytes, expectedSha256] of SQLITE_PAIRS) {
    const canonical = '/vendor/evolu/' + file;
    const alias = '/vendor/evolu8/' + file;
    for (const url of [canonical, alias]) {
      assert.equal(
        urls.filter(entry => entry === url).length, 1,
        'Exactly one original public SQLite URL: ' + url,
      );
    }
    const entries = manifest.assets.filter(entry => entry.output === alias.slice(1));
    assert.equal(entries.length, 1, 'Exactly one SQLite asset manifest entry: ' + file);
    assert.deepEqual(entries[0], {
      source: 'node_modules/@evolu/sqlite-wasm/sqlite-wasm/jswasm/' + file,
      output: alias.slice(1),
      sha256: expectedSha256,
    }, 'Exact SQLite asset provenance: ' + file);

    for (const [url, owner, version] of [
      [canonical, 'SQLite', '3.50.4'],
      [alias, '@evolu/sqlite-wasm v8 candidate', '2.2.4'],
    ] as const) {
      const owners = inventory.components.filter(component => component.files.includes(url.slice(1)));
      assert.equal(owners.length, 1, 'Unique SQLite vendor inventory owner: ' + url);
      assert.equal(owners[0]!.name, owner);
      assert.equal(owners[0]!.version, version);
      for (const directory of new Set([root, ...(assetRoot ? [path.resolve(assetRoot)] : [])])) {
        const payload = await read(path.join(directory, url.slice(1)));
        assert.equal(payload.byteLength, expectedBytes, 'Complete public SQLite asset size: ' + url);
        assert.equal(
          createHash('sha256').update(payload).digest('hex'), expectedSha256,
          'Exact complete public SQLite asset: ' + url,
        );
      }
    }
    aliases[alias] = canonical;
  }
  return {
    urls: urls.filter(url => !Object.hasOwn(aliases, url)),
    aliases: Object.freeze(aliases),
  };
}

/** Both builders retain all eight public files. Only the four proven aliases
 * leave APP_SHELL; all other resource order and budget accounting stay intact. */
export async function applySqliteAssetPrecache(
  worker: string,
  options: SqliteAssetOptions,
): Promise<string> {
  const marker = 'const SQLITE_ASSET_ALIASES = {};';
  assert.equal(worker.split(marker).length, 2, 'Unique worker SQLite asset-alias injection point');
  const plan = await planPrecacheSqliteAssets(parseAppShellEntries(worker), options);
  return worker
    .replace(marker, `const SQLITE_ASSET_ALIASES = ${JSON.stringify(plan.aliases)};`)
    .replace(/const APP_SHELL = \[[\s\S]*?\];/, `const APP_SHELL = ${JSON.stringify(plan.urls, null, 2)};`);
}
