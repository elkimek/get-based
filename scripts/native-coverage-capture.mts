import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {productionFunctionIndex} from './coverage-source.mjs';
import {nativeDigest, nativeSelected, readNativeBlob, readNativeCapture, readNativeRegular} from './native-coverage-storage.mjs';
import {nativeFunctionMapper, UnmappedNativeFunction} from './native-coverage-functions.mjs';
import {replayNativeTransform, NATIVE_WRAPPER_PREFIX} from './native-coverage-transform.mjs';
import type {NativeCapture, NativeContext, NativeGeometry, NativeMappedCapture, NativeObservation, NativeRaw, NativeSuiteCapture, NativeTransform} from './native-coverage-types.mjs';
export function validateNativeEnvironment(capture: NativeCapture, independent: string): void {
  assert(capture.schemaVersion === 1 && capture.completed === true && Number.isSafeInteger(capture.pid) && capture.pid > 0 && /^[a-f0-9-]{36}$/.test(capture.holderId));
  const {environment} = capture; assert(environment && (environment.name === 'node' || environment.name === 'jsdom'));
  assert.equal(environment.viteEnvironment, environment.name === 'node' ? 'ssr' : 'client'); assert.equal(environment.consumer, environment.name === 'node' ? 'server' : 'client'); assert.equal(independent, environment.viteEnvironment, 'Independent provider suite environment mismatch');
}
/** A run-scoped mapper shares parse/transform work across isolated suites without sharing coverage counters. */
export class NativeCaptureMapper {
  readonly #config: NativeContext;
  readonly #sealed: ReadonlySet<string> | undefined;
  readonly #variants = new Map<string, string[]>();
  readonly #mapped = new Map<string, Map<string, {start: number; end: number} | {reason: string}>>();
  readonly #ownership = new Map<string, Set<string>>();
  constructor(config: NativeContext, sealed?: ReadonlySet<string>) {
    this.#config = config; this.#sealed = sealed;
    for (const name of fs.readdirSync(config.directory).sort()) {
      if (!/^(?:geometry|observation)-[a-f0-9]{64}\.json$/.test(name)) continue;
      assert(!sealed || sealed.has(name), 'Unsealed native transform observation');
      const value = JSON.parse(readNativeRegular(path.join(config.directory, name)).toString('utf8')) as NativeGeometry | NativeObservation;
      assert(config.sources.includes(value.file)); assert.equal(name, `${name.startsWith('geometry-') ? 'geometry' : 'observation'}-${nativeDigest(JSON.stringify(value))}.json`);
      const key = JSON.stringify([name.startsWith('geometry-') ? 'geometry' : 'observation', value.file, value.environment, value.consumer]); const variants = this.#variants.get(key) ?? []; variants.push(name); this.#variants.set(key, variants);
    }
  }
  async map(record: NativeSuiteCapture): Promise<NativeMappedCapture> {
    const config = this.#config, capture = readNativeCapture(config.directory, record.file, this.#sealed);
    validateNativeEnvironment(capture, record.environment); assert.equal(capture.runId, config.runId); assert.equal(capture.revision, config.revision);
    const raw = JSON.parse(readNativeBlob(config.directory, capture.raw).toString('utf8')) as NativeRaw;
    assert(Array.isArray(raw.result) && Number.isFinite(raw.timestamp) && Array.isArray(capture.snapshots) && Array.isArray(capture.moduleExecutionInfo));
    assert.equal(raw.result.length, capture.snapshots.length, 'Missing native script snapshot');
    const scriptIds = new Set<string>(), result: NativeMappedCapture = {called: [], unmapped: [], unattributed: []};
    for (const script of raw.result) {
      assert(typeof script.scriptId === 'string' && typeof script.url === 'string' && !scriptIds.has(script.scriptId)); scriptIds.add(script.scriptId);
      const matches = capture.snapshots.filter(snapshot => snapshot.scriptId === script.scriptId); assert.equal(matches.length, 1, 'Ambiguous native script snapshot'); const snapshot = matches[0]!;
      assert.equal(snapshot.url, script.url); assert(snapshot.metadata && snapshot.metadata.scriptId === script.scriptId && snapshot.metadata.url === script.url);
      const relative = nativeSelected(config, script.url); assert.equal(snapshot.file, relative, 'Native snapshot source attribution changed');
      const runtime = readNativeBlob(config.directory, snapshot.source).toString('utf8'); assert.equal(runtime.length, snapshot.sourceLength);
      assert(Array.isArray(script.functions) && script.functions.length > 0); const own = new Set<string>();
      for (const fn of script.functions) {
        assert(typeof fn.functionName === 'string' && typeof fn.isBlockCoverage === 'boolean' && Array.isArray(fn.ranges) && fn.ranges.length > 0);
        for (const range of fn.ranges) assert(Number.isSafeInteger(range.startOffset) && Number.isSafeInteger(range.endOffset) && Number.isSafeInteger(range.count) && range.count >= 0 && range.startOffset >= 0 && range.endOffset > range.startOffset && range.endOffset <= runtime.length, 'Malformed native own ranges');
        const first = fn.ranges[0]!, key = `${first.startOffset}:${first.endOffset}`; assert(!own.has(key), 'Duplicate native own range'); own.add(key);
      }
      if (!relative) {
        // Existing VM/Function tests legitimately have no canonical filename. Keep authenticated raw evidence, never infer ownership.
        result.unattributed.push({capture: record.file.file, scriptId: script.scriptId, sourceHash: snapshot.source.sha256, runtimeLength: runtime.length, functions: script.functions.length, positiveOwnFunctions: script.functions.filter(fn => fn.ranges[0]!.count > 0).length});
        continue;
      }
      const canonical = readNativeRegular(path.join(config.root, relative)).toString('utf8');
      const cacheKey = JSON.stringify([relative, snapshot.source.sha256, capture.environment]);
      const entries = this.#mapped.get(cacheKey) ?? new Map<string, {start: number; end: number} | {reason: string}>();
      if (script.functions.some(fn => !entries.has(`${fn.ranges[0]!.startOffset}:${fn.ranges[0]!.endOffset}`))) {
          let transform: NativeTransform;
          if (runtime === canonical) transform = {file: path.join(config.root, relative), canonical, runtime, code: runtime, map: null, offset: 0};
          else {
            assert(runtime.startsWith(NATIVE_WRAPPER_PREFIX), 'Selected runtime source differs without a public module wrapper');
            const unique = <T extends NativeGeometry | NativeObservation>(kind: string): T => {const variants = this.#variants.get(JSON.stringify([kind, relative, capture.environment.viteEnvironment, capture.environment.consumer])) ?? []; assert.equal(variants.length, 1, 'Multiple source transform variants require a distinct exact witness'); const name = variants[0]!, value = JSON.parse(readNativeRegular(path.join(config.directory, name)).toString('utf8')) as T; assert.equal(name, `${kind}-${nativeDigest(JSON.stringify(value))}.json`, 'Changed native transform observation'); return value;};
            const info = capture.moduleExecutionInfo.filter(([file]) => file === path.join(config.root, relative)); assert.equal(info.length, 1, 'Missing public module execution offset');
            transform = await replayNativeTransform(config.root, relative, canonical, runtime, snapshot, info[0]![1].startOffset, unique<NativeGeometry>('geometry'), unique<NativeObservation>('observation'), capture.environment);
          }
          const mapper = nativeFunctionMapper(transform);
          for (const native of script.functions) {
            const first = native.ranges[0]!, key = `${first.startOffset}:${first.endOffset}`;
            try {const mapped = mapper(native); entries.set(key, {start: mapped.start, end: mapped.end});}
            catch (error) {if (!(error instanceof UnmappedNativeFunction)) throw error; entries.set(key, {reason: error.message});}
          }
          // Only compact identity facts survive a script. AST facts, decoded maps and token closures are released.
          this.#mapped.set(cacheKey, entries);
      }
      let owned = this.#ownership.get(relative); if (!owned) {owned = new Set(productionFunctionIndex(canonical, relative, config.root).owned.map(fn => `${fn.start}:${fn.end}`)); this.#ownership.set(relative, owned);}
      for (const native of script.functions) {
        const first = native.ranges[0]!, identity = entries.get(`${first.startOffset}:${first.endOffset}`); assert(identity);
        if ('reason' in identity) result.unmapped.push({file: relative, start: first.startOffset, end: first.endOffset, count: first.count, runtimeLength: runtime.length, reason: identity.reason});
        else if (first.count > 0 && owned.has(`${identity.start}:${identity.end}`)) result.called.push({file: relative, ...identity, count: first.count});
      }
    }
    return result;
  }
}
