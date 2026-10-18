import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ARCHIVE = 'tests/fixtures/archived-native-ui/';
// These original manifests are frozen historical evidence, not a mutable exemption.
const MANIFESTS = {
  "original-source-pins.json": "750d5b75f1a843d2090a2e4dcfc8447dca6d98fe667db1c824ddbb303b083d5c",
  "marker-original-source-pins.json": "f3095add88d6f27e7030daebb684b662cf07d1a5f52a8b8808441cb67eb8fc8d"
} as const;
const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');

/** Qualify the finite original renderers before distinguishing them from authored JS.
 * Historical absolute destination strings are provenance only and are never opened. */
export function qualifyFrozenNativeOracles(root: string, inventory: readonly string[]): Set<string> {
  const directory = path.join(root, ARCHIVE);
  if (!fs.existsSync(directory)) {
    assert(!inventory.some(file => file.startsWith(ARCHIVE)), 'Missing inventoried frozen native archive');
    return new Set();
  }
  assert(fs.lstatSync(directory).isDirectory(), 'Frozen native archive must be a regular directory');
  assert.equal(fs.realpathSync(directory), path.resolve(fs.realpathSync(root), ARCHIVE), 'Frozen native archive has linked ancestors');
  const files = new Map<string, string>();
  for (const [manifest, expectedHash] of Object.entries(MANIFESTS)) {
    const file = path.join(directory, manifest);
    assert(fs.lstatSync(file).isFile(), 'Frozen native manifest must be a regular file');
    const body = fs.readFileSync(file);
    assert.equal(sha256(body), expectedHash, 'Changed frozen native manifest: ' + manifest);
    const rows: unknown = JSON.parse(body.toString('utf8'));
    assert(Array.isArray(rows), 'Frozen native manifest must be an array');
    for (const value of rows) {
      assert(value && typeof value === 'object' && !Array.isArray(value), 'Frozen native manifest row');
      const row = value as Record<string, unknown>, destination = row['destination'];
      assert(typeof destination === 'string', 'Frozen native manifest destination');
      if (!destination.endsWith('.js')) continue;
      const portable = destination.slice(destination.lastIndexOf(ARCHIVE));
      assert(/^tests\/fixtures\/archived-native-ui\/components\/[A-Za-z]+\.svelte\.html\.js$/.test(portable), 'Finite archived renderer path');
      assert(typeof row['sha256'] === 'string' && /^[a-f0-9]{64}$/.test(row['sha256']), 'Frozen native renderer hash');
      assert(!files.has(portable), 'Duplicate frozen native renderer');
      files.set(portable, row['sha256']);
    }
  }
  assert.equal(files.size, 15, 'The original archive contains exactly fifteen renderers');
  for (const [file, expectedHash] of files) {
    const target = path.join(root, file);
    assert(fs.lstatSync(target).isFile(), 'Frozen native renderer must be a regular file');
    assert.equal(fs.realpathSync(target), path.join(fs.realpathSync(root), file), 'Frozen native renderer has linked ancestors');
    assert.equal(sha256(fs.readFileSync(target)), expectedHash, 'Changed frozen native renderer: ' + file);
  }
  return new Set(files.keys());
}
