#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, RUNTIME_MODULE_ID } from 'rolldown';

import {
  enforceAppShellBudget,
  formatAppShellSummary,
  summarizeAppShell,
} from './app-shell-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_ENTRY = path.join(ROOT, 'js', 'main.js');
const RETRY_QUERY = '?lazy-retry=1';
const GENERATED_BUNDLE_RE = /^bundle-[A-Za-z0-9_-]+\.js$/;
const INDEX_SCRIPT_START = '  <!-- PRODUCTION_MAIN_SCRIPT_START -->';
const INDEX_SCRIPT_END = '  <!-- PRODUCTION_MAIN_SCRIPT_END -->';
const SW_BUNDLES_START = '  // PRODUCTION_BUNDLE_ASSETS_START';
const SW_BUNDLES_END = '  // PRODUCTION_BUNDLE_ASSETS_END';
const PRODUCTION_RAW_JS_ASSETS = new Set([
  '/js/theme-bootstrap.js',
  '/js/extra-theme-bootstrap.js',
  '/js/analytics-bootstrap.js',
  '/js/legal-consent-bootstrap.js',
  '/js/service-worker-update.js',
  '/js/lens-local-worker.js',
  '/js/voice-local-stt-worker.js',
  '/js/voice-local-tts-worker.js',
  '/js/lens-local-utils.js',
  '/js/lens-local-store.js',
]);
const FATAL_BUILD_WARNINGS = new Set(['INEFFECTIVE_DYNAMIC_IMPORT']);

export function handleBuildLog(level, log, defaultHandler) {
  if (FATAL_BUILD_WARNINGS.has(log?.code)) {
    throw new Error(`Production build rejected ${log.code}: ${log.message}`);
  }
  defaultHandler(level, log);
}

function stripRetryQuery(id) {
  return id.endsWith(RETRY_QUERY) ? id.slice(0, -RETRY_QUERY.length) : id;
}

function retryImportPlugin() {
  return {
    name: 'getbased-lazy-retry-imports',
    resolveId(source, importer) {
      if (source.endsWith(RETRY_QUERY)) {
        if (!importer) return null;
        const cleanSource = source.slice(0, -RETRY_QUERY.length);
        const importerPath = stripRetryQuery(importer);
        const resolved = path.isAbsolute(cleanSource)
          ? cleanSource
          : path.resolve(path.dirname(importerPath), cleanSource);
        return `${resolved}${RETRY_QUERY}`;
      }

      if (importer?.endsWith(RETRY_QUERY) && source.startsWith('.')) {
        return path.resolve(path.dirname(stripRetryQuery(importer)), source);
      }

      return null;
    },
    async load(id) {
      if (!id.endsWith(RETRY_QUERY)) return null;
      return fs.readFile(stripRetryQuery(id), 'utf8');
    },
  };
}

function initialGraphPlugin(initialModules) {
  const staticImports = new Map();

  return {
    name: 'getbased-initial-module-graph',
    moduleParsed(info) {
      staticImports.set(info.id, [...info.importedIds]);
    },
    buildEnd() {
      const visit = (id) => {
        if (initialModules.has(id)) return;
        initialModules.add(id);
        for (const importedId of staticImports.get(id) || []) visit(importedId);
      };
      visit(MAIN_ENTRY);
      initialModules.add(RUNTIME_MODULE_ID);
    },
  };
}

function replaceMarkedSection(source, startMarker, endMarker, replacementLines) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`Missing or invalid build markers: ${startMarker} … ${endMarker}`);
  }
  const before = source.slice(0, start + startMarker.length);
  const after = source.slice(end);
  return `${before}\n${replacementLines.join('\n')}\n${after}`;
}

function pruneSourceModuleAppShell(source) {
  return source.replace(
    /^  '(\/js\/[^']+\.js)',\n/gm,
    (line, url) => (PRODUCTION_RAW_JS_ASSETS.has(url) ? line : ''),
  );
}

async function validateBundlerLock() {
  const lock = JSON.parse(await fs.readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const bundler = lock.packages?.['node_modules/rolldown'];
  if (bundler?.version !== '1.2.1' || !bundler?.integrity) {
    throw new Error('rolldown must be directly locked to 1.2.1 with integrity metadata');
  }
}

async function removeOldBundles(outputDirectory) {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter(entry => entry.isFile() && GENERATED_BUNDLE_RE.test(entry.name))
    .map(entry => fs.unlink(path.join(outputDirectory, entry.name))));
}

function collectStaticStartupFiles(entryChunk, chunkByName) {
  const startupFiles = new Set();
  const visit = (fileName) => {
    if (startupFiles.has(fileName)) return;
    startupFiles.add(fileName);
    const chunk = chunkByName.get(fileName);
    for (const imported of chunk?.imports || []) visit(imported);
  };
  visit(entryChunk.fileName);
  return startupFiles;
}

async function enforceBuildBudget(summary) {
  const budget = JSON.parse(
    await fs.readFile(path.join(ROOT, 'scripts', 'production-build-budget.json'), 'utf8'),
  );
  const failures = [];
  for (const [metric, maximum] of Object.entries(budget.maximums || {})) {
    const actual = summary[metric];
    if (!Number.isFinite(actual)) failures.push(`${metric} was not measured`);
    else if (actual > maximum) failures.push(`${metric} ${actual} exceeds ${maximum}`);
  }
  if (failures.length) throw new Error(`Production build budget failed: ${failures.join('; ')}`);
}

