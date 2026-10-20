#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createTestPlan, baseAssetInventories, planningSourceFiles, testCommands, type TestPlan} from './pr-test-scope.mjs';
import {readVendorManifest} from './project-owned-vendor.mjs';
import {headlessBrowserEnvironment} from './headless-browser-environment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projects = ['kit-chromium', 'kit-firefox', 'kit-webkit', 'kit-mobile-webkit'] as const;
type NativeSuite = 'browser' | 'firefox' | 'pwa' | 'display';
export interface NativeLane {id: string; suite: NativeSuite; engine: 'chromium' | 'firefox' | 'all'; shard: string; coverage: boolean}
export const KIT_OPFS_FILE = 'tests/pwa/sveltekit-knowledge-base.spec.ts';
export interface KitLane {id: string; project: typeof projects[number]; engine: 'chromium' | 'firefox' | 'webkit'; shard: string; runner: 'ubuntu-latest' | 'macos-15'; caseScope: 'all' | 'webkit-standard' | 'webkit-opfs'}
export interface CiPlan {
  schemaVersion: 1; full: boolean; affected: TestPlan | null;
  unit: boolean; performance: boolean; native: boolean; kit: boolean;
  nativeMatrix: {include: NativeLane[]}; kitMatrix: {include: KitLane[]};
  jobs: {prepare: true; unit: true; native: boolean; kit: boolean; performance: boolean; coverage: boolean};
}
/** Keep stateful browser suites serial within a lane; isolated runners provide
 * parallelism. Only independent Chromium cases share a runner's worker pool. */
