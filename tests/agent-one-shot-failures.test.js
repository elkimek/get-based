import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readdirSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';
import { OpenClawAgentClient } from '../lib/openclaw-agent-client.js';

const roots = [], clients = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(kind, action = () => {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'getbased-one-shot-')); roots.push(cwd);
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
  });
  const spawnImpl = vi.fn((_command, args, options) => { setImmediate(() => action(child, args, options)); return child; });
  const options = { command: kind, cwd, env: { HOME: cwd }, spawnImpl };
  const client = kind === 'claude' ? new ClaudeAgentClient(options) : new OpenClawAgentClient(options);
  if (kind === 'openclaw') client.modelCatalogPromise = Promise.resolve([{ id: 'test/model', isDefault: true }]);
  clients.push(client);
  return { cwd, child, client, spawnImpl };
}
function request(client, overrides = {}) {
  return client.prompt({ prompt: [{ type: 'text', text: 'hello' }], instructions: 'instructions',
    allowedToolNames: [], mcpConfig: {}, onEvent: vi.fn(), ...overrides });
}
function success(kind, child, options) {
  if (kind === 'claude') child.stdout.end('{"type":"result","result":"done"}\n');
  else writeSync(options.stdio[1], '{"ok":true,"status":"ok","final":"done"}');
  child.emit('exit', 0);
}

describe.each(['claude', 'openclaw'])('%s one-shot failure cleanup', kind => {
  it('does not spawn or create private files for already cancelled work', async () => {
    const f = fixture(kind, (child, _args, options) => success(kind, child, options));
    const controller = new AbortController(); controller.abort();
    await expect(request(f.client, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.spawnImpl).not.toHaveBeenCalled(); expect(readdirSync(f.cwd)).toEqual([]);
  });
  it('removes private files after a synchronous spawn failure', async () => {
    const f = fixture(kind); f.spawnImpl.mockImplementation(() => { throw new Error('spawn failed'); });
    await expect(request(f.client)).rejects.toThrow('spawn failed');
    expect(readdirSync(f.cwd)).toEqual([]); expect(f.client.children.size).toBe(0);
  });
  it('reports nonzero exits and removes all turn files', async () => {
    const f = fixture(kind, (child, _args, options) => {
      if (kind === 'claude') { child.stderr.write('cli failed'); child.stdout.end(); }
      else writeSync(options.stdio[2], 'cli failed');
      child.emit('exit', 2);
    });
    await expect(request(f.client)).rejects.toThrow('cli failed');
    expect(readdirSync(f.cwd)).toEqual([]); expect(f.client.children.size).toBe(0);
  });
  it('settles a process error even when stdout never closes', async () => {
    const f = fixture(kind, child => child.emit('error', new Error('process failed')));
    await expect(request(f.client)).rejects.toThrow('process failed');
    expect(readdirSync(f.cwd)).toEqual([]); expect(f.client.children.size).toBe(0);
  });
  it('settles cancellation without waiting for the process to honor SIGTERM', async () => {
    const controller = new AbortController();
    const f = fixture(kind, () => controller.abort());
    await expect(request(f.client, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(readdirSync(f.cwd)).toEqual([]); expect(f.client.children.size).toBe(0);
  });
  it('cleans up when an event consumer rejects the result', async () => {
    const f = fixture(kind, (child, _args, options) => success(kind, child, options));
    await expect(request(f.client, { onEvent: () => { throw new Error('consumer failed'); } })).rejects.toThrow('consumer failed');
    expect(readdirSync(f.cwd)).toEqual([]); expect(f.client.children.size).toBe(0);
  });
  it('exposes a model catalogue without starting a turn', async () => {
    const f = fixture(kind);
    const models = await f.client.getModelCatalog();
    expect(models.length).toBeGreaterThan(0);
  });
});

it('Claude ignores malformed lines and does not duplicate streamed text in the final result', async () => {
  const f = fixture('claude', child => {
    child.stdout.end('not-json\n\n{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}}\n{"type":"result","result":"hello"}\n');
    child.emit('exit', 0);
  });
  const onEvent = vi.fn(); await request(f.client, { onEvent });
  expect(onEvent.mock.calls.filter(([event]) => event.type === 'text_delta')).toEqual([[{ type: 'text_delta', delta: 'hello' }]]);
  expect(readdirSync(f.cwd)).toEqual([]);
});
it('Claude cleans up and kills a running process when writing its input fails', async () => {
  const f = fixture('claude'); f.child.stdin.end = () => { throw new Error('write failed'); };
  await expect(request(f.client)).rejects.toThrow('write failed');
  expect(f.child.kill).toHaveBeenCalledWith('SIGTERM');
  expect(f.client.children.size).toBe(0); expect(readdirSync(f.cwd)).toEqual([]);
});
it.each(['not-json', '{"ok":false,"error":"denied"}', '{"ok":true,"status":"ok"}'])('OpenClaw settles response %s without leaving files', async payload => {
  const f = fixture('openclaw', (child, _args, options) => { writeSync(options.stdio[1], payload); child.emit('exit', 0); });
  const outcome = await request(f.client).catch(error => error);
  if (payload.includes('"ok":true')) expect(outcome).toHaveProperty('sessionId');
  else expect(outcome).toBeInstanceOf(Error);
  expect(readdirSync(f.cwd)).toEqual([]);
});

describe.each(['claude', 'openclaw'])('%s active turn lifecycle', kind => {
  it.each(['restart', 'close'])('settles active work when %s is requested', async operation => {
    const f = fixture(kind);
    const pending = request(f.client).catch(error => error);
    await vi.waitFor(() => expect(f.client.children.size).toBe(1));
    await f.client[operation]();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(readdirSync(f.cwd)).toEqual([]);
  });
  it('removes the abort listener after successful completion', async () => {
    const f = fixture(kind, (child, _args, options) => success(kind, child, options));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await request(f.client, { signal: controller.signal });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort(); expect(f.child.kill).not.toHaveBeenCalled();
    expect(f.client.cancellations.size).toBe(0);
  });
});
it('Claude preserves resume, model, reasoning, schema and tool restrictions', async () => {
  const f = fixture('claude', (child, _args, options) => success('claude', child, options));
  const schema = { type: 'object', required: ['answer'] };
  await request(f.client, { sessionId: 'existing-session', model: 'opus', effort: 'high', outputSchema: schema, allowedToolNames: ['context'] });
  const args = f.spawnImpl.mock.calls[0][1];
  for (const [flag, value] of [['--resume', 'existing-session'], ['--model', 'opus'], ['--effort', 'high'], ['--json-schema', JSON.stringify(schema)], ['--allowedTools', 'mcp__getbased__context']]) {
    expect(args[args.indexOf(flag) + 1]).toBe(value);
  }
  expect(args).not.toContain('--session-id'); expect(args).toContain('--restricted');
});
it.each(['claude', 'openclaw'])('%s supplies an exit error when stderr is empty', async kind => {
  const f = fixture(kind, child => { child.stdout.end(); child.emit('exit', null); });
  await expect(request(f.client)).rejects.toThrow('code unknown');
  expect(readdirSync(f.cwd)).toEqual([]);
});
