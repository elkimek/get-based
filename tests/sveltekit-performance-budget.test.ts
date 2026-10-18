import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {renderHTML as renderChatShellHTML} from '../js/components/ChatShell.svelte.html.js';
import {BENCHMARK_CHAT_CLOSE_SELECTOR, BENCHMARK_RESOURCE_IDLE_TIMEOUT_MS, waitForBenchmarkResourceIdle, startServer} from '../scripts/benchmark-static.mjs';
import {
  enforceSvelteKitPerformanceBudget, parseSvelteKitPerformanceBudget,
  parseSvelteKitPerformanceOptions, readSvelteKitPerformanceArtifact, summarizeSvelteKitPhase,
} from '../scripts/sveltekit-performance-budget.mjs';
import type {BenchmarkPhaseSnapshot} from '../scripts/benchmark-static.mjs';
import {BENCHMARK_NOW, makeBenchmarkCase, seedBenchmarkProfile} from '../scripts/benchmark-static-fixtures.mjs';
import type {PhaseResources, SvelteKitPerformanceBudget} from '../scripts/sveltekit-performance-budget.mjs';

const origin = 'http://127.0.0.1:12345';
const temporary: string[] = [];
const runFile = promisify(execFile);
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(temporary.splice(0).map(directory => fs.rm(directory, {recursive: true, force: true})));
});
function phase(): BenchmarkPhaseSnapshot {
  return {
    requests: [
      {url: origin + '/app?dev-sw=1', method: 'GET', resourceType: 'document', completion: 'finished', status: 200},
      {url: origin + '/_app/immutable/start.js', method: 'GET', resourceType: 'script', completion: 'finished', status: 200},
    ],
    transfers: [
      {requestId: 'navigation', url: origin + '/app?dev-sw=1', encodedBytes: 1240, encodedBodyBytes: 1000, status: 200},
      {requestId: 'module', url: origin + '/_app/immutable/start.js', encodedBytes: 2240, encodedBodyBytes: 2000, status: 200},
    ],
    resourceTimings: [], resourceTimingAvailable: false,
    resources: [
      {requestId: 'navigation', url: origin + '/app?dev-sw=1', decodedBodyBytes: 4000},
      {requestId: 'module', url: origin + '/_app/immutable/start.js', decodedBodyBytes: 8000},
    ],
  };
}
const measured: PhaseResources = {requests: 2, transferBytes: 3480, encodedBodyBytes: 3000, decodedBodyBytes: 12000};
function policy(): SvelteKitPerformanceBudget {
  return {schemaVersion: 1,
    reference: {buildId: 'a'.repeat(64), measuredAt: '2026-10-17', samplesPerScenario: 3, description: 'Frozen synthetic qualification, CPU4x/network100ms'},
    maximums: {startup: {...measured}, firstUse: {settings: {...measured}, body: {...measured}}}};
}
describe('shipping Kit performance CLI and fixed budget policy', () => {
  it('defaults to three samples of both devices and the prebuilt dist artifact', () => {
    expect(parseSvelteKitPerformanceOptions([], {})).toEqual({artifact: 'dist', output: '.local-notes/sveltekit-performance', samples: 3, device: 'both', record: false});
    expect(parseSvelteKitPerformanceOptions([], {GETBASED_KIT_ARTIFACT: '/synthetic/frozen'}).artifact).toBe('/synthetic/frozen');
    expect(parseSvelteKitPerformanceOptions(['--artifact', 'explicit'], {GETBASED_KIT_ARTIFACT: 'environment'}).artifact).toBe('explicit');
  });
  it('requires explicit measurement-only mode and accepts only bounded scenarios', () => {
    expect(parseSvelteKitPerformanceOptions(['--record', '--samples', '1', '--device', 'mobile', '--artifact', 'frozen', '--output', '.local-notes/proof'], {}))
      .toEqual({record: true, samples: 1, device: 'mobile', artifact: 'frozen', output: '.local-notes/proof'});
  });
  it.each([
    ['--unknown'], ['--record', '--record'], ['--samples', '0'], ['--samples', '6'], ['--samples', '1.0'],
    ['--samples', 'NaN'], ['--device', 'tablet'], ['--artifact'], ['--output', '--record'],
    ['--device', 'mobile', '--device', 'desktop'], ['--budget', 'arbitrary.json'],
  ].map(argv => [argv]))('rejects malformed/unbounded options before acquisition: %j', argv => {
    expect(() => parseSvelteKitPerformanceOptions(argv, {})).toThrow();
  });
  it('preserves exact, traceable fixed policy values', () => {
    const expected = policy();
    expect(parseSvelteKitPerformanceBudget(expected)).toEqual(expected);
  });
  it.each([
    (value: SvelteKitPerformanceBudget) => ({...value, schemaVersion: 2}),
    (value: SvelteKitPerformanceBudget) => ({...value, reference: {...value.reference, buildId: 'latest'}}),
    (value: SvelteKitPerformanceBudget) => ({...value, reference: {...value.reference, measuredAt: '2026-02-30'}}),
    (value: SvelteKitPerformanceBudget) => ({...value, reference: {...value.reference, samplesPerScenario: 0}}),
    (value: SvelteKitPerformanceBudget) => ({...value, reference: {...value.reference, description: ' '}}),
    (value: SvelteKitPerformanceBudget) => ({...value, maximums: {...value.maximums, startup: {...value.maximums.startup, requests: 0}}}),
    (value: SvelteKitPerformanceBudget) => ({...value, maximums: {...value.maximums, startup: {...value.maximums.startup, transferBytes: Infinity}}}),
    (value: SvelteKitPerformanceBudget) => ({...value, maximums: {...value.maximums, startup: {...value.maximums.startup, decodedBodyBytes: 1.5}}}),
    (value: SvelteKitPerformanceBudget) => ({...value, timingTolerance: 100}),
  ])('rejects malformed policy/reference instead of silently weakening a gate', corrupt => {
    expect(() => parseSvelteKitPerformanceBudget(corrupt(policy()))).toThrow();
  });
  it('cannot substitute missing/extra resource gates or optional workflow limits', () => {
    const value = policy();
    expect(() => parseSvelteKitPerformanceBudget({...value, maximums: {startup: measured, firstUse: {settings: measured}}})).toThrow();
    expect(() => parseSvelteKitPerformanceBudget({...value, maximums: {...value.maximums, startup: {requests: 2}}})).toThrow();
  });
  it('fails invalid CLI before attempting artifact or browser acquisition', async () => {
    const result = await runFile(process.execPath, ['scripts/sveltekit-performance-budget.mjs', '--unknown'], {cwd: process.cwd()})
      .then(() => {throw Error('Invalid CLI unexpectedly succeeded');}, error => error as {stderr: string});
    expect(result.stderr).toContain('Unknown performance option');
    expect(result.stderr).not.toMatch(/Executable doesn't exist|browserType.launch|ENOENT/);
  });
});
describe('fresh resource closure after an already-idle navigation', () => {
  function fakeTime() {vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'performance']});}
  it('waits for actual request completion and a fresh 500ms quiet interval', async () => {
    fakeTime();
    const state = {pending: 1, started: 1, completed: 0};
    let resolved = false;
    const waiting = waitForBenchmarkResourceIdle(() => state).then(() => {resolved = true;});
    await vi.advanceTimersByTimeAsync(600);
    expect(resolved).toBe(false);
    state.pending = 0; state.completed = 1;
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(resolved).toBe(true);
  });
  it('rejects a sticky old idle state when a delayed SPA request starts', async () => {
    fakeTime();
    const state = {pending: 0, started: 0, completed: 0};
    let resolved = false;
    const waiting = waitForBenchmarkResourceIdle(() => state).then(() => {resolved = true;});
    await vi.advanceTimersByTimeAsync(400);
    state.started = 1; state.pending = 1;
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(false);
    state.pending = 0; state.completed = 1;
    await vi.advanceTimersByTimeAsync(525);
    await waiting;
    expect(resolved).toBe(true);
  });
  it('does not equate Playwright completion with a still-missing CDP completion', async () => {
    fakeTime();
    const state = {pending: 0, started: 1, completed: 0};
    let resolved = false;
    const waiting = waitForBenchmarkResourceIdle(() => state).then(() => {resolved = true;});
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);
    state.completed = 1;
    await vi.advanceTimersByTimeAsync(525);
    await waiting;
    expect(resolved).toBe(true);
  });
  it('fails continuous new traffic within the unchanged 30s deadline even if each request completes', async () => {
    fakeTime();
    let requests = 0;
    const outcome = waitForBenchmarkResourceIdle(() => ({pending: 0, started: ++requests, completed: requests}))
      .then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(BENCHMARK_RESOURCE_IDLE_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(Error);
    expect(String(await outcome)).toContain('within 30000ms');
    expect(performance.now()).toBe(30000);
  });
  it('propagates known transport failures immediately rather than waiting out the deadline', async () => {
    const failed = new Error('Synthetic failed transport');
    await expect(waitForBenchmarkResourceIdle(() => {throw failed;})).rejects.toBe(failed);
  });
  it('bounds a never-completing request instead of accepting a truthy pending state', async () => {
    fakeTime();
    const outcome = waitForBenchmarkResourceIdle(() => ({pending: 1, started: 1, completed: 0}))
      .then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(BENCHMARK_RESOURCE_IDLE_TIMEOUT_MS);
    expect(String(await outcome)).toContain('within 30000ms');
    expect(performance.now()).toBe(30000);
  });
});
describe('the actual returning empty-profile Settings journey', () => {
  it('targets exactly the authored accessible Close chat control rather than the covered app header', () => {
    const html = renderChatShellHTML();
    const dom = new JSDOM(html);
    try {
      const controls = dom.window.document.querySelectorAll(BENCHMARK_CHAT_CLOSE_SELECTOR);
      expect(controls).toHaveLength(1);
      expect(controls[0]!.tagName).toBe('BUTTON');
      expect(controls[0]!.getAttribute('aria-label')).toBe('Close chat');
      expect(controls[0]!.closest('#chat-shell')).not.toBeNull();
      const missing = new JSDOM(html.replace('data-chat-action="close-panel"', 'data-chat-action="retired-close"'));
      try {expect(missing.window.document.querySelectorAll(BENCHMARK_CHAT_CLOSE_SELECTOR)).toHaveLength(0);}
      finally {missing.window.close();}
    } finally {dom.window.close();}
  });
});
describe('complete startup and incremental first-use transfer accounting', () => {
  it('counts actual navigation, response headers, compressed bodies and decoded bodies separately', () => {
    expect(summarizeSvelteKitPhase(phase(), origin)).toEqual(measured);
  });
  it('preserves repeated requests as a multiset, including exact query identities', () => {
    const value = phase();
    value.requests.push({...value.requests[1]!});
    value.transfers.push({...value.transfers[1]!, requestId: 'second-module'});
    value.resources.push({...value.resources[1]!, requestId: 'second-module'});
    expect(summarizeSvelteKitPhase(value, origin)).toEqual({requests: 3, transferBytes: 5720, encodedBodyBytes: 5000, decodedBodyBytes: 20000});
    value.transfers[2]!.url += '?lazy-retry=1';
    expect(() => summarizeSvelteKitPhase(value, origin)).toThrow('URL inventory');
  });
  it.each([
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.completion = 'pending';},
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.completion = 'failed';},
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.status = 404;},
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.method = 'POST';},
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.error = 'aborted';},
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.url = 'https://outside.invalid/';},
    (value: BenchmarkPhaseSnapshot) => {value.requests[0]!.url = origin + '/__benchmark__/js/profile.js';},
    (value: BenchmarkPhaseSnapshot) => {value.transfers.pop();},
    (value: BenchmarkPhaseSnapshot) => {value.resources.shift();},
    (value: BenchmarkPhaseSnapshot) => {value.resources[0]!.requestId = value.resources[1]!.requestId;},
    (value: BenchmarkPhaseSnapshot) => {value.resources[0]!.requestId = 'unobserved';},
    (value: BenchmarkPhaseSnapshot) => {value.resources[0]!.url = value.resources[1]!.url;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.url = null;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.requestId = value.transfers[1]!.requestId;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.status = 500;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.status = 201;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.encodedBodyBytes = NaN;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.encodedBodyBytes = 0;},
    (value: BenchmarkPhaseSnapshot) => {value.transfers[0]!.encodedBytes = 999;},
    (value: BenchmarkPhaseSnapshot) => {value.resources[0]!.decodedBodyBytes = 0;},
    (value: BenchmarkPhaseSnapshot) => {value.resources[0]!.decodedBodyBytes = -1;},
    (value: BenchmarkPhaseSnapshot) => {value.resources[0]!.decodedBodyBytes = Infinity;},
    (value: BenchmarkPhaseSnapshot) => {value.requests = []; value.transfers = []; value.resources = [];},
  ])('rejects an incomplete, failed, escaped or unaccounted phase', corrupt => {
    const value = phase(); corrupt(value);
    expect(() => summarizeSvelteKitPhase(value, origin)).toThrow();
  });
  it('uses actual decoded CDP bytes when fixed-clock ResourceTiming is unavailable', () => {
    const value = phase();
    expect(value.resourceTimingAvailable).toBe(false);
    expect(summarizeSvelteKitPhase(value, origin).decodedBodyBytes).toBe(12000);
    value.resourceTimings = [{url: origin + '/partial', decodedBodyBytes: 1}];
    expect(() => summarizeSvelteKitPhase(value, origin)).toThrow('explicitly empty');
  });
  it('cross-checks every advisory timing response when the browser exposes that inventory', () => {
    const value = phase();
    value.resourceTimingAvailable = true;
    value.resourceTimings = value.resources.map(({url, decodedBodyBytes}) => ({url, decodedBodyBytes}));
    expect(summarizeSvelteKitPhase(value, origin)).toEqual(measured);
    value.resourceTimings[0]!.decodedBodyBytes++;
    expect(() => summarizeSvelteKitPhase(value, origin)).toThrow('decoded bodies differ');
    value.resourceTimings.pop();
    expect(() => summarizeSvelteKitPhase(value, origin)).toThrow('URL inventory');
  });
  it.each(['requests', 'transferBytes', 'encodedBodyBytes', 'decodedBodyBytes'] as const)('enforces %s on every sample and phase, never a median', key => {
    for (const workflow of ['settings', 'body'] as const) for (const selected of ['startup', 'firstUse'] as const) {
      const row = {device: 'desktop' as const, workflow, sample: 2, startup: {...measured}, firstUse: {...measured}};
      expect(() => enforceSvelteKitPerformanceBudget(row, policy())).not.toThrow();
      row[selected][key]++;
      expect(() => enforceSvelteKitPerformanceBudget(row, policy())).toThrow(`${selected}.${key}`);
    }
  });
  it('uses the selected workflow limit rather than the other first-use budget', () => {
    const value = policy(); value.maximums.firstUse.settings.requests = 1;
    const row = {device: 'mobile' as const, workflow: 'body' as const, sample: 0, startup: measured, firstUse: measured};
    expect(() => enforceSvelteKitPerformanceBudget(row, value)).not.toThrow();
    expect(() => enforceSvelteKitPerformanceBudget({...row, workflow: 'settings'}, value)).toThrow('firstUse.requests');
  });
});
describe('closed workload fixtures preserve real deployed request semantics', () => {
  it('rejects an unknown seed provider before browser imports or local model discovery', async () => {
    const demo: unknown = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data/demo-male.json'), 'utf8'));
    const fixture = makeBenchmarkCase('empty', demo);
    await expect(Reflect.apply(seedBenchmarkProfile, undefined, [{fixture, now: BENCHMARK_NOW, provider: 'unknown-provider'}]))
      .rejects.toThrow('Unsupported benchmark seed provider');
    await expect(Reflect.apply(seedBenchmarkProfile, undefined, [{fixture, now: BENCHMARK_NOW, provider: 'ollama'}]))
      .rejects.toThrow('Unsupported benchmark seed provider');
  });
  it('serves the actual frozen revision only in the explicit metadata fixture, with real complete body accounting', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-performance-metadata-'));
    temporary.push(directory);
    const sha = 'e'.repeat(40);
    await fs.writeFile(path.join(directory, 'build-metrics.json'), JSON.stringify({revision: sha}));
    const server = await startServer(process.cwd(), directory, {deploymentMetadata: true});
    try {
      const response = await fetch(server.origin + '/api/commit', {headers: {'Accept-Encoding': 'identity', Origin: 'https://not-the-artifact.invalid'}});
      expect(response.status).toBe(200);
      expect(new URL(response.url).origin).toBe(server.origin);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Content-Security-Policy')).toContain('default-src');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      const body = await response.text();
      expect(Number(response.headers.get('Content-Length'))).toBe(Buffer.byteLength(body));
      expect(JSON.parse(body)).toEqual({sha, ref: 'local-performance-fixture'});
      const missing = await fetch(server.origin + '/api/not-a-fixture');
      expect(missing.status).toBe(404); await missing.text();
    } finally {await server.close();}
    const original = await startServer(process.cwd(), directory);
    try {
      const response = await fetch(original.origin + '/api/commit');
      expect(response.status).toBe(404); await response.text();
    } finally {await original.close();}
  });
  it('refuses to fabricate commit metadata when the artifact lacks a valid revision', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-performance-metadata-invalid-'));
    temporary.push(directory);
    await fs.writeFile(path.join(directory, 'build-metrics.json'), JSON.stringify({revision: 'synthetic'}));
    await expect(startServer(process.cwd(), directory, {deploymentMetadata: true})).rejects.toThrow('actual artifact revision');
  });
});
describe('prebuilt shipping artifact validation before browser launch', () => {
  async function artifact() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-kit-performance-'));
    temporary.push(directory);
    const metadata = {revision: 'd'.repeat(40), buildId: 'b'.repeat(64), static: true, framework: 'SvelteKit 3 / Svelte 5', sourceInputCount: 42, verificationDigest: 'c'.repeat(64)};
    await Promise.all([
      fs.writeFile(path.join(directory, 'build-metrics.json'), JSON.stringify(metadata)),
      fs.writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Synthetic static artifact</title>'),
      fs.writeFile(path.join(directory, 'version.js'), `self.APP_BUILD_ID = '${metadata.buildId}';\n`),
    ]);
    return {directory, metadata};
  }
  it('requires and retains the real artifact identity and qualified input digest', async () => {
    const {directory, metadata} = await artifact();
    expect(await readSvelteKitPerformanceArtifact(directory)).toEqual({directory, buildId: metadata.buildId, revision: metadata.revision, sourceInputCount: 42, verificationDigest: metadata.verificationDigest});
  });
  it.each([
    {revision: 'synthetic-revision'}, {static: false}, {framework: 'native compatibility'}, {sourceInputCount: 0}, {verificationDigest: 'missing'},
  ])('rejects an unqualified/nonshipping artifact: %j', async corruption => {
    const {directory, metadata} = await artifact();
    await fs.writeFile(path.join(directory, 'build-metrics.json'), JSON.stringify({...metadata, ...corruption}));
    await expect(readSvelteKitPerformanceArtifact(directory)).rejects.toThrow();
  });
});
