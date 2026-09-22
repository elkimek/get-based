import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { COVERAGE_INCLUDE, isProductionSource, productionSources, sourceFunctions, matchSourceFunction, summarizeFeatures } from '../scripts/coverage-source.mjs';
import { renderCoverageHtml, renderCoverageMarkdown } from '../scripts/coverage-report.mjs';

describe('complete production coverage scope', () => {
  it.each(['js/app.js', 'api/share.js', 'lib/auth.js', 'server/host.js', 'shared/contract.js', 'bin/companion.js', 'service-worker-runtime.js'])('includes %s', file => {
    expect(isProductionSource(file)).toBe(true);
  });
  it.each(['tests/helper.js', 'vendor/library.js', 'node_modules/package/index.js', 'scripts/build.mjs', 'js/readme.md'])('excludes %s', file => {
    expect(isProductionSource(file)).toBe(false);
  });
  it('discovers a never-imported module and nested mjs sources without including tooling', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-scope-'));
    try {
      for (const file of ['lib/nested/unloaded.mjs', 'shared/protocol.js', 'service-worker-runtime.js', 'scripts/tool.js']) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), 'export function uncalled() {}');
      }
      expect(productionSources(root)).toEqual(['lib/nested/unloaded.mjs', 'service-worker-runtime.js', 'shared/protocol.js']);
      expect(COVERAGE_INCLUDE).toContain('lib/**/*.{js,mjs}');
    } finally { fs.rmSync(root, { recursive: true }); }
  });
});

describe('source function identity', () => {
  const source = 'const a = { run() { return 1; } }; const b = { run() { return 2; } };';
  it('keeps identically named methods distinct across V8 signature and Istanbul body locations', () => {
    const functions = sourceFunctions(source);
    expect(functions).toHaveLength(2);
    const firstEnd = source.indexOf('}');
    const secondStart = source.lastIndexOf('run()');
    const secondEnd = source.indexOf('}', secondStart) + 1;
    const v8 = matchSourceFunction(functions, secondStart, secondEnd);
    const istanbul = matchSourceFunction(functions, source.indexOf('{', secondStart), secondEnd);
    expect(v8).toEqual(istanbul);
    expect(matchSourceFunction(functions, source.indexOf('{', secondStart), secondEnd - 1)).toEqual(v8);
    expect(v8.start).toBe(secondStart);
    expect(v8.end).not.toBe(firstEnd + 1);
  });
  it('does not attribute the outer function or script to a nested callback', () => {
    const source = 'function outer() { return [1].map(x => x + 1); }';
    const functions = sourceFunctions(source);
    expect(functions).toHaveLength(2);
    expect(matchSourceFunction(functions, 0, source.length).name).toBe('outer');
    expect(matchSourceFunction(functions, source.indexOf('x =>'), source.indexOf(');')).name).toBe('(anonymous)');
    expect(matchSourceFunction(functions, 0, source.length + 1)).toBeNull();
  });
  it('counts constructors, accessors, async methods and default-argument callbacks', () => {
    const functions = sourceFunctions('class A { constructor() {} get value() { return 1; } async run(cb = () => 1) { return cb(); } }');
    expect(functions).toHaveLength(4);
    expect(new Set(functions.map(fn => `${fn.start}:${fn.end}`)).size).toBe(4);
  });
  it('matches a parenthesized expression body without merging a sibling callback', () => {
    const source = 'const a = x => ({ value: x }); const b = x => ({ value: x });';
    const functions = sourceFunctions(source);
    const start = source.lastIndexOf('{');
    expect(matchSourceFunction(functions, start, source.lastIndexOf('}') + 1)).toEqual(functions[1]);
  });
  it('matches a closing-brace line boundary without accepting arbitrary body ranges', () => {
    const source = 'class A {\n  run() {\n    return 1;\n  }\n  other() { return 2; }\n}';
    const functions = sourceFunctions(source);
    const start = source.indexOf('{', source.indexOf('run()'));
    const end = source.indexOf('  }');
    expect(matchSourceFunction(functions, start, end, 'istanbul')).toEqual(functions[0]);
    expect(matchSourceFunction(functions, start, source.indexOf('return 1') + 8, 'istanbul')).toBeNull();
    expect(matchSourceFunction(functions, 0, end, 'istanbul')).toBeNull();
  });
  it('accepts only an exact Istanbul declaration name, never a V8 range or sibling', () => {
    const source = 'function same() { return 1; } const b = { same() { return 2; } };';
    const functions = sourceFunctions(source);
    const start = source.lastIndexOf('same');
    expect(matchSourceFunction(functions, start, start + 4, 'istanbul')).toEqual(functions[1]);
    expect(matchSourceFunction(functions, start, start + 4)).toBeNull();
    expect(matchSourceFunction(functions, start, start + 3, 'istanbul')).toBeNull();
    expect(matchSourceFunction(functions, 0, 0, 'istanbul')).toBeNull();
  });
  it('maps real V8 execution to only the called same-named method', async () => {
    const source = '(() => { const a = { run() { return 1; } }; const b = { run() { return 2; } }; return b.run(); })();';
    // A separate process avoids stopping Vitest's own V8 coverage collector.
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
      import inspector from 'node:inspector/promises';
      const session = new inspector.Session(); session.connect();
      await session.post('Profiler.enable');
      await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
      await session.post('Runtime.evaluate', { expression: ${JSON.stringify(`${source}\n//# sourceURL=coverage-identity-probe.js`)} });
      const { result } = await session.post('Profiler.takePreciseCoverage');
      console.log(JSON.stringify(result.find(entry => entry.url === 'coverage-identity-probe.js')));
      session.disconnect();
    `]);
    const script = JSON.parse(stdout);
    const functions = sourceFunctions(source);
    const executed = script.functions.filter(fn => fn.functionName === 'run').map(fn => ({
      identity: matchSourceFunction(functions, fn.ranges[0].startOffset, fn.ranges[0].endOffset),
      called: fn.ranges[0].count > 0,
    }));
    expect(executed).toHaveLength(2);
    expect(executed.map(fn => fn.called)).toEqual([false, true]);
    expect(executed.every(fn => fn.identity !== null)).toBe(true);
    expect(executed[0].identity.start).not.toBe(executed[1].identity.start);
  });
});

describe('reviewable coverage artifacts', () => {
  const row = { file: 'lib/auth.js', fnTotal: 10, fnCalled: 2, total: 100, covered: 30, fnPct: 20, pct: 30, uncalledFns: ['<script>alert(1)</script>'], unmappedCalledFunctions: [] };
  it('weights feature results by functions rather than averaging file percentages', () => {
    const groups = summarizeFeatures([row, { ...row, file: 'server/host.js', fnTotal: 2, fnCalled: 2 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'Server and companion', files: 2, fnCalled: 4, fnTotal: 12 });
    expect(groups[0].fnPct).toBeCloseTo(100 / 3);
  });
  it('attributes the result to a commit, distinguishes execution and escapes source text', () => {
    const report = { commit: 'abc123', workingTreeDirty: true, globalFnPct: 20, globalPct: 30, rows: [row], features: summarizeFeatures([row]) };
    expect(renderCoverageMarkdown(report)).toContain('abc123 (working tree modified)');
    expect(renderCoverageMarkdown(report)).toContain('not branch coverage');
    const html = renderCoverageHtml(report);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});
