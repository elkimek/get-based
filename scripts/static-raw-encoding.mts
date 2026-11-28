import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {minify, parse} from 'rolldown/utils';
import {assertLegacyEvoluEncoding as assertEquivalentEncoding} from './legacy-evolu-compaction.mjs';

export const COMPACTABLE_STATIC_VENDOR_SCRIPTS: Readonly<Record<string, boolean>> = Object.freeze({
  '/vendor/qrcode-generator.js': false,
  '/vendor/ppq-private-tee.js': true,
});

/** Preserve the complete executable tree, names, URLs and legal notices.
 * When the printer changes syntax, retain the exact original body instead. */
export async function encodeStaticRawModule(file: string, source: string, isModule = true): Promise<string> {
  const output = await minify(file, source, {module: isModule, compress: false, mangle: false, codegen: {legalComments: 'none'}});
  assert.deepEqual(output.errors, [], 'Raw module encoding errors: ' + file);
  const parsed = await parse(file, source);
  const notices = parsed.comments.filter(comment => /license|copyright|permission|public domain|@preserve|^!/i.test(comment.value))
    .map(comment => source.slice(comment.start, comment.end));
  const code = output.code + '\n' + notices.join('\n') + '\n';
  try {await assertEquivalentEncoding(source, code);}
  catch {return source;}
  return Buffer.byteLength(code) < Buffer.byteLength(source) ? code : source;
}
export async function verifyStaticRawModule(file: string, source: string, output: string, isModule = true): Promise<void> {
  assert.equal(output, await encodeStaticRawModule(file, source, isModule), 'Exact current raw-module encoding: ' + file);
}
export async function compactStaticRawModules(directory: string, urls: ReadonlySet<string>) {
  let before = 0, after = 0;
  for (const url of urls) {
    const file = path.join(directory, url.slice(1)), source = await fs.readFile(file, 'utf8');
    const output = await encodeStaticRawModule(url, source, true);
    before += Buffer.byteLength(source); after += Buffer.byteLength(output);
    await fs.writeFile(file, output);
  }
  return {files: urls.size, before, after, saved: before - after};
}
export async function compactStaticVendorScripts(directory: string, urls: readonly string[]) {
  let files = 0, before = 0, after = 0;
  for (const url of new Set(urls)) {
    if (!Object.hasOwn(COMPACTABLE_STATIC_VENDOR_SCRIPTS, url)) continue;
    const isModule = COMPACTABLE_STATIC_VENDOR_SCRIPTS[url]!;
    const file = path.join(directory, url.slice(1)), source = await fs.readFile(file, 'utf8');
    const output = await encodeStaticRawModule(url, source, isModule);
    files++;
    before += Buffer.byteLength(source); after += Buffer.byteLength(output);
    if (output !== source) await fs.writeFile(file, output);
  }
  return {files, before, after, saved: before - after};
}
