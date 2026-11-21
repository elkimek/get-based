#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {qualifiedPlan} from './ci-plan.mjs';
import {validateKitCases, type KitCase} from './kit-acceptance-reporter.mjs';
import {readNativeFunctionCoverage, type NativeCoverageReadOptions} from './native-coverage-receipt.mjs';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function regular(file: string, label: string): Buffer {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {assert(fs.fstatSync(descriptor).isFile(), label); return fs.readFileSync(descriptor);}
  finally {fs.closeSync(descriptor);}
}
function json(file: string): unknown { return JSON.parse(regular(file, `Nonregular JSON file: ${file}`).toString('utf8')); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);
function jsonFiles(directory: string): string[] {
  assert(fs.lstatSync(directory).isDirectory(), `Expected directory: ${directory}`);
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.json')).sort();
  for (const file of files) assert(fs.lstatSync(path.join(directory, file)).isFile(), `Nonregular JSON file: ${file}`);
  return files;
}
function kitReport(value: unknown, execution: boolean): {context: unknown; tests: KitCase[]} {
  const report = object(value, 'Kit report');
  assert(report['schemaVersion'] === 1 && report['execution'] === execution && report['status'] === 'passed', 'Unsuccessful or incompatible Kit report');
  assert(Array.isArray(report['issues']) && report['issues'].length === 0, 'Kit report contains guard issues');
  assert(Array.isArray(report['tests']), 'Kit tests must be an array');
  const tests = report['tests'].map(value => {
    const test = object(value, 'Kit case');
    for (const field of ['id', 'file', 'project', 'title', 'declaredExpectedStatus']) assert(typeof test[field] === 'string', `Missing Kit ${field}`);
    assert(Array.isArray(test['titlePath']) && test['titlePath'].every(part => typeof part === 'string'), 'Invalid Kit title path');
    assert(Number.isSafeInteger(test['repeatEachIndex']) && Number(test['repeatEachIndex']) >= 0, 'Invalid Kit repeat index');
    assert(test['id'] === JSON.stringify([test['project'], test['file'], test['titlePath'], test['repeatEachIndex']]), 'Forged Kit portable identity');
    assert(Array.isArray(test['declaredAnnotations']), 'Missing declared Kit annotations');
    if (execution) {
      assert(test['attemptCount'] === 1, `Unexpected Kit attempts: ${test['id']}`);
      assert(test['outcome'] === (test['status'] === 'skipped' ? 'skipped' : 'expected'), `Unexpected Kit outcome: ${test['id']}`);
      assert(Array.isArray(test['annotations']), 'Missing observed Kit annotations');
    }
    return test as unknown as KitCase;
  });
  const issues = validateKitCases(tests, execution, execution);
  assert(!issues.length, issues.join('\n'));
  return {context: report['context'] ?? null, tests};
}
interface KitRunContext {commit: string; runId: string; runAttempt: string}
function kitRunContext(value: unknown): KitRunContext {
  const context = object(value, 'Kit run context');
  assert(same(Object.keys(context).sort(), ['commit', 'runAttempt', 'runId']), 'Unexpected Kit run context fields');
  assert(typeof context['commit'] === 'string' && /^[a-f0-9]{40}$/.test(context['commit']), 'Invalid Kit source revision');
  assert(typeof context['runId'] === 'string' && /^[1-9]\d*$/.test(context['runId']), 'Invalid Kit run identity');
  assert(typeof context['runAttempt'] === 'string' && /^[1-9]\d*$/.test(context['runAttempt'])
    && Number.isSafeInteger(Number(context['runAttempt'])), 'Invalid Kit run attempt');
  return context as unknown as KitRunContext;
}
/** Retry receipts may replace only the exact same declared shard in this run. */
function latestKitReports(collection: ReturnType<typeof kitReport>, reports: readonly unknown[], currentValue: unknown) {
  const current = kitRunContext(currentValue), collected = kitRunContext(collection.context);
  assert(current.commit === collected.commit && current.runId === collected.runId
    && Number(current.runAttempt) >= Number(collected.runAttempt), 'Kit collection differs from current run');
  const expected = new Map(collection.tests.map(test => [test.id, test]));
  const shards = new Map<string, {attempt: number; value: unknown}>(), attempts = new Set<string>();
  for (const value of reports) {
    const report = object(value, 'Kit report'), context = kitRunContext(report['context']);
    assert(report['schemaVersion'] === 1 && report['execution'] === true, 'Incompatible Kit execution report');
    assert(context.commit === collected.commit && context.runId === collected.runId
      && Number(context.runAttempt) >= Number(collected.runAttempt)
      && Number(context.runAttempt) <= Number(current.runAttempt), 'Kit report context differs from current run');
    assert(Array.isArray(report['tests']) && report['tests'].length > 0, 'Missing Kit shard cases');
    const ids = report['tests'].map(value => {
      const test = object(value, 'Kit case'), declaration = expected.get(String(test['id']));
      assert(declaration && test['id'] === declaration.id, 'Uncollected Kit retry case');
      assert(test['declaredExpectedStatus'] === declaration.declaredExpectedStatus
        && same(test['declaredAnnotations'], declaration.declaredAnnotations), 'Changed Kit retry declaration');
      return declaration.id;
    }).sort();
    assert(new Set(ids).size === ids.length, 'Duplicate Kit retry case');
    const identity = JSON.stringify(ids), attempt = Number(context.runAttempt), prior = shards.get(identity);
    const receiptIdentity = JSON.stringify([identity, attempt]);
    assert(!attempts.has(receiptIdentity), 'Ambiguous Kit reports for the same shard and attempt');
    attempts.add(receiptIdentity);
    if (!prior || attempt > prior.attempt) shards.set(identity, {attempt, value});
  }
  return {reports: [...shards.values()].map(shard => shard.value), provenance: {
    ...current, collectionAttempt: collected.runAttempt,
    selectedAttempts: [...new Set([...shards.values()].map(shard => shard.attempt))].sort((a, b) => a - b),
    supersededReports: reports.length - shards.size,
  }};
}
/** Keep immutable per-attempt artifact directories separate until qualification. */
export function readKitReports(directory: string): unknown[] {
  const reports = jsonFiles(directory).map(file => json(path.join(directory, file)));
  for (const name of fs.readdirSync(directory).sort()) {
    const target = path.join(directory, name);
    const stat = fs.lstatSync(target);
    assert(!stat.isSymbolicLink(), 'Symbolic Kit receipt artifact');
    if (!stat.isDirectory()) continue;
    const match = /^kit-receipt-([a-z][a-z0-9-]*)-attempt-([1-9]\d*)$/.exec(name);
    assert(match, 'Unexpected Kit receipt artifact directory');
    const files = jsonFiles(target);
    assert(files.length === 1 && files[0] === `${match[1]}.json`, 'Unexpected Kit receipt artifact contents');
    const value = object(json(path.join(target, files[0]!)), 'Kit report');
    assert(object(value['context'], 'Kit run context')['runAttempt'] === match[2], 'Kit artifact attempt differs from report');
    reports.push(value);
  }
  return reports;
}
/** A shard can never replace, duplicate or silently omit an intended case. */
export function qualifyKitUnion(collection: unknown, reports: readonly unknown[], currentContext?: unknown) {
  const expected = kitReport(collection, false);
  const selected = currentContext === undefined ? {reports} : latestKitReports(expected, reports, currentContext);
  const byId = new Map(expected.tests.map(test => [test.id, test]));
  const observed = new Set<string>();
  let executed = 0;
  assert(reports.length > 0, 'No Kit execution reports');
  for (const value of selected.reports) {
    const report = kitReport(value, true);
    if (currentContext === undefined) assert(same(report.context, expected.context), 'Kit report context differs from collection');
    for (const test of report.tests) {
      const declaration = byId.get(test.id);
      assert(declaration, `Uncollected Kit result: ${test.id}`);
      assert(!observed.has(test.id), `Duplicate Kit shard result: ${test.id}`);
      assert(test.declaredExpectedStatus === declaration.declaredExpectedStatus && same(test.declaredAnnotations, declaration.declaredAnnotations), `Changed Kit declaration: ${test.id}`);
      observed.add(test.id); if (test.status !== 'skipped') executed++;
    }
  }
  const missing = expected.tests.filter(test => !observed.has(test.id));
  assert(!missing.length, `Missing ${missing.length} intended Kit cases: ${missing.map(test => test.id).join(', ')}`);
  assert(executed > 0, 'No SvelteKit acceptance case executed across selected shards');
  return {schemaVersion: 1, status: 'passed', executed, collected: expected.tests.length, executedOrApprovedSkip: observed.size, reports: selected.reports.length, ...('provenance' in selected ? {provenance: selected.provenance} : {})};
}
export interface CoverageFile {file: string; sha256: string; bytes: number; entries: number}
export interface CoverageInventory {schemaVersion: 1; shard: {current: number; total: number}; files: CoverageFile[]}
function parseShard(shard: string) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  const current = Number(match?.[1]), total = Number(match?.[2]);
  assert(match && Number.isSafeInteger(current) && Number.isSafeInteger(total) && current <= total && total <= 64, 'Invalid coverage shard N/M');
  return {current, total};
}
function readCoverageFile(directory: string, file: string) {
  assert(path.basename(file) === file && file.endsWith('.json'), 'Invalid raw coverage filename');
  const target = path.join(directory, file);
  const body = regular(target, `Nonregular raw coverage file: ${file}`), value = object(JSON.parse(body.toString('utf8')), `Coverage ${file}`);
  assert(Array.isArray(value['entries']), `Missing raw entries: ${file}`);
  for (const entry of value['entries']) {
    const record = object(entry, `Coverage entry ${file}`);
    assert(typeof record['url'] === 'string', `Invalid coverage URL: ${file}`);
  }
  const receipt: CoverageFile = {file, sha256: digest(body), bytes: body.length, entries: value['entries'].length};
  return {receipt, value};
}
export function createCoverageInventory(directory: string, shard: string): CoverageInventory {
  const files = jsonFiles(directory).map(file => readCoverageFile(directory, file).receipt);
  assert(files.length > 0 && files.some(file => file.entries > 0), 'Coverage shard has no readable nonempty raw coverage');
  return {schemaVersion: 1, shard: parseShard(shard), files};
}
function validateUnitCoverage(file: string): {files: number; sha256: string} {
  const body = regular(file, 'Unit coverage must be a regular file'), value = object(JSON.parse(body.toString('utf8')), 'Unit coverage');
  const files = Object.entries(value);
  assert(files.length > 0, 'Unit coverage is empty');
  let statements = 0;
  for (const [name, raw] of files) {
    const record = object(raw, `Unit coverage ${name}`);
    assert(typeof record['path'] === 'string', `Unit coverage path missing: ${name}`);
    for (const map of ['statementMap', 'fnMap', 'branchMap']) object(record[map], `Unit ${map}`);
    for (const map of ['s', 'f']) {
      const counts = Object.values(object(record[map], `Unit ${map}`));
      assert(counts.every(count => typeof count === 'number' && Number.isFinite(count) && count >= 0), `Invalid unit ${map} counts`);
      if (map === 's') statements += counts.length;
    }
    const branches = Object.values(object(record['b'], 'Unit branch counts'));
    assert(branches.every(counts => Array.isArray(counts) && counts.every(count => typeof count === 'number' && Number.isFinite(count) && count >= 0)), 'Invalid unit branch counts');
  }
  assert(statements > 0, 'Unit coverage contains no statements');
  return {files: files.length, sha256: digest(body)};
}
type ReadVerifiedBrowserCoverage = (file: string, body: Record<string, unknown>) => void;
function qualifyBrowserCoverageUnion(directory: string, inventories: readonly unknown[], expectedShards: number, readVerified?: ReadVerifiedBrowserCoverage) {
  assert(Number.isSafeInteger(expectedShards) && expectedShards > 0 && expectedShards <= 64 && inventories.length === expectedShards, 'Wrong coverage shard count');
  const shardIds = new Set<number>(), files = new Map<string, CoverageFile>();
  for (const raw of inventories) {
    const inventory = object(raw, 'Coverage inventory'), shard = object(inventory['shard'], 'Coverage shard');
    assert(inventory['schemaVersion'] === 1 && shard['total'] === expectedShards, 'Incompatible coverage inventory');
    const current = Number(shard['current']);
    assert(Number.isSafeInteger(current) && current > 0 && current <= expectedShards && !shardIds.has(current), 'Duplicate or invalid coverage shard');
    shardIds.add(current);
    assert(Array.isArray(inventory['files']) && inventory['files'].length > 0, 'Empty coverage inventory');
    let shardEntries = 0;
    for (const entry of inventory['files']) {
      const declared = object(entry, 'Coverage file');
      assert(typeof declared['file'] === 'string' && !files.has(declared['file']), 'Duplicate or invalid raw coverage file');
      const {receipt: actual, value} = readCoverageFile(directory, declared['file']);
      assert(actual.sha256 === declared['sha256'] && actual.bytes === declared['bytes'] && actual.entries === declared['entries'], `Coverage body differs: ${actual.file}`);
      files.set(actual.file, actual); shardEntries += actual.entries;
      readVerified?.(actual.file, value);
    }
    assert(shardEntries > 0, 'Coverage inventory has no nonempty browser entries');
  }
  assert(same(jsonFiles(directory), [...files.keys()].sort()), 'Missing or unexpected raw coverage files');
  assert([...files.values()].some(file => file.entries > 0), 'No browser coverage entries');
  return {schemaVersion: 1, status: 'passed', shards: expectedShards, rawFiles: files.size};
}
/** Retain the synchronous genuine Istanbul contract used by existing producers. */
export function qualifyCoverageUnion(directory: string, inventories: readonly unknown[], expectedShards: number, unitFile: string) {
  const browser = qualifyBrowserCoverageUnion(directory, inventories, expectedShards);
  return {...browser, unit: validateUnitCoverage(unitFile)};
}
/** Native function-only evidence has its own explicit, asynchronously replayed contract. */
export async function qualifyNativeCoverageUnion(directory: string, inventories: readonly unknown[], expectedShards: number, unitFile: string, options: NativeCoverageReadOptions = {}) {
  return (await readQualifiedNativeCoverageUnion(directory, inventories, expectedShards, unitFile, options)).qualification;
}

