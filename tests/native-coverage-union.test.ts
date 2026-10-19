import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createNativeCoverageFixture} from './helpers/native-coverage-fixture.js';
import {createCoverageInventory, qualifyCoverageUnion, qualifyNativeCoverageUnion} from '../scripts/ci-results.mjs';
import {nativeDigest, type NativeCoverageFile} from '../scripts/native-coverage-receipt.mjs';
import {productionFunctionIndex} from '../scripts/coverage-source.mjs';
import {sourceFingerprint} from '../scripts/coverage-model-helpers.mjs';
import {addBrowserEntriesToModel, addNativeFunctionCoverageToModel, mergeCoverageModels, summarizeCoverageModel} from '../scripts/playwright-coverage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = 'js/unique-id.js', source = fs.readFileSync(path.join(root, file), 'utf8');
const functions = productionFunctionIndex(source, file, root).owned;
type Model = Parameters<typeof summarizeCoverageModel>[0];
const model = (): Model => new Map();
// These are pure model inputs. The separate reader tests qualify complete raw
// witnesses; the model must only union exact, already-qualified own keys.
function nativeFile(called: readonly number[], unmapped: NativeCoverageFile['unmapped'] = []): NativeCoverageFile {
  return {file, sourceHash: nativeDigest(source), sourceLength: source.length,
    called: called.map(index => {const fn = functions[index]!; return {start: fn.start, end: fn.end, count: 1};}), unmapped};
}
function browserEntry(called: readonly number[]) {
  return {url: `/${file}`, text: source, ...sourceFingerprint(source),
    functions: functions.map((fn, index) => ({functionName: fn.name,
      ranges: [{startOffset: fn.start, endOffset: fn.end, count: called.includes(index) ? 1 : 0}]}))};
}

describe('native function-only and browser coverage union', () => {
  it('retains every own function while giving native calls no byte credit', () => {
    expect(functions.length).toBeGreaterThan(1);
    const value = model(); addNativeFunctionCoverageToModel(value, {files: [nativeFile([0])]});
    expect(summarizeCoverageModel(value).totals).toEqual({total: source.length, covered: 0, fnTotal: functions.length, fnCalled: 1});
    expect(value.get(file)!.ranges).toEqual([]);
  });
  it('ORs distinct exact keys across browser snapshots and native calls without double credit', () => {
    const browser = model(), native = model();
    addBrowserEntriesToModel(browser, [browserEntry([0]), browserEntry([1])]);
    const called = functions.map((_, index) => index).filter(index => index !== 1);
    addNativeFunctionCoverageToModel(native, {files: [nativeFile(called)]});
    const before = summarizeCoverageModel(browser), combined = summarizeCoverageModel(mergeCoverageModels(native, browser, native));
    expect(before.totals.fnCalled).toBe(2);
    expect(combined.totals).toEqual({...before.totals, fnTotal: functions.length, fnCalled: functions.length});
    expect(combined.rows[0]!.sources).toEqual(['playwright', 'vitest-native-functions']);
  });
  it('leaves unknown positive entries visible and gives them no function or byte credit', () => {
    const value = model(), unknown = {start: 1, end: 2, count: 4, runtimeLength: source.length, reason: 'No exact source function'};
    addNativeFunctionCoverageToModel(value, {files: [nativeFile([], [unknown, {...unknown, count: 0}])]});
    const report = summarizeCoverageModel(value);
    expect(report.totals).toEqual({total: source.length, covered: 0, fnTotal: functions.length, fnCalled: 0});
    expect(report.rows[0]!.unmappedCalledFunctions).toEqual(['1:2 native count=4: No exact source function']);
  });
  it('rejects an unowned key instead of remapping it by overlap or name', () => {
    const row = nativeFile([0]); row.called[0]!.start++;
    expect(() => addNativeFunctionCoverageToModel(model(), {files: [row]})).toThrow('not an exact canonical owned key');
  });
  it.each([0, -1, 0.5, NaN, Infinity])('rejects invalid positive function count %s', count => {
    const row = nativeFile([0]); row.called[0]!.count = count;
    expect(() => addNativeFunctionCoverageToModel(model(), {files: [row]})).toThrow('Invalid native positive function count');
  });
});

