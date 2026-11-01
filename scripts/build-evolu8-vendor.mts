#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import type { BuildOptions, RolldownOutput } from 'rolldown';

type EvoluBundleTarget = {entry: string; output: string; treeshake?: boolean};
type LockedPackageReader = {version?: unknown; integrity?: unknown};
type LockReader = {packages?: Record<string, LockedPackageReader>};
type BundlerOptionsReader = Omit<BuildOptions, 'treeshake'> & {treeshake: BuildOptions['treeshake']};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');
// Keep the previous public graph intact while its tabs/retained builds retire.
// Worker-relative URLs must never select another SQLite implementation.
const OUTPUT_DIR = 'vendor/evolu8/v8.24.1-web3.6.5';
const MANIFEST = `${OUTPUT_DIR}/manifest.json`;

const BUNDLES: EvoluBundleTarget[] = [
  {
    entry: 'scripts/vendor-entries/evolu8.js',
    output: `${OUTPUT_DIR}/evolu-bundle.js`,
  },
  {
    entry: 'scripts/vendor-entries/evolu8-db-worker.js',
    output: `${OUTPUT_DIR}/Db.worker.js`,
    treeshake: false,
  },
  {
    entry: 'scripts/vendor-entries/evolu8-shared-worker.js',
    output: `${OUTPUT_DIR}/Shared.worker.js`,
    treeshake: false,
  },
];

const COPIES = [{
  source: 'node_modules/@evolu/sqlite-wasm/dist/wasm/sqlite3.wasm',
  output: `${OUTPUT_DIR}/sqlite3.wasm`,
}, ...['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(file => ({
  source: `node_modules/@evolu/sqlite-wasm/${file}`,
  output: `${OUTPUT_DIR}/${file}`,
}))];

