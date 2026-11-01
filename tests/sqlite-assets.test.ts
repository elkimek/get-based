import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { applySqliteAssetPrecache, planPrecacheSqliteAssets } from '../scripts/sqlite-assets.mjs';
import { parseAppShellEntries, summarizeAppShell } from '../scripts/app-shell-budget.mjs';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';

const root = process.cwd();
// Independent complete payload identities: neither planner output nor the
// current vendor manifest can supply or regenerate these expected hashes.
const exact = [
  ['sqlite3-bundler-friendly.mjs', 454803,
    '1d1cea8bbf10d173ab29d003e1197db2aca7f29a23a7a4320f5cfe77ce4e3243'],
  ['sqlite3.wasm', 1036167,
    'e0e94e4ac5221c19aefe7e59fe88ceab93bff56ec1d966c21c6cf39ac0f26735'],
  ['sqlite3-opfs-async-proxy.js', 21051,
    'cf58af5a6384d81dc958fd7933be7517d6521e51918c629be2686b6713d656dd'],
  ['sqlite3-worker1-bundler-friendly.mjs', 1533,
    '7b771d35011172c6e24cafad78dec56704fc36584715d633adab8d8af7bea259'],
] as const;
const modernUrl = '/vendor/evolu8/v8.24.1-web3.6.5/sqlite3.wasm';
const legacyUrls = exact.flatMap(([file]) => ['/vendor/evolu/' + file, '/vendor/evolu8/' + file]);
const urls = [...legacyUrls, modernUrl];
const aliases = Object.fromEntries(exact.map(([file]) => ['/vendor/evolu8/' + file, '/vendor/evolu/' + file]));
const shell = (entries: readonly string[]) => 'const APP_SHELL = ' + JSON.stringify(entries) + ';';
const worker = (entries: readonly string[]) =>
  'const SQLITE_ASSET_ALIASES = {};\nconst FONT_ALIASES = {};\n' + shell(entries);
const mutate = (change: (file: string, bytes: Buffer) => Buffer) => async (file: string) =>
  change(path.relative(root, file).replaceAll(path.sep, '/'), await fs.readFile(file));

type MutableManifest = {
  assets: Array<{ source: string; output: string; sha256: string }>;
  packages: Record<string, { version: string; integrity: string }>;
};
type MutableInventory = { components: Array<{ name: string; version: string; files: string[] }> };

it('qualifies exactly four whole SQLite pairs while preserving both public URL files and all other resources in order', async () => {
  const original = [
    '/styles.css', ...urls, '/vendor/evolu/Db.worker.js', '/vendor/evolu8/Db.worker.js',
    '/vendor/evolu8/Shared.worker.js', '/vendor/evolu8/unqualified.js',
  ];
  const plan = await planPrecacheSqliteAssets(original, { sourceRoot: root });
  expect(plan).toEqual({ urls: original.filter(url => !Object.hasOwn(aliases, url)), aliases });
  expect(Object.isFrozen(plan.aliases)).toBe(true);
  for (const [file, expectedBytes, expectedSha256] of exact) {
    for (const prefix of ['vendor/evolu/', 'vendor/evolu8/']) {
      const payload = await fs.readFile(prefix + file);
      expect(payload.byteLength).toBe(expectedBytes);
      expect(createHash('sha256').update(payload).digest('hex')).toBe(expectedSha256);
    }
  }
});

it('measures every full canonical byte with the unchanged app-shell metric and source-root fallback', async () => {
  const built = await applySqliteAssetPrecache(worker(urls), { sourceRoot: root });
  const before = await summarizeAppShell({
    serviceWorkerSource: shell(urls),
    artifactRoot: path.join(root, '.local-notes/nonexistent-sqlite-artifact'),
    sourceRoot: root,
  });
  const after = await summarizeAppShell({
    serviceWorkerSource: built,
    artifactRoot: path.join(root, '.local-notes/nonexistent-sqlite-artifact'),
    sourceRoot: root,
  });
  expect(before).toEqual({ resources: 9, decodedBytes: 3747565 });
  expect(after).toEqual({ resources: 5, decodedBytes: 2234011 });
  expect(parseAppShellEntries(built)).toContain(modernUrl);
  expect(aliases).not.toHaveProperty(modernUrl);
  expect(built).toContain('const FONT_ALIASES = {};');
  expect(built).toContain('const SQLITE_ASSET_ALIASES = ' + JSON.stringify(aliases) + ';');
});