describe('explicit native unit transport seam', () => {
  it('keeps Istanbul synchronous and rejects interpreting it as native evidence', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-union-'));
    try {
      const raw = path.join(directory, 'raw'); fs.mkdirSync(raw);
      fs.writeFileSync(path.join(raw, 'one.json'), JSON.stringify({entries: [{url: '/js/main.js'}]}));
      const inventory = createCoverageInventory(raw, '1/1'), unit = path.join(directory, 'unit.json');
      fs.writeFileSync(unit, JSON.stringify({'/checkout/js/main.js': {path: '/checkout/js/main.js', statementMap: {'0': {}}, s: {'0': 1}, fnMap: {}, f: {}, branchMap: {}, b: {}}}));
      const original = qualifyCoverageUnion(raw, [inventory], 1, unit);
      expect(original).not.toBeInstanceOf(Promise);
      expect(original).toMatchObject({status: 'passed', unit: {files: 1}});
      await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, unit)).rejects.toThrow();
      await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, path.join(directory, 'missing'))).rejects.toThrow();
      fs.writeFileSync(unit, '{');
      await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, unit)).rejects.toThrow();
      await expect(qualifyNativeCoverageUnion(raw, [], 1, unit)).rejects.toThrow('Wrong coverage shard count');
      await expect(qualifyNativeCoverageUnion(raw, [inventory, inventory], 2, unit)).rejects.toThrow('Incompatible coverage inventory');
    } finally {fs.rmSync(directory, {recursive: true, force: true});}
  });
});

