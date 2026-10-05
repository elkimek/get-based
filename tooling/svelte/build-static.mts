import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBuilder, defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { rewriteNativeAssetBase } from '../../scripts/sveltekit-contracts.mjs';
import { handleBuildLog } from '../../scripts/build-production.mjs';

type StaticKitOptions = { root: string; temporary: string; version: string };
export function staticKitConfig({ root, temporary, version }: StaticKitOptions) {
  const componentBridge = path.join(root, 'js/components/DisplaySettings.svelte.native.js');
  return defineConfig({
    root: path.join(root, 'tooling/svelte'),
    resolve: { dedupe: ['svelte'] },
    build: { sourcemap: true, rolldownOptions: { onLog: handleBuildLog } },
    plugins: [{
      name: 'getbased-native-contracts', enforce: 'pre',
      transform(code, id) { return rewriteNativeAssetBase(code, id.split('?')[0]!, root); },
      load(id) {
        if (id !== componentBridge) return null;
        // Use the authored component and Kit's shared Svelte runtime, preserving
        // the native adapter contract without bundling Svelte a second time.
        return `export { default } from ${JSON.stringify(path.join(root, 'js/components/DisplaySettings.svelte'))}; export { mount, unmount, flushSync } from 'svelte';`;
      },
    }, sveltekit({
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
