import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRawModuleAssets } from './raw-module-assets.mjs';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from './native-typescript-ast.js';
import {parseAppShellEntries} from './app-shell-budget.mjs';

/** Static build contracts shared by both production entrypoints. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_RAW_MODULE_ROOTS = new Set([
  '/js/theme-bootstrap.js',
  '/js/extra-theme-bootstrap.js',
  '/js/analytics-bootstrap.js',
  '/js/legal-consent-bootstrap.js',
  '/js/service-worker-update.js',
  '/js/lens-local-worker.js',
  '/js/voice-local-stt-worker.js',
  '/js/voice-local-tts-worker.js',
]);
const FATAL_BUILD_WARNINGS = new Set(['INEFFECTIVE_DYNAMIC_IMPORT']);

/** Online compatibility and license files are published without precaching a
 * second runtime. Existing tabs can still finish loading their frozen graph. */
export const ONLINE_EVOLU_ASSETS = [
  '/vendor/evolu8/evolu-bundle.js',
  '/vendor/evolu8/Db.worker.js',
  '/vendor/evolu8/Shared.worker.js',
  '/vendor/evolu8/v8.24.1-web3.6.5/LICENSE',
  '/vendor/evolu8/v8.24.1-web3.6.5/THIRD_PARTY_NOTICES.md',
] as const;

export function handleBuildLog<Level, Log>(level: Level, log: Log, defaultHandler: (level: Level, log: Log) => unknown) {
  if (FATAL_BUILD_WARNINGS.has((log as {code?: unknown} | null | undefined)?.code as string)) {
    throw new Error(`Production build rejected ${(log as {code?: unknown}).code}: ${(log as {message?: unknown}).message}`);
  }
  defaultHandler(level, log);
}

export async function productionRawModuleAssets() {
  return collectRawModuleAssets(PRODUCTION_RAW_MODULE_ROOTS, url => fs.readFile(path.join(ROOT, url.slice(1)), 'utf8'));
}

/** Prune decoded literal URLs, retaining all unrelated source bytes and comments. */
export function pruneSourceModuleAppShell(source: string, rawAssets: ReadonlySet<string>) {
  const declared = new Set(parseAppShellEntries(source));
  for (const url of rawAssets) {
    if (!declared.has(url)) throw new Error(`Raw module asset is missing from APP_SHELL: ${url}`);
  }
  return withParsedSource(source, 'service-worker.js', file => {
    let array: ts.ArrayLiteralExpression | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'APP_SHELL'
          && node.initializer && ts.isArrayLiteralExpression(node.initializer)) array = node.initializer;
      node.forEachChild(visit);
    };
    visit(file);
    // The shared reader above already requires one declaration and a static array.
    if (!array) throw new Error('Missing qualified APP_SHELL array');
    const edits: Array<{start: number; end: number}> = [];
    for (let index = 0; index < array.elements.length; index++) {
      const element = array.elements[index]!;
      if (!ts.isStringLiteralLikeNode(element)) throw new Error('Unqualified APP_SHELL entry');
      const url = element.text;
      if (!url.startsWith('/js/') || !url.endsWith('.js') || rawAssets.has(url)) continue;
      edits.push({start: element.getStart(file), end: element.getEnd()});
      const limit = array.elements[index + 1]?.getStart(file) ?? array.getEnd() - 1;
      let position = element.getEnd();
      while (position < limit) {
        if (/\s/.test(source[position]!)) {
          position++;
        } else if (source.startsWith('//', position)) {
          const lineEnd = source.slice(position + 2, limit).search(/[\n\r\u2028\u2029]/);
          position = lineEnd < 0 ? limit : position + 2 + lineEnd + 1;
        } else if (source.startsWith('/*', position)) {
          const end = source.indexOf('*/', position + 2);
          if (end < 0 || end + 2 > limit) throw new Error('Unqualified APP_SHELL separator comment');
          position = end + 2;
        } else {
          break;
        }
      }
      if (source[position] === ',') edits.push({start: position, end: position + 1});
      else if (index + 1 < array.elements.length) throw new Error('Unqualified APP_SHELL separator');
    }
    let pruned = source;
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
      pruned = pruned.slice(0, edit.start) + pruned.slice(edit.end);
    }
    const expected = [...declared].filter(url => !url.startsWith('/js/') || !url.endsWith('.js') || rawAssets.has(url));
    const actual = parseAppShellEntries(pruned);
    if (actual.length !== expected.length || actual.some((url, index) => url !== expected[index])) {
      throw new Error('Pruned APP_SHELL does not preserve the qualified URL order');
    }
    return pruned;
  });
}
