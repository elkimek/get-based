import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {readBenchmarkArtifact, withBenchmarkCleanup, benchmarkContextCleanup, benchmarkErrorDetails, assertBenchmarkRevisionParity} from '../scripts/benchmark-static.mjs';

const temporary: string[] = [], buildId = 'a'.repeat(64), runFile = promisify(execFile);
afterEach(async () => {await Promise.all(temporary.splice(0).map(directory => fs.rm(directory, {recursive: true, force: true})));});
async function artifact() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-benchmark-invalid-')); temporary.push(directory);
  await Promise.all([
    fs.writeFile(path.join(directory, 'build-metrics.json'), JSON.stringify({buildId})),
    fs.writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Synthetic artifact</title>'),
    fs.writeFile(path.join(directory, 'version.js'), `self.APP_BUILD_ID = '${buildId}';\n`),
  ]);
  return directory;
}
describe('benchmark artifact acquisition', () => {
  it('loads actual regular required files and their matching canonical identity', async () => {
    const directory = await artifact(); expect(await readBenchmarkArtifact(directory)).toEqual({directory, buildId});
  });
  it.each(['build-metrics.json', 'index.html', 'version.js'])('rejects missing %s before resource acquisition', async file => {
    const directory = await artifact(); await fs.rm(path.join(directory, file));
    await expect(readBenchmarkArtifact(directory)).rejects.toMatchObject({code: 'ENOENT'});
  });
  it('rejects a missing directory and a regular-file artifact path', async () => {
    const directory = await artifact();
    await expect(readBenchmarkArtifact(path.join(directory, 'missing'))).rejects.toMatchObject({code: 'ENOENT'});
    await expect(readBenchmarkArtifact(path.join(directory, 'index.html'))).rejects.toThrow('must be a directory');
  });
  it('retains malformed JSON as its original SyntaxError', async () => {
    const directory = await artifact(); await fs.writeFile(path.join(directory, 'build-metrics.json'), '{');
    await expect(readBenchmarkArtifact(directory)).rejects.toBeInstanceOf(SyntaxError);
  });
  it.each([{metrics: null}, {metrics: []}, {metrics: {}}, {metrics: {buildId: null}}, {metrics: {buildId: 'a'.repeat(63)}},
    {metrics: {buildId: 'A'.repeat(64)}}])('rejects invalid static identity $metrics', async ({metrics}) => {
    const directory = await artifact(); await fs.writeFile(path.join(directory, 'build-metrics.json'), JSON.stringify(metrics));
    await expect(readBenchmarkArtifact(directory)).rejects.toThrow('Invalid static build identity');
  });
  it('rejects empty HTML and metadata/version disagreement', async () => {
    const directory = await artifact(); await fs.writeFile(path.join(directory, 'index.html'), ' \n');
    await expect(readBenchmarkArtifact(directory)).rejects.toThrow('index.html is empty');
    await fs.writeFile(path.join(directory, 'index.html'), '<!doctype html>');
    await fs.writeFile(path.join(directory, 'version.js'), `self.APP_BUILD_ID = '${'b'.repeat(64)}';`);
    await expect(readBenchmarkArtifact(directory)).rejects.toThrow('version/build identity differs');
  });
  it('rejects a symlinked required file without reading its outside target', async () => {
    const directory = await artifact(), outside = await artifact(); await fs.rm(path.join(directory, 'version.js'));
    await fs.symlink(path.join(outside, 'version.js'), path.join(directory, 'version.js'));
    await expect(readBenchmarkArtifact(directory)).rejects.toThrow('requires a regular version.js');
  });
});
describe('the actual benchmark cleanup boundary', () => {
  it('returns successful work only after all acquired resources close exactly once', async () => {
    const calls: string[] = [], result = {rows: 2};
    const actual = await withBenchmarkCleanup(async () => {calls.push('work'); return result;}, () =>
      ['browser', 'baseline server', 'candidate server'].map(label => ({label, close: async () => {calls.push(label);}})));
    expect(actual).toBe(result); expect(calls).toEqual(['work', 'browser', 'baseline server', 'candidate server']);
  });
  it('preserves a navigation failure identity and original phase after normal connected cleanup', async () => {
    const navigation = new Error('net::ERR_CONNECTION_REFUSED', {cause: {phase: 'navigation', url: 'http://127.0.0.1:1/app'}});
    const calls: string[] = [], context = {unrouteAll: async () => {calls.push('unroute');}, close: async () => {calls.push('close');}};
    await expect(withBenchmarkCleanup(async () => {throw navigation;}, () => benchmarkContextCleanup({isConnected: () => true}, context))).rejects.toBe(navigation);
    expect(calls).toEqual(['unroute', 'close']); expect(benchmarkErrorDetails(navigation)).toMatchObject({message: navigation.message, cause: {phase: 'navigation'}});
  });
  it('skips routes after browser interruption, closes context and preserves the original error', async () => {
    const navigation = new Error('Target page, context or browser has been closed'); let connected = true;
    const calls: string[] = [], context = {unrouteAll: async () => {throw Error('Must not unroute a disconnected browser');}, close: async () => {calls.push('close');}};
    await expect(withBenchmarkCleanup(async () => {connected = false; throw navigation;}, () => benchmarkContextCleanup({isConnected: () => connected}, context))).rejects.toBe(navigation);
    expect(calls).toEqual(['close']);
  });
  it('retains connected cleanup failures and still closes the context', async () => {
    const original = new Error('Original failed navigation'), routeError = new Error('Connected unroute failure'), calls: string[] = [];
    const context = {unrouteAll: async () => {calls.push('unroute'); throw routeError;}, close: async () => {calls.push('close');}};
    const failure = await withBenchmarkCleanup(async () => {throw original;}, () => benchmarkContextCleanup({isConnected: () => true}, context)).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError); expect(failure.cause).toBe(original); expect(failure.errors[0]).toBe(original);
    expect(failure.errors[1].cause).toBe(routeError); expect(calls).toEqual(['unroute', 'close']);
  });
  it('attempts every server close even if browser and one server fail', async () => {
    const primary = new Error('Failed first use'), browserFailure = new Error('Browser close failed'), serverFailure = new Error('Server close failed');
    const calls: string[] = [];
    const failure = await withBenchmarkCleanup(async () => {throw primary;}, () => [
      {label: 'browser', close: async () => {calls.push('browser'); throw browserFailure;}},
      {label: 'baseline server', close: async () => {calls.push('baseline'); throw serverFailure;}},
      {label: 'candidate server', close: async () => {calls.push('candidate');}},
    ]).catch(error => error);
    expect(calls).toEqual(['browser', 'baseline', 'candidate']); expect(failure.cause).toBe(primary);
    expect(failure.errors).toHaveLength(3); expect(failure.errors[1].cause).toBe(browserFailure); expect(failure.errors[2].cause).toBe(serverFailure);
    const receipt = JSON.parse(JSON.stringify(benchmarkErrorDetails(failure)));
    expect(receipt.cause.message).toBe(primary.message); expect(receipt.errors[1].cause.message).toBe(browserFailure.message);
    expect(receipt.errors[2].cause.message).toBe(serverFailure.message);
  });
  it('does not report success when only cleanup fails, including a seed-page close', async () => {
    const closeFailure = new Error('Seed page close failed');
    const failure = await withBenchmarkCleanup(async () => 'completed', () => [{label: 'seed page', close: async () => {throw closeFailure;}}]).catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError); expect(failure.errors).toHaveLength(1);
    expect(failure.cause.cause).toBe(closeFailure); expect(failure.errors[0].message).toContain('seed page');
  });
  it('preserves falsy thrown values and serializes cyclic errors without losing other fields', async () => {
    await expect(withBenchmarkCleanup(async () => {throw undefined;}, () => [])).rejects.toBeUndefined();
    const error = new Error('Primary'); error.cause = error;
    expect(benchmarkErrorDetails(error)).toMatchObject({name: 'Error', message: 'Primary', cause: '[Circular error detail]'});
  });
});
it('the actual invalid-artifact CLI exits nonzero with a retained original error and no browser runtime', async () => {
  const directory = await artifact(); await fs.writeFile(path.join(directory, 'build-metrics.json'), '{');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = await fs.mkdtemp(path.join(root, '.local-notes', 'benchmark-invalid-command-')); temporary.push(output);
  try {
    await runFile(process.execPath, [path.join(root, 'scripts/benchmark-static.mjs'), '--baseline', directory, '--candidate', directory,
      '--cases', 'empty', '--pairs', '1', '--output', output], {cwd: root, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}, timeout: 10000});
    throw Error('Invalid artifact command unexpectedly succeeded');
  } catch (error) {
    assert(error instanceof Error && 'code' in error && 'killed' in error);
    expect(error.code).toBe(1); expect(error.killed).toBe(false);
  }
  const runs = await fs.readdir(output); expect(runs).toHaveLength(1); assert(runs[0]);
  const run = path.join(output, runs[0]), receipt: unknown = JSON.parse(await fs.readFile(path.join(run, 'failure.json'), 'utf8'));
  expect(receipt).toMatchObject({details: {name: 'SyntaxError'}, rows: []});
  await expect(fs.stat(path.join(run, 'runtime'))).rejects.toMatchObject({code: 'ENOENT'});
  await expect(fs.stat(path.join(run, 'results.json'))).rejects.toMatchObject({code: 'ENOENT'});
}, 15000);


