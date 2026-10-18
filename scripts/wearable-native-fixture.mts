import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

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