it('assembles native and Kit-style full workers without losing public owners, font plans, unrelated code or resources', async () => {
  const source = await readServiceWorkerSource(file => fs.readFile(file, 'utf8'));
  const built = await applySqliteAssetPrecache(source, { sourceRoot: root });
  expect(parseAppShellEntries(built)).toEqual(
    parseAppShellEntries(source).filter(url => !Object.hasOwn(aliases, url)),
  );
  const rest = (text: string) => text
    .replace(/const SQLITE_ASSET_ALIASES = \{[^;]*\};/, 'SQLITE-MARKER')
    .replace(/const APP_SHELL = \[[\s\S]*?\];/, 'SHELL-MARKER');
  expect(rest(built)).toBe(rest(source));
  await expect(applySqliteAssetPrecache(built, { sourceRoot: root })).rejects.toThrow('injection point');
});

it.each(legacyUrls)('rejects an omitted or duplicated original public URL %s', async url => {
  await expect(planPrecacheSqliteAssets(
    urls.filter(item => item !== url), { sourceRoot: root },
  )).rejects.toThrow('original public SQLite URL');
  await expect(planPrecacheSqliteAssets([...urls, url], { sourceRoot: root })).rejects.toThrow('Unique original');
});

it.each(legacyUrls)('rejects a changed complete payload at either public identity %s', async url => {
  const read = mutate((file, bytes) => {
    if (file !== url.slice(1)) return bytes;
    const changed = Buffer.from(bytes);
    changed[0] = changed[0]! ^ 1;
    return changed;
  });
  await expect(planPrecacheSqliteAssets(urls, { sourceRoot: root, read }))
    .rejects.toThrow('Exact complete public SQLite asset');
});

it.each([
  'hash', 'source', 'duplicate', 'package-version', 'package-integrity',
  'lock-version', 'lock-integrity', 'inventory-owner', 'inventory-version', 'inventory-duplicate',
] as const)('rejects SQLite provenance corruption: %s', async kind => {
  const read = mutate((file, bytes) => {
    if (file === 'vendor/evolu8/manifest.json') {
      const value = JSON.parse(bytes.toString()) as MutableManifest;
      if (kind === 'hash') value.assets[0]!.sha256 = 'foreign';
      if (kind === 'source') value.assets[0]!.source = 'foreign';
      if (kind === 'duplicate') value.assets.push({ ...value.assets[0]! });
      if (kind === 'package-version') value.packages['@evolu/sqlite-wasm']!.version = 'foreign';
      if (kind === 'package-integrity') value.packages['@evolu/sqlite-wasm']!.integrity = 'foreign';
      return Buffer.from(JSON.stringify(value));
    }
    if (file === 'package-lock.json') {
      const value = JSON.parse(bytes.toString()) as {
        packages: Record<string, { version: string; integrity: string }>;
      };
      if (kind === 'lock-version') value.packages['node_modules/@evolu/sqlite-wasm']!.version = 'foreign';
      if (kind === 'lock-integrity') value.packages['node_modules/@evolu/sqlite-wasm']!.integrity = 'foreign';
      return Buffer.from(JSON.stringify(value));
    }
    if (file === 'vendor/components.json') {
      const value = JSON.parse(bytes.toString()) as MutableInventory;
      const owner = value.components.find(component => component.name === 'SQLite')!;
      if (kind === 'inventory-owner') owner.name = 'foreign';
      if (kind === 'inventory-version') owner.version = 'foreign';
      if (kind === 'inventory-duplicate') value.components.push({ ...owner, files: [...owner.files] });
      return Buffer.from(JSON.stringify(value));
    }
    return bytes;
  });
  await expect(planPrecacheSqliteAssets(urls, { sourceRoot: root, read })).rejects.toThrow();
});

