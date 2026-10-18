import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBuilder, defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import {createKitVendorExternals} from './kit-vendor-externals.mjs';
import { rewriteNativeAssetBase } from '../../scripts/sveltekit-contracts.mjs';
import { handleBuildLog } from '../../scripts/static-build-assets.mjs';
import { createSvelteFacadePlugin, compiledSvelteModulePattern } from '../../scripts/svelte-facade-plugin.mjs';

type StaticKitOptions = { root: string; temporary: string; version: string };
export function staticKitConfig({ root, temporary, version }: StaticKitOptions) {
  return defineConfig({
    root: path.join(root, 'tooling/svelte'),
    resolve: { dedupe: ['svelte'] },
    build: { sourcemap: true, rolldownOptions: { onLog: handleBuildLog } },
    plugins: [createKitVendorExternals({root}), {
      name: 'getbased-native-contracts', enforce: 'pre',
      transform(code, id) { return rewriteNativeAssetBase(code, id.split('?')[0]!, root); },
    }, {...createSvelteFacadePlugin({root, client: 'kit'}), enforce: 'pre'}, sveltekit({
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
    })],
  });
}
export async function buildStaticKit(options: StaticKitOptions): Promise<void> {
  // Kit's analysis/prerender workers reload the Vite config in their processes.
  // A real temporary config carries the same options without global env state.
  const configFile = path.join(options.temporary, 'vite.config.mjs');
  await fs.writeFile(configFile, `import { staticKitConfig } from ${JSON.stringify(fileURLToPath(import.meta.url))}; export default staticKitConfig(${JSON.stringify(options)});\n`);
  const builder = await createBuilder({ configFile });
  await builder.buildApp();
}
