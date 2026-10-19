import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync, inflateRawSync, crc32} from 'node:zlib';
import {constants as fsConstants} from 'node:fs';

export const wearableNativeFixtureManifestSHA256 = '17e5510d4b52a27d023a644dc130d6e59afa09394b79523791ddefda3249d49b';
const fixtureDirectory = fileURLToPath(new URL('../tests/fixtures/wearable-native-parity/', import.meta.url));
const maxPayloadBytes = 24 * 1024 * 1024;
const maxHeaderBytes = 64 * 1024;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface FileIdentity {file: string; bytes: number; sha256: string}
interface FixtureManifest {
  version: 1;
  archive: {file: 'receipts.bin.gz'; bytes: number; sha256: string; payloadBytes: number};
  files: FileIdentity[];
}
export interface QualifiedWearableNativeFile {file: string; bytes: Buffer; sha256: string}

function relativeFile(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0, 'A nonempty fixture member path');
  assert(!value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value), 'A portable relative fixture path');
  assert(value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'), 'No fixture path traversal');
  assert(!/^[A-Za-z]:/.test(value), 'No drive-qualified fixture path');
}
function identity(value: FileIdentity) {
  assert(value && typeof value === 'object', 'A fixture member identity');
  relativeFile(value.file);
  assert(Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= maxPayloadBytes, 'A bounded fixture member size');
  assert(typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256), 'An exact fixture member hash');
}

/** Verify the pinned compressed input, framing and every original member before
 * creating any files. The container is a four-byte big-endian JSON-header length,
 * that exact UTF-8 header, then the listed raw file bodies in order. It has no
 * archive link, mode or executable semantics. */
export function verifyWearableNativeArchive(archive: Buffer, manifestBytes: Buffer, expectedManifestSHA256: string): QualifiedWearableNativeFile[] {
  assert.equal(sha(manifestBytes), expectedManifestSHA256, 'Pinned Wearables fixture manifest');
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as FixtureManifest;
  assert.equal(manifest.version, 1, 'Known Wearables fixture format');
  assert.equal(manifest.archive.file, 'receipts.bin.gz', 'Fixed local fixture archive');
  assert(Number.isSafeInteger(manifest.archive.payloadBytes) && manifest.archive.payloadBytes > 4 && manifest.archive.payloadBytes <= maxPayloadBytes, 'Bounded decompressed fixture');
  assert.equal(archive.byteLength, manifest.archive.bytes, 'Exact compressed fixture size');
  assert.equal(sha(archive), manifest.archive.sha256, 'Pinned compressed fixture bytes');
  assert(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 32, 'Finite fixture member inventory');
  const names = new Set<string>();
  for (const file of manifest.files) {identity(file); assert(!names.has(file.file), 'Unique fixture member paths'); names.add(file.file);}
  const payload = gunzipSync(archive, {maxOutputLength: maxPayloadBytes});
  assert.equal(payload.byteLength, manifest.archive.payloadBytes, 'Exact decompressed fixture size');
  const headerLength = payload.readUInt32BE(0);
  assert(headerLength > 0 && headerLength <= maxHeaderBytes && 4 + headerLength < payload.byteLength, 'Bounded fixture framing');
  const header = JSON.parse(payload.subarray(4, 4 + headerLength).toString('utf8')) as {version: number; files: FileIdentity[]};
  assert.equal(header.version, manifest.version, 'Matching container version');
  assert.deepEqual(header.files, manifest.files, 'Exact container member inventory');
  const files: QualifiedWearableNativeFile[] = [];
  let offset = 4 + headerLength;
  for (const file of manifest.files) {
    const end = offset + file.bytes;
    assert(end <= payload.byteLength, 'Complete original fixture member');
    const bytes = payload.subarray(offset, end);
    assert.equal(sha(bytes), file.sha256, 'Exact original fixture member: ' + file.file);
    files.push({file: file.file, bytes, sha256: file.sha256});
    offset = end;
  }
  assert.equal(offset, payload.byteLength, 'No undeclared fixture bytes');
  return files;
}