/** Consume browser bytes after digest validation and return the independently replayed unit receipt. */
export async function readQualifiedNativeCoverageUnion(directory: string, inventories: readonly unknown[], expectedShards: number, unitFile: string, options: NativeCoverageReadOptions = {}, readVerified?: ReadVerifiedBrowserCoverage) {
  const browser = qualifyBrowserCoverageUnion(directory, inventories, expectedShards, readVerified);
  const root = options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const receipt = await readNativeFunctionCoverage(unitFile, {root, ...(options.expectedRevision === undefined ? {} : {expectedRevision: options.expectedRevision})});
  const body = regular(unitFile, 'Unit native coverage must be a regular file');
  assert(same(JSON.parse(body.toString('utf8')), receipt), 'Native unit receipt changed during qualification');
  const qualification = {...browser, unit: {
    format: 'native-functions', producer: receipt.producer, files: receipt.files.length, sha256: digest(body),
    calledFunctions: receipt.files.reduce((sum, entry) => sum + entry.called.length, 0),
    unmappedFunctions: receipt.files.reduce((sum, entry) => sum + entry.unmapped.length, 0), unattributedScripts: receipt.unattributed.length,
    mappingComplete: receipt.files.every(entry => entry.unmapped.length === 0), tests: receipt.tests,
  }};
  return {qualification, native: receipt};
}

