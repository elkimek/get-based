#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {staticKitOutputDirectory,copyStaticPublicMetadata} from './static-build-layout.mjs';
import {createStaticBuildFingerprint} from './static-build-inputs.mjs';
import { buildStaticKit } from '../tooling/svelte/build-static.mjs';
import { buildCompanionBundle } from './build-companion-bundle.mjs';
import { ONLINE_EVOLU_ASSETS, pruneSourceModuleAppShell, productionRawModuleAssets } from './static-build-assets.mjs';
import { inlineServiceWorkerAssets } from './service-worker-source.js';
import { parseAppShellEntries, summarizeAppShell } from './app-shell-budget.mjs';
import { staticKitTemplate, externalizeKitBootstrap } from './sveltekit-contracts.mjs';
import {planPrecacheFontAssets} from './font-assets.mjs';
import {qualifyBrowserVendorAssets} from './browser-vendor-contracts.mjs';
import {applySqliteAssetPrecache} from './sqlite-assets.mjs';
import {measureSvelteKitResources,enforceSvelteKitResourceBudget} from './sveltekit-resource-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, '.local-notes/sveltekit-build');
async function filesIn(directory: string): Promise<string[]> {
  return (await Promise.all((await fs.readdir(directory, { withFileTypes: true }))
    .map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat().sort();
}

export async function buildSvelteKit({ outputRoot = DEFAULT_OUTPUT, buildTag = '' }: { outputRoot?: string; buildTag?: string } = {}) {
  outputRoot = staticKitOutputDirectory(ROOT,outputRoot);
  await fs.mkdir(path.join(ROOT, '.local-notes'), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(ROOT, '.local-notes/static-kit-'));
  await fs.symlink(path.join(ROOT, 'tooling/svelte/node_modules'), path.join(temporary, 'node_modules'), 'dir');
  try {
    const staticRoot = path.join(temporary, 'static');
    await fs.mkdir(staticRoot, { recursive: true });
    await buildCompanionBundle({ outputRoot: staticRoot });
    await copyStaticPublicMetadata(ROOT,staticRoot);
    const [index, worker, workerAssets] = await Promise.all([
      fs.readFile(path.join(ROOT, 'index.html'), 'utf8'), fs.readFile(path.join(ROOT, 'service-worker.js'), 'utf8'),
      fs.readFile(path.join(ROOT, 'service-worker-assets.js'), 'utf8'),
    ]);
    const vendors = await qualifyBrowserVendorAssets({root: ROOT});
    const rawAssets = await productionRawModuleAssets();
    const baseWorker = pruneSourceModuleAppShell(inlineServiceWorkerAssets(worker, workerAssets), rawAssets)
      .replace(/[ \t]*'\/service-worker-assets\.js',/, '');
    vendors.assertShell(baseWorker);
    const rawUrls = parseAppShellEntries(baseWorker);
    for (const url of rawAssets) {
      if (!rawUrls.includes(url)) throw new Error(`Raw worker dependency was lost while pruning APP_SHELL: ${url}`);
    }
    for (const url of new Set([...rawUrls, ...ONLINE_EVOLU_ASSETS])) {
      if (url === '/app' || url === '/index.html') continue;
      const relative = url.slice(1);
      const destination = path.join(staticRoot, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      if (relative !== 'getbased-companion.mjs') await fs.copyFile(path.join(ROOT, relative), destination);
    }
    await vendors.assertCopiedAssets(staticRoot);
    // Keep all authored/build inputs and public assets in atomic cache identity.
    // Revision is separate provenance; test exclusion needs a complete asset graph.
    const revision = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const inventory = execFileSync('git', ['--no-optional-locks', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0');
    const {fingerprint,sourceFiles,verificationDigest} = await createStaticBuildFingerprint(ROOT,revision,buildTag,inventory);
    for (const file of await filesIn(staticRoot)) fingerprint.update(path.relative(staticRoot, file)).update(await fs.readFile(file));
    const buildId = fingerprint.digest('hex');
    await fs.writeFile(path.join(temporary, 'app.html'), staticKitTemplate(index));
    await buildStaticKit({ root: ROOT, temporary, version: buildId });
    const site = path.join(temporary, 'site');
    await vendors.assertCopiedAssets(site);
    const rendered = externalizeKitBootstrap(await fs.readFile(path.join(site, 'app.html'), 'utf8'));
    await fs.writeFile(path.join(site, 'index.html'), rendered.html);
    await fs.unlink(path.join(site, 'app.html'));
    for (const script of rendered.scripts) {
      await fs.mkdir(path.dirname(path.join(site, script.file)), { recursive: true });
      await fs.writeFile(path.join(site, script.file), script.code);
    }
    const frameworkFiles = (await filesIn(path.join(site, '_app'))).filter(file => !file.endsWith('.map'));
    const bundleUrls = [...frameworkFiles.map(file => '/' + path.relative(site, file).replaceAll(path.sep, '/')),
      ...rendered.scripts.map(script => '/' + script.file)];
    const {urls: precacheUrls, aliases: fontAliases} = await planPrecacheFontAssets(rawUrls, site);
    const urls = [...new Set([...precacheUrls, ...bundleUrls])].sort();
    const fontAliasMarker = 'const FONT_ALIASES = {};';
    if (baseWorker.split(fontAliasMarker).length !== 2) throw new Error('Missing unique worker font-alias injection point');
    const fontWorker = baseWorker.replace(fontAliasMarker, `const FONT_ALIASES = ${JSON.stringify(fontAliases)};`)
      .replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${buildId}';`)
      .replace(/const APP_SHELL = \[[\s\S]*?\];/, `const APP_SHELL = ${JSON.stringify(urls, null, 2)};`);
    const builtWorker = await applySqliteAssetPrecache(fontWorker, {sourceRoot: ROOT, assetRoot: site});
    vendors.assertShell(builtWorker);
    const version = (await fs.readFile(path.join(site, 'version.js'), 'utf8')).replace(/\nself\.APP_BUILD_ID = '[^']*';\n?/g, '\n');
    await fs.writeFile(path.join(site, 'version.js'), `${version.trimEnd()}\nself.APP_BUILD_ID = '${buildId}';\n`);
    await fs.writeFile(path.join(site, 'service-worker.js'), builtWorker);
    const shell = await summarizeAppShell({ serviceWorkerSource: builtWorker, artifactRoot: site });
    const jsFiles = bundleUrls.filter(url => url.endsWith('.js'));
    const bytes = (await Promise.all(jsFiles.map(url => fs.stat(path.join(site, url))))).reduce((sum, stat) => sum + stat.size, 0);
    const resourcePolicy: unknown = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/sveltekit-resource-budget.json'), 'utf8'));
    const resourceBudget = enforceSvelteKitResourceBudget(await measureSvelteKitResources({
      serviceWorkerSource: builtWorker, artifactRoot: site, generatedJavaScriptUrls: jsFiles,
    }), resourcePolicy);
    for (const warning of resourceBudget.warnings) console.warn(warning);
    const previousLimits = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/app-shell-budget.json'), 'utf8')) as { maximums: { resources: number; decodedBytes: number } };
    const summary = { revision, buildId, sourceInputCount: sourceFiles.length, verificationDigest, framework: 'SvelteKit 3 / Svelte 5', static: true, javascriptFiles: jsFiles.length,
      javascriptDecodedBytes: bytes, appShellResources: shell.resources, appShellDecodedBytes: shell.decodedBytes,
      resourceBudget,
      legacyAppShellLimits: previousLimits.maximums,
      legacyLimitDelta: { resources: shell.resources - previousLimits.maximums.resources,
        decodedBytes: shell.decodedBytes - previousLimits.maximums.decodedBytes },
      sizePolicy: 'SvelteKit offline bytes enforce the committed absolute and reference-growth limits; resource count warns. Startup and first-use transfer have a separate browser gate. Historical native ceilings remain separate compatibility measurements.' };
    await fs.writeFile(path.join(site, 'build-metrics.json'), JSON.stringify(summary, null, 2) + '\n');
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(path.dirname(outputRoot), { recursive: true });
    await fs.rename(site, outputRoot).catch(async error => {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fs.cp(site, outputRoot, { recursive: true });
    });
    return summary;
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--output');
  const checkOnly = process.argv.includes('--check');
  if(checkOnly&&index>=0)throw new Error('--check cannot replace a named output directory');
  const outputRoot = checkOnly ? await fs.mkdtemp(path.join(os.tmpdir(),'getbased-kit-check-')) : index < 0 ? DEFAULT_OUTPUT : process.argv[index + 1];
  if (!outputRoot) throw new Error('--output requires a dedicated artifact directory');
  try { console.log(JSON.stringify(await buildSvelteKit({ outputRoot }), null, 2)); }
  finally { if(checkOnly)await fs.rm(outputRoot,{recursive:true,force:true}); }
}
