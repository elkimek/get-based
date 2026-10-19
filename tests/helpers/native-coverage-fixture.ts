import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {productionSources, productionFunctionIndex} from '../../scripts/coverage-source.mjs';
import {nativeDigest, writeNativeBlob, writeNativeJSON} from '../../scripts/native-coverage-storage.mjs';
import {nativeCoverageSummary, NATIVE_COVERAGE_FILE} from '../../scripts/native-coverage-receipt.mjs';
import type {NativeCoverageReceipt} from '../../scripts/native-coverage-receipt.mjs';
import type {NativeCapture, NativeContext, NativeRaw, NativeSuiteCapture, NativeBlob} from '../../scripts/native-coverage-types.mjs';
import type {NativeCaseProof} from '../../scripts/native-coverage-cases.mjs';
/** Synthetic codec/corruption fixture only. No inspector run or behavior/coverage acceptance is claimed. */
export function createNativeCoverageFixture(root: string, directory: string, revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()): {file: string; receipt: NativeCoverageReceipt; context: NativeContext; sourceFile: string; rawFile: string; captureFile: string; casesFile: string; key: {start: number; end: number}} {
  fs.mkdirSync(directory, {recursive: true});
  const context: NativeContext = {root, directory, runId: randomUUID(), revision, sources: productionSources(root, {runtime: true})};
  const sourceFile = 'js/unique-id.js', absolute = path.join(root, sourceFile), source = fs.readFileSync(absolute, 'utf8');
  const key = productionFunctionIndex(source, sourceFile, root).owned.find(fn => fn.name === 'cryptoRandomHex'); assert(key);
  const id = randomUUID(), raw: NativeRaw = {timestamp: 1, result: [{scriptId: '1', url: pathToFileURL(absolute).href, functions: [{functionName: 'cryptoRandomHex', isBlockCoverage: true, ranges: [{startOffset: key.start, endOffset: key.end, count: 1}]}]}]};
  const rawBlob = writeNativeJSON(directory, `raw-${id}.json`, raw), lines = source.split('\n');
  const capture: NativeCapture = {schemaVersion: 1, runId: context.runId, revision: context.revision, holderId: randomUUID(), pid: 1, environment: {name: 'node', viteEnvironment: 'ssr', consumer: 'server'}, raw: rawBlob, snapshots: [{file: sourceFile, scriptId: '1', url: raw.result[0]!.url, metadata: {scriptId: '1', url: raw.result[0]!.url, startLine: 0, startColumn: 0, endLine: lines.length - 1, endColumn: lines.at(-1)!.length, executionContextId: 1, hash: nativeDigest(source)}, source: writeNativeBlob(directory, source), sourceLength: source.length}], moduleExecutionInfo: [], completed: true};
  const captureBlob = writeNativeJSON(directory, `capture-${id}.json`, capture), testFile = 'tests/ci-results.test.ts', sourceHash = nativeDigest(fs.readFileSync(path.join(root, testFile))), test = {id: 'synthetic-codec-case', name: 'synthetic codec case', mode: 'run' as const, fails: false, line: 1, column: 0};
  const cases: NativeCaseProof = {schemaVersion: 1, runId: context.runId, revision: context.revision, reason: 'passed', errors: 0, specifications: [{id: 'synthetic-codec-module', project: '', file: testFile, sourceHash}], modules: [{id: 'synthetic-codec-module', project: '', file: testFile, sourceHash, collected: [test], finished: [{...test, state: 'passed', errors: 0}]}]};
  const captures: NativeSuiteCapture[] = [{file: captureBlob, testFiles: [testFile], project: '', environment: 'ssr'}];
  writeNativeJSON(directory, 'context.json', context); writeNativeJSON(directory, 'cases.json', cases); writeNativeJSON(directory, 'captures.json', captures);
  const transport: NativeBlob[] = [];
  function visit(folder: string, prefix: string): void {for (const entry of fs.readdirSync(folder, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {const relative = prefix + entry.name, file = path.join(folder, entry.name); if (entry.isDirectory()) visit(file, relative + '/'); else {const bytes = fs.readFileSync(file); transport.push({file: relative, sha256: nativeDigest(bytes), bytes: bytes.length});}}}
  visit(directory, '');
  const receipt: NativeCoverageReceipt = {schemaVersion: 1, producer: 'native-v8-own-functions', revision: context.revision, runId: context.runId, complete: true, functionsOnly: true, statements: null, branches: null, bytes: null, files: nativeCoverageSummary(context, [{called: [{file: sourceFile, start: key.start, end: key.end, count: 1}], unmapped: [], unattributed: []}]), unattributed: [], tests: {modules: 1, cases: 1, passed: 1, skipped: 0}, transport};
  writeNativeJSON(directory, NATIVE_COVERAGE_FILE, receipt);
  return {file: path.join(directory, NATIVE_COVERAGE_FILE), receipt, context, sourceFile, rawFile: rawBlob.file, captureFile: captureBlob.file, casesFile: 'cases.json', key: {start: key.start, end: key.end}};
}
