import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseModuleSpecifiers} from '../../scripts/architecture-map.mjs';

interface GraphModule {id: string; renderedLength?: number}
export interface ActualRetryChunk {
  file: string;
  facadeModuleId?: string | null;
  modules: GraphModule[];
  exports?: string[];
  imports?: string[];
  dynamicImports?: string[];
  bytes?: number;
  codeSHA256?: string;
}
interface QualifiedRetry {
  canonicalId: string;
  retryId: string;
  canonicalFileName: string;
  removedRetryFileName: string;
  bodySHA256: string;
  canonicalPrehashSHA256: string;
  retryPrehashSHA256: string;
  exports: string[];
  imports: string[];
  dynamicImports: string[];
}
export interface ActualRetryGraph {
  artifactRoot?: string;
  modules?: {id: string}[];
  chunks: ActualRetryChunk[];
  qualifiedRetries?: QualifiedRetry[];
  canonicalBodyHashes?: Record<string, string>;
}
const query = '?lazy-retry=1';
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const hashedChunk = /^bundle-[A-Za-z0-9_-]+\.js$/;
const retainedIds = (graph: ActualRetryGraph) => graph.chunks.flatMap(chunk => chunk.modules
  .filter(module => module.renderedLength === undefined || module.renderedLength > 0)
  .map(module => module.id));

/** Physical facades keep their original guard. A removed native facade must
 * instead prove a distinct, actually imported query module against disk bytes.
 * This consumes builder diagnostics only; it never changes candidate output. */
export function requireActualRetry(graph: ActualRetryGraph, kind: 'native' | 'kit', entry: string): void {
  const canonicalSuffix = '/js/' + entry;
  const ids = retainedIds(graph);
  assert(ids.some(id => id.endsWith(canonicalSuffix)), `${kind}: canonical ${entry}`);
  if (ids.some(id => id.endsWith(canonicalSuffix + query))) return;
  assert.equal(kind, 'native', `Missing physical ${kind} retry ${entry}`);
  assert(graph.artifactRoot && path.isAbsolute(graph.artifactRoot), 'Missing absolute actual artifact root');
  assert(graph.modules, 'Missing actual parsed source modules');
  assert(graph.qualifiedRetries?.length, 'Missing qualified native retries');
  assert(graph.canonicalBodyHashes, 'Missing shipped canonical body hashes');
  const roots = graph.modules.filter(module => module.id.endsWith(canonicalSuffix));
  assert.equal(roots.length, 1, 'Canonical source root must be unique');
  const root = roots[0]!;
  const proofs = graph.qualifiedRetries;
  const requested = proofs.filter(proof => proof.canonicalId === root.id && proof.retryId === root.id + query);
  assert.equal(requested.length, 1, 'Missing or duplicate exact logical retry root');
  const parsed = new Set(graph.modules.map(module => module.id));
  const byFile = new Map(graph.chunks.map(chunk => [chunk.file, chunk]));
  assert.equal(byFile.size, graph.chunks.length, 'Duplicate actual chunk file');
  const removed = new Map<string, string>();
  const canonical = new Map<string, ActualRetryChunk>();
  const sourceRoots = new Set<string>();
  const bodies = new Map<string, Buffer>();
  const read = (file: string): Buffer => {
    assert.equal(path.posix.basename(file), file, 'Chunk filename must stay within artifact js directory');
    assert(file.endsWith('.js'), 'Expected a JavaScript chunk');
    let body = bodies.get(file);
    if (!body) {
      body = fs.readFileSync(path.join(graph.artifactRoot!, 'js', file));
      bodies.set(file, body);
    }
    return body;
  };
  for (const proof of proofs) {
    assert.equal(proof.retryId, proof.canonicalId + query, 'Wrong qualified retry source identity');
    assert(parsed.has(proof.canonicalId) && parsed.has(proof.retryId), 'Both exact source roots must be parsed');
    assert(!sourceRoots.has(proof.canonicalId), 'Duplicate qualified source root');
    sourceRoots.add(proof.canonicalId);
    assert(hashedChunk.test(proof.canonicalFileName) && hashedChunk.test(proof.removedRetryFileName), 'Expected closed hashed retry filenames');
    assert.notEqual(proof.canonicalFileName, proof.removedRetryFileName, 'Retry must have had a distinct physical filename');
    assert(!removed.has(proof.removedRetryFileName) && !canonical.has(proof.canonicalFileName), 'Ambiguous qualified retry pair');
    const facades = graph.chunks.filter(chunk => chunk.facadeModuleId === proof.canonicalId);
    assert.equal(facades.length, 1, 'Qualified root must have one actual canonical facade');
    const chunk = facades[0]!;
    assert.equal(chunk.file, proof.canonicalFileName, 'Cross-root canonical filename');
    assert(!byFile.has(proof.removedRetryFileName), 'Removed retry survived actual output');
    assert(!graph.chunks.some(item => item.facadeModuleId === proof.retryId), 'Removed retry facade survived');
    assert(!fs.existsSync(path.join(graph.artifactRoot, 'js', proof.removedRetryFileName)), 'Removed retry survived on disk');
    assert(hashPattern.test(proof.bodySHA256), 'Invalid body hash');
    assert(hashPattern.test(proof.canonicalPrehashSHA256) && hashPattern.test(proof.retryPrehashSHA256), 'Missing original prehash proof');
    const body = read(chunk.file);
    assert.equal(sha(body), proof.bodySHA256, 'Actual canonical bytes differ from qualified body');
    assert.equal(chunk.codeSHA256, proof.bodySHA256, 'Actual chunk code hash differs');
    assert.equal(chunk.bytes, body.byteLength, 'Actual chunk byte count differs');
    assert.equal(graph.canonicalBodyHashes['/js/' + chunk.file], proof.bodySHA256, 'Shipped canonical hash differs');
    assert.deepEqual(chunk.exports, proof.exports, 'Qualified namespace exports differ');
    assert.deepEqual(chunk.imports, proof.imports, 'Qualified static dependencies differ');
    removed.set(proof.removedRetryFileName, proof.canonicalFileName);
    canonical.set(proof.canonicalFileName, chunk);
  }
  assert.deepEqual(Object.keys(graph.canonicalBodyHashes).sort(),
    [...canonical.keys()].map(file => '/js/' + file).sort(), 'Shipped alias inventory differs');
  for (const proof of proofs) {
    const expected = proof.dynamicImports.map(file => {
      const target = removed.get(file);
      return target ? target + query : file;
    });
    assert.deepEqual(canonical.get(proof.canonicalFileName)!.dynamicImports, expected, 'Qualified dynamic dependencies differ');
  }
  // A manifest and metadata alone cannot establish an actual second ESM URL.
  // Independently parse producer bodies and require the same exact edge in both.
  const target = requested[0]!.canonicalFileName + query;
  let used = false;
  for (const chunk of graph.chunks) {
    const body = read(chunk.file);
    assert.equal(sha(body), chunk.codeSHA256, 'Producer bytes differ from final graph hash');
    assert.equal(body.byteLength, chunk.bytes, 'Producer bytes differ from final graph size');
    const dynamic = parseModuleSpecifiers(body.toString('utf8'), chunk.file).dependencies
      .filter(edge => edge.kind === 'dynamic').map(edge => edge.specifier.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(chunk.file), edge.specifier)) : edge.specifier);
    if (dynamic.includes(target)) {
      assert(chunk.dynamicImports?.includes(target), 'Actual query import is absent from final metadata');
      used = true;
    }
  }
  assert(used, 'Qualified retry query has no actual dynamic-import producer');
}