/** Each test worker owns a fresh directory; source fixtures remain immutable and
 * no network, historical checkout or personal machine path is needed. */
export async function materializeWearableNativeFixture() {
  const manifestBytes = await fs.readFile(path.join(fixtureDirectory, 'manifest.json'));
  const archive = await fs.readFile(path.join(fixtureDirectory, 'receipts.bin.gz'));
  const files = verifyWearableNativeArchive(archive, manifestBytes, wearableNativeFixtureManifestSHA256);
  const nativeManifest = files.find(file => file.file === 'native-input-manifest.json');
  assert(nativeManifest, 'The original native input manifest is present');
  assert.equal(nativeManifest.sha256, 'b32fbd595d3a08e323335c3d15a8c07cea729dcb02721e183ca55ff96d1e817e', 'Unchanged original native input manifest');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-wearable-native-'));
  try {
    for (const file of files) {
      const target = path.join(directory, file.file);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.writeFile(target, file.bytes, {flag: 'wx', mode: 0o600});
    }
  } catch (error) {
    await fs.rm(directory, {recursive: true, force: true});
    throw error;
  }
  return {
    directory,
    manifestFile: path.join(directory, 'native-input-manifest.json'),
    manifestSHA: nativeManifest.sha256,
    async cleanup() {await fs.rm(directory, {recursive: true, force: true});},
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === '--github-env'), 'Use no arguments for JSON, or --github-env for the current GitHub job');
  if (args[0] === '--github-env') assert(process.env.GITHUB_ENV, '--github-env requires the runner-provided GITHUB_ENV file');
  const fixture = await materializeWearableNativeFixture();
  const environment = {
    GETBASED_WEARABLE_NATIVE_DIRECTORY: fixture.directory,
    GETBASED_WEARABLE_NATIVE_MANIFEST: fixture.manifestFile,
    GETBASED_WEARABLE_NATIVE_MANIFEST_SHA256: fixture.manifestSHA,
  };
  try {
    if (args[0] === '--github-env') await fs.appendFile(process.env.GITHUB_ENV!, Object.entries(environment).map(([key, value]) => `${key}=${value}\n`).join(''));
    process.stdout.write(JSON.stringify(environment) + '\n');
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}


// Original application and source snapshots are test data, never public assets.
// The old paint receipts above remain authenticated history; this complete app
// supplies the same-browser native reference for the active rendering contract.
export const wearableOriginalSourceSHA256 = '4876fef6fc09ae43959685971a83bbcb5ea792dd287aede5acb8ec27e783ea07';
export const wearableOriginalBindingSHA256 = '96e3a5898e79d8738369b43eed649fe3582105451403d03b32162678921e2199';
const originalLimit = 44 * 1024 * 1024;
const originalGzipHeader = Buffer.from('1f8b0800000000000203', 'hex');
interface OriginalMember {path: string; bytes: number; sha256: string}
interface OriginalSource {file: string; bytes: number; sha256: string; body: string}
interface OriginalBinding {kind: string; format: string; compressedBytes: number; compressedSHA256: string; frameBytes: number; frameSHA256: string; inventorySHA256: string; artifactBuildId: string; fileCount: number; decodedBodyBytes: number; archiveFile: string}
export interface WearableFixtureLifecycle {errors: Array<{stage: string; message: string}>; dropped: number; removed: boolean; acquiredDirectory?: string}
const lifecycleError = (receipt: WearableFixtureLifecycle, stage: string, error: unknown) => {
  let message = 'Unprintable thrown value'; try {message = String(error).slice(0, 2048);} catch {}
  if (receipt.errors.length < 32) receipt.errors.push({stage, message}); else receipt.dropped++;
};
function originalPath(name: string) {
  relativeFile(name);
  assert(name.length <= 512 && !name.includes(':') && name.split('/').length <= 16, 'Bounded portable original path');
  return name;
}
/** One fixed GZIP member, exact decoded frame and exact original file bodies.
 * No TAR/link/mode interpretation, concatenated members, trailing data or pin adoption. */
