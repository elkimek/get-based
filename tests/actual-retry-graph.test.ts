import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach, expect, it} from 'vitest';
import {requireActualRetry, type ActualRetryGraph} from './helpers/actual-retry-graph.js';

const directories: string[] = [];
const digest = (body: string) => createHash('sha256').update(body).digest('hex');
const source = '/synthetic/source/js/nutrition.js';
const childSource = '/synthetic/source/js/nutrition-child.js';
const target = 'bundle-nutrition-Ab12.js';
const removedTarget = 'bundle-nutrition-retry-Cd34.js';
const child = 'bundle-child-Ef56.js';
const removedChild = 'bundle-child-retry-Gh78.js';
const query = '?lazy-retry=1';

/** Real temporary producer bodies, not a stubbed parser/hash/filesystem. The
 * target itself imports a second qualified retry so the dependency inverse is
 * independently exercised as well as the root caller's distinct ESM URL. */
function fixture() {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-retry-graph-'));
  directories.push(artifactRoot);
  fs.mkdirSync(path.join(artifactRoot, 'js'));
  const bodies = {
    'main.js': `export const ordinary = () => import('./${target}');\nexport const retry = () => import('./${target}${query}');\n`,
    [target]: `export const value = 7;\nexport const nested = () => import('./${child}${query}');\n`,
    [child]: 'export const child = 11;\n',
  };
  for (const [file, body] of Object.entries(bodies)) fs.writeFileSync(path.join(artifactRoot, 'js', file), body);
  const graph: ActualRetryGraph = {
    artifactRoot,
    modules: [source, source + query, childSource, childSource + query].map(id => ({id})),
    chunks: Object.entries(bodies).map(([file, body]) => ({
      file,
      facadeModuleId: file === target ? source : file === child ? childSource : '/synthetic/source/js/main.js',
      modules: [{id: file === target ? source : file === child ? childSource : '/synthetic/source/js/main.js', renderedLength: body.length}],
      exports: file === target ? ['nested', 'value'] : file === child ? ['child'] : ['ordinary', 'retry'],
      imports: [],
      dynamicImports: file === 'main.js' ? [target, target + query] : file === target ? [child + query] : [],
      bytes: Buffer.byteLength(body), codeSHA256: digest(body),
    })),
    canonicalBodyHashes: {['/js/' + target]: digest(bodies[target]), ['/js/' + child]: digest(bodies[child])},
    qualifiedRetries: [
      {canonicalId: source, retryId: source + query, canonicalFileName: target, removedRetryFileName: removedTarget,
        bodySHA256: digest(bodies[target]), canonicalPrehashSHA256: digest('original canonical target'),
        retryPrehashSHA256: digest('original retry target'), exports: ['nested', 'value'], imports: [], dynamicImports: [removedChild]},
      {canonicalId: childSource, retryId: childSource + query, canonicalFileName: child, removedRetryFileName: removedChild,
        bodySHA256: digest(bodies[child]), canonicalPrehashSHA256: digest('original canonical child'),
        retryPrehashSHA256: digest('original retry child'), exports: ['child'], imports: [], dynamicImports: []},
    ],
  };
  return {graph, bodies};
}
function rewrite(graph: ActualRetryGraph, file: string, body: string): void {
  fs.writeFileSync(path.join(graph.artifactRoot!, 'js', file), body);
  const chunk = graph.chunks.find(item => item.file === file)!;
  chunk.codeSHA256 = digest(body);
  chunk.bytes = Buffer.byteLength(body);
}
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, {recursive: true, force: true});
});

it('proves a real removed native root, nested closed dependency rewrite, bytes, namespace and actual query producer', () => {
  const {graph} = fixture();
  expect(() => requireActualRetry(graph, 'native', 'nutrition.js')).not.toThrow();
  expect(() => requireActualRetry(graph, 'kit', 'nutrition.js')).toThrow('Missing physical kit retry');
});

it.each(['native', 'kit'] as const)('keeps the original retained physical root guard for %s', kind => {
  const graph: ActualRetryGraph = {chunks: [{file: 'main.js', modules: [{id: source}, {id: source + query}]}]};
  expect(() => requireActualRetry(graph, kind, 'nutrition.js')).not.toThrow();
  graph.chunks[0]!.modules[1]!.renderedLength = 0;
  expect(() => requireActualRetry(graph, kind, 'nutrition.js')).toThrow();
});

