import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Evaluate the actual production module in isolated native VM modules. This
// exercises event sequencing without browser storage, timers or network calls.
const sourcePath = path.resolve('js/startup-orchestrator.ts');
const fixture = String.raw`
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const original = fs.readFileSync(process.argv[1], 'utf8');
async function run(readyState, fail = false, holdRestore = false, holdNavigation = false, failNavigation = false, containedNavigationFailure = false) {
  const calls = [], errors = [];
  let release, releaseNavigation;
  const navigation = holdNavigation ? new Promise(resolve => { releaseNavigation = resolve; }) : undefined;
  const restored = holdRestore ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const document = new EventTarget();
  document.readyState = readyState;
  document.documentElement = { dataset: {} };
  const context = vm.createContext({ document, console: { error: (...args) => errors.push(args) } });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(original, { mode: 'strip' }), { context });
  await module.link(specifier => {
    const line = original.split('\n').find(line => line.endsWith("from '" + specifier + "';"));
    const match = line?.match(/import \{([^}]+)\}/);
    if (!match) throw new Error('Unrecognized startup dependency: ' + specifier);
    const exports = match[1].split(',').map(name => name.trim());
    return new vm.SyntheticModule(exports, function () {
      for (const name of exports) this.setExport(name, () => {
        calls.push(name);
        if (name === 'initializeStartupFoundation' && fail) return Promise.reject(new Error('controlled startup failure'));
        if (name === 'renderStartupUI') return failNavigation ? Promise.reject(new Error('controlled route failure')) : containedNavigationFailure ? Promise.resolve(false) : navigation;
        if (name === 'restorePendingImportReviewDraft') return restored;
        if (name.startsWith('initialize') || name === 'handleStartupOAuthCallbacks') return Promise.resolve();
      });
    }, { context });
  });
  await module.evaluate();
  if (readyState !== 'loading') document.dispatchEvent(new Event('DOMContentLoaded'));
  module.namespace.startApp();
  module.namespace.startApp();
  if (readyState === 'loading') document.dispatchEvent(new Event('DOMContentLoaded'));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const beforeRestore = Object.hasOwn(document.documentElement.dataset, 'appReady');
  const beforeNavigation = { ready: beforeRestore, calls: [...calls] };
  releaseNavigation?.();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  release?.();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  module.namespace.startApp();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return { calls, errors: errors.length, beforeRestore, beforeNavigation, ready: Object.hasOwn(document.documentElement.dataset, 'appReady') };
}
const result = {};
for (const state of ['loading', 'interactive', 'complete']) result[state] = await run(state);
result.deferred = await run('complete', false, true);
result.failure = await run('complete', true);
result.navigation = await run('complete', false, false, true);
result.navigationFailure = await run('complete', false, false, false, true);
result.containedNavigationFailure = await run('complete', false, false, false, false, true);
console.log(JSON.stringify(result));
`;
interface StartupEvidence { calls: string[]; errors: number; beforeRestore: boolean; beforeNavigation: {ready: boolean; calls: string[]}; ready: boolean }
const evidence = JSON.parse(execFileSync(process.execPath,
  ['--experimental-vm-modules', '--input-type=module', '-e', fixture, sourcePath],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) as Record<string, StartupEvidence>;
const startupOrder = ['initializeStartupFoundation', 'initializeProfileData', 'runPostProfileStartupMaintenance',
  'handleStartupOAuthCallbacks', 'renderStartupUI', 'runAppExtensionStartup', 'restorePendingImportReviewDraft'];

describe('startup document event boundary', () => {
  it.each(['loading', 'interactive', 'complete'])('starts once when the document is %s', readyState => {
    const actual = evidence[readyState]!;
    expect(actual.ready).toBe(true);
    expect(actual.errors).toBe(0);
    expect(actual.calls.filter(name => startupOrder.includes(name))).toEqual(startupOrder);
    expect(actual.calls.filter(name => name === 'installGlobalEventListeners')).toHaveLength(1);
  });

  it('keeps readiness behind completion of asynchronous import draft restoration', () => {
    expect(evidence.deferred!.beforeRestore).toBe(false);
    expect(evidence.deferred!.ready).toBe(true);
    expect(evidence.deferred!.calls.filter(name => startupOrder.includes(name))).toEqual(startupOrder);
  });

  it('waits for the saved route before extensions, import restoration and readiness', () => {
    const actual = evidence.navigation!;
    expect(actual.beforeNavigation.ready).toBe(false);
    expect(actual.beforeNavigation.calls).toContain('renderStartupUI');
    expect(actual.beforeNavigation.calls).not.toContain('runAppExtensionStartup');
    expect(actual.beforeNavigation.calls).not.toContain('restorePendingImportReviewDraft');
    expect(actual.ready).toBe(true);
    expect(actual.errors).toBe(0);
    expect(actual.calls.filter(name => startupOrder.includes(name))).toEqual(startupOrder);
  });

  it('publishes readiness when the route contains its failure with a usable retry alert', () => {
    const actual = evidence.containedNavigationFailure!;
    expect(actual.ready).toBe(true);
    expect(actual.errors).toBe(0);
    expect(actual.calls.filter(name => startupOrder.includes(name))).toEqual(startupOrder);
  });

  it('contains a rejected initial route without publishing readiness or post-render work', () => {
    const actual = evidence.navigationFailure!;
    expect(actual.ready).toBe(false);
    expect(actual.errors).toBe(1);
    expect(actual.calls.filter(name => name === 'showNotification')).toHaveLength(1);
    expect(actual.calls).not.toContain('runAppExtensionStartup');
    expect(actual.calls).not.toContain('restorePendingImportReviewDraft');
  });

  it('contains startup errors without declaring readiness or rerunning after the failure', () => {
    expect(evidence.failure!.ready).toBe(false);
    expect(evidence.failure!.errors).toBe(1);
    expect(evidence.failure!.calls.filter(name => name === 'initializeStartupFoundation')).toHaveLength(1);
    expect(evidence.failure!.calls.filter(name => name === 'showNotification')).toHaveLength(1);
    expect(evidence.failure!.calls).not.toContain('initializeProfileData');
  });

});
