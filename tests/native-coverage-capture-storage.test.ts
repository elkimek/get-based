import {afterEach, describe, expect, it} from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {NATIVE_RECORD_LIMIT, nativeDigest, readNativeCapture, readNativeRegular, writeNativeBlob, writeNativeCapture, writeNativeJSON} from '../scripts/native-coverage-storage.mjs';
import type {NativeBlob, NativeCapture, NativeCaptureTransport} from '../scripts/native-coverage-types.mjs';

const fs = process.getBuiltinModule('node:fs'), directories: string[] = [];
afterEach(() => {for (const directory of directories.splice(0)) fs.rmSync(directory, {recursive: true, force: true});});
function fixture(copies = 3) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-capture-')); directories.push(directory);
  // A lone surrogate verifies exact JSON-string storage rather than lossy UTF-8 string encoding.
  const url = 'data:application/json;base64,' + 'A'.repeat(8192) + String.fromCharCode(0xD800);
  const source = writeNativeBlob(directory, 'literal source');
  const capture: NativeCapture = {
    schemaVersion: 1, runId: randomUUID(), revision: 'a'.repeat(40), holderId: randomUUID(), pid: process.pid,
    environment: {name: 'node', viteEnvironment: 'ssr', consumer: 'server'},
    raw: writeNativeJSON(directory, 'raw.json', {result: [], timestamp: 1}),
    snapshots: Array.from({length: copies}, (_, index) => ({
      file: null, scriptId: String(index), url: '', source, sourceLength: 14,
      metadata: {scriptId: String(index), url: '', startLine: 0, startColumn: 0, endLine: 0, endColumn: 14,
        executionContextId: index + 1, hash: nativeDigest('literal source'), sourceMapURL: url},
    })), moduleExecutionInfo: [['/literal/module.js', {startOffset: 19}]], completed: true,
  };
  const blob = writeNativeCapture(directory, 'capture.json', capture);
  const transport = JSON.parse(fs.readFileSync(path.join(directory, blob.file), 'utf8')) as NativeCaptureTransport;
  return {directory, url, capture, blob, transport};
}
function changed(value: ReturnType<typeof fixture>, mutate: (transport: NativeCaptureTransport) => void): NativeBlob {
  mutate(value.transport);
  return writeNativeJSON(value.directory, 'changed-' + randomUUID() + '.json', value.transport);
}

