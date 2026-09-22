import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const COVERAGE_ROOTS = ['js', 'api', 'lib', 'server', 'shared', 'bin'];
export const COVERAGE_FILES = ['dev-server.js', 'service-worker.js', 'service-worker-runtime.js', 'version.js'];
export const COVERAGE_INCLUDE = [...COVERAGE_ROOTS.map(root => `${root}/**/*.{js,mjs}`), ...COVERAGE_FILES];

export function isProductionSource(file) {
  return COVERAGE_FILES.includes(file)
    || (COVERAGE_ROOTS.includes(file.split('/')[0]) && /\.m?js$/.test(file));
}

export function productionSources(root) {
  const files = COVERAGE_FILES.filter(file => fs.existsSync(path.join(root, file)));
  function visit(relative) {
    if (!fs.existsSync(path.join(root, relative))) return;
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && isProductionSource(file)) files.push(file);
    }
  }
  COVERAGE_ROOTS.forEach(visit);
  return files.sort();
}

// Both Istanbul and V8 must map to a source function, never to its display name.
// Istanbul often reports only the body; V8 includes the signature. AST identity
// preserves separate same-named methods, nested functions and anonymous callbacks.
export function sourceFunctions(source, file = 'source.js') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = [];
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      let body = node.body;
      while (ts.isParenthesizedExpression(body)) body = body.expression;
      const closingLineStart = source.lastIndexOf('\n', body.end - 2) + 1;
      const indentedClosingBrace = ts.isBlock(body)
        && /^[ \t\r]*$/.test(source.slice(closingLineStart, body.end - 1));
      functions.push({
        start: node.getStart(ast), end: node.end,
        bodyStart: body.getStart(ast), bodyEnd: body.end,
        nameStart: node.name?.getStart(ast), nameEnd: node.name?.end,
        // Istanbul's block location ends before the closing brace; expression
        // bodies can omit surrounding parentheses. V8 includes the full end.
        collectorEnds: [...new Set([node.end, body.end, ...(ts.isBlock(body) ? [body.end - 1] : []),
          ...(indentedClosingBrace ? [closingLineStart] : [])])],
        name: node.name?.getText(ast) || '(anonymous)',
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return functions;
}

export function matchSourceFunction(functions, start, end, collector = 'v8') {
  // Require the end of the actual function/body. General overlap can mistake
  // a containing script or outer function for a nested callback.
  return functions.filter(fn => (fn.collectorEnds.includes(end) && start >= fn.start && start <= fn.bodyStart)
    // Istanbul can map an inline function only to its declaration name. This
    // exact AST span is safe; never accept arbitrary signature/body overlap.
    || (collector === 'istanbul' && start === fn.nameStart && end === fn.nameEnd))
    .sort((a, b) => b.start - a.start)[0] || null;
}

const FEATURES = [
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

export function coverageFeature(file) {
  if (file.startsWith('service-worker')) return 'PWA runtime';
  if (file.startsWith('shared/')) return 'Shared contracts';
  if (!file.startsWith('js/')) return 'Server and companion';
  return FEATURES.find(([, pattern]) => pattern.test(path.basename(file)))?.[0] || 'Shell and shared browser utilities';
}

export function summarizeFeatures(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = coverageFeature(row.file);
    const group = groups.get(name) || { name, files: 0, fnTotal: 0, fnCalled: 0, total: 0, covered: 0 };
    group.files++;
    for (const key of ['fnTotal', 'fnCalled', 'total', 'covered']) group[key] += row[key];
    groups.set(name, group);
  }
  return [...groups.values()].map(group => ({ ...group,
    fnPct: group.fnTotal ? 100 * group.fnCalled / group.fnTotal : 100,
    bytePct: group.total ? 100 * group.covered / group.total : 0,
  })).sort((a, b) => a.fnPct - b.fnPct || a.name.localeCompare(b.name));
}
