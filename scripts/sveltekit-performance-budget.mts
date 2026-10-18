/** Real static-PWA transfer gates; hardware-dependent timings remain diagnostic. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import type {Browser} from '@playwright/test';
import {headlessBrowserEnvironment} from './headless-browser-environment.js';
import {
  benchmarkErrorDetails, measure, outputDirectory, readBenchmarkArtifact,
  startServer, withBenchmarkCleanup,
} from './benchmark-static.mjs';
import type {Artifact, BenchmarkPhaseSnapshot, Measurement} from './benchmark-static.mjs';
import {BENCHMARK_NOW, benchmarkMedian, makeBenchmarkCase} from './benchmark-static-fixtures.mjs';

export const SVELTEKIT_PERFORMANCE_BUDGET = 'scripts/sveltekit-performance-budget.json';
const WORKFLOWS = ['settings', 'body'] as const;
export type PerformanceWorkflow = typeof WORKFLOWS[number];
export type PerformanceDevice = 'desktop' | 'mobile';
export interface SvelteKitPerformanceOptions {
  artifact: string;
  output: string;
  samples: number;
  device: PerformanceDevice | 'both';
  record: boolean;
}
export interface PhaseResources {
  requests: number;
  transferBytes: number;
  encodedBodyBytes: number;
  decodedBodyBytes: number;
}
export interface SvelteKitPerformanceBudget {
  schemaVersion: 1;
  reference: {buildId: string; measuredAt: string; samplesPerScenario: number; description: string};
  maximums: {
    startup: PhaseResources;
    firstUse: Record<PerformanceWorkflow, PhaseResources>;
  };
}
export interface PerformanceSample {
  device: PerformanceDevice;
  workflow: PerformanceWorkflow;
  sample: number;
  startup: PhaseResources;
  firstUse: PhaseResources;
  measurement: Measurement;
}
const RESOURCE_KEYS = ['requests', 'transferBytes', 'encodedBodyBytes', 'decodedBodyBytes'] as const;

/** Parse all arguments before touching an artifact, output directory or browser. */
export function parseSvelteKitPerformanceOptions(
  argv: readonly string[], environment: {GETBASED_KIT_ARTIFACT?: string | undefined} = process.env,
): SvelteKitPerformanceOptions {
  const options: SvelteKitPerformanceOptions = {
    artifact: environment.GETBASED_KIT_ARTIFACT || 'dist',
    output: '.local-notes/sveltekit-performance', samples: 3, device: 'both', record: false,
  };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!;
    assert(['--artifact', '--output', '--samples', '--device', '--record'].includes(flag), 'Unknown performance option: ' + flag);
    assert(!seen.has(flag), 'Duplicate performance option: ' + flag);
    seen.add(flag);
    if (flag === '--record') {options.record = true; continue;}
    const value = argv[++index];
    assert(value && !value.startsWith('--'), 'Missing value for ' + flag);
    if (flag === '--artifact') options.artifact = value;
    else if (flag === '--output') options.output = value;
    else if (flag === '--samples') {
      assert(/^[1-5]$/.test(value), 'Samples must be an integer from 1 to 5');
      options.samples = Number(value);
    } else {
      assert(value === 'desktop' || value === 'mobile' || value === 'both', 'Device must be desktop, mobile or both');
      options.device = value;
    }
  }
  return options;
}
function object(value: unknown, label: string): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label + ' has unexpected or missing fields');
}
function phaseLimits(value: unknown, label: string): PhaseResources {
  const row = object(value, label);
  exactKeys(row, RESOURCE_KEYS, label);
  for (const key of RESOURCE_KEYS) assert(Number.isSafeInteger(row[key]) && Number(row[key]) > 0, label + '.' + key + ' must be a positive safe integer');
  return {
    requests: Number(row.requests), transferBytes: Number(row.transferBytes),
    encodedBodyBytes: Number(row.encodedBodyBytes), decodedBodyBytes: Number(row.decodedBodyBytes),
  };
}
export function parseSvelteKitPerformanceBudget(value: unknown): SvelteKitPerformanceBudget {
  const policy = object(value, 'Performance budget');
  exactKeys(policy, ['schemaVersion', 'reference', 'maximums'], 'Performance budget');
  assert.equal(policy.schemaVersion, 1, 'Unsupported performance budget schema');
  const reference = object(policy.reference, 'reference');
  exactKeys(reference, ['buildId', 'measuredAt', 'samplesPerScenario', 'description'], 'reference');
  assert(typeof reference.buildId === 'string' && /^[a-f0-9]{64}$/.test(reference.buildId), 'reference.buildId must identify the qualified artifact');
  assert(typeof reference.measuredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(reference.measuredAt)
    && new Date(reference.measuredAt).toISOString().slice(0, 10) === reference.measuredAt, 'reference.measuredAt must be a valid YYYY-MM-DD date');
  assert(Number.isSafeInteger(reference.samplesPerScenario) && Number(reference.samplesPerScenario) > 0, 'reference.samplesPerScenario must be positive');
  assert(typeof reference.description === 'string' && reference.description.trim(), 'reference.description must explain the qualification');
  const maximums = object(policy.maximums, 'maximums');
  exactKeys(maximums, ['startup', 'firstUse'], 'maximums');
  const firstUse = object(maximums.firstUse, 'maximums.firstUse');
  exactKeys(firstUse, WORKFLOWS, 'maximums.firstUse');
  return {schemaVersion: 1, reference: {
    buildId: reference.buildId, measuredAt: reference.measuredAt,
    samplesPerScenario: Number(reference.samplesPerScenario), description: reference.description,
  }, maximums: {
    startup: phaseLimits(maximums.startup, 'maximums.startup'),
    firstUse: {
      settings: phaseLimits(firstUse.settings, 'maximums.firstUse.settings'),
      body: phaseLimits(firstUse.body, 'maximums.firstUse.body'),
    },
  }};
}
function nonnegative(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, label + ' must be a nonnegative safe integer');
}
function measuredURL(value: string, origin: string): string {
  const url = new URL(value);
  assert.equal(url.origin, origin, 'Measured request escaped the artifact origin: ' + value);
  assert(url.protocol === 'http:' || url.protocol === 'https:', 'Non-HTTP measured request');
  assert(!url.pathname.startsWith('/__benchmark__/'), 'Private seed traffic entered the measured phase');
  return url.href;
}
function sameURLInventory(actual: readonly string[], expected: readonly string[], label: string): void {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label + ' URL inventory differs from actual requests');
}
/** No missing response, pending work, cached zero accounting or URL/query normalization. */
export function summarizeSvelteKitPhase(phase: BenchmarkPhaseSnapshot, origin: string): PhaseResources {
  assert(phase.requests.length > 0, 'A measured phase has no actual requests');
  const urls = phase.requests.map(request => {
    const url = measuredURL(request.url, origin);
    assert.equal(request.method, 'GET', 'Unexpected measured request method');
    assert.equal(request.completion, 'finished', 'Measured request did not finish: ' + url);
    assert(typeof request.status === 'number' && request.status >= 200 && request.status < 300, 'Measured request was not successful: ' + url);
    assert.equal(request.error, undefined, 'Measured request recorded an error');
    return url;
  });
  const identifiers = new Set<string>();
  let transferBytes = 0, encodedBodyBytes = 0, decodedBodyBytes = 0;
  const transferURLs = phase.transfers.map(transfer => {
    assert(transfer.requestId && !identifiers.has(transfer.requestId), 'Duplicate or missing CDP request identity');
    identifiers.add(transfer.requestId);
    assert(transfer.url, 'CDP completion lacks its actual URL');
    assert(transfer.status >= 200 && transfer.status < 300, 'CDP response was not successful');
    nonnegative(transfer.encodedBytes, 'Encoded transfer bytes');
    nonnegative(transfer.encodedBodyBytes, 'Encoded response body bytes');
    assert(transfer.encodedBytes > 0 && transfer.encodedBodyBytes > 0, 'Missing real transfer/body accounting');
    assert(transfer.encodedBytes >= transfer.encodedBodyBytes, 'Encoded body exceeds the whole response transfer');
    transferBytes += transfer.encodedBytes;
    encodedBodyBytes += transfer.encodedBodyBytes;
    return measuredURL(transfer.url, origin);
  });
  sameURLInventory(transferURLs, urls, 'CDP response');
  assert.deepEqual(phase.transfers.map(transfer => JSON.stringify([transfer.url, transfer.status])).sort(),
    phase.requests.map(request => JSON.stringify([request.url, request.status])).sort(), 'CDP/request response statuses differ');
  const decodedIdentifiers = new Set<string>();
  const resourceURLs = phase.resources.map(resource => {
    assert(resource.requestId && !decodedIdentifiers.has(resource.requestId), 'Duplicate or missing decoded response identity');
    decodedIdentifiers.add(resource.requestId);
    nonnegative(resource.decodedBodyBytes, 'Decoded response body bytes');
    assert(resource.decodedBodyBytes > 0, 'Missing navigation/resource decoded body accounting');
    decodedBodyBytes += resource.decodedBodyBytes;
    return measuredURL(resource.url, origin);
  });
  sameURLInventory(resourceURLs, urls, 'CDP decoded response');
  assert.deepEqual([...decodedIdentifiers].sort(), [...identifiers].sort(), 'Decoded/CDP request identities differ');
  assert.deepEqual(phase.resources.map(resource => JSON.stringify([resource.requestId, resource.url])).sort(),
    phase.transfers.map(transfer => JSON.stringify([transfer.requestId, transfer.url])).sort(), 'Decoded/CDP request URLs differ');
  if (phase.resourceTimingAvailable) {
    sameURLInventory(phase.resourceTimings.map(resource => measuredURL(resource.url, origin)), urls, 'Advisory navigation/resource timing');
    assert.deepEqual(phase.resourceTimings.map(resource => JSON.stringify([resource.url, resource.decodedBodyBytes])).sort(),
      phase.resources.map(resource => JSON.stringify([resource.url, resource.decodedBodyBytes])).sort(), 'ResourceTiming/CDP decoded bodies differ');
  } else assert.deepEqual(phase.resourceTimings, [], 'Unavailable ResourceTiming must remain explicitly empty');
  for (const [key, value] of Object.entries({transferBytes, encodedBodyBytes, decodedBodyBytes})) nonnegative(value, key);
  return {requests: urls.length, transferBytes, encodedBodyBytes, decodedBodyBytes};
}
export function enforceSvelteKitPerformanceBudget(
  sample: Pick<PerformanceSample, 'device' | 'workflow' | 'sample' | 'startup' | 'firstUse'>,
  budget: SvelteKitPerformanceBudget,
): void {
  for (const phase of ['startup', 'firstUse'] as const) {
    const maximums = phase === 'startup' ? budget.maximums.startup : budget.maximums.firstUse[sample.workflow];
    for (const key of RESOURCE_KEYS) {
      nonnegative(sample[phase][key], phase + '.' + key);
      assert(sample[phase][key] <= maximums[key],
        `${sample.device}/${sample.workflow}/sample ${sample.sample} ${phase}.${key}: ${sample[phase][key]} > ${maximums[key]}`);
    }
  }
}
export function summarizePerformanceTimings(rows: readonly PerformanceSample[]) {
  return (['desktop', 'mobile'] as const).flatMap(device => WORKFLOWS.flatMap(workflow => {
    const selected = rows.filter(row => row.device === device && row.workflow === workflow);
    if (!selected.length) return [];
    const firstUseMetrics = (row: PerformanceSample): Record<string, number | null> =>
      typeof row.measurement.firstUse === 'number' ? {settingsJourneyMs: row.measurement.firstUse} : {...row.measurement.firstUse};
    const names = Object.keys(firstUseMetrics(selected[0]!));
    return [{device, workflow, samples: selected.length,
      startupMedianMs: benchmarkMedian(selected.map(row => row.measurement.startupMs)),
      firstUseMedians: Object.fromEntries(names.map(name => {
        const values = selected.map(row => firstUseMetrics(row)[name]);
        if (values.every(value => value === null)) return [name, null];
        assert(values.every((value): value is number => typeof value === 'number' && Number.isFinite(value)), 'Inconsistent timing observations');
        return [name, benchmarkMedian(values)];
      })),
    }];
  }));
}
export async function readSvelteKitPerformanceArtifact(requested: string) {
  const artifact = await readBenchmarkArtifact(requested);
  const metrics = object(JSON.parse(await fs.readFile(path.join(artifact.directory, 'build-metrics.json'), 'utf8')), 'Build metrics');
  assert.equal(metrics.static, true, 'Performance gates require the static shipping artifact');
  assert(typeof metrics.framework === 'string' && metrics.framework.startsWith('SvelteKit '), 'Performance gates require a SvelteKit artifact');
  assert(Number.isSafeInteger(metrics.sourceInputCount) && Number(metrics.sourceInputCount) > 0, 'Missing artifact source inventory');
  assert(typeof metrics.verificationDigest === 'string' && /^[a-f0-9]{64}$/.test(metrics.verificationDigest), 'Missing artifact verification digest');
  assert(typeof metrics.revision === 'string' && /^[a-f0-9]{40}$/.test(metrics.revision), 'Missing artifact source revision for the deployment metadata fixture');
  return {...artifact, revision: metrics.revision, sourceInputCount: Number(metrics.sourceInputCount), verificationDigest: metrics.verificationDigest};
}
async function main(): Promise<void> {
  const options = parseSvelteKitPerformanceOptions(process.argv.slice(2));
  const root = await fs.realpath(process.cwd());
  // Normal mode never silently records an unbudgeted run when policy is absent.
  const budgetPath = path.join(root, SVELTEKIT_PERFORMANCE_BUDGET);
  const budget = options.record ? null : parseSvelteKitPerformanceBudget(JSON.parse(await fs.readFile(budgetPath, 'utf8')));
  const input = await readSvelteKitPerformanceArtifact(path.resolve(root, options.artifact));
  const output = await outputDirectory(root, options.output);
  let artifact: Artifact | undefined, browser: Browser | undefined;
  const rows: PerformanceSample[] = [];
  const mode = {measurementOnly: options.record, budgetEnforced: !options.record};
  const receipt = () => ({...mode, options, artifact: input, budget, rows, timingSummary: summarizePerformanceTimings(rows)});
  try {
    const report = await withBenchmarkCleanup(async () => {
      artifact = {variant: 'candidate', ...input, server: await startServer(root, input.directory, {deploymentMetadata: true})};
      const demo: unknown = JSON.parse(await fs.readFile(path.join(root, 'data/demo-male.json'), 'utf8'));
      browser = await chromium.launch({headless: true, channel: 'chromium', env: headlessBrowserEnvironment(path.join(output, 'runtime'))});
      const devices: PerformanceDevice[] = options.device === 'both' ? ['desktop', 'mobile'] : [options.device];
      for (const device of devices) for (const workflow of WORKFLOWS) {
        const caseName = workflow === 'settings' ? 'empty' : 'combined';
        const fixture = makeBenchmarkCase(caseName, demo);
        for (let sample = 0; sample < options.samples; sample++) {
          const measurement = await measure(browser, artifact, caseName, sample, fixture, {device, capturePhases: true});
          assert(measurement.resourcePhases, 'Benchmark omitted the requested complete phase accounting');
          assert.deepEqual(measurement.errors, [], 'Page errors during measured context cleanup');
          assert.deepEqual(measurement.externalRequests, [], 'External requests during measured context cleanup');
          const row: PerformanceSample = {device, workflow, sample, measurement,
            startup: summarizeSvelteKitPhase(measurement.resourcePhases.startup, artifact.server.origin),
            firstUse: summarizeSvelteKitPhase(measurement.resourcePhases.firstUse, artifact.server.origin)};
          rows.push(row);
          await fs.writeFile(path.join(output, 'partial.json'), JSON.stringify(receipt(), null, 2) + '\n');
          if (budget) enforceSvelteKitPerformanceBudget(row, budget);
          console.log(JSON.stringify({...mode, device, workflow, sample, startup: row.startup, firstUse: row.firstUse}));
        }
      }
      const provenanceFiles = ['scripts/benchmark-static.mts', 'scripts/benchmark-static-fixtures.mts',
        'scripts/sveltekit-performance-budget.mts', 'data/demo-male.json', 'js/profile.ts',
        'js/profile-data-migrations.ts', 'js/crypto.ts', 'js/nutrition-store.ts', 'js/wearables-store.ts'];
      if (budget) provenanceFiles.push(SVELTEKIT_PERFORMANCE_BUDGET);
      const sourceProvenance = Object.fromEntries(await Promise.all(provenanceFiles.map(async file =>
        [file, createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')])));
      return {...receipt(), sourceProvenance, conditions: {
        headless: true, workers: 1, freshContexts: true, fixedDate: BENCHMARK_NOW,
        cpuRate: 4, latencyMs: 100, downloadBytesPerSecond: 1250000, uploadBytesPerSecond: 625000,
        compression: 'Actual Brotli response bodies; CDP loadingFinished includes response transport overhead',
        encodedBodyMethod: 'Actual CDP response Content-Length; whole-response encodedDataLength recorded separately',
        decodedBodyMethod: 'Passive CDP dataReceived.dataLength totals, including navigation; complete request IDs and exact URL multisets required',
        resourceTimingMethod: 'Advisory decodedBodySize inventory cross-checked in full when available; explicit availability=false flag under fixed clock is retained, never counted as zero decoded bytes',
        phaseBoundary: 'Actual ready/visible UI and network idle; no pending requests; complete immutable prefix required',
        startup: 'Empty profile and combined labs/meals/wearables profile, before any first-use action',
        firstUse: 'Incremental public Settings open for empty; public Body navigation for combined',
        seedExcluded: true, cache: 'disabled', serviceWorkers: 'blocked',
        providerFixture: 'OpenRouter selected, AI paused, no keys; provider discovery and live inference are outside this UI transfer workload',
        deploymentMetadataFixture: {path: '/api/commit', sha: input.revision, ref: 'local-performance-fixture',
          accounting: 'Actual same-origin JSON response, compressed and fully counted; this models deployed metadata and is not a no-API claim'},
        profilePolicy: 'Whole durable synthetic profile must remain byte-equivalent as structured data',
        timingGates: false, resourceGates: budget ? 'Every sample, every resource metric' : 'Explicit measurement-only qualification',
      }};
    }, () => [
      {label: 'browser', close: async () => {await browser?.close();}},
      ...(artifact ? [{label: 'artifact server', close: () => artifact!.server.close()}] : []),
    ]);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${options.record ? 'MEASUREMENT ONLY (no budget acceptance)' : 'Budget acceptance'}: ${output}/results.json`);
  } catch (error) {
    try {
      await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({...receipt(), error: benchmarkErrorDetails(error)}, null, 2) + '\n');
    } catch (receiptError) {
      throw new AggregateError([error, receiptError], 'Performance failure receipt could not be written', {cause: error});
    }
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