describe('lossless bounded native capture transport', () => {
  it('deduplicates exact inspector URLs while restoring all logical metadata and anonymous snapshots', () => {
    const value = fixture();
    expect(readNativeCapture(value.directory, value.blob)).toEqual(value.capture);
    expect(value.capture.snapshots.every(snapshot => snapshot.metadata.sourceMapURL === value.url)).toBe(true);
    expect(value.transport.schemaVersion).toBe(2);
    expect(value.transport.sourceMapURLs).toHaveLength(3);
    expect(new Set(value.transport.sourceMapURLs.map(reference => reference.source.file)).size).toBe(1);
    expect(fs.readdirSync(path.join(value.directory, 'blobs')).filter(name => name.endsWith('.map-url.json'))).toHaveLength(1);
    expect(value.transport.capture.snapshots.every(snapshot => snapshot.sourceMapURLExternal === true && !Object.hasOwn(snapshot.metadata, 'sourceMapURL'))).toBe(true);
    expect(value.blob.bytes).toBeLessThan(Buffer.byteLength(JSON.stringify(value.capture)) / 2);
  });
  it('preserves a logical capture above 64 MiB without increasing the physical record bound', () => {
    const value = fixture(8200);
    expect(Buffer.byteLength(JSON.stringify(value.capture))).toBeGreaterThan(NATIVE_RECORD_LIMIT);
    expect(value.blob.bytes).toBeLessThan(NATIVE_RECORD_LIMIT);
    expect(readNativeCapture(value.directory, value.blob)).toEqual(value.capture);
    // Only the smaller pooled records reach disk; the oversized inline write still fails.
    expect(() => writeNativeJSON(value.directory, 'oversized-inline.json', value.capture)).toThrow('Oversized native coverage record');
    expect(fs.existsSync(path.join(value.directory, 'oversized-inline.json'))).toBe(false);
  });
  it('retains legacy inline schema-one captures unchanged', () => {
    const value = fixture(), original = writeNativeJSON(value.directory, 'legacy.json', value.capture);
    expect(readNativeCapture(value.directory, original)).toEqual(value.capture);
  });
  it('retains absent, empty and short inline URLs exactly', () => {
    const value = fixture();
    delete value.capture.snapshots[0]!.metadata.sourceMapURL;
    value.capture.snapshots[1]!.metadata.sourceMapURL = '';
    value.capture.snapshots[2]!.metadata.sourceMapURL = 'literal.map';
    const blob = writeNativeCapture(value.directory, 'short.json', value.capture);
    expect(readNativeCapture(value.directory, blob)).toEqual(value.capture);
    expect((JSON.parse(fs.readFileSync(path.join(value.directory, blob.file), 'utf8')) as NativeCaptureTransport).sourceMapURLs).toEqual([]);
  });
  it.each(['missing', 'duplicate', 'extra', 'inline conflict', 'owner mismatch', 'snapshot duplicate', 'invalid marker', 'unknown version'] as const)('rejects %s reference structure', kind => {
    const value = fixture(), blob = changed(value, wire => {
      const first = wire.sourceMapURLs[0]!;
      if (kind === 'missing') wire.sourceMapURLs.shift();
      if (kind === 'duplicate') wire.sourceMapURLs.push({...first});
      if (kind === 'extra') wire.sourceMapURLs.push({...first, scriptId: 'unmatched'});
      if (kind === 'inline conflict') wire.capture.snapshots[0]!.metadata.sourceMapURL = value.url;
      if (kind === 'owner mismatch') wire.capture.snapshots[0]!.metadata.scriptId = 'another';
      if (kind === 'snapshot duplicate') wire.capture.snapshots[1]!.scriptId = wire.capture.snapshots[0]!.scriptId;
      if (kind === 'invalid marker') Object.assign(wire.capture.snapshots[0]!, {sourceMapURLExternal: false});
      if (kind === 'unknown version') Object.assign(wire, {schemaVersion: 3});
    });
    expect(() => readNativeCapture(value.directory, blob)).toThrow();
  });
  it('rejects an extra reference even when its snapshot exists but is unmarked', () => {
    const value = fixture(), blob = changed(value, wire => {delete wire.capture.snapshots[0]!.sourceMapURLExternal;});
    expect(() => readNativeCapture(value.directory, blob)).toThrow('Unexpected native source-map reference');
  });
  it.each(['missing', 'corrupt', 'truncated'] as const)('rejects %s referenced bytes', kind => {
    const value = fixture(), source = value.transport.sourceMapURLs[0]!.source, file = path.join(value.directory, source.file);
    if (kind === 'missing') fs.unlinkSync(file);
    if (kind === 'corrupt') {const bytes = fs.readFileSync(file); bytes[1] = bytes[1] === 65 ? 66 : 65; fs.writeFileSync(file, bytes);}
    if (kind === 'truncated') fs.truncateSync(file, source.bytes - 1);
    expect(() => readNativeCapture(value.directory, value.blob)).toThrow();
  });
  it('verifies a conflicting descriptor even after authenticating the same shared filename', () => {
    const value = fixture(), blob = changed(value, wire => {
      wire.sourceMapURLs[1]!.source = {...wire.sourceMapURLs[1]!.source, bytes: wire.sourceMapURLs[1]!.source.bytes + 1};
    });
    expect(() => readNativeCapture(value.directory, blob)).toThrow('Truncated native record');
  });
  it('requires every externalized map to belong to the sealed transport inventory', () => {
    const value = fixture(), source = value.transport.sourceMapURLs[0]!.source;
    expect(() => readNativeCapture(value.directory, value.blob, new Set([value.blob.file]))).toThrow('Unsealed native source-map reference');
    expect(readNativeCapture(value.directory, value.blob, new Set([value.blob.file, source.file]))).toEqual(value.capture);
  });
  it('rejects authenticated non-string map records and map identity substitution', () => {
    const value = fixture(), bytes = Buffer.from(JSON.stringify({url: value.url}));
    const source = writeNativeJSON(value.directory, `blobs/${nativeDigest(bytes)}.map-url.json`, {url: value.url});
    const blob = changed(value, wire => {for (const reference of wire.sourceMapURLs) reference.source = source;});
    expect(() => readNativeCapture(value.directory, blob)).toThrow('Invalid external native source-map URL');
    const substituted = changed(value, wire => {wire.sourceMapURLs[0]!.source = {...source, file: 'raw.json'};});
    expect(() => readNativeCapture(value.directory, substituted)).toThrow('Invalid native source-map blob identity');
  });
  it('preserves the 64 MiB bound without writing an oversized physical record', () => {
    const value = fixture(), file = path.join(value.directory, 'oversized.json');
    expect(NATIVE_RECORD_LIMIT).toBe(64 * 1024 * 1024);
    fs.closeSync(fs.openSync(file, 'wx')); fs.truncateSync(file, NATIVE_RECORD_LIMIT + 1);
    expect(() => readNativeRegular(file)).toThrow('Invalid or oversized coverage record');
  });
});
