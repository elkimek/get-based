import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build, type BuildOptions, type OutputChunk, type OutputOptions, type Plugin, type RolldownOutput} from 'rolldown';
import {parseAst} from 'rolldown/parseAst';

const RETRY_QUERY = '?lazy-retry=1';
interface AstNode {type: string; start: number; end: number; [key: string]: unknown}
interface ImportReference {kind: 'static' | 'dynamic'; value: string; start: number; end: number}
interface Syntax {references: ImportReference[]; hasImportMeta: boolean}
interface RawChunk {code: string}
interface Pair {canonicalId: string; retryId: string}
export type NativeRetryOptions = BuildOptions & {plugins: Plugin[]; output: OutputOptions & {dir: string}; write?: true};
export interface QualifiedNativeRetry {
  canonicalId: string;
  retryId: string;
  canonicalFileName: string;
  removedRetryFileName: string;
  bodySHA256: string;
  canonicalPrehashSHA256: string;
  retryPrehashSHA256: string;
  exports: readonly string[];
  imports: readonly string[];
  dynamicImports: readonly string[];
}
export interface NativeRetryChunks {
  result: RolldownOutput;
  /** Only canonical hashed URL -> exact SHA-256 is shipped in the worker. */
  canonicalBodyHashes: Readonly<Record<string, string>>;
  removedPhysicalFiles: number;
  removedPhysicalBodyBytes: number;
  /** Build-only logical transport evidence. Never injected into shipped assets. */
  qualifiedRetries: readonly QualifiedNativeRetry[];
}

const digest = (source: string) => createHash('sha256').update(source).digest('hex');
const identity = (chunk: Pick<OutputChunk, 'facadeModuleId' | 'modules'>) =>
  chunk.facadeModuleId || Object.keys(chunk.modules).sort().join('\n');
const same = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const target = (file: string, reference: string) => reference.startsWith('.')
  ? path.posix.normalize(path.posix.join(path.posix.dirname(file), reference)) : reference;

function isNode(value: unknown): value is AstNode {
  return value !== null && typeof value === 'object' && 'type' in value
    && typeof value.type === 'string' && 'start' in value && typeof value.start === 'number'
    && 'end' in value && typeof value.end === 'number';
}
function stringValue(node: AstNode): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type !== 'TemplateLiteral' || !Array.isArray(node.expressions)
    || node.expressions.length || !Array.isArray(node.quasis)) return null;
  const quasi: unknown = node.quasis[0];
  if (!isNode(quasi) || !quasi.value || typeof quasi.value !== 'object'
    || !('cooked' in quasi.value) || typeof quasi.value.cooked !== 'string') return null;
  return quasi.value.cooked;
}
function syntax(code: string): Syntax {
  const result: Syntax = {references: [], hasImportMeta: false};
  const add = (source: unknown, kind: ImportReference['kind']) => {
    if (!isNode(source)) return;
    const value = stringValue(source);
    if (value !== null) result.references.push({kind, value, start: source.start, end: source.end});
  };
  const walk = (node: unknown): void => {
    if (!isNode(node)) return;
    if (node.type === 'MetaProperty') result.hasImportMeta = true;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
      add(node.source, 'static');
    }
    if (node.type === 'ImportExpression') add(node.source, 'dynamic');
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (isNode(value)) walk(value);
    }
  };
  walk(parseAst(code));
  return result;
}

