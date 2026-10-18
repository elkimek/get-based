import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'svelte/compiler';
import * as ts from 'typescript/unstable/ast';
import {withParsedSources} from './native-typescript-ast.js';
import {scriptSource, syntaxFile} from './svelte-source.mjs';

/** Literal runtime consumers require a deliberate new ownership review, never silent style loss. */
export async function assertNoLightSetupAtomicConsumers(root: string): Promise<void> {
  const scripts = new Map<string, string>();
  const offenders = new Set<string>();
  const inspectLiteral = (value: unknown, file: string): void => {
    if (typeof value === 'string' && value.includes('gb:light-setup:')) offenders.add(file);
  };
  function inspectMarkup(value: unknown, file: string): void {
    if (Array.isArray(value)) { for (const child of value) inspectMarkup(child, file); return; }
    if (!value || typeof value !== 'object') return;
    if ('type' in value && value.type === 'Text' && 'data' in value) inspectLiteral(value.data, file);
    if ('type' in value && value.type === 'Literal' && 'value' in value) inspectLiteral(value.value, file);
    if ('type' in value && value.type === 'TemplateElement' && 'value' in value
      && value.value && typeof value.value === 'object' && 'cooked' in value.value) {
      inspectLiteral(value.value.cooked, file);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'parent' && key !== 'loc') inspectMarkup(child, file);
    }
  }
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!/\.(?:ts|svelte)$/.test(file) || file.endsWith('.d.ts')) continue;
      const source = await fs.readFile(file, 'utf8');
      if (file.endsWith('.svelte')) inspectMarkup(parse(source, {filename: file, modern: true}).fragment, file);
      scripts.set(syntaxFile(file), scriptSource(file, source));
    }
  }
  await visit(path.join(root, 'js'));
  withParsedSources(scripts, files => {
    for (const [file, source] of files) {
      function walk(node: ts.Node): void {
        if (ts.isStringLiteralLikeNode(node) || ts.isTemplateHead(node)
          || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) inspectLiteral(node.text, file);
        node.forEachChild(walk);
      }
      walk(source);
    }
  });
  assert.ok(offenders.size === 0,
    `Light setup atomic runtime consumers require qualification: ${[...offenders].sort().join(', ')}`);
}
