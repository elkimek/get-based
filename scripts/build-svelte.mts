#!/usr/bin/env node
// Compile authored components at stable native URLs for compatibility and
// coverage. The static Kit build consumes their sources with a shared runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import { walkSourceFiles } from './source-files.js';
import { compile } from 'svelte/compiler';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'js/components/DisplaySettings.svelte');
export async function buildSvelte({ component = COMPONENT, outputDirectory = path.dirname(component), check = false }: {
  component?: string; outputDirectory?: string; check?: boolean;
} = {}): Promise<void> {
  const result = await build({
    input: 'getbased:component-entry',
    write: false,
    platform: 'browser',
    plugins: [{
      name: 'getbased-svelte-component',
      resolveId(id, importer) {
        if (id === 'getbased:component-entry') return id;
        if (importer?.endsWith('.svelte') && id.startsWith('.') && id.endsWith('.js')) return { id, external: true };
        return null;
      },
      async load(id) {
        if (id === 'getbased:component-entry') {
          return `export { default } from ${JSON.stringify(component)}; export { mount, unmount, flushSync } from 'svelte';`;
        }
        if (!id.endsWith('.svelte')) return null;
        const compiled = compile(await fs.readFile(id, 'utf8'), {
          filename: id, generate: 'client', css: 'external', dev: false,
        });
        if (compiled.warnings.length) {
          throw new Error(compiled.warnings.map(warning => `${warning.code}: ${warning.message}`).join('\n'));
        }
        if (compiled.css?.code) throw new Error('Component styles must use the scoped Tailwind stylesheet');
        return { code: compiled.js.code, map: compiled.js.map };
      },
    }],
    output: { dir: outputDirectory, format: 'es', minify: true, sourcemap: true, entryFileNames: `${path.basename(component)}.native.js` },
  });
  for (const output of result.output) {
    const file = path.join(outputDirectory, output.fileName);
    const content = output.type === 'chunk' ? output.code : output.source;
    if (check) {
      const existing = await fs.readFile(file);
      if (!existing.equals(Buffer.from(content))) throw new Error(`Svelte output is stale: ${output.fileName}`);
    } else {
      await fs.mkdir(outputDirectory, { recursive: true });
      await fs.writeFile(file, content);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const component of [...walkSourceFiles(path.join(ROOT, 'js/components')), ...walkSourceFiles(path.join(ROOT, 'js/kit'))].filter(file => file.endsWith('.svelte'))) {
    await buildSvelte({ component, check: process.argv.includes('--check') });
  }
}
