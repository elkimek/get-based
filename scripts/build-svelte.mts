#!/usr/bin/env node
// Bundle the bounded component for native ESM. Domain services stay external;
// SvelteKit can later consume the same authored .svelte component directly.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import { compile } from 'svelte/compiler';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'js/components/DisplaySettings.svelte');
export async function buildSvelte({ outputDirectory = path.dirname(COMPONENT), check = false }: {
  outputDirectory?: string; check?: boolean;
} = {}): Promise<void> {
  const result = await build({
    input: 'getbased:display-entry',
    write: false,
    platform: 'browser',
    plugins: [{
      name: 'getbased-display-component',
      resolveId(id) { return id === 'getbased:display-entry' ? id : null; },
      async load(id) {
        if (id === 'getbased:display-entry') {
          return `export { default } from ${JSON.stringify(COMPONENT)}; export { mount, unmount, flushSync } from 'svelte';`;
        }
        if (id !== COMPONENT) return null;
        const compiled = compile(await fs.readFile(id, 'utf8'), {
          filename: id, generate: 'client', css: 'external', dev: false,
        });
        if (compiled.warnings.length) {
          throw new Error(compiled.warnings.map(warning => `${warning.code}: ${warning.message}`).join('\n'));
        }
        if (compiled.css?.code) throw new Error('Display styles must use the scoped Tailwind stylesheet');
        return { code: compiled.js.code, map: compiled.js.map };
      },
    }],
    output: { dir: outputDirectory, format: 'es', minify: true, sourcemap: true, entryFileNames: 'DisplaySettings.svelte.native.js' },
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
  await buildSvelte({ check: process.argv.includes('--check') });
}
