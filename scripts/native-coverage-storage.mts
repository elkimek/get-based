import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {NativeBlob, NativeContext} from './native-coverage-types.mjs';
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
