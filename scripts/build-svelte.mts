#!/usr/bin/env node
// Compile authored components at stable native URLs for compatibility and
// coverage. The static Kit build consumes their sources with a shared runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { walkSourceFiles } from './source-files.js';
import { compile } from 'svelte/compiler';
import { withChatShellSnapshot } from './chat-shell-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'js/components/DisplaySettings.svelte');
export async function buildSvelte({ component = COMPONENT, outputDirectory = path.dirname(component), check = false, output = 'client' }: {
  component?: string; outputDirectory?: string; check?: boolean; output?: 'client' | 'html';
} = {}): Promise<void> {
  const result = await build({
    input: 'getbased:component-entry',
    write: false,
    // HTML rendering needs Svelte's server lifecycle exports, even when the
    // synchronous result is later used by a browser compatibility adapter.
    platform: output === 'html' ? 'neutral' : 'browser',
    plugins: [{
      name: 'getbased-svelte-component',
      resolveId(id, importer) {
        if (id === 'getbased:component-entry') return id;
        if (output === 'html' && id === 'node:async_hooks') return { id, external: true }; // Svelte retains its optional async renderer; this entry exposes only synchronous .body.
        if (importer?.endsWith('.svelte') && id.startsWith('.') && id.endsWith('.js')) return { id, external: true };
        return null;
      },
      async load(id) {
        if (id === 'getbased:component-entry') {
          if (output === 'html') return `import Component from ${JSON.stringify(component)}; import { render } from 'svelte/server'; export const renderHTML = props => render(Component, { props }).body;`;
          const hydration = /\/(?:RoutstrActions|ChatShell|ChatSpeechButton|ChatMessageActions|ContextNotes|ContextCardStatus)\.svelte$/.test(component) ? ', hydrate' : '';
          return `export { default } from ${JSON.stringify(component)}; export { mount, unmount, flushSync${hydration} } from 'svelte';`;
        }
        if (!id.endsWith('.svelte')) return null;
        const compiled = compile(await fs.readFile(id, 'utf8'), {
          filename: id, generate: output === 'html' ? 'server' : 'client', css: 'external', dev: false,
        });
        if (compiled.warnings.length) {
          throw new Error(compiled.warnings.map(warning => `${warning.code}: ${warning.message}`).join('\n'));
        }
        if (compiled.css?.code) throw new Error('Component styles must use the scoped Tailwind stylesheet');
        return { code: compiled.js.code, map: compiled.js.map };
      },
    }],
    output: { dir: outputDirectory, format: 'es', minify: true, sourcemap: true, entryFileNames: `${path.basename(component)}.${output === 'html' ? 'html' : 'native'}.js` },
  });
  if (output === 'html' && result.output.some(chunk => chunk.type === 'chunk' && (
    chunk.imports.some(id => id.startsWith('node:')) ||
    chunk.dynamicImports.some(id => id.startsWith('node:') && id !== 'node:async_hooks')
  ))) throw new Error('Browser HTML cannot import Node APIs except Svelte’s unused optional asynchronous renderer');
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
    if (/\/(?:RoutstrActions|ChatShell|ChatAttestationBadge|ChatSpeechButton|ChatCitations|ChatStoredImages|ChatMessageActions|ChatAgentDraftCards|ChatProviderQuiz|ChatOnboardingProgress|ContextCardCatalog|ContextCardStatus|ContextCardTips|ContextEMFLauncher|ContextFoodContaminantsBadge|ContextNutritionLink|NutritionPresentation)\.svelte$/.test(component)) await buildSvelte({ component, output: 'html', check: process.argv.includes('--check') });
  }
  const { renderHTML } = await import(pathToFileURL(path.join(ROOT, 'js/components/ChatShell.svelte.html.js')).href) as { renderHTML: () => string };
  const indexPath = path.join(ROOT, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  const generated = withChatShellSnapshot(index, renderHTML());
  if (process.argv.includes('--check')) {
    if (generated !== index) throw new Error('Native Chat shell snapshot is stale; run npm run svelte:build');
  } else await fs.writeFile(indexPath, generated);
}