export function readCoverageInventories(directory: string) {
  return jsonFiles(directory).map(file => json(path.join(directory, file)));
}
export function qualifyJobs(needsValue: unknown, selectedValue: unknown, full: boolean, coverageJob = 'coverage') {
  const needs = object(needsValue, 'Job results'), selected = object(selectedValue, 'Selected jobs');
  assert(selected['prepare'] === true, 'Prepare must always be required');
  if (full) assert(selected[coverageJob] === true, 'Full verification requires combined coverage');
  assert(same(Object.keys(needs).sort(), Object.keys(selected).sort()), 'Missing or unexpected job results');
  for (const [name, enabled] of Object.entries(selected)) {
    assert(typeof enabled === 'boolean', `Invalid selected job flag: ${name}`);
    const result = object(needs[name], `Job ${name}`)['result'];
    assert(result === (enabled ? 'success' : 'skipped'), `Job ${name}: expected ${enabled ? 'success' : 'skipped'}, got ${String(result)}`);
  }
  return {schemaVersion: 1, status: 'passed', full, jobs: selected};
}
async function main(): Promise<void> {
  const args = process.argv.slice(2), mode = args[0];
  const value = (flag: string) => {const index = args.indexOf(flag); assert(index >= 0 && args[index + 1], `Missing ${flag}`); return args[index + 1]!;};
  let result: unknown;
  if (mode === 'kit') {
    const environment = [process.env['GITHUB_SHA'], process.env['GITHUB_RUN_ID'], process.env['GITHUB_RUN_ATTEMPT']];
    assert(environment.every(value => value) || environment.every(value => !value), 'Incomplete current Kit run identity');
    const currentContext = environment[0] ? {commit: environment[0], runId: environment[1], runAttempt: environment[2]} : undefined;
    result = qualifyKitUnion(json(value('--collection')), readKitReports(value('--reports')), currentContext);
  }
  else if (mode === 'coverage-inventory') result = createCoverageInventory(value('--directory'), value('--shard'));
  else if (mode === 'coverage-verify') {
    const format = args.includes('--unit-format') ? value('--unit-format') : 'istanbul';
    assert(format === 'istanbul' || format === 'native-functions', 'Unknown unit coverage format');
    const directory = value('--directory'), inventories = readCoverageInventories(value('--inventories')), shards = Number(value('--shards')), unit = value('--unit');
    result = format === 'native-functions' ? await qualifyNativeCoverageUnion(directory, inventories, shards, unit) : qualifyCoverageUnion(directory, inventories, shards, unit);
  }
  else if (mode === 'aggregate') {
    const plan = qualifiedPlan(json(value('--plan')));
    result = qualifyJobs(json(value('--needs')), plan.jobs, plan.full);
  } else throw new Error(`Unknown CI results mode: ${String(mode)}`);
  const output = value('--output'); fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error); process.exitCode = 1;});