export function verifyWearableOriginalAppArchive(archive: Buffer, bindingBytes: Buffer) {
  assert.equal(sha(bindingBytes), wearableOriginalBindingSHA256, 'Pinned original application binding');
  const binding = JSON.parse(bindingBytes.toString('utf8')) as OriginalBinding;
  assert.equal(binding.kind, 'REVIEWED portable original fixture binding/v2');
  assert.equal(binding.format, 'GBORIG1-GZIP1');
  assert.equal(binding.archiveFile, 'original-artifact.gborig1.gz');
  assert.equal(binding.artifactBuildId, '84924c09f326ea10684b8a0c0aa92f51419c7498b6dfe03654370378207987ec');
  assert.equal(binding.fileCount, 769); assert.equal(binding.decodedBodyBytes, 42783073);
  assert(binding.frameBytes > binding.decodedBodyBytes && binding.frameBytes <= originalLimit);
  assert.equal(archive.length, binding.compressedBytes); assert(archive.length >= 20 && archive.length <= originalLimit);
  assert.equal(sha(archive), binding.compressedSHA256, 'Pinned complete original application');
  assert(archive.subarray(0, 10).equals(originalGzipHeader), 'Fixed original GZIP header');
  const compressed = archive.subarray(10, -8);
  // Node's documented info:true result is wider than the installed declaration.
  // Validate that public shape at runtime instead of trusting an unchecked cast.
  const inflated: unknown = inflateRawSync(compressed, {windowBits: 15, maxOutputLength: originalLimit, info: true});
  assert(inflated && typeof inflated === 'object');
  const engine: unknown = Reflect.get(inflated, 'engine'), frame: unknown = Reflect.get(inflated, 'buffer');
  assert(engine && typeof engine === 'object' && Buffer.isBuffer(frame), 'Native inflater info result');
  assert.equal(Reflect.get(engine, 'bytesWritten'), compressed.length, 'No trailing or concatenated GZIP members');
  assert.equal(frame.length, binding.frameBytes); assert.equal(sha(frame), binding.frameSHA256, 'Exact original decoded frame');
  assert.equal(archive.readUInt32LE(archive.length - 8), crc32(frame) >>> 0, 'Exact original GZIP CRC32');
  assert.equal(archive.readUInt32LE(archive.length - 4), frame.length >>> 0, 'Exact original GZIP ISIZE');
  assert(frame.subarray(0, 8).equals(Buffer.from('GBORIG1\n')));
  const headerBytes = frame.readUInt32BE(8); assert(headerBytes > 0 && headerBytes <= 262144 && 12 + headerBytes < frame.length);
  const header = frame.subarray(12, 12 + headerBytes);
  assert.equal(sha(header), binding.inventorySHA256, 'Pinned original member inventory');
  const rows = JSON.parse(header.toString('utf8')) as OriginalMember[];
  assert.equal(rows.length, 769); assert.equal(header.toString(), JSON.stringify(rows));
  const files: QualifiedWearableNativeFile[] = [], names = new Set<string>();
  let offset = 12 + headerBytes, total = 0;
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['bytes', 'path', 'sha256']); originalPath(row.path);
    assert(!names.has(row.path), 'Unique original application member'); names.add(row.path);
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 4 * 1024 * 1024);
    assert(/^[a-f0-9]{64}$/.test(row.sha256));
    assert(offset + row.bytes <= frame.length); const bytes = frame.subarray(offset, offset + row.bytes);
    assert.equal(sha(bytes), row.sha256, 'Exact original application member ' + row.path);
    files.push({file: row.path, bytes, sha256: row.sha256}); offset += row.bytes; total += row.bytes;
  }
  assert.equal(total, binding.decodedBodyBytes); assert.equal(offset, frame.length, 'No undeclared original frame bytes');
  for (const name of names) for (let parent = path.posix.dirname(name); parent !== '.'; parent = path.posix.dirname(parent))
    assert(!names.has(parent), 'No original file/directory prefix conflict');
  return {files, binding};
}
function verifyOriginalSources(bytes: Buffer) {
  assert.equal(sha(bytes), wearableOriginalSourceSHA256, 'Pinned independent original source data');
  const source = JSON.parse(bytes.toString('utf8')) as {version: number; files: OriginalSource[]};
  assert.equal(source.version, 1); assert.equal(source.files.length, 51);
  const names = new Set<string>(); let total = 0;
  for (const row of source.files) {
    originalPath(row.file); assert(!names.has(row.file)); names.add(row.file);
    const body = Buffer.from(row.body); assert.equal(body.length, row.bytes); assert.equal(sha(body), row.sha256);
    total += body.length;
  }
  assert.equal(total, 1138418);
  return source.files.map(row => ({file: row.file, bytes: Buffer.from(row.body), sha256: row.sha256}));
}
async function boundedOriginalRead(file: string, maximum: number, receipt: WearableFixtureLifecycle) {
  assert.equal(await fs.realpath(file), path.resolve(file), 'No original fixture symlink or parent escape');
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined, primary: unknown, present = false, bytes = Buffer.alloc(0);
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat(); assert(stat.isFile() && stat.size >= 0 && stat.size <= maximum, 'Bounded regular original fixture');
    bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) {const read: {bytesRead: number} = await handle.read(bytes, offset, bytes.length - offset, null); assert(read.bytesRead > 0, 'Complete original input'); offset += read.bytesRead;}
    assert.equal((await handle.read(Buffer.alloc(1), 0, 1, null)).bytesRead, 0, 'No input growth after preflight');
  } catch (error) {present = true; primary = error;}
  finally {if (handle) try {await handle.close();} catch (error) {lifecycleError(receipt, 'original input close', error); if (!present) {present = true; primary = error;}}}
  if (present) throw primary; return bytes;
}
/** Authenticate everything before the first extraction write. The sole owned
 * temporary directory is identity checked before after-qualification/removal. */