describe('matched benchmark revision policy preserves genuine visible metadata', () => {
  it('accepts the same recorded revision with empty-profile Settings', () => {
    expect(() => assertBenchmarkRevisionParity(['empty', 'control', 'combined'], 'b'.repeat(40), 'b'.repeat(40))).not.toThrow();
  });
  it('rejects different revisions whenever empty is selected without normalizing the UI', () => {
    expect(() => assertBenchmarkRevisionParity(['control', 'empty'], 'b'.repeat(40), 'c'.repeat(40)))
      .toThrow('Empty-profile Settings parity requires the same recorded revision');
  });
  it('retains cross-revision Body-only comparisons', () => {
    expect(() => assertBenchmarkRevisionParity(['control', 'combined'], 'b'.repeat(40), 'c'.repeat(40))).not.toThrow();
  });
});
async function expectPreBrowserBenchmarkFailure(baseline: string, candidate: string, message: string) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = await fs.mkdtemp(path.join(root, '.local-notes', 'benchmark-revision-command-'));
  temporary.push(output);
  try {
    await runFile(process.execPath, [path.join(root, 'scripts/benchmark-static.mjs'), '--baseline', baseline, '--candidate', candidate,
      '--cases', 'empty,control,combined', '--pairs', '1', '--output', output], {cwd: root, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}, timeout: 10000});
    throw Error('Unqualified revision command unexpectedly succeeded');
  } catch (error) {
    assert(error instanceof Error && 'code' in error && 'killed' in error);
    expect(error.code).toBe(1); expect(error.killed).toBe(false);
  }
  const runs = await fs.readdir(output); expect(runs).toHaveLength(1); assert(runs[0]);
  const run = path.join(output, runs[0]);
  const receipt: unknown = JSON.parse(await fs.readFile(path.join(run, 'failure.json'), 'utf8'));
  expect(receipt).toMatchObject({details: {name: 'AssertionError', message: expect.stringContaining(message)}, rows: []});
  await expect(fs.stat(path.join(run, 'runtime'))).rejects.toMatchObject({code: 'ENOENT'});
  await expect(fs.stat(path.join(run, 'results.json'))).rejects.toMatchObject({code: 'ENOENT'});
}
describe('actual matched CLI validates both revisions before acquiring resources', () => {
  it.each(['baseline', 'candidate'] as const)('rejects a missing %s revision before warming either server', async missing => {
    const invalid = await artifact(), valid = await artifact();
    await fs.writeFile(path.join(valid, 'build-metrics.json'), JSON.stringify({buildId, revision: 'b'.repeat(40)}));
    // Reading the required identity files succeeds. Warming this otherwise valid
    // artifact would fail for another reason, proving revision validation comes first.
    await fs.symlink(path.join(valid, 'index.html'), path.join(valid, 'must-not-warm.html'));
    await expectPreBrowserBenchmarkFailure(missing === 'baseline' ? invalid : valid, missing === 'candidate' ? invalid : valid,
      'Deployment fixture requires the actual artifact revision');
  }, 15000);
  it('rejects distinct empty-profile revisions before either server/browser is acquired', async () => {
    const baseline = await artifact(), candidate = await artifact();
    await fs.writeFile(path.join(baseline, 'build-metrics.json'), JSON.stringify({buildId, revision: 'b'.repeat(40)}));
    await fs.writeFile(path.join(candidate, 'build-metrics.json'), JSON.stringify({buildId, revision: 'c'.repeat(40)}));
    // A misplaced guard after server warming must independently fail this witness.
    await fs.symlink(path.join(baseline, 'index.html'), path.join(baseline, 'must-not-warm.html'));
    await expectPreBrowserBenchmarkFailure(baseline, candidate,
      'Empty-profile Settings parity requires the same recorded revision');
  }, 15000);
});
