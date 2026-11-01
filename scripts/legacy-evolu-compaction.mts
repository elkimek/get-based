import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {minify, parse} from 'rolldown/utils';

// The frozen v7 graph is still required offline for identity migration and
// recovery. Change its encoding only, never its public URLs or executable tree.
const ASSETS = [
  ['vendor/evolu/Db.worker.js',
    'f25e314ec4ba8581575537ddc0f290f58ece113a64a8a2cfd049ceb772094e10',
    '5e04be37348b943afec706709331291f11555180719fa6a6cb4cd0cc65ebf734'],
  ['vendor/evolu/evolu-bundle.js',
    '95027ae3c7fa7d26ebac2468e3f6d9c70e79e21b40c624919d2fa9fd38ef789a',
    '1d7aaa40fdc632d47b5d3ae9e265d2903b8ecb7160bad8e2cb634ee5259e0103'],
] as const;
const digest = (source: string) => createHash('sha256').update(source).digest('hex');
const legalNotice = (value: string) => /license|copyright|permission|public domain|@preserve|^!/i.test(value);

function syntax(value: unknown, parentType?: string): unknown {
  if (!value || typeof value !== 'object' || value instanceof RegExp) return value;
  if (Array.isArray(value)) return value.map(child => syntax(child, parentType));
  const node = value as Record<string, unknown>;
  // The printer may choose backticks for a plain string. This equivalence is
  // forbidden for tagged templates, whose raw text is observable.
  if (node.type === 'Literal' && typeof node.value === 'string') return {type: 'StringValue', value: node.value};
  if (node.type === 'TemplateLiteral' && parentType !== 'TaggedTemplateExpression'
    && Array.isArray(node.expressions) && !node.expressions.length && Array.isArray(node.quasis)
    && node.quasis.length === 1) {
    const quasi = node.quasis[0] as {value: {cooked: unknown}};
    assert.equal(typeof quasi.value.cooked, 'string');
    return {type: 'StringValue', value: quasi.value.cooked};
  }
  return Object.fromEntries(Object.entries(node)
    .filter(([key]) => key !== 'start' && key !== 'end' && !(key === 'raw' && node.type === 'Literal'))
    .map(([key, child]) => [key, syntax(child, typeof node.type === 'string' ? node.type : undefined)]));
}

/** Compare every node, binding, value, export and module/worker coordinate. */
export async function assertLegacyEvoluEncoding(source: string, output: string): Promise<void> {
  const [before, after] = await Promise.all([
    parse('legacy.js', source, {preserveParens: false}),
    parse('legacy.js', output, {preserveParens: false}),
  ]);
  assert.deepEqual(before.errors, [], 'Valid original legacy graph');
  assert.deepEqual(after.errors, [], 'Valid compact legacy graph');
  assert(isDeepStrictEqual(syntax(after.program), syntax(before.program)), 'Legacy executable syntax must remain identical');
  const notices = (comments: typeof before.comments) => comments
    .filter(comment => legalNotice(comment.value))
    .map(comment => comment.value);
  assert.deepEqual(notices(after.comments), notices(before.comments), 'Every legacy legal notice remains verbatim and ordered');
}

/** A closed encoding contract shared by the producer and portable CI seal. */
export async function verifyLegacyEvoluAsset(file: string, source: string, output: string): Promise<boolean> {
  const asset = ASSETS.find(([name]) => name === file);
  if (!asset) return false;
  assert.equal(digest(source), asset[1], 'Exact frozen legacy input: ' + file);
  assert.equal(digest(output), asset[2], 'Exact qualified legacy encoding: ' + file);
  await assertLegacyEvoluEncoding(source, output);
  return true;
}
export async function compactLegacyEvoluAssets(directory: string) {
  const prepared = [];
  for (const [file, originalHash, outputHash] of ASSETS) {
    const source = await fs.readFile(path.join(directory, file), 'utf8');
    assert.equal(digest(source), originalHash, 'Exact frozen legacy input: ' + file);
    const output = await minify(file, source, {
      module: true, compress: false, mangle: false, codegen: {legalComments: 'none'},
    });
    assert.deepEqual(output.errors, [], 'Legacy encoding errors: ' + file);
    // The printer reindents comments. Copy original complete notices instead.
    const original = await parse(file, source);
    const notices = original.comments.filter(comment => legalNotice(comment.value))
      .map(comment => source.slice(comment.start, comment.end));
    const code = output.code + '\n' + notices.join('\n') + '\n';
    assert.equal(digest(code), outputHash, 'Exact qualified legacy encoding: ' + file);
    await verifyLegacyEvoluAsset(file, source, code);
    prepared.push({file, source, output: code});
  }
  // Qualify the entire closed set before replacing either copied file.
  for (const item of prepared) await fs.writeFile(path.join(directory, item.file), item.output);
  const before = prepared.reduce((bytes, item) => bytes + Buffer.byteLength(item.source), 0);
  const after = prepared.reduce((bytes, item) => bytes + Buffer.byteLength(item.output), 0);
  return {files: prepared.length, before, after, saved: before - after};
}
