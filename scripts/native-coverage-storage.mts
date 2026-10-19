import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {NativeBlob, NativeCapture, NativeCaptureTransport, NativeContext} from './native-coverage-types.mjs';
// Coverage transport must remain independent of application filesystem mocks.
const fs = process.getBuiltinModule('node:fs');
export const nativeDigest = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
// Retain the qualified per-record bound; never follow a final symlink or read a device.
export const NATIVE_RECORD_LIMIT = 64 * 1024 * 1024;
export function readNativeRegular(file: string): Buffer {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {const stat = fs.fstatSync(descriptor); assert(stat.isFile() && stat.size <= NATIVE_RECORD_LIMIT, `Invalid or oversized coverage record: ${file}`); return fs.readFileSync(descriptor);}
  finally {fs.closeSync(descriptor);}
}
export function portable(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !path.posix.isAbsolute(value) && !value.split('/').some(part => part === '..' || part === '.' || part === ''), 'Invalid coverage relative path');
}
function publishNativeBytes(directory: string, file: string, bytes: Buffer): NativeBlob {
  portable(file); assert(bytes.length <= NATIVE_RECORD_LIMIT, 'Oversized native coverage record');
  const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), {recursive: true});
  const temporary = target + '.tmp-' + randomUUID();
  const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    try {fs.writeFileSync(descriptor, bytes);} finally {fs.closeSync(descriptor);}
    // The completed file is published atomically. Other workers can only see complete bytes.
    try {fs.linkSync(temporary, target);}
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      assert.deepEqual(readNativeRegular(target), bytes, 'Native record collision');
    }
  } finally {fs.unlinkSync(temporary);}
  return {file, sha256: nativeDigest(bytes), bytes: bytes.length};
}
export function writeNativeJSON(directory: string, file: string, value: unknown): NativeBlob {
  return publishNativeBytes(directory, file, Buffer.from(JSON.stringify(value)));
}
export function writeNativeBlob(directory: string, source: string): NativeBlob {
  const bytes = Buffer.from(source); return publishNativeBytes(directory, `blobs/${nativeDigest(bytes)}.js`, bytes);
}
export function readNativeBlob(directory: string, item: NativeBlob): Buffer {
  portable(item.file); assert(/^[a-f0-9]{64}$/.test(item.sha256) && Number.isSafeInteger(item.bytes) && item.bytes >= 0);
  const bytes = readNativeRegular(path.join(directory, item.file)); assert.equal(bytes.length, item.bytes, 'Truncated native record'); assert.equal(nativeDigest(bytes), item.sha256, 'Corrupt native record'); return bytes;
}
const INLINE_MAP_URL_LIMIT = 4096;
/** Preserve exact URL strings, including UTF-16 surrogates, without repeating large inline maps. */
export function writeNativeCapture(directory: string, file: string, capture: NativeCapture): NativeBlob {
  const sourceMapURLs: NativeCaptureTransport['sourceMapURLs'] = [], shared = new Map<string, NativeBlob>();
  const snapshots = capture.snapshots.map(snapshot => {
    assert(!Object.hasOwn(snapshot, 'sourceMapURLExternal'), 'Reserved native capture transport marker');
    const url = snapshot.metadata.sourceMapURL;
    if (typeof url !== 'string' || Buffer.byteLength(url) <= INLINE_MAP_URL_LIMIT) return snapshot;
    let source = shared.get(url);
    if (!source) {
      const bytes = Buffer.from(JSON.stringify(url));
      source = publishNativeBytes(directory, `blobs/${nativeDigest(bytes)}.map-url.json`, bytes); shared.set(url, source);
    }
    sourceMapURLs.push({scriptId: snapshot.scriptId, source});
    const {sourceMapURL: externalized, ...metadata} = snapshot.metadata; assert.equal(externalized, url);
    return {...snapshot, metadata, sourceMapURLExternal: true as const};
  });
  const transport: NativeCaptureTransport = {schemaVersion: 2, producer: 'native-capture-transport', capture: {...capture, snapshots}, sourceMapURLs};
  return writeNativeJSON(directory, file, transport);
}
/** Authenticate every distinct descriptor before restoring exact logical inspector metadata. */
export function readNativeCapture(directory: string, item: NativeBlob, sealed?: ReadonlySet<string>): NativeCapture {
  const value = JSON.parse(readNativeBlob(directory, item).toString('utf8')) as NativeCapture | NativeCaptureTransport;
  assert(value && typeof value === 'object', 'Invalid native capture transport');
  if (value.schemaVersion === 1) return value;
  assert(value.schemaVersion === 2 && value.producer === 'native-capture-transport', 'Unknown native capture transport');
  assert.deepEqual(Object.keys(value).sort(), ['capture', 'producer', 'schemaVersion', 'sourceMapURLs']);
  const capture = value.capture; assert(capture && capture.schemaVersion === 1 && Array.isArray(capture.snapshots) && Array.isArray(value.sourceMapURLs));
  const references = new Map<string, NativeBlob>(), verified = new Map<string, string>();
  for (const reference of value.sourceMapURLs) {
    assert(reference && typeof reference.scriptId === 'string' && !references.has(reference.scriptId), 'Duplicate native source-map reference');
    assert.deepEqual(Object.keys(reference).sort(), ['scriptId', 'source']);
    references.set(reference.scriptId, reference.source);
  }
  const identities = new Set<string>(), restored = capture.snapshots.map(snapshot => {
    assert(snapshot && typeof snapshot.scriptId === 'string' && !identities.has(snapshot.scriptId), 'Duplicate native snapshot identity'); identities.add(snapshot.scriptId);
    const source = references.get(snapshot.scriptId), marked = Object.hasOwn(snapshot, 'sourceMapURLExternal');
    if (!marked) {assert(!source, 'Unexpected native source-map reference'); return snapshot;}
    assert(snapshot.sourceMapURLExternal === true && snapshot.metadata?.scriptId === snapshot.scriptId, 'Invalid native source-map owner');
    assert(!Object.hasOwn(snapshot.metadata, 'sourceMapURL') && source, 'Missing or conflicting native source-map reference');
    assert(/^blobs\/[a-f0-9]{64}\.map-url\.json$/.test(source.file) && source.file === `blobs/${source.sha256}.map-url.json`, 'Invalid native source-map blob identity');
    assert(!sealed || sealed.has(source.file), 'Unsealed native source-map reference');
    const key = JSON.stringify([source.file, source.sha256, source.bytes]); let url = verified.get(key);
    if (url === undefined) {
      const decoded: unknown = JSON.parse(readNativeBlob(directory, source).toString('utf8'));
      assert(typeof decoded === 'string' && Buffer.byteLength(decoded) > INLINE_MAP_URL_LIMIT, 'Invalid external native source-map URL');
      url = decoded; verified.set(key, url);
    }
    references.delete(snapshot.scriptId);
    const {sourceMapURLExternal: marker, ...original} = snapshot; assert(marker);
    return {...original, metadata: {...snapshot.metadata, sourceMapURL: url}};
  });
  assert.equal(references.size, 0, 'Unmatched native source-map reference');
  return {...capture, snapshots: restored};
}
export function nativeSelected(config: NativeContext, url: string): string | null {
  if (!url) return null; let absolute: string;
  if (url.startsWith('file:')) {try {const parsed = new URL(url); if (parsed.search || parsed.hash) return null; absolute = fileURLToPath(parsed);} catch {return null;}}
  else if (path.isAbsolute(url)) absolute = url; else return null;
  const relative = path.relative(config.root, absolute).split(path.sep).join('/'); return config.sources.includes(relative) ? relative : null;
}
export function nativeContext(config: NativeContext): void {
  assert(path.isAbsolute(config.root) && path.isAbsolute(config.directory) && /^[a-f0-9-]{36}$/.test(config.runId) && /^[a-f0-9]{40}$/.test(config.revision));
  assert(fs.realpathSync(config.root) === config.root && fs.realpathSync(config.directory) === config.directory);
  assert(config.sources.length > 0 && new Set(config.sources).size === config.sources.length); config.sources.forEach(portable);
}