export async function materializeWearableOriginalApplication(receipt: WearableFixtureLifecycle) {
  const fresh: WearableFixtureLifecycle = {errors: [], dropped: 0, removed: false};
  assert.deepEqual(receipt, fresh, 'Fresh caller-visible fixture lifecycle receipt');
  const inputs = [
    {name: 'fixture-binding.json', maximum: 65536},
    {name: 'original-artifact.gborig1.gz', maximum: originalLimit},
    {name: 'original-source.json', maximum: 2 * 1024 * 1024},
  ];
  const raw: Buffer[] = [];
  for (const input of inputs) raw.push(await boundedOriginalRead(path.join(fixtureDirectory, input.name), input.maximum, receipt));
  const verified = verifyWearableOriginalAppArchive(raw[1]!, raw[0]!);
  const sources = verifyOriginalSources(raw[2]!);
  const all = [...verified.files.map(row => ({...row, file: 'app/' + row.file})), ...sources.map(row => ({...row, file: 'source/' + row.file}))];
  const byName = new Map(all.map(row => [row.file, row])), children = new Map<string, Set<string>>([['', new Set()]]);
  for (const row of all) {
    const parts = row.file.split('/'); let prefix = '';
    for (const part of parts) {if (!children.has(prefix)) children.set(prefix, new Set()); children.get(prefix)!.add(part); prefix = prefix ? prefix + '/' + part : part;}
  }
  let directory: string | undefined, owner: {dev: number; ino: number} | undefined;
  async function owned() {
    assert(directory && owner, 'Original extraction ownership unavailable; retain for inspection');
    assert.equal(await fs.realpath(directory), directory); const stat = await fs.lstat(directory);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === owner.dev && stat.ino === owner.ino, 'Exact owned original extraction required');
  }
  async function verifyDirectory() {
    await owned(); let count = 0, total = 0;
    async function walk(prefix: string, depth: number): Promise<void> {
      assert(depth <= 17); const expected = children.get(prefix); assert(expected, 'Only declared original directories');
      // opendir streams; unexpected entries fail on arrival rather than collecting an unbounded listing.
      const stream = await fs.opendir(path.join(directory!, prefix)); const seen = new Set<string>();
      let primary: unknown, present = false;
      try {
        for (;;) {
          const entry = await stream.read(); if (!entry) break;
          assert(expected.has(entry.name) && !seen.has(entry.name), 'Exact original directory membership'); seen.add(entry.name);
          const name = prefix ? prefix + '/' + entry.name : entry.name, file = path.join(directory!, name), stat = await fs.lstat(file);
          assert(!stat.isSymbolicLink()); const row = byName.get(name);
          if (row) {assert(entry.isFile() && stat.isFile()); const bytes = await boundedOriginalRead(file, 4 * 1024 * 1024, receipt); assert.equal(bytes.length, row.bytes.length); assert.equal(sha(bytes), row.sha256); count++; total += bytes.length;}
          else {assert(entry.isDirectory() && stat.isDirectory()); await walk(name, depth + 1);}
        }
      } catch (error) {primary = error; present = true;}
      finally {try {await stream.close();} catch (error) {lifecycleError(receipt, 'original directory close', error); if (!present) {primary = error; present = true;}}}
      if (present) throw primary;
      assert.equal(seen.size, expected.size, 'Complete original directory membership');
    }
    await walk('', 0); assert.equal(count, 820); assert.equal(total, 43921491);
  }
  async function verifyInputs() {for (const [index, input] of inputs.entries()) assert.equal(sha(await boundedOriginalRead(path.join(fixtureDirectory, input.name), input.maximum, receipt)), sha(raw[index]!), 'Original input unchanged after use');}
  async function cleanup() {
    try {await verifyInputs();} catch (error) {lifecycleError(receipt, 'original fixture input aftercheck', error);}
    if (directory) {
      try {await verifyDirectory();} catch (error) {lifecycleError(receipt, 'original extraction aftercheck', error);}
      try {await owned(); await fs.rm(directory, {recursive: true, force: false}); receipt.removed = true;} catch (error) {lifecycleError(receipt, 'owned original extraction removal', error);}
    }
    if (receipt.errors.length || receipt.dropped) throw Error('Original fixture aftercheck/cleanup failed: ' + JSON.stringify(receipt));
  }
  try {
    const temporaryParent = await fs.realpath(os.tmpdir());
    directory = await fs.mkdtemp(path.join(temporaryParent, 'getbased-wearable-original-')); receipt.acquiredDirectory = directory;
    const stat = await fs.lstat(directory); assert(stat.isDirectory() && !stat.isSymbolicLink()); owner = {dev: stat.dev, ino: stat.ino};
    await fs.chmod(directory, 0o700); await owned();
    for (const row of all) {
      const target = path.join(directory, row.file); await fs.mkdir(path.dirname(target), {recursive: true, mode: 0o700});
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined, primary: unknown, present = false;
      try {handle = await fs.open(target, 'wx', 0o600); await handle.writeFile(row.bytes);} catch (error) {primary = error; present = true;}
      finally {if (handle) try {await handle.close();} catch (error) {lifecycleError(receipt, 'original extraction member close', error); if (!present) {primary = error; present = true;}}}
      if (present) throw primary;
    }
    await verifyDirectory(); assert.equal(receipt.errors.length, 0);
    return {artifactDirectory: path.join(directory, 'app'), sourceDirectory: path.join(directory, 'source'), binding: verified.binding, inventory: verified.files.map(row => ({path: '/' + row.file, bytes: row.bytes.length, sha256: row.sha256})), verify: verifyDirectory, cleanup};
  } catch (error) {try {await cleanup();} catch (secondary) {lifecycleError(receipt, 'setup cleanup', secondary);} throw error;}
}
