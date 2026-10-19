import assert from 'node:assert/strict';
import path from 'node:path';
import type {Reporter, Vitest, TestModule, TestCase, TestSpecification} from 'vitest/node';
import {nativeDigest, readNativeRegular, writeNativeJSON} from './native-coverage-storage.mjs';
import {validateNativeCases} from './native-coverage-cases.mjs';
import type {NativeCaseIdentity, NativeCaseModule, NativeCaseProof, NativeCaseResult} from './native-coverage-cases.mjs';
import type {NativeContext} from './native-coverage-types.mjs';
/** Independent public reporter binds discovery, collection, declaration modes and terminal case identities. */
export default class NativeCoverageReporter implements Reporter {
  #vitest?: Vitest;
  #specifications: NativeCaseProof['specifications'] = [];
  #collected = new Map<string, NativeCaseModule>();
  #ended = new Set<string>();
  onInit(vitest: Vitest): void {this.#vitest = vitest;}
  #context(): NativeContext | undefined {return this.#vitest?.getProvidedContext().getbasedNativeCoverage;}
  #identity(module: TestModule): Omit<NativeCaseModule, 'collected' | 'finished'> {
    const config = this.#context(); assert(config); const file = path.relative(config.root, module.moduleId).split(path.sep).join('/');
    return {id: module.id, project: module.project.name, file, sourceHash: nativeDigest(readNativeRegular(module.moduleId))};
  }
  #case(test: TestCase): NativeCaseIdentity {
    assert(test.options.mode !== 'only' && test.location, 'Coverage requires an unfiltered, source-located case'); let parent = test.parent;
    while (parent.type === 'suite') {assert(parent.options.mode !== 'only', 'Coverage cannot accept focused suites'); parent = parent.parent;}
    return {id: test.id, name: test.fullName, mode: test.options.mode, fails: !!test.options.fails, line: test.location.line, column: test.location.column};
  }
  onTestRunStart(specifications: readonly TestSpecification[]): void {
    const config = this.#context(); if (!config) return;
    const vitest = this.#vitest; assert(vitest);
    assert(!vitest.getGlobalTestNamePattern() && !vitest.config.tagsFilter?.length, 'Native coverage cannot qualify globally filtered cases');
    this.#collected.clear(); this.#ended.clear();
    this.#specifications = specifications.map(specification => {
      assert(!specification.testLines?.length && !specification.testNamePattern && !specification.testIds?.length && !specification.testTagsFilter?.length, 'Native coverage cannot qualify filtered cases');
      return {id: specification.taskId, project: specification.project.name, file: path.relative(config.root, specification.moduleId).split(path.sep).join('/'), sourceHash: nativeDigest(readNativeRegular(specification.moduleId))};
    });
  }
  onTestModuleCollected(module: TestModule): void {
    if (!this.#context()) return; assert(module.errors().length === 0 && !this.#collected.has(module.id));
    this.#collected.set(module.id, {...this.#identity(module), collected: [...module.children.allTests()].map(test => this.#case(test)), finished: []});
  }
  onTestModuleEnd(module: TestModule): void {
    if (!this.#context()) return; assert(module.ok() && module.errors().length === 0 && !this.#ended.has(module.id)); const collected = this.#collected.get(module.id); assert(collected);
    const finished: NativeCaseResult[] = [...module.children.allTests()].map(test => {const result = test.result(); assert(result.state === 'passed' || result.state === 'skipped', 'Incomplete native test result'); return {...this.#case(test), state: result.state, errors: result.errors?.length ?? 0};});
    assert.deepEqual(this.#identity(module), {id: collected.id, project: collected.project, file: collected.file, sourceHash: collected.sourceHash}); collected.finished = finished; this.#ended.add(module.id);
  }
  onTestRunEnd: NonNullable<Reporter['onTestRunEnd']> = (modules, errors, reason) => {
    const config = this.#context(); if (!config) return; assert(reason === 'passed' && errors.length === 0); assert.equal(this.#ended.size, modules.length);
    assert.deepEqual(modules.map(module => module.id).sort(), [...this.#ended].sort());
    const proof: NativeCaseProof = {schemaVersion: 1, runId: config.runId, revision: config.revision, reason: 'passed', errors: 0, specifications: this.#specifications, modules: modules.map(module => {const collected = this.#collected.get(module.id); assert(collected); return collected;})};
    validateNativeCases(proof, config); writeNativeJSON(config.directory, 'cases.json', proof);
  };
}