export function createCiPlan(full: boolean, affected: TestPlan | null): CiPlan {
  assert(typeof full === 'boolean', 'An explicit full-suite decision');
  assert(full ? affected === null : affected !== null, 'Affected selection is required only for PR scope');
  if (affected) assert.equal(affected.uncovered.length, 0, 'Every changed runtime must have test scope');
  const native: NativeLane[] = [];
  const add = (suite: NativeSuite, engine: NativeLane['engine'], shards = 1) => {
    for (let shard = 1; shard <= shards; shard++) native.push({id: `${suite}-${shard}-of-${shards}`, suite, engine, shard: `${shard}/${shards}`, coverage: full && suite === 'browser'});
  };
  if (full || affected!.browser.length) add('browser', 'chromium', full ? 4 : Math.min(4, affected!.browser.length));
  if (full || affected!.firefox.length) add('firefox', 'firefox');
  if (full || affected!.pwa.length) add('pwa', 'all');
  if (full || affected!.browser.some(file => /(?:^|\/)settings-display-pilot\.spec\.[jt]s$/.test(file)) || affected!.pwa.some(file => /(?:^|\/)settings-display-pilot\.spec\.[jt]s$/.test(file))) add('display', 'all');
  const kit: KitLane[] = [];
  for (const project of projects) {
    const webkit = project === 'kit-webkit' || project === 'kit-mobile-webkit';
    const selected = affected?.kit || [];
    const standardCount = webkit ? selected.filter(file => file !== KIT_OPFS_FILE).length : selected.length;
    const shards = full ? 2 : Math.min(2, standardCount);
    for (let shard = 1; shard <= shards; shard++) kit.push({
      id: `${project}-${shard}-of-${shards}`, project,
      engine: project === 'kit-chromium' ? 'chromium' : project === 'kit-firefox' ? 'firefox' : 'webkit',
      shard: `${shard}/${shards}`, runner: webkit ? 'macos-15' : 'ubuntu-latest', caseScope: webkit ? 'webkit-standard' : 'all',
    });
    // Both WebKit shipping projects use Cocoa. Keep the unchanged Worker/OPFS
    // partition separate from standard UI shards, with exact union completeness.
    if (webkit && (full || selected.includes(KIT_OPFS_FILE))) kit.push({
      id: `${project}-opfs-1-of-1`, project, engine: 'webkit', shard: '1/1', runner: 'macos-15', caseScope: 'webkit-opfs',
    });
  }
  return {
    schemaVersion: 1, full, affected,
    unit: true,
    performance: full || affected!.performance,
    native: native.length > 0, kit: kit.length > 0,
    nativeMatrix: {include: native}, kitMatrix: {include: kit},
    jobs: {prepare: true, unit: true, native: native.length > 0, kit: kit.length > 0, performance: full || affected!.performance, coverage: full},
  };
}
export function ciPlanOutputs(plan: CiPlan): Record<string, string> {
  return {
    full: String(plan.full), unit: String(plan.unit), performance: String(plan.performance), native: String(plan.native), kit: String(plan.kit),
    native_matrix: JSON.stringify(plan.nativeMatrix), kit_matrix: JSON.stringify(plan.kitMatrix),
  };
}
export function qualifiedPlan(value: unknown): CiPlan {
  assert(value && typeof value === 'object', 'A CI plan object');
  const plan = value as CiPlan;
  assert.equal(plan.schemaVersion, 1, 'Known CI plan schema');
  assert.deepEqual(plan, createCiPlan(plan.full, plan.affected), 'Exact derived CI scheduling plan');
  return plan;
}
export function nativeLaneCommand(planValue: CiPlan, id: string): {command: string[]; environment: Record<string, string>} {
  const plan = qualifiedPlan(planValue);
  const lane = plan.nativeMatrix.include.find(value => value.id === id);
  assert(lane, 'The requested native lane is selected');
  let command: string[];
  if (lane.suite === 'display') command = ['playwright', 'test', '--config=playwright.display-pilot.config.js'];
  else if (plan.full) command = ['playwright', 'test', ...(lane.suite === 'browser' ? [] : [`--config=playwright.${lane.suite}.config.js`])];
  else {
    const commands = testCommands(plan.affected!, lane.suite, file => file, {});
    assert.equal(commands.length, 1, 'Exactly one selected native browser command');
    command = commands[0]!;
  }
  command.push(`--shard=${lane.shard}`);
  const directory = path.join(root, '.local-notes/ci/coverage', lane.id);
  return {command, environment: {
    PLAYWRIGHT_OUTPUT_DIR: path.join(root, '.local-notes/ci/results', lane.id),
    PLAYWRIGHT_FIREFOX_OUTPUT_DIR: path.join(root, '.local-notes/ci/results', lane.id),
    PLAYWRIGHT_PWA_OUTPUT_DIR: path.join(root, '.local-notes/ci/results', lane.id),
    PLAYWRIGHT_PILOT_OUTPUT_DIR: path.join(root, '.local-notes/ci/results', lane.id),
    PLAYWRIGHT_SUITE_COVERAGE: lane.coverage ? '1' : '0',
    PLAYWRIGHT_COVERAGE_DIR: directory,
    PLAYWRIGHT_REUSE_SERVER: '0',
  }};
}
export function kitLaneCommand(planValue: CiPlan, id: string): {command: string[]; environment: Record<string, string>} {
  const plan = qualifiedPlan(planValue);
  const lane = plan.kitMatrix.include.find(value => value.id === id);
  assert(lane, 'The requested Kit lane is selected');
  const environment = {GETBASED_KIT_PROJECT: lane.project, GETBASED_KIT_SHARD: lane.shard, GETBASED_KIT_CASE_SCOPE: lane.caseScope};
  const selectedFiles = lane.caseScope === 'webkit-opfs' ? [KIT_OPFS_FILE]
    : plan.affected?.kit.filter(file => lane.caseScope !== 'webkit-standard' || file !== KIT_OPFS_FILE);
  const files = plan.full && lane.caseScope !== 'webkit-opfs' ? [] : selectedFiles;
  assert(files && (plan.full || files.length), 'A selected nonempty Kit file group');
  const command = ['playwright', 'test', ...files, '--config=playwright.sveltekit.config.js', `--project=${lane.project}`, `--shard=${lane.shard}`];
  return {command, environment: {
    ...environment,
    GETBASED_KIT_ACCEPTANCE_GUARD: '1',
    GETBASED_KIT_GUARD_REPORT: path.join(root, '.local-notes/ci/kit-receipts', lane.id + '.json'),
    PLAYWRIGHT_KIT_OUTPUT_DIR: path.join(root, '.local-notes/ci/results', lane.id),
  }};
}
export function kitCollectionCommand(planValue: CiPlan): {command: string[]; environment: Record<string, string>} {
  const plan = qualifiedPlan(planValue);
  assert(plan.kit, 'Kit collection requires selected acceptance cases');
  const command = plan.full
    ? ['playwright', 'test', '--config=playwright.sveltekit.config.js']
    : testCommands(plan.affected!, 'kit', file => file, {})[0];
  assert(command, 'Selected Kit collection command');
  return {command: [...command, '--list'], environment: {
    GETBASED_KIT_ACCEPTANCE_GUARD: '1',
    GETBASED_KIT_CASE_SCOPE: 'all',
    GETBASED_KIT_GUARD_REPORT: path.join(root, '.local-notes/ci/kit-collection.json'),
  }};
}
function git(...args: string[]): string {return execFileSync('git', args, {cwd: root, encoding: 'utf8'});}
function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--full', '--base', '--output', '--run-native', '--run-kit']);
  const options = new Map<string, string>();
  let collect = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (key === '--collect-kit') {assert(!collect, 'A single Kit collection request'); collect = true; continue;}
    const value = args[++index];
    assert(allowed.has(key) && !options.has(key) && value && !value.startsWith('--'), 'Known unique CI plan arguments with values'); options.set(key, value);
  }
  const output = path.resolve(root, options.get('--output') || '.local-notes/ci/plan.json');
  assert(output.startsWith(path.join(root, '.local-notes') + path.sep), 'CI plans belong in ignored local notes');
  const native = options.get('--run-native'), kit = options.get('--run-kit');
  if (native || kit || collect) {
    assert(Number(Boolean(native)) + Number(Boolean(kit)) + Number(collect) === 1 && !options.has('--full') && !options.has('--base'), 'Execute exactly one frozen CI lane');
    if (!collect) assert.equal(process.env['GITHUB_ACTIONS'], 'true', 'Automatic matrix execution is GitHub Actions-only; use explicit focused tests locally');
    const plan = qualifiedPlan(JSON.parse(fs.readFileSync(output, 'utf8')));
    if (kit) {
      const lane = plan.kitMatrix.include.find(value => value.id === kit);
      assert(lane, 'The requested Kit lane is selected');
      assert.equal(process.platform, lane.runner === 'macos-15' ? 'darwin' : 'linux', 'Kit acceptance runs on its planned native platform');
    }
    const selected = collect ? kitCollectionCommand(plan) : native ? nativeLaneCommand(plan, native) : kitLaneCommand(plan, kit!);
    const environment = {...process.env, ...selected.environment};
    const result = spawnSync('npx', ['--no-install', ...selected.command], {cwd: root, stdio: 'inherit', env: headlessBrowserEnvironment(path.join(root, '.local-notes/ci/headless-runtime'), environment)});
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    return;
  }
  const fullValue = options.get('--full') ?? process.env['CI_SCOPE_FULL'];
  assert(fullValue === 'true' || fullValue === 'false', '--full must explicitly be true or false');
  const full = fullValue === 'true';
  let affected: TestPlan | null = null;
  if (!full) {
    const base = options.get('--base'); assert(base && /^[a-f0-9]{40}$/.test(base), 'Affected plans require a full base SHA');
    const changed = git('diff', '--name-only', '-z', `${base}...HEAD`).split('\0').filter(Boolean);
    const files = git('ls-files', '-z').split('\0').filter(Boolean);
    const sources = new Map(planningSourceFiles(files, readVendorManifest(root)).filter(file => fs.existsSync(path.join(root, file))).map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
    affected = createTestPlan(sources, changed, baseAssetInventories(base, root));
  }
  const plan = createCiPlan(full, affected);
  fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n');
  if (affected) fs.writeFileSync(path.join(path.dirname(output), 'affected.json'), JSON.stringify(affected, null, 2) + '\n');
  const outputs = ciPlanOutputs(plan);
  if (process.env['GITHUB_OUTPUT']) fs.appendFileSync(process.env['GITHUB_OUTPUT'], Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
  process.stdout.write(JSON.stringify(outputs, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
