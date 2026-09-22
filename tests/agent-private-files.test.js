import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ writeFile: vi.fn(), open: vi.fn() }));
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal(), ...mocks }));
import * as fs from 'node:fs/promises';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';
import { OpenClawAgentClient } from '../lib/openclaw-agent-client.js';
const real = await vi.importActual('node:fs/promises');
const roots = [];
afterEach(() => { for (const cwd of roots.splice(0)) rmSync(cwd, { recursive: true, force: true }); vi.clearAllMocks(); });
function client(kind) {
  const cwd = mkdtempSync(join(tmpdir(), 'getbased-private-files-')); roots.push(cwd);
  const spawnImpl = vi.fn();
  const options = { command: kind, cwd, env: { HOME: cwd }, spawnImpl };
  const instance = kind === 'claude' ? new ClaudeAgentClient(options) : new OpenClawAgentClient(options);
  if (kind === 'openclaw') instance.modelCatalogPromise = Promise.resolve([{ id: 'test/model' }]);
  return { instance, cwd, spawnImpl };
}
it.each(['claude', 'openclaw'])('%s waits for the sibling write before cleaning private files on failure', async kind => {
  const f = client(kind);
  let release;
  fs.writeFile.mockReset().mockRejectedValueOnce(new Error('disk full')).mockImplementationOnce(async (...args) => {
    await new Promise(resolve => { release = resolve; });
    return real.writeFile(...args);
  });
  let settled = false;
  const pending = f.instance.prompt({ prompt: [], instructions: 'private', mcpConfig: {}, allowedToolNames: [], onEvent: vi.fn() })
    .catch(error => { settled = true; return error; });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(settled).toBe(false);
  release(); expect((await pending).message).toBe('disk full');
  expect(readdirSync(f.cwd)).toEqual([]); expect(f.spawnImpl).not.toHaveBeenCalled();
});
it.each([0, 1])('closes the successful output handle when opening sibling %s fails', async failedIndex => {
  const f = client('openclaw');
  let release, handle;
  fs.open.mockReset().mockImplementation(async (...args) => {
    const index = String(args[0]).includes('stdout') ? 0 : 1;
    if (index === failedIndex) throw new Error('cannot open');
    await new Promise(resolve => { release = resolve; });
    handle = await real.open(...args); return handle;
  });
  let settled = false;
  const pending = f.instance.runCommand([], undefined).catch(error => { settled = true; return error; });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(settled).toBe(false); release();
  expect((await pending).message).toBe('cannot open');
  await expect(handle.stat()).rejects.toThrow();
  expect(readdirSync(f.cwd)).toEqual([]); expect(f.spawnImpl).not.toHaveBeenCalled();
});
it.each(['claude', 'openclaw'])('%s does not spawn when cancelled during private-file writes', async kind => {
  const f = client(kind), controller = new AbortController();
  let release;
  fs.writeFile.mockReset().mockImplementationOnce(async (...args) => {
    await new Promise(resolve => { release = resolve; });
    return real.writeFile(...args);
  }).mockImplementation((...args) => real.writeFile(...args));
  const pending = f.instance.prompt({ prompt: [], instructions: 'private', mcpConfig: {}, allowedToolNames: [], signal: controller.signal, onEvent: vi.fn() }).catch(error => error);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  controller.abort(); release();
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(f.spawnImpl).not.toHaveBeenCalled(); expect(readdirSync(f.cwd)).toEqual([]);
});
it('does not spawn when cancelled during output-file opening', async () => {
  const f = client('openclaw'), controller = new AbortController();
  let release;
  fs.open.mockReset().mockImplementationOnce(async (...args) => {
    await new Promise(resolve => { release = resolve; }); return real.open(...args);
  }).mockImplementation((...args) => real.open(...args));
  const pending = f.instance.runCommand([], controller.signal).catch(error => error);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  controller.abort(); release();
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(f.spawnImpl).not.toHaveBeenCalled(); expect(readdirSync(f.cwd)).toEqual([]);
});