/** Both passes receive fresh stateful plugins. No generated code changes after renderChunk. */
export async function buildNativeRetryChunks(createOptions: () => NativeRetryOptions): Promise<NativeRetryChunks> {
  const raw = new Map<string, RawChunk>();
  const inventory: Plugin = {
    name: 'getbased-native-retry-inventory',
    renderChunk(code, chunk) {
      const key = identity(chunk);
      assert(!raw.has(key), 'Duplicate first-pass chunk identity');
      raw.set(key, {code});
      return null;
    },
  };
  const firstOptions = createOptions();
  const first = await build({...firstOptions, write: false, plugins: [...firstOptions.plugins, inventory]});
  const original = first.output.filter(item => item.type === 'chunk');
  const facades = new Map(original.filter(chunk => chunk.facadeModuleId)
    .map(chunk => [chunk.facadeModuleId, chunk]));
  const pairs: Pair[] = [];
  for (const retry of original) {
    const retryId = retry.facadeModuleId;
    if (!retryId?.endsWith(RETRY_QUERY)) continue;
    const canonicalId = retryId.slice(0, -RETRY_QUERY.length);
    const canonical = facades.get(canonicalId);
    if (!canonical || canonical.isEntry || retry.isEntry || canonical.map || retry.map
      || canonical.code !== retry.code || !same(canonical.exports, retry.exports)
      || !same(canonical.imports, retry.imports) || !same(canonical.dynamicImports, retry.dynamicImports)
      || path.posix.dirname(canonical.fileName) !== path.posix.dirname(retry.fileName)
      || original.some(chunk => chunk.imports.includes(retry.fileName))
      || [...canonical.imports, ...canonical.dynamicImports].some(file => file === canonical.fileName || file === retry.fileName)) continue;
    const before = raw.get(identity(canonical)), retryBefore = raw.get(identity(retry));
    assert(before && retryBefore, 'Missing first-pass prehash source');
    if (syntax(canonical.code).hasImportMeta || syntax(before.code).hasImportMeta
      || syntax(retryBefore.code).hasImportMeta) continue;
    pairs.push({canonicalId, retryId});
  }

  const aliases: Record<string, string> = {};
  const qualifiedRetries: QualifiedNativeRetry[] = [];
  const removedFiles = new Set<string>();
  let removedPhysicalBodyBytes = 0;
  const rewrite: Plugin = {
    name: 'getbased-native-retry-query-transport',
    renderChunk(code, chunk, _output, meta) {
      const before = raw.get(identity(chunk));
      assert(before, 'Unexpected second-pass chunk');
      assert.equal(code, before.code, 'Non-deterministic prehash input between retry passes');
      const rendered = Object.values(meta.chunks);
      const replacements = new Map<string, string>();
      for (const pair of pairs) {
        const canonical = rendered.find(item => item.facadeModuleId === pair.canonicalId);
        const retry = rendered.find(item => item.facadeModuleId === pair.retryId);
        assert(canonical && retry, 'Missing second-pass facade');
        replacements.set(retry.fileName, canonical.fileName);
      }
      const edits: Array<{start: number; end: number; value: string}> = [];
      for (const reference of syntax(code).references) {
        const canonical = replacements.get(target(chunk.fileName, reference.value));
        if (!canonical) continue;
        assert.equal(reference.kind, 'dynamic', 'Retry transport cannot replace a static dependency');
        const relative = path.posix.relative(path.posix.dirname(chunk.fileName), canonical);
        edits.push({start: reference.start, end: reference.end,
          value: JSON.stringify((relative.startsWith('.') ? relative : './' + relative) + RETRY_QUERY)});
      }
      let transformed = code;
      for (const edit of edits.toSorted((left, right) => right.start - left.start)) {
        transformed = transformed.slice(0, edit.start) + edit.value + transformed.slice(edit.end);
      }
      for (const reference of syntax(transformed).references) {
        assert(!replacements.has(target(chunk.fileName, reference.value)), 'Unrewritten retry reference');
      }
      return edits.length ? {code: transformed, map: null} : null;
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
      const byFacade = new Map(chunks.filter(chunk => chunk.facadeModuleId)
        .map(chunk => [chunk.facadeModuleId, chunk]));
      const removed = new Map<string, string>();
      for (const pair of pairs) {
        const canonical = byFacade.get(pair.canonicalId), retry = byFacade.get(pair.retryId);
        assert(canonical && retry, 'Missing final retry pair');
        assert.equal(canonical.code, retry.code, 'Final canonical/retry bytes changed after prehash proof');
        assert(same(canonical.exports, retry.exports) && same(canonical.imports, retry.imports)
          && same(canonical.dynamicImports, retry.dynamicImports), 'Final namespace/dependencies differ');
        assert(!syntax(canonical.code).hasImportMeta, 'Final retry body gained import.meta');
        aliases['/js/' + canonical.fileName] = digest(canonical.code);
        removed.set(retry.fileName, canonical.fileName);
        removedFiles.add(retry.fileName);
        removedPhysicalBodyBytes += Buffer.byteLength(retry.code);
      }
      for (const chunk of chunks) {
        for (const reference of syntax(chunk.code).references) {
          assert(!removed.has(target(chunk.fileName, reference.value)), 'Emitted code references a removed file');
        }
        assert(chunk.imports.every(file => !removed.has(file)), 'Static graph references a removed retry');
        // Metadata follows the already-transformed code. Never mutate chunk.code here.
        chunk.dynamicImports = chunk.dynamicImports.map(file => {
          const canonical = removed.get(file);
          return canonical ? canonical + RETRY_QUERY : file;
        });
      }
      for (const pair of pairs) {
        const canonical = byFacade.get(pair.canonicalId), retry = byFacade.get(pair.retryId);
        assert(canonical && retry);
        const canonicalRaw = raw.get(identity(canonical)), retryRaw = raw.get(identity(retry));
        assert(canonicalRaw && retryRaw);
        qualifiedRetries.push({canonicalId: pair.canonicalId, retryId: pair.retryId,
          canonicalFileName: canonical.fileName, removedRetryFileName: retry.fileName,
          bodySHA256: digest(canonical.code), canonicalPrehashSHA256: digest(canonicalRaw.code),
          retryPrehashSHA256: digest(retryRaw.code), exports: [...canonical.exports],
          imports: [...canonical.imports], dynamicImports: [...canonical.dynamicImports]});
      }
      for (const file of removedFiles) delete bundle[file];
    },
  };
  const secondOptions = createOptions();
  const result = await build({...secondOptions, plugins: [...secondOptions.plugins, rewrite]});
  const chunks = result.output.filter(item => item.type === 'chunk');
  assert(chunks.every(chunk => !removedFiles.has(chunk.fileName)), 'Deleted retry survived actual output');
  const directory = secondOptions.output.dir;
  assert(directory, 'Native retry build requires a real output directory');
  for (const chunk of chunks) {
    assert.equal(await fs.readFile(path.join(directory, chunk.fileName), 'utf8'), chunk.code,
      'Producer output changed after content hashes');
    const prior = original.find(item => item.fileName === chunk.fileName);
    if (prior) assert.equal(chunk.code, prior.code, 'Same immutable filename acquired different bytes');
  }
  for (const file of removedFiles) {
    await assert.rejects(fs.access(path.join(directory, file)), {code: 'ENOENT'});
  }
  return {result, canonicalBodyHashes: Object.freeze(aliases),
    removedPhysicalFiles: removedFiles.size, removedPhysicalBodyBytes,
    qualifiedRetries: Object.freeze(qualifiedRetries)};
}
