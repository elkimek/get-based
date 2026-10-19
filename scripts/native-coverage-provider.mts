import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import type {CoverageProvider, ResolvedCoverageOptions, Vitest} from 'vitest/node';
import {productionSources} from './coverage-source.mjs';
import {nativeContext, nativeDigest, readNativeBlob, readNativeCapture, readNativeRegular, writeNativeJSON} from './native-coverage-storage.mjs';
import {NativeCaptureMapper, validateNativeEnvironment} from './native-coverage-capture.mjs';
import {nativeCoverageSummary, NATIVE_COVERAGE_FILE, validateNativeFunctionCoverage} from './native-coverage-receipt.mjs';
import {validateNativeCases} from './native-coverage-cases.mjs';
import type {NativeCoverageFile, NativeCoverageReceipt} from './native-coverage-receipt.mjs';
import type {NativeBlob, NativeContext, NativeMappedCapture, NativeSuiteCapture, NativeUnattributedScript} from './native-coverage-types.mjs';
/** Public native provider: actual V8 own entries supply function credit; critical four-metric suites use Istanbul separately. */
export default class NativeCoverageProvider implements CoverageProvider {
  name = 'custom';
  #config?: NativeContext;
  #options?: ResolvedCoverageOptions;
  #captures: NativeSuiteCapture[] = [];
  #candidate?: NativeCoverageFile[];
  #unattributed: NativeUnattributedScript[] = [];
  initialize(vitest: Vitest): void {
    const root = fs.realpathSync(vitest.config.root), directory = path.resolve(root, vitest.config.coverage.reportsDirectory);
    const relative = path.relative(root, directory); assert(relative.startsWith('tests' + path.sep) && relative !== 'tests', 'Native reports must use a dedicated tests output directory');
    fs.rmSync(directory, {recursive: true, force: true}); fs.mkdirSync(directory, {recursive: true});
    const config: NativeContext = {root, directory: fs.realpathSync(directory), runId: randomUUID(), revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), sources: productionSources(root, {runtime: true})};
    nativeContext(config); this.#config = config; this.#options = {...vitest.config.coverage, reportsDirectory: directory};
    writeNativeJSON(directory, 'context.json', config); vitest.provide('getbasedNativeCoverage', config);
  }
  resolveOptions(): ResolvedCoverageOptions {assert(this.#options); return this.#options;}
  clean(): void { /* initialize owns the new run directory; preserve its injected context. */ }
  onAfterSuiteRun: CoverageProvider['onAfterSuiteRun'] = metadata => {
    const config = this.#config; assert(config); const manifest = metadata.coverage as NativeBlob; assert(manifest && /^capture-[a-f0-9-]{36}\.json$/.test(manifest.file));
    const capture = readNativeCapture(config.directory, manifest);
    validateNativeEnvironment(capture, metadata.environment); assert.equal(capture.runId, config.runId); assert.equal(capture.revision, config.revision);
    readNativeBlob(config.directory, capture.raw);
    const testFiles = metadata.testFiles.map(file => path.relative(config.root, file).split(path.sep).join('/')); assert(testFiles.length > 0 && new Set(testFiles).size === testFiles.length);
    const project = metadata.projectName ?? ''; assert(!this.#captures.some(record => record.project === project && record.testFiles.some(file => testFiles.includes(file))), 'Repeated suite coverage');
    this.#captures.push({file: manifest, testFiles, project, environment: metadata.environment});
  };
  async generateCoverage(): Promise<NativeCoverageFile[]> {
    const config = this.#config; assert(config && this.#captures.length > 0); writeNativeJSON(config.directory, 'captures.json', this.#captures);
    const mapper = new NativeCaptureMapper(config), mapped: NativeMappedCapture[] = [];
    for (const capture of this.#captures) mapped.push(await mapper.map(capture));
    this.#unattributed = mapped.flatMap(capture => capture.unattributed); this.#candidate = nativeCoverageSummary(config, mapped); return this.#candidate;
  }
  reportCoverage(coverage: unknown): void {
    const config = this.#config; assert(config && this.#candidate && coverage === this.#candidate);
    // Vitest's public onTestRunEnd reporter runs between generateCoverage and reportCoverage.
    const tests = validateNativeCases(JSON.parse(readNativeRegular(path.join(config.directory, 'cases.json')).toString('utf8')), config, this.#captures);
    const transport: NativeBlob[] = [];
    function visit(directory: string, prefix: string): void {
      for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = prefix + entry.name, absolute = path.join(directory, entry.name); assert(!entry.isSymbolicLink(), 'Native output cannot contain symlinks');
        if (entry.isDirectory()) visit(absolute, relative + '/');
        else {const bytes = readNativeRegular(absolute); transport.push({file: relative, sha256: nativeDigest(bytes), bytes: bytes.length});}
      }
    }
    visit(config.directory, '');
    const receipt: NativeCoverageReceipt = {schemaVersion: 1, producer: 'native-v8-own-functions', revision: config.revision, runId: config.runId, complete: true, functionsOnly: true, statements: null, branches: null, bytes: null, files: this.#candidate, unattributed: this.#unattributed, tests, transport};
    validateNativeFunctionCoverage(receipt, {root: config.root, expectedRevision: config.revision}); writeNativeJSON(config.directory, NATIVE_COVERAGE_FILE, receipt);
  }
}