export async function buildProduction({ outputRoot = ROOT } = {}) {
  await validateBundlerLock();

  const outputDirectory = path.join(outputRoot, 'js');
  await fs.mkdir(outputDirectory, { recursive: true });
  await removeOldBundles(outputDirectory);

  const initialModules = new Set();
  const result = await build({
    input: MAIN_ENTRY,
    platform: 'browser',
    onLog: handleBuildLog,
    plugins: [
      retryImportPlugin(),
      initialGraphPlugin(initialModules),
    ],
    output: {
      dir: outputDirectory,
      format: 'es',
      minify: true,
      sourcemap: false,
      entryFileNames: 'bundle-main-[hash].js',
      chunkFileNames: 'bundle-[name]-[hash].js',
      assetFileNames: 'bundle-[name]-[hash][extname]',
      manualChunks(id) {
        return initialModules.has(id) ? 'startup' : undefined;
      },
    },
  });

  const chunks = result.output.filter(item => item.type === 'chunk');
  const assets = result.output.filter(item => item.type === 'asset');
  const entryChunk = chunks.find(chunk => chunk.isEntry);
  if (!entryChunk) throw new Error('Production build did not emit an entry chunk');
  if (assets.length) {
    throw new Error(`Production build emitted ${assets.length} unexpected non-JavaScript asset(s)`);
  }
  if (!chunks.every(chunk => GENERATED_BUNDLE_RE.test(chunk.fileName))) {
    throw new Error('Production build emitted a file outside the bundle-*.js namespace');
  }

  const chunkByName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const startupFiles = collectStaticStartupFiles(entryChunk, chunkByName);
  const startupDecodedBytes = [...startupFiles].reduce(
    (total, fileName) => total + Buffer.byteLength(chunkByName.get(fileName)?.code || ''),
    0,
  );
  const outputDecodedBytes = chunks.reduce(
    (total, chunk) => total + Buffer.byteLength(chunk.code),
    0,
  );
  const summary = {
    entryFile: entryChunk.fileName,
    startupJavaScriptFiles: startupFiles.size,
    startupDecodedBytes,
    outputJavaScriptFiles: chunks.length,
    outputDecodedBytes,
    lazyJavaScriptFiles: chunks.length - startupFiles.size,
  };

  const [indexSource, serviceWorkerSource, serviceWorkerRuntimeSource] = await Promise.all([
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
    fs.readFile(path.join(ROOT, 'service-worker.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'service-worker-runtime.js'), 'utf8'),
  ]);
  const builtIndex = replaceMarkedSection(
    indexSource,
    INDEX_SCRIPT_START,
    INDEX_SCRIPT_END,
    [
      ...[...startupFiles]
        .filter(fileName => fileName !== entryChunk.fileName)
        .sort()
        .map(fileName => `  <link rel="modulepreload" href="js/${fileName}">`),
      `  <script type="module" src="js/${entryChunk.fileName}"></script>`,
    ],
  );
  const bundleAssetLines = chunks
    .map(chunk => `  '/js/${chunk.fileName}',`)
    .sort();
  const builtServiceWorker = replaceMarkedSection(
    pruneSourceModuleAppShell(serviceWorkerSource),
    SW_BUNDLES_START,
    SW_BUNDLES_END,
    bundleAssetLines,
  );
  await Promise.all([
    fs.writeFile(path.join(outputRoot, 'index.html'), builtIndex),
    fs.writeFile(path.join(outputRoot, 'service-worker.js'), builtServiceWorker),
    fs.writeFile(path.join(outputRoot, 'service-worker-runtime.js'), serviceWorkerRuntimeSource),
  ]);

  await enforceBuildBudget(summary);
  const appShellMetrics = await summarizeAppShell({
    serviceWorkerSource: builtServiceWorker,
    artifactRoot: outputRoot,
    sourceRoot: ROOT,
  });
  const appShellBudget = JSON.parse(
    await fs.readFile(path.join(ROOT, 'scripts', 'app-shell-budget.json'), 'utf8'),
  );
  enforceAppShellBudget(appShellMetrics, appShellBudget);
  summary.appShellResources = appShellMetrics.resources;
  summary.appShellDecodedBytes = appShellMetrics.decodedBytes;

  return summary;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function runCli() {
  const checkOnly = process.argv.includes('--check');
  const outputRoot = checkOnly
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-production-build-'))
    : ROOT;
  try {
    const summary = await buildProduction({ outputRoot });
    console.log(
      `Production startup: ${summary.startupJavaScriptFiles} JS files, `
      + `${formatBytes(summary.startupDecodedBytes)} decoded`,
    );
    console.log(
      `Lazy output: ${summary.lazyJavaScriptFiles} JS files; `
      + `${formatBytes(summary.outputDecodedBytes)} total decoded`,
    );
    console.log(`PWA precache: ${formatAppShellSummary({
      resources: summary.appShellResources,
      decodedBytes: summary.appShellDecodedBytes,
    })}`);
    console.log(`Entry: js/${summary.entryFile}`);
  } finally {
    if (checkOnly) await fs.rm(outputRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
