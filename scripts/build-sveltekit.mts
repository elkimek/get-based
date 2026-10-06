#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStaticKit } from '../tooling/svelte/build-static.mjs';
import { buildCompanionBundle } from './build-companion-bundle.mjs';
import { pruneSourceModuleAppShell } from './build-production.mjs';
import { inlineServiceWorkerAssets } from './service-worker-source.js';
import { parseAppShellEntries, summarizeAppShell } from './app-shell-budget.mjs';
import { staticKitTemplate, externalizeKitBootstrap } from './sveltekit-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT, '.local-notes/sveltekit-build');
async function filesIn(directory: string): Promise<string[]> {
  return (await Promise.all((await fs.readdir(directory, { withFileTypes: true }))
    .map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat().sort();
}

export async function buildSvelteKit({ outputRoot = DEFAULT_OUTPUT, buildTag = '' }: { outputRoot?: string; buildTag?: string } = {}) {
  outputRoot = path.resolve(outputRoot);
  if (![path.join(ROOT, '.local-notes') + path.sep, os.tmpdir() + path.sep].some(prefix => outputRoot.startsWith(prefix))) {
    throw new Error('SvelteKit evaluation output must be inside ignored local notes or a temporary directory');
  }
  await fs.mkdir(path.join(ROOT, '.local-notes'), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(ROOT, '.local-notes/static-kit-'));
  await fs.symlink(path.join(ROOT, 'tooling/svelte/node_modules'), path.join(temporary, 'node_modules'), 'dir');
  try {
    const staticRoot = path.join(temporary, 'static');
    await fs.mkdir(staticRoot, { recursive: true });
    await buildCompanionBundle({ outputRoot: staticRoot });
    const [index, worker, workerAssets] = await Promise.all([
      fs.readFile(path.join(ROOT, 'index.html'), 'utf8'), fs.readFile(path.join(ROOT, 'service-worker.js'), 'utf8'),
      fs.readFile(path.join(ROOT, 'service-worker-assets.js'), 'utf8'),
    ]);
    const baseWorker = pruneSourceModuleAppShell(inlineServiceWorkerAssets(worker, workerAssets))
      .replace(/\s*'\/service-worker-assets\.js',/, '');
    const rawUrls = parseAppShellEntries(baseWorker);
    for (const url of rawUrls) {
      if (url === '/app' || url === '/index.html') continue;
      const relative = url.slice(1);
      const destination = path.join(staticRoot, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      if (relative !== 'getbased-companion.mjs') await fs.copyFile(path.join(ROOT, relative), destination);
    }
    // Fingerprint authored inputs and public assets so dirty local builds also
    // receive distinct atomic cache identities; never include local journals.
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const inventory = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0');
    const fingerprint = createHash('sha256').update(revision).update(buildTag);
    for (const relative of inventory.filter(file => /\.(?:ts|mts|svelte|css|html|json)$/.test(file)).sort()) {
      const source = await fs.readFile(path.join(ROOT, relative)).catch((error: NodeJS.ErrnoException) => {
        // Git still lists locally deleted tracked inputs during migration.
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (source !== null) fingerprint.update(relative).update(source);
    }
    for (const file of await filesIn(staticRoot)) fingerprint.update(path.relative(staticRoot, file)).update(await fs.readFile(file));
    const buildId = fingerprint.digest('hex');
    await fs.writeFile(path.join(temporary, 'app.html'), staticKitTemplate(index));
    await buildStaticKit({ root: ROOT, temporary, version: buildId });
    const site = path.join(temporary, 'site');
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
    const urls = [...new Set([...rawUrls, ...bundleUrls])].sort();
    const builtWorker = baseWorker.replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${buildId}';`)
      .replace(/const APP_SHELL = \[[\s\S]*?\];/, `const APP_SHELL = ${JSON.stringify(urls, null, 2)};`);
    const version = (await fs.readFile(path.join(site, 'version.js'), 'utf8')).replace(/\nself\.APP_BUILD_ID = '[^']*';\n?/g, '\n');
    await fs.writeFile(path.join(site, 'version.js'), `${version.trimEnd()}\nself.APP_BUILD_ID = '${buildId}';\n`);
    await fs.writeFile(path.join(site, 'service-worker.js'), builtWorker);
    const shell = await summarizeAppShell({ serviceWorkerSource: builtWorker, artifactRoot: site });
    const jsFiles = bundleUrls.filter(url => url.endsWith('.js'));
    const bytes = (await Promise.all(jsFiles.map(url => fs.stat(path.join(site, url))))).reduce((sum, stat) => sum + stat.size, 0);
    const previousLimits = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/app-shell-budget.json'), 'utf8')) as { maximums: { resources: number; decodedBytes: number } };
    const summary = { revision, buildId, framework: 'SvelteKit 3 / Svelte 5', static: true, javascriptFiles: jsFiles.length,
      javascriptDecodedBytes: bytes, appShellResources: shell.resources, appShellDecodedBytes: shell.decodedBytes,
      legacyAppShellLimits: previousLimits.maximums,
      legacyLimitDelta: { resources: shell.resources - previousLimits.maximums.resources,
        decodedBytes: shell.decodedBytes - previousLimits.maximums.decodedBytes },
      sizePolicy: 'Measured for local migration evaluation; historical limits remain enforced on the native build.' };
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
  const outputRoot = index < 0 ? DEFAULT_OUTPUT : process.argv[index + 1];
  if (!outputRoot) throw new Error('--output requires an ignored or temporary directory');
  console.log(JSON.stringify(await buildSvelteKit({ outputRoot }), null, 2));
}
