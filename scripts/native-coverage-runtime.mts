import assert from 'node:assert/strict';
import inspector from 'node:inspector/promises';
import type {Debugger} from 'node:inspector';
import {randomUUID} from 'node:crypto';
import {inject, expect} from 'vitest';
import {builtinEnvironments} from 'vitest/runtime';
import {nativeContext, nativeDigest, nativeSelected, writeNativeBlob, writeNativeJSON} from './native-coverage-storage.mjs';
import type {NativeCapture, NativeContext, NativeEnvironment, NativeSnapshot} from './native-coverage-types.mjs';
const OWNER = 'getbased-native-v8-holder/v1';
interface Holder {
  kind: typeof OWNER; id: string; pid: number; key: symbol; config: NativeContext; configHash: string;
  session: inspector.Session; reference: inspector.Session;
  parsed: Map<string, Debugger.ScriptParsedEventDataType>; started: boolean; enabled: boolean; debugging: boolean;
}
function context(): {config: NativeContext; key: symbol; hash: string} {
  const config = inject('getbasedNativeCoverage'); assert(config); nativeContext(config);
  return {config, key: Symbol.for(OWNER + ':' + nativeDigest(config.directory)), hash: nativeDigest(JSON.stringify(config))};
}
function current(): Holder {
  const scope = context(), value: unknown = Reflect.get(globalThis, scope.key); assert(value && typeof value === 'object'); const holder = value as Holder;
  assert(holder.kind === OWNER && holder.pid === process.pid && holder.key === scope.key && holder.configHash === scope.hash && holder.session === holder.reference, 'Foreign native inspector holder'); return holder;
}
async function release(holder: Holder): Promise<void> {
  assert.equal(Reflect.get(globalThis, holder.key), holder); const errors: unknown[] = [];
  try {
    if (holder.started) {try {await holder.session.post('Profiler.stopPreciseCoverage');} catch (error) {errors.push(error);} finally {holder.started = false;}}
    if (holder.enabled) {try {await holder.session.post('Profiler.disable');} catch (error) {errors.push(error);} finally {holder.enabled = false;}}
    if (holder.debugging) {try {await holder.session.post('Debugger.disable');} catch (error) {errors.push(error);} finally {holder.debugging = false;}}
    try {holder.session.disconnect();} catch (error) {errors.push(error);}
  } finally {assert.equal(Reflect.get(globalThis, holder.key), holder); assert(Reflect.deleteProperty(globalThis, holder.key));}
  assert.equal(errors.length, 0, 'Native inspector cleanup failed');
}
async function failed(error: unknown, holder: Holder | undefined): Promise<never> {
  if (holder) {try {await release(holder);} catch (cleanup) {process.stderr.write(`Native coverage cleanup also failed: ${String(cleanup)}\n`);}}
  throw error;
}
function environment(): NativeEnvironment {
  // startCoverage runs concurrently with global setup; takeCoverage runs after suite setup.
  const name = expect.getState().environment; assert(name === 'node' || name === 'jsdom', 'Unsupported native suite environment');
  const expected = name === 'node' ? 'ssr' : 'client', descriptor = builtinEnvironments[name];
  assert(descriptor.name === name && descriptor.viteEnvironment === expected, 'Public builtin environment identity changed');
  return {name, viteEnvironment: expected, consumer: name === 'node' ? 'server' : 'client'};
}
export default {
  async getProvider() {const {default: Provider} = await import('./native-coverage-provider.mjs'); return new Provider();},
  async startCoverage(options: {isolate: boolean}): Promise<void> {
    let holder: Holder | undefined;
    try {
      const scope = context(); assert(options.isolate, 'Native coverage requires the configured isolated Vitest suites'); assert(!Reflect.has(globalThis, scope.key), 'Cannot replace active inspector holder');
      const session = new inspector.Session(); holder = {kind: OWNER, id: randomUUID(), pid: process.pid, key: scope.key, config: scope.config, configHash: scope.hash, session, reference: session, parsed: new Map(), started: false, enabled: false, debugging: false};
      Object.defineProperty(globalThis, scope.key, {value: holder, writable: false, configurable: true}); const owned = holder;
      session.connect(); session.on('Debugger.scriptParsed', ({params}) => {if (nativeSelected(owned.config, params.url) || !params.url || /^evalmachine\./.test(params.url)) owned.parsed.set(params.scriptId, params);});
      await session.post('Debugger.enable'); holder.debugging = true; await session.post('Profiler.enable'); holder.enabled = true;
      await session.post('Profiler.startPreciseCoverage', {callCount: true, detailed: true}); holder.started = true;
    } catch (error) {await failed(error, holder);}
  },
  async takeCoverage(options?: {moduleExecutionInfo?: Map<string, {startOffset: number}>}): Promise<{file: string; sha256: string; bytes: number}> {
    let holder: Holder | undefined;
    try {
      holder = current(); assert(holder.started); const identity = environment(), id = randomUUID();
      const raw = await holder.session.post('Profiler.takePreciseCoverage');
      assert('timestamp' in raw && typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp), 'Missing native coverage timestamp');
      // Retain actual selected ranges unchanged. Irrelevant Node/library scripts cannot inflate disk artifacts.
      const selected = raw.result.filter(script => nativeSelected(holder!.config, script.url) || !script.url || /^evalmachine\./.test(script.url));
      const rawBlob = writeNativeJSON(holder.config.directory, `raw-${id}.json`, {result: selected, timestamp: raw.timestamp}); const snapshots: NativeSnapshot[] = [];
      for (const script of selected) {
        assert(script.functions.length > 0); const metadata = holder.parsed.get(script.scriptId); assert(metadata && metadata.scriptId === script.scriptId && metadata.url === script.url, 'Missing native script provenance');
        const response: Debugger.GetScriptSourceReturnType = await holder.session.post('Debugger.getScriptSource', {scriptId: script.scriptId});
        const scriptSource: string = response.scriptSource;
        for (const fn of script.functions) {assert(fn.ranges.length > 0); for (const range of fn.ranges) assert(Number.isSafeInteger(range.startOffset) && Number.isSafeInteger(range.endOffset) && Number.isSafeInteger(range.count) && range.startOffset >= 0 && range.endOffset > range.startOffset && range.endOffset <= scriptSource.length && range.count >= 0, 'Malformed native range');}
        snapshots.push({file: nativeSelected(holder.config, script.url), scriptId: script.scriptId, url: script.url, metadata, source: writeNativeBlob(holder.config.directory, scriptSource), sourceLength: scriptSource.length});
      }
      const capture: NativeCapture = {schemaVersion: 1, runId: holder.config.runId, revision: holder.config.revision, holderId: holder.id, pid: holder.pid, environment: identity, raw: rawBlob, snapshots, moduleExecutionInfo: [...(options?.moduleExecutionInfo ?? [])], completed: true};
      return writeNativeJSON(holder.config.directory, `capture-${id}.json`, capture);
    } catch (error) {return failed(error, holder);}
  },
  async stopCoverage(): Promise<void> {const scope = context(); if (Reflect.has(globalThis, scope.key)) await release(current());},
};