const corruptions: Array<[string, (graph: ActualRetryGraph) => void]> = [
  ['missing proof', graph => {graph.qualifiedRetries = [];}],
  ['cross-root proof', graph => {graph.qualifiedRetries![0]!.canonicalId = childSource;}],
  ['wrong retry root', graph => {graph.qualifiedRetries![0]!.retryId = source + '?other=1';}],
  ['unparsed retry source', graph => {graph.modules = graph.modules!.filter(row => row.id !== source + query);}],
  ['duplicate root', graph => {graph.qualifiedRetries!.push(structuredClone(graph.qualifiedRetries![0]!));}],
  ['missing artifact root', graph => {delete graph.artifactRoot;}],
  ['wrong facade', graph => {graph.chunks[1]!.facadeModuleId = childSource;}],
  ['removed file still emitted', graph => {graph.chunks.push({...graph.chunks[1]!, file: removedTarget, facadeModuleId: source + query});}],
  ['removed file still on disk', graph => {fs.writeFileSync(path.join(graph.artifactRoot!, 'js', removedTarget), 'export const obsolete = 1;');}],
  ['wrong body hash', graph => {graph.qualifiedRetries![0]!.bodySHA256 = '0'.repeat(64);}],
  ['wrong final code hash', graph => {graph.chunks[1]!.codeSHA256 = '0'.repeat(64);}],
  ['wrong final size', graph => {graph.chunks[1]!.bytes!++;}],
  ['wrong shipped hash', graph => {graph.canonicalBodyHashes!['/js/' + target] = '0'.repeat(64);}],
  ['unqualified shipped alias', graph => {graph.canonicalBodyHashes!['/js/bundle-unqualified-Q9.js'] = '0'.repeat(64);}],
  ['missing prehash proof', graph => {graph.qualifiedRetries![0]!.canonicalPrehashSHA256 = '';}],
  ['changed exports', graph => {graph.chunks[1]!.exports = ['value'];}],
  ['changed static dependency', graph => {graph.chunks[1]!.imports = ['unexpected.js'];}],
  ['changed dynamic dependency', graph => {graph.chunks[1]!.dynamicImports = [child];}],
  ['extra dynamic dependency', graph => {graph.chunks[1]!.dynamicImports!.push('unexpected.js');}],
  ['unqualified dependency rewrite', graph => {graph.qualifiedRetries!.pop();}],
  ['invented unrelated dependency', graph => {graph.qualifiedRetries![0]!.dynamicImports = ['unrelated.js'];}],
  ['actual query missing metadata', graph => {graph.chunks[0]!.dynamicImports = [target];}],
  ['producer body changed after hash', graph => {fs.appendFileSync(path.join(graph.artifactRoot!, 'js', 'main.js'), '\nexport const changed = true;');}],
];
for (const [name, mutate] of corruptions) {
  it(`rejects ${name} independently of the unchanged healthy fixture`, () => {
    const {graph} = fixture();
    expect(() => requireActualRetry(graph, 'native', 'nutrition.js')).not.toThrow();
    mutate(graph);
    expect(() => requireActualRetry(graph, 'native', 'nutrition.js')).toThrow();
  });
}

it('rejects metadata-only alias usage even when the changed producer has an honest final hash', () => {
  const {graph} = fixture();
  rewrite(graph, 'main.js', `export const ordinary = () => import('./${target}');\n// import('./${target}${query}') is only a comment\n`);
  expect(() => requireActualRetry(graph, 'native', 'nutrition.js')).toThrow('no actual dynamic-import producer');
});

it('retains exact unrelated dynamic dependency order and count', () => {
  const {graph, bodies} = fixture();
  const body = bodies[target] + "export const one = () => import('./other-one.js');\nexport const two = () => import('./other-two.js');\n";
  rewrite(graph, target, body);
  graph.qualifiedRetries![0]!.bodySHA256 = digest(body);
  graph.canonicalBodyHashes!['/js/' + target] = digest(body);
  graph.qualifiedRetries![0]!.dynamicImports.push('other-one.js', 'other-two.js');
  graph.chunks[1]!.dynamicImports!.push('other-one.js', 'other-two.js');
  expect(() => requireActualRetry(graph, 'native', 'nutrition.js')).not.toThrow();
  graph.chunks[1]!.dynamicImports = [child + query, 'other-two.js', 'other-one.js'];
  expect(() => requireActualRetry(graph, 'native', 'nutrition.js')).toThrow('Qualified dynamic dependencies differ');
});
