import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript-api';
import { isSourceFile, sourcePath, runtimePath, walkSourceFiles } from './source-files.js';

export interface CoverageSourceFunction { start: number; end: number; bodyStart: number; bodyEnd: number; nameStart: number | undefined; nameEnd: number | undefined; collectorEnds: number[]; name: string; }
export interface CoverageFeatureRow { file: string; fnTotal: number; fnCalled: number; total: number; covered: number; }

export const COVERAGE_ROOTS = ['js', 'api', 'lib', 'server', 'shared', 'bin'];
export const COVERAGE_FILES = ['dev-server.js', 'service-worker.js', 'service-worker-runtime.js', 'service-worker-assets.js', 'version.js'];
// Collect executable JS offsets from the same artifacts in Node and browsers.
// Inventories can separately expose their canonical TypeScript sources.
export const COVERAGE_INCLUDE = [...COVERAGE_ROOTS.map(root => `${root}/**/*.{js,mjs}`), ...COVERAGE_FILES];

export function isProductionSource(file: string) {
  return COVERAGE_FILES.includes(file.replace(/\.[cm]?ts$/, '.js'))
    || (COVERAGE_ROOTS.includes(file.split('/')[0]!) && isSourceFile(file));
}

export function productionSources(root: string, { runtime = false }: { runtime?: boolean } = {}) {
  return [...new Set([
    ...COVERAGE_FILES.map(file => sourcePath(path.join(root, file))).filter(file => fs.existsSync(file)),
    ...COVERAGE_ROOTS.flatMap(directory => walkSourceFiles(path.join(root, directory))),
  ])].map(file => {
    const target = runtime ? runtimePath(file) : file;
    if (!fs.existsSync(target)) throw new Error(`Missing emitted runtime ${target}; run npm run typescript:build`);
    return path.relative(root, target).replaceAll(path.sep, '/');
  }).sort();
}

// Both Istanbul and V8 must map to a source function, never to its display name.
// Istanbul often reports only the body; V8 includes the signature. AST identity
// preserves separate same-named methods, nested functions and anonymous callbacks.
export function sourceFunctions(source: string, file = 'source.js') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.[cm]?ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const functions: CoverageSourceFunction[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionLike(node) && (node as ts.FunctionLikeDeclaration).body) {
      let body = (node as ts.FunctionLikeDeclaration).body!;
      while (ts.isParenthesizedExpression(body)) body = body.expression;
      const closingLineStart = source.lastIndexOf('\n', body.end - 2) + 1;
      const indentedClosingBrace = ts.isBlock(body)
        && /^[ \t\r]*$/.test(source.slice(closingLineStart, body.end - 1));
      functions.push({
        start: node.getStart(ast), end: node.end,
        bodyStart: body.getStart(ast), bodyEnd: body.end,
        nameStart: (node as ts.FunctionLikeDeclaration).name?.getStart(ast), nameEnd: (node as ts.FunctionLikeDeclaration).name?.end,
        // Istanbul's block location ends before the closing brace; expression
        // bodies can omit surrounding parentheses. V8 includes the full end.
        collectorEnds: [...new Set([node.end, body.end, ...(ts.isBlock(body) ? [body.end - 1] : []),
          ...(indentedClosingBrace ? [closingLineStart] : [])])],
        name: (node as ts.FunctionLikeDeclaration).name?.getText(ast) || '(anonymous)',
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return functions;
}

export function matchSourceFunction(functions: readonly CoverageSourceFunction[], start: number, end: number, collector = 'v8') {
  // Require the end of the actual function/body. General overlap can mistake
  // a containing script or outer function for a nested callback.
  return functions.filter(fn => (fn.collectorEnds.includes(end) && start >= fn.start && start <= fn.bodyStart)
    // Istanbul can map an inline function only to its declaration name. This
    // exact AST span is safe; never accept arbitrary signature/body overlap.
    || (collector === 'istanbul' && start === fn.nameStart && end === fn.nameEnd))
    .sort((a, b) => b.start - a.start)[0] || null;
}

const FEATURES: Array<[string, RegExp]> = [
  ['Biology scores', /^(biology-score|biology-scores)/],
  ['Import and export', /^(pdf-import|import-|export|backup|pii|report-)/],
  ['Sync', /^sync/],
  ['Nutrition', /^(nutrition|food-)/],
  ['Wearables and body', /^(wearable|cycle|supplement|biometric)/],
  ['Light and environment', /^(light|sun|emf|hardware)/],
  ['Genetics', /^(dna|genetic)/],
  ['Knowledge and voice', /^(lens|voice)/],
  ['Agents', /^(agent-|cli-agent)/],
  ['Wallet and providers', /^(api|provider|routstr|cashu|nostr|tinfoil|local-ai)/],
  ['Chat', /^(chat|reasoning)/],
  ['Labs and markers', /^(marker|lab-|schema|adapter|unit-|normalize)/],
  ['Profile and storage', /^(profile|data|blob|crypto|state)/],
];

export function coverageFeature(file: string) {
  if (file.startsWith('service-worker')) return 'PWA runtime';
  if (file.startsWith('shared/')) return 'Shared contracts';
  if (!file.startsWith('js/')) return 'Server and companion';
  return FEATURES.find(([, pattern]) => pattern.test(path.basename(file)))?.[0] || 'Shell and shared browser utilities';
}

export function summarizeFeatures(rows: readonly CoverageFeatureRow[]) {
  const groups = new Map<string, { name: string; files: number; fnTotal: number; fnCalled: number; total: number; covered: number }>();
  for (const row of rows) {
    const name = coverageFeature(row.file);
    const group = groups.get(name) || { name, files: 0, fnTotal: 0, fnCalled: 0, total: 0, covered: 0 };
    group.files++;
    for (const key of ['fnTotal', 'fnCalled', 'total', 'covered']) group[key as 'fnTotal' | 'fnCalled' | 'total' | 'covered'] += row[key as 'fnTotal' | 'fnCalled' | 'total' | 'covered'];
    groups.set(name, group);
  }
  return [...groups.values()].map(group => ({ ...group,
    fnPct: group.fnTotal ? 100 * group.fnCalled / group.fnTotal : 100,
    bytePct: group.total ? 100 * group.covered / group.total : 0,
  })).sort((a, b) => a.fnPct - b.fnPct || a.name.localeCompare(b.name));
}
