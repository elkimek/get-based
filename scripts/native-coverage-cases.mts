import assert from 'node:assert/strict';
import path from 'node:path';
import type {NativeContext, NativeSuiteCapture} from './native-coverage-types.mjs';
import {nativeDigest, portable, readNativeRegular} from './native-coverage-storage.mjs';
export interface NativeCaseIdentity {id: string; name: string; mode: 'run' | 'skip' | 'todo'; fails: boolean; line: number; column: number;}
export interface NativeCaseResult extends NativeCaseIdentity {state: 'passed' | 'skipped'; errors: number;}
export interface NativeCaseModule {id: string; project: string; file: string; sourceHash: string; collected: NativeCaseIdentity[]; finished: NativeCaseResult[];}
export interface NativeCaseProof {schemaVersion: 1; runId: string; revision: string; reason: 'passed'; errors: 0; specifications: {id: string; project: string; file: string; sourceHash: string}[]; modules: NativeCaseModule[];}
export function validateNativeCases(value: unknown, config: NativeContext, captures?: NativeSuiteCapture[]): {modules: number; cases: number; passed: number; skipped: number} {
  assert(value && typeof value === 'object'); const proof = value as NativeCaseProof;
  assert(proof.schemaVersion === 1 && proof.runId === config.runId && proof.revision === config.revision && proof.reason === 'passed' && proof.errors === 0);
  assert(Array.isArray(proof.specifications) && proof.specifications.length > 0 && Array.isArray(proof.modules));
  const identity = (module: {id: string; project: string; file: string; sourceHash: string}): string => {
    portable(module.file); assert(typeof module.id === 'string' && module.id.length > 0 && typeof module.project === 'string' && /^[a-f0-9]{64}$/.test(module.sourceHash));
    assert.equal(nativeDigest(readNativeRegular(path.join(config.root, module.file))), module.sourceHash, 'Stale native test module'); return JSON.stringify([module.project, module.file, module.id, module.sourceHash]);
  };
  const expected = proof.specifications.map(identity).sort(), actual = proof.modules.map(identity).sort(); assert.equal(new Set(expected).size, expected.length); assert.deepEqual(actual, expected, 'Collected native modules differ from discovered specifications');
  const ids = new Set<string>(); let cases = 0, passed = 0, skipped = 0;
  for (const module of proof.modules) {
    assert(Array.isArray(module.collected) && Array.isArray(module.finished));
    const stable = (item: NativeCaseIdentity): NativeCaseIdentity => {
      assert(typeof item.id === 'string' && item.id.length > 0 && typeof item.name === 'string' && item.name.length > 0 && ['run', 'skip', 'todo'].includes(item.mode) && typeof item.fails === 'boolean' && Number.isSafeInteger(item.line) && item.line > 0 && Number.isSafeInteger(item.column) && item.column >= 0, 'Invalid native case identity');
      return {id: item.id, name: item.name, mode: item.mode, fails: item.fails, line: item.line, column: item.column};
    };
    const collected = module.collected.map(stable); assert.equal(new Set(collected.map(item => item.id)).size, collected.length);
    const finished = module.finished.map(stable); assert.deepEqual(finished, collected, 'Native collected/finished case identities or declaration modes changed');
    for (const item of module.finished) {
      const id = JSON.stringify([module.project, module.file, item.id]); assert(!ids.has(id)); ids.add(id); assert(item.errors === 0, 'Native case retained errors');
      assert.equal(item.state, item.mode === 'run' ? 'passed' : 'skipped', 'Native declared case did not complete as collected'); cases++; if (item.state === 'passed') passed++; else skipped++;
    }
  }
  assert(cases > 0 && passed > 0, 'Empty native coverage test execution');
  if (captures) {
    const suiteFiles = captures.flatMap(capture => capture.testFiles.map(file => JSON.stringify([capture.project, file]))).sort(); const moduleFiles = proof.modules.map(module => JSON.stringify([module.project, module.file])).sort();
    assert.equal(new Set(suiteFiles).size, suiteFiles.length, 'Duplicate native suite capture'); assert.deepEqual(suiteFiles, moduleFiles, 'Coverage captures differ from actual test-module membership');
  }
  return {modules: proof.modules.length, cases, passed, skipped};
}
