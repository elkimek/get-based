import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseAst} from 'rolldown/parseAst';
import {expect, it} from 'vitest';

const root = process.cwd();
const fixturePath = path.join(root, 'tests/fixtures/lab-context-assembly-original.json');
const bytes = fs.readFileSync(fixturePath, 'utf8');
expect(createHash('sha256').update(bytes).digest('hex')).toBe('17d73972d9bda69be90e10ffaebfb4a6de7b01e1382c11e3fc5e1de41fa0b184');
const original = JSON.parse(bytes) as {source: string};
const facade = fs.readFileSync(path.join(root, 'js/lab-context.ts'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js/lab-context-assembly.ts'), 'utf8');
function declaration(source: string, name: string) {
  for (const statement of parseAst(source, {lang: 'ts'}).body) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (node?.type === 'FunctionDeclaration' && node.id?.name === name) {
      if (!node.body) throw new Error('Expected a concrete function body');
      return {source: source.slice(node.start, node.end), body: source.slice(node.body.start, node.body.end)};
    }
  }
  throw new Error('Missing actual declaration ' + name);
}
function importSources(source: string) {
  return parseAst(source, {lang: 'ts'}).body.filter(node => node.type === 'ImportDeclaration')
    .map(node => source.slice(node.start, node.end));
}
it('moves the complete original pipeline, assembly and date algorithm without changing their logic or dependency bindings', () => {
  for (const name of ['buildLabContext', '_buildLabContextInner']) {
    expect(declaration(core, name).source).toBe(declaration(original.source, name).source);
  }
  expect(declaration(core, 'formatLabDateAgeValue').body).toBe(declaration(original.source, 'formatLabDateAge').body);
  expect(importSources(core)).toEqual(importSources(original.source));
  expect(declaration(facade, 'buildLabContext').source).toBe(
    "function buildLabContext({ skipGroupFilter, ignoreContextToggles, queryText, nutritionHistoryLabel }: LabContextOptions = {}) {\n"
    + '  return buildLabContextCore({ skipGroupFilter, ignoreContextToggles, queryText, nutritionHistoryLabel });\n}',
  );
  expect(declaration(facade, 'formatLabDateAge').source).toBe(
    'function formatLabDateAge(date: string, now = Date.now()) {\n  return formatLabDateAgeValue(date, now);\n}',
  );
  expect(core).toContain('function formatLabDateAgeValue(date: string, now: number)');
});

// Evaluate genuine original/current module bodies in isolated native ESM graphs.
// Mock only their unchanged imported boundaries; every read/callback/cache event
// is compared with the frozen original. Canonical and retry facades share one
// dependency graph in each run, matching real bare-relative ESM resolution.
const harness = String.raw`
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const root = process.argv[1], scenario = process.argv[2];
const frozen = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/lab-context-assembly-original.json'), 'utf8'));
async function run(mode) {
  const trace = [], cache = new Map(), modules = new Map(), sentinel = Error('synthetic owned boundary failure');
  let sunReads = 0;
  class Clock extends Date {
    static get now() {
      trace.push('now:get');
      return () => {
        trace.push('now:call');
        if (scenario === 'format-now-throw') throw sentinel;
        return scenario === 'format-now-undefined' ? undefined : Date.parse('2026-10-17T12:00:00Z');
      };
    }
  }
  const importedData = new Proxy({supplements: [], entries: []}, {
    get(target, key) {trace.push('data:' + String(key)); return target[key];},
  });
  const state = new Proxy({importedData, currentProfile: 'synthetic', profileSex: 'male', profileDob: null, unitSystem: 'EU'}, {
    get(target, key) {trace.push('state:' + String(key)); return target[key];},
  });
  const data = {dates: ['2026-10-17'], categories: {fixture: {label: 'Fixture', markers: {sample: {name: 'Sample', values: [1], unit: 'u'}}}}};
  const labContextDeps = Object.defineProperties({}, {
    buildBiologyScoresAIContext: {get() {
      trace.push('biology:get');
      return function() {trace.push('biology:this:' + (this === labContextDeps)); return 'BIO\n';};
    }},
    buildSunContext: {get() {
      trace.push('sun:get'); sunReads++;
      if (sunReads % 2) return () => {throw Error('The typeof-read function must never be prebound or invoked');};
      return function() {trace.push('sun:this:' + (this === labContextDeps)); return 'SUN\n';};
    }},
  });
  const values = Object.fromEntries(Object.values(frozen.imports).flat().map(name => [name, () => '']));
  Object.assign(values, {
    state, labContextDeps, SBM_2015_THRESHOLDS: {}, NUTRITION_CONTEXT_DAY_OPTIONS: [7, 30],
    getActiveData: () => {trace.push('active-data'); return data;},
    getLabContextFingerprint: () => {trace.push('fingerprint'); return 'synthetic-fingerprint';},
    resolveSupplementContextMode: query => {trace.push('resolve:' + String(query)); return 'compact';},
    getOrBuildLabContext: (key, build) => {
      trace.push('cache:' + key);
      if (cache.has(key)) {trace.push('cache:hit'); return cache.get(key);}
      trace.push('cache:miss'); const result = build(); cache.set(key, result); return result;
    },
    isLabMarkersContextEnabled: () => true, isLightSunContextEnabled: () => true,
    isInsightContextCardsEnabled: () => false, isSupplementsMedsContextEnabled: () => false,
    isGeneticsSummaryInAIContext: () => false, isGeneticsPriorityInAIContext: () => false,
    isGeneticsInventoryInAIContext: () => false, isWearableContextEnabled: () => false,
    isNutritionContextEnabled: () => false,
    getLatestValueIndex: () => 0, formatMarkerValuesForChat: () => '1 u',
    getCurrentSupplements: () => [], getSupplementsOverlappingRange: () => [],
    getProfileHeight: () => ({}), getLatitudeFromLocation: () => 0, getProfileLocation: () => ({}),
    getUnitProfileLabel: () => 'EU', buildContextChangeTimeline: () => '', buildLabCollectionContextSection: () => '',
  });
  const context = vm.createContext({Date: Clock, console});
  function load(url) {
    if (modules.has(url)) return modules.get(url);
    const file = new URL(url).pathname.split('/').at(-1);
    let module;
    if (file === 'lab-context.js' || file === 'lab-context-assembly.js') {
      if (mode === 'original' && file === 'lab-context-assembly.js') throw Error('Original must not acquire the candidate core');
      const source = mode === 'original' ? frozen.source : fs.readFileSync(path.join(root, 'js', file.replace(/\.js$/, '.ts')), 'utf8');
      module = new vm.SourceTextModule(stripTypeScriptTypes(source, {mode: 'strip'}), {context, identifier: url});
    } else {
      const names = frozen.imports['./' + file];
      if (!names) throw Error('Unexpected candidate dependency ' + file);
      module = new vm.SyntheticModule(names, function() {
        for (const name of names) this.setExport(name, values[name]);
      }, {context, identifier: url});
    }
    modules.set(url, module);
    return module;
  }
  const first = load('file:///synthetic/js/lab-context.js');
  await first.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
  await first.evaluate();
  const second = load('file:///synthetic/js/lab-context.js?lazy-retry=1');
  await second.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
  await second.evaluate();
  const api = first.namespace, retry = second.namespace;
  const namespace = {
    names: Object.keys(api).sort(), retryNames: Object.keys(retry).sort(),
    buildName: api.buildLabContext.name, buildArity: api.buildLabContext.length,
    formatName: api.formatLabDateAge.name, formatArity: api.formatLabDateAge.length,
    ownedFunctions: api.buildLabContext !== retry.buildLabContext && api.formatLabDateAge !== retry.formatLabDateAge,
    sharedExports: frozen.publicNames.filter(name => !['buildLabContext', 'formatLabDateAge'].includes(name)).every(name => api[name] === retry[name]),
  };
  let output, error;
  try {
    if (scenario.startsWith('format-')) {
      if (scenario === 'format-explicit-zero') output = api.formatLabDateAge('2026-10-17', 0);
      else if (scenario === 'format-explicit-null') output = api.formatLabDateAge('2026-10-17', null);
      else if (scenario === 'format-explicit-undefined') output = api.formatLabDateAge('2026-10-17', undefined);
      else output = api.formatLabDateAge('2026-10-17');
    } else if (scenario === 'cache') {
      output = [api.buildLabContext({queryText: 'same'}), retry.buildLabContext({queryText: 'same'}), api.buildLabContext({queryText: 'same'})];
    } else if (scenario === 'null') output = api.buildLabContext(null);
    else if (scenario === 'undefined') output = api.buildLabContext(undefined);
    else if (scenario === 'no-argument') output = api.buildLabContext();
    else {
      const keys = ['skipGroupFilter', 'ignoreContextToggles', 'queryText', 'nutritionHistoryLabel'];
      const prototype = Object.create(null);
      const options = Object.create(scenario === 'inherited' ? prototype : null);
      const owner = scenario === 'inherited' ? prototype : options;
      for (const key of keys) Object.defineProperty(owner, key, {get() {
        trace.push('option:' + key);
        if (scenario === 'fault:' + key) throw sentinel;
        return key === 'queryText' ? 'question' : undefined;
      }});
      Object.defineProperty(options, Symbol('must-not-read'), {get() {throw sentinel;}});
      const proxy = new Proxy(options, {ownKeys() {throw Error('Original destructuring never enumerates options');}});
      output = api.buildLabContext(proxy);
    }
  } catch (caught) {error = {name: caught.name, message: caught.message, injectedIdentity: caught === sentinel};}
  return {namespace, output, error, trace};
}
console.log(JSON.stringify({original: await run('original'), candidate: await run('candidate')}));
`;
interface Evidence {
  namespace: {names: string[]; retryNames: string[]; buildName: string; buildArity: number; formatName: string; formatArity: number; ownedFunctions: boolean; sharedExports: boolean};
  output?: unknown;
  error?: {name: string; message: string; injectedIdentity: boolean};
  trace: string[];
}
for (const scenario of ['no-argument', 'undefined', 'null', 'options', 'inherited', 'cache',
  'fault:skipGroupFilter', 'fault:ignoreContextToggles', 'fault:queryText', 'fault:nutritionHistoryLabel',
  'format-default', 'format-explicit-zero', 'format-explicit-null', 'format-explicit-undefined', 'format-now-undefined', 'format-now-throw']) {
  it(`${scenario}: preserves exact original output, getter/fault/clock/cache order and canonical/retry ownership`, () => {
    const result = JSON.parse(execFileSync(process.execPath,
      ['--experimental-vm-modules', '--input-type=module', '--eval', harness, root, scenario],
      {encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe']})) as {original: Evidence; candidate: Evidence};
    expect(result.candidate).toEqual(result.original);
    expect(result.candidate.namespace).toMatchObject({buildName: 'buildLabContext', buildArity: 0,
      formatName: 'formatLabDateAge', formatArity: 1, ownedFunctions: true, sharedExports: true});
    if (scenario === 'cache') {
      expect(result.candidate.trace.filter(value => value === 'cache:miss')).toHaveLength(1);
      expect(result.candidate.trace.filter(value => value === 'cache:hit')).toHaveLength(2);
      expect(result.candidate.trace.filter(value => value === 'biology:get')).toHaveLength(1);
      expect(result.candidate.trace.filter(value => value === 'sun:get')).toHaveLength(2);
      expect(result.candidate.trace).toContain('biology:this:true');
      expect(result.candidate.trace).toContain('sun:this:true');
      expect(result.candidate.output).toEqual([expect.stringContaining('SUN'), expect.stringContaining('SUN'), expect.stringContaining('SUN')]);
    }
    if (scenario === 'format-now-undefined' || scenario === 'format-now-throw') {
      expect(result.candidate.trace).toEqual(['now:get', 'now:call']);
      expect(result.candidate.error).toBeDefined();
    }
  });
}