const sha256 = (value: Parameters<ReturnType<typeof createHash>['update']>[0]) => createHash('sha256').update(value).digest('hex');
// The old public graph is a frozen transition artifact, not output from the
// current dependency lock. Qualify its original manifest and every whole file
// before either generating or checking the current runtime.
const legacyManifestBytes = await fs.readFile(path.join(ROOT, 'vendor/evolu8/manifest.json'));
if (sha256(legacyManifestBytes) !== '47a5b6e6a40126008715dd3fac3c748427fe0f4eaf40a1863bbbfa06a80815d7') {
  throw new Error('The frozen previous Evolu 8 manifest changed');
}
const legacyManifest = JSON.parse(legacyManifestBytes.toString('utf8')) as {
  bundles: Array<{output: string; sha256: string}>;
  assets: Array<{output: string; sha256: string}>;
};
for (const target of [...legacyManifest.bundles, ...legacyManifest.assets]) {
  if (sha256(await fs.readFile(path.join(ROOT, target.output))) !== target.sha256) {
    throw new Error(`The frozen previous Evolu 8 asset changed: ${target.output}`);
  }
}
const lock: LockReader = JSON.parse(await fs.readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
const requiredPackages = ['@evolu/common', '@evolu/web', '@evolu/sqlite-wasm', 'rolldown'];
const packages: Record<string, {version: unknown; integrity: unknown}> = Object.fromEntries(requiredPackages.map(packageName => {
  const entry = lock.packages?.[`node_modules/${packageName}`];
  if (!entry?.version || !entry?.integrity) {
    throw new Error(`${packageName} is missing version/integrity in package-lock.json`);
  }
  return [packageName, { version: entry.version, integrity: entry.integrity }];
}));

if (packages['@evolu/common']!.version !== '8.24.1') throw new Error('@evolu/common must be locked to 8.24.1');
if (packages['@evolu/web']!.version !== '3.6.5') throw new Error('@evolu/web must be locked to 3.6.5');
if (packages['@evolu/sqlite-wasm']!.version !== '3.54.1-build3') throw new Error('@evolu/sqlite-wasm must be locked to 3.54.1-build3');

const generatedBundles: Array<EvoluBundleTarget & {bytes: string; sha256: string}> = [];
for (const target of BUNDLES) {
  const result = await (build as (options: BundlerOptionsReader) => Promise<RolldownOutput>)({
    input: path.join(ROOT, target.entry),
    platform: 'browser',
    plugins: [{
      name: 'evolu-sibling-wasm',
      transform(code, id) {
        if (!id.replaceAll(path.sep, '/').endsWith('/@evolu/sqlite-wasm/dist/src/WasmUrl.js')) return;
        const coordinate = 'new URL("../wasm/sqlite3.wasm", import.meta.url);';
        if (code.split(coordinate).length !== 2) throw new Error('Unexpected Evolu SQLite WASM URL contract');
        return { code: code.replace(coordinate, 'new URL("./sqlite3.wasm", import.meta.url);'), map: null };
      },
    }],
    treeshake: target.treeshake,
    write: false,
    output: {
      format: 'es',
      minify: true,
      codeSplitting: false,
      sourcemap: false,
    },
  });
  const chunks = result.output.filter(item => item.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`${target.entry} produced ${chunks.length} chunks; expected one`);
  const banner = '// @ts-nocheck\n// Generated from locked Evolu 8 packages; run npm run vendor:evolu8:check.\n';
  const cleanCode = chunks[0]!.code.replace(/[ \t]+$/gm, '');
  const bytes = banner + (cleanCode.endsWith('\n') ? cleanCode : `${cleanCode}\n`);
  generatedBundles.push({ ...target, bytes, sha256: sha256(bytes) });
}

const generatedCopies = await Promise.all(COPIES.map(async target => {
  const bytes = await fs.readFile(path.join(ROOT, target.source));
  return { ...target, bytes, sha256: sha256(bytes) };
}));

const expectedManifest = {
  schemaVersion: 1,
  packages,
  bundles: generatedBundles.map(({ entry, output, sha256 }) => ({ entry, output, sha256 })),
  assets: generatedCopies.map(({ source, output, sha256 }) => ({ source, output, sha256 })),
};
const manifestText = `${JSON.stringify(expectedManifest, null, 2)}\n`;

if (CHECK_ONLY) {
  const currentFiles = await Promise.all([
    ...generatedBundles.map(target => fs.readFile(path.join(ROOT, target.output)).catch(() => null)),
    ...generatedCopies.map(target => fs.readFile(path.join(ROOT, target.output)).catch(() => null)),
  ]);
  const expectedFiles = [
    ...generatedBundles.map(target => Buffer.from(target.bytes)),
    ...generatedCopies.map(target => target.bytes),
  ];
  let stale = false;
  for (let index = 0; index < expectedFiles.length; index += 1) {
    if (!currentFiles[index]?.equals(expectedFiles[index]!)) {
      const target = [...generatedBundles, ...generatedCopies][index]!;
      console.error(`${target.output} is stale; run npm run vendor:evolu8:build`);
      stale = true;
    }
  }
  const currentManifest = await fs.readFile(path.join(ROOT, MANIFEST), 'utf8').catch(() => '');
  if (currentManifest !== manifestText) {
    console.error(`${MANIFEST} does not match the lockfile and generated bytes`);
    stale = true;
  }
  if (stale) process.exitCode = 1;
  else console.log(`Evolu ${packages['@evolu/common']!.version} browser vendor is reproducible`);
} else {
  await fs.mkdir(path.join(ROOT, OUTPUT_DIR), { recursive: true });
  await Promise.all([
    ...generatedBundles.map(target => fs.writeFile(path.join(ROOT, target.output), target.bytes)),
    ...generatedCopies.map(target => fs.writeFile(path.join(ROOT, target.output), target.bytes)),
    fs.writeFile(path.join(ROOT, MANIFEST), manifestText),
  ]);
  console.log(`Built Evolu ${packages['@evolu/common']!.version} browser candidate in ${OUTPUT_DIR}`);
}