// A small copied-source codec root keeps corruption tests bounded. This is
// synthetic transport evidence, not an inspector run or UI/behavior acceptance.
async function withNativeFixture(run: (fixture: ReturnType<typeof createNativeCoverageFixture>, raw: string, inventory: ReturnType<typeof createCoverageInventory>, options: {root: string; expectedRevision: string}) => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-codec-'));
  try {
    const sourceRoot = path.join(directory, 'source'), transport = path.join(directory, 'unit'), raw = path.join(directory, 'browser');
    for (const relative of [file, 'tests/ci-results.test.ts']) {
      fs.mkdirSync(path.dirname(path.join(sourceRoot, relative)), {recursive: true});
      fs.copyFileSync(path.join(root, relative), path.join(sourceRoot, relative));
    }
    const revision = nativeDigest(directory).slice(0, 40), fixture = createNativeCoverageFixture(sourceRoot, transport, revision);
    fs.mkdirSync(raw); fs.writeFileSync(path.join(raw, 'one.json'), JSON.stringify({entries: [{url: `/${file}`}]}));
    await run(fixture, raw, createCoverageInventory(raw, '1/1'), {root: sourceRoot, expectedRevision: revision});
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}
function saveReceipt(fixture: ReturnType<typeof createNativeCoverageFixture>) {
  fs.writeFileSync(fixture.file, JSON.stringify(fixture.receipt));
}
function resealProof(fixture: ReturnType<typeof createNativeCoverageFixture>, relative: string, mutate: (value: Record<string, unknown>) => void) {
  const target = path.join(path.dirname(fixture.file), relative), value: unknown = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected fixture proof record');
  mutate(value as Record<string, unknown>); const bytes = Buffer.from(JSON.stringify(value)); fs.writeFileSync(target, bytes);
  const descriptor = fixture.receipt.transport.find(item => item.file === relative)!;
  descriptor.sha256 = nativeDigest(bytes); descriptor.bytes = bytes.length; saveReceipt(fixture);
}

describe('native unit union consumes authenticated synthetic codec transport', () => {
  it('qualifies the exact current inventory and actual raw positive key without Istanbul metrics', async () => withNativeFixture(async (fixture, raw, inventory, options) => {
    const result = await qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options);
    expect(result).toMatchObject({status: 'passed', shards: 1, rawFiles: 1, unit: {
      format: 'native-functions', producer: 'native-v8-own-functions', files: 1,
      calledFunctions: 1, unmappedFunctions: 0, unattributedScripts: 0, mappingComplete: true,
      tests: {modules: 1, cases: 1, passed: 1, skipped: 0},
    }});
    expect(result.unit.sha256).toBe(nativeDigest(fs.readFileSync(fixture.file)));
    expect(() => qualifyCoverageUnion(raw, [inventory], 1, fixture.file)).toThrow();
  }));
  const corruptions: Array<[string, (fixture: ReturnType<typeof createNativeCoverageFixture>) => void]> = [
    ['incomplete collection', fixture => {Object.assign(fixture.receipt, {complete: false});}],
    ['another revision', fixture => {fixture.receipt.revision = nativeDigest(fixture.file).slice(0, 40);}],
    ['missing inventory entry', fixture => {fixture.receipt.files = [];}],
    ['stale source hash', fixture => {fixture.receipt.files[0]!.sourceHash = nativeDigest('stale');}],
    ['changed source length', fixture => {fixture.receipt.files[0]!.sourceLength++;}],
    ['unowned function key', fixture => {fixture.receipt.files[0]!.called[0]!.start++;}],
    ['genuine but uncalled sibling key', fixture => {
      const row = fixture.receipt.files[0]!, copied = fs.readFileSync(path.join(fixture.context.root, row.file), 'utf8');
      const sibling = productionFunctionIndex(copied, row.file, fixture.context.root).owned.find(fn => fn.start !== fixture.key.start)!;
      row.called = [{start: sibling.start, end: sibling.end, count: 1}];
    }],
    ['forged positive count', fixture => {fixture.receipt.files[0]!.called[0]!.count++;}],
    ['nonnumeric count', fixture => {Object.assign(fixture.receipt.files[0]!.called[0]!, {count: '1'});}],
    ['invented byte metric', fixture => {Object.assign(fixture.receipt, {bytes: 1});}],
    ['zero count', fixture => {fixture.receipt.files[0]!.called[0]!.count = 0;}],
    ['duplicate canonical key', fixture => {fixture.receipt.files[0]!.called.push({...fixture.receipt.files[0]!.called[0]!});}],
    ['borrowed aggregate case count', fixture => {fixture.receipt.tests.cases++; fixture.receipt.tests.passed++;}],
    ['missing unattributed inventory', fixture => {Object.assign(fixture.receipt, {unattributed: undefined});}],
    ['missing independent transport', fixture => {fixture.receipt.transport = [];}],
    ['duplicate transport entry', fixture => {fixture.receipt.transport.push({...fixture.receipt.transport[0]!});}],
    ['unbounded transport path', fixture => {fixture.receipt.transport[0]!.file = '../outside';}],
  ];
  it.each(corruptions)('rejects %s at the real native union boundary', async (name, mutate) => withNativeFixture(async (fixture, raw, inventory, options) => {
    mutate(fixture); saveReceipt(fixture);
    const rejection = expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects;
    if (name === 'genuine but uncalled sibling key' || name === 'forged positive count') await rejection.toThrow('Native key/count/unknown summary differs from actual raw own-entry witnesses');
    else await rejection.toThrow();
  }));
  it('rejects changed raw bytes and stale emitted source bytes', async () => withNativeFixture(async (fixture, raw, inventory, options) => {
    const rawFile = path.join(path.dirname(fixture.file), fixture.rawFile), original = fs.readFileSync(rawFile);
    fs.appendFileSync(rawFile, ' ');
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow();
    fs.writeFileSync(rawFile, original); fs.appendFileSync(path.join(options.root, fixture.sourceFile), ' ');
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow();
  }));
  it('rejects missing and symlinked raw transport records', async () => withNativeFixture(async (fixture, raw, inventory, options) => {
    const rawFile = path.join(path.dirname(fixture.file), fixture.rawFile), outside = path.join(path.dirname(fixture.file), 'replacement');
    fs.renameSync(rawFile, outside);
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow();
    fs.symlinkSync(outside, rawFile);
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow();
  }));
  it.each(['missing terminal case', 'empty both case IDs', 'missing both case IDs'])('rejects a rehashed %s instead of trusting aggregate totals', async kind => withNativeFixture(async (fixture, raw, inventory, options) => {
    resealProof(fixture, fixture.casesFile, value => {
      const modules = value['modules'] as Array<{collected: Array<Record<string, unknown>>; finished: Array<Record<string, unknown>>}>;
      if (kind === 'missing terminal case') modules[0]!.finished = [];
      else for (const row of [modules[0]!.collected[0]!, modules[0]!.finished[0]!]) {
        if (kind === 'empty both case IDs') row['id'] = ''; else delete row['id'];
      }
    });
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow(kind === 'missing terminal case'
      ? 'Native collected/finished case identities or declaration modes changed' : 'Invalid native case identity');
  }));
  it('retains exact browser transport checks when native unit evidence is valid', async () => withNativeFixture(async (fixture, raw, inventory, options) => {
    const body = path.join(raw, 'one.json'), original = fs.readFileSync(body);
    fs.appendFileSync(body, ' ');
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow('Coverage body differs');
    fs.writeFileSync(body, original); fs.writeFileSync(path.join(raw, 'extra.json'), original);
    await expect(qualifyNativeCoverageUnion(raw, [inventory], 1, fixture.file, options)).rejects.toThrow('Missing or unexpected raw coverage files');
  }));
});
