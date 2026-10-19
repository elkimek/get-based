import {afterEach, expect, it, vi} from 'vitest';
import * as applicationFS from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {nativeContext, readNativeBlob, writeNativeJSON} from '../scripts/native-coverage-storage.mjs';

const application = vi.hoisted(() => ({
  append: vi.fn(),
  stat: vi.fn(() => ({applicationFixture: true})),
}));
// Application mocks intentionally need no default export or coverage I/O methods.
vi.mock('node:fs', () => ({appendFileSync: application.append, statSync: application.stat}));

const realFS = process.getBuiltinModule('node:fs');
let directory: string | undefined;
afterEach(() => {
  if (directory) realFS.rmSync(directory, {recursive: true, force: true});
  directory = undefined;
  vi.clearAllMocks();
});

it('keeps authenticated coverage I/O independent of an application filesystem mock', () => {
  applicationFS.appendFileSync('/fixture/application.log', 'application-only');
  expect(applicationFS.statSync('/fixture/application')).toEqual({applicationFixture: true});
  expect(application.append).toHaveBeenCalledWith('/fixture/application.log', 'application-only');
  expect(application.stat).toHaveBeenCalledWith('/fixture/application');

  directory = realFS.realpathSync(realFS.mkdtempSync(path.join(os.tmpdir(), 'getbased-native-filesystem-')));
  nativeContext({
    root: realFS.realpathSync(process.cwd()), directory,
    runId: randomUUID(), revision: 'a'.repeat(40), sources: ['js/fixture.js'],
  });
  const value = {complete: true, retained: ['literal bytes', 7]};
  const record = writeNativeJSON(directory, 'record.json', value);
  expect(record.bytes).toBe(Buffer.byteLength(JSON.stringify(value)));
  expect(readNativeBlob(directory, record).toString('utf8')).toBe(JSON.stringify(value));
  expect(application.append).toHaveBeenCalledTimes(1);
  expect(application.stat).toHaveBeenCalledTimes(1);
});
