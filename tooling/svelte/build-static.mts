import path from 'node:path';
import {startupDataChunk} from '../../scripts/startup-data-chunks.mjs';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBuilder, defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import {createKitVendorExternals} from './kit-vendor-externals.mjs';
import { packStaticChatInstructions, rewriteNativeAssetBase } from '../../scripts/sveltekit-contracts.mjs';
import { handleBuildLog } from '../../scripts/static-build-assets.mjs';
import { createSvelteFacadePlugin, compiledSvelteModulePattern } from '../../scripts/svelte-facade-plugin.mjs';
import {createKitRetryChunksPlugin, readKitRetrySummary, type KitRetrySummary} from '../../scripts/kit-retry-chunks.mjs';

type StaticKitOptions = { root: string; temporary: string; version: string };
export function staticKitConfig({ root, temporary, version }: StaticKitOptions, retryPass?: 'inventory' | 'transport') {
  const retry = retryPass ? createKitRetryChunksPlugin({pass: retryPass, planFile: path.join(temporary, 'retry-plan.json'), summaryFile: path.join(temporary, 'retry-summary.json')}) : null;
  return defineConfig({
    root: path.join(root, 'tooling/svelte'),
    resolve: { dedupe: ['svelte'] },
    environments: {client: {build: {rolldownOptions: {output: {codeSplitting: {groups: [startupDataChunk(root)]}}}}}},
    build: { sourcemap: 'hidden', ...(retry ? {modulePreload: {resolveDependencies: retry.resolveDependencies}} : {}), rolldownOptions: { onLog: handleBuildLog } },
    plugins: [createKitVendorExternals({root}), {
      name: 'getbased-native-contracts', enforce: 'pre',
      transform(code, id) { return packStaticChatInstructions(code, id.split('?')[0]!, root) ?? rewriteNativeAssetBase(code, id.split('?')[0]!, root); },
    }, {...createSvelteFacadePlugin({root, client: 'kit'}), enforce: 'pre'},
    ...(retry ? [retry.plugin] : []), sveltekit({
      // Kit owns the full AppShell inside #kit-root. Native form delegates must
      // cancel submissions before they bubble to that root (or handle capture).
      embedded: true,
      // These generated artifacts are already compiled, not authored rune modules.
      experimental: { compileModule: { exclude: [/\.svelte\.(?:native|html)\.js$/, compiledSvelteModulePattern(root)] } },
      adapter: adapter({ pages: path.join(temporary, 'site'), assets: path.join(temporary, 'site') }),
      files: {
        src: path.join(root, 'js/kit'), routes: path.join(root, 'js/kit/routes'),
        assets: path.join(temporary, 'static'), appTemplate: path.join(temporary, 'app.html'),
        hooks: { universal: path.join(root, 'js/kit/hooks') },
      },
      outDir: path.join(temporary, '.svelte-kit'),
      moduleExtensions: ['.ts'],
      paths: { relative: false }, serviceWorker: { register: false },
      prerender: { crawl: false, entries: ['/app'] },
      version: { name: version, pollInterval: 0 },
    }), ...(retry ? [retry.finalizePlugin] : [])],
  });
}
export async function buildStaticKit(options: StaticKitOptions): Promise<KitRetrySummary> {
  // Kit's analysis/prerender workers reload the config in independent processes.
  // The random private build directory owns both proof passes and their plan.
  const configFile = path.join(options.temporary, 'vite.config.mjs');
  for (const pass of ['inventory', 'transport'] as const) {
    if (pass === 'transport') {
      await fs.rm(path.join(options.temporary, '.svelte-kit/output'), {recursive: true, force: true});
      await fs.rm(path.join(options.temporary, 'site'), {recursive: true, force: true});
    }
    await fs.writeFile(configFile, `import { staticKitConfig } from ${JSON.stringify(fileURLToPath(import.meta.url))}; export default staticKitConfig(${JSON.stringify(options)}, ${JSON.stringify(pass)});\n`);
    const builder = await createBuilder({ configFile });
    await builder.buildApp();
  }
  return readKitRetrySummary(path.join(options.temporary, 'retry-summary.json'), path.join(options.temporary, 'site'));
}