it.each(urls.flatMap(url => (['missing', 'truncated', 'changed'] as const).map(kind => ({ url, kind }))))(
  'requires exact retained public Kit copy $url: $kind', async ({ url, kind }) => {
    const assetRoot = path.join(root, '.local-notes/symbolic-sqlite-artifact');
    const read = async (file: string): Promise<Buffer> => {
      if (!file.startsWith(assetRoot + path.sep)) return fs.readFile(file);
      const relative = path.relative(assetRoot, file);
      const bytes = await fs.readFile(path.join(root, relative));
      if (relative.replaceAll(path.sep, '/') !== url.slice(1)) return bytes;
      if (kind === 'missing') throw new Error('Missing retained public SQLite copy');
      if (kind === 'truncated') return bytes.subarray(1);
      const changed = Buffer.from(bytes);
      changed[0] = changed[0]! ^ 1;
      return changed;
    };
    await expect(planPrecacheSqliteAssets(urls, { sourceRoot: root, assetRoot, read })).rejects.toThrow();
  },
);

it('verifies an independent copied Kit asset root without changing source files or budget accounting', async () => {
  const assetRoot = path.join(root, '.local-notes/symbolic-sqlite-artifact');
  const reads: string[] = [];
  const read = async (file: string) => {
    reads.push(file);
    return fs.readFile(file.startsWith(assetRoot + path.sep)
      ? path.join(root, path.relative(assetRoot, file)) : file);
  };
  const built = await applySqliteAssetPrecache(worker(urls), { sourceRoot: root, assetRoot, read });
  expect(parseAppShellEntries(built)).toEqual(urls.filter(url => !Object.hasOwn(aliases, url)));
  for (const url of urls) expect(reads).toContain(path.join(assetRoot, url.slice(1)));
});

it('requires the independent current SQLite binary and never aliases it to either legacy graph', async () => {
  const payload = await fs.readFile(modernUrl.slice(1));
  expect(payload.byteLength).toBe(720457);
  expect(createHash('sha256').update(payload).digest('hex'))
    .toBe('c620df45173a97416e2849a853e14320f24b3bb5f05c42313747f87e7eb6967a');
  const legacy = await fs.readFile('vendor/evolu/sqlite3.wasm');
  expect(payload.equals(legacy)).toBe(false);
  await expect(planPrecacheSqliteAssets(legacyUrls, {sourceRoot: root})).rejects.toThrow('Exactly one modern SQLite URL');
  await expect(planPrecacheSqliteAssets([...urls, modernUrl], {sourceRoot: root})).rejects.toThrow('Unique original');
  const read = mutate((file, bytes) => file === modernUrl.slice(1) ? Buffer.alloc(bytes.length) : bytes);
  await expect(planPrecacheSqliteAssets(urls, {sourceRoot: root, read})).rejects.toThrow('Exact complete modern SQLite asset');
});

it.each(['hash', 'source', 'duplicate', 'package-version', 'package-integrity'] as const)(
  'rejects current SQLite manifest corruption: %s', async kind => {
    const read = mutate((file, bytes) => {
      if (file !== 'vendor/evolu8/v8.24.1-web3.6.5/manifest.json') return bytes;
      const value = JSON.parse(bytes.toString()) as MutableManifest;
      if (kind === 'hash') value.assets[0]!.sha256 = 'foreign';
      if (kind === 'source') value.assets[0]!.source = 'foreign';
      if (kind === 'duplicate') value.assets.push({...value.assets[0]!});
      if (kind === 'package-version') value.packages['@evolu/sqlite-wasm']!.version = 'foreign';
      if (kind === 'package-integrity') value.packages['@evolu/sqlite-wasm']!.integrity = 'foreign';
      return Buffer.from(JSON.stringify(value));
    });
    await expect(planPrecacheSqliteAssets(urls, {sourceRoot: root, read})).rejects.toThrow();
  },
);

it.each(['missing', 'duplicate', 'foreign'] as const)('rejects an unqualified build injection point: %s', async kind => {
  const source = worker(urls);
  const marker = 'const SQLITE_ASSET_ALIASES = {};';
  const changed = kind === 'missing' ? source.replace(marker, '')
    : kind === 'duplicate' ? source + '\n' + marker
      : source.replace(marker, 'const SQLITE_ASSET_ALIASES = {foreign:true};');
  await expect(applySqliteAssetPrecache(changed, { sourceRoot: root })).rejects.toThrow('injection point');
});
