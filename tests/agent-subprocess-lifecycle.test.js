import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { ClaudeAgentClient } from '../lib/claude-agent-client.js';
import { OpenClawAgentClient } from '../lib/openclaw-agent-client.js';

it.each(['claude', 'openclaw'])('%s reads a real subprocess response and removes private files', async kind => {
  const cwd = await mkdtemp(join(tmpdir(), 'getbased-real-child-'));
  const payload = kind === 'claude' ? { type: 'result', result: 'actual child output' } : { ok: true, status: 'ok', final: 'actual child output' };
  let child;
  const options = { command: 'fixture', cwd, spawnImpl: (_command, _args, options) => {
    child = spawn(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(payload) + '\n')});`], options);
    return child;
  } };
  const client = kind === 'claude' ? new ClaudeAgentClient(options) : new OpenClawAgentClient(options);
  if (kind === 'openclaw') client.modelCatalogPromise = Promise.resolve([{ id: 'fixture/model' }]);
  try {
    const onEvent = vi.fn();
    await client.prompt({ prompt: [], instructions: 'fixture only', mcpConfig: {}, allowedToolNames: [], onEvent });
    expect(onEvent).toHaveBeenCalledWith({ type: 'text_delta', delta: 'actual child output' });
    expect(child.exitCode).toBe(0); expect(await readdir(cwd)).toEqual([]);
  } finally { await client.close(); if (child?.exitCode === null) child.kill('SIGKILL'); await rm(cwd, { recursive: true, force: true }); }
});

it.each(['claude', 'openclaw'])('%s cancels a real running subprocess and cleans up after close', async kind => {
  const cwd = await mkdtemp(join(tmpdir(), 'getbased-real-child-'));
  let child, closed;
  const options = { command: 'fixture', cwd, spawnImpl: (_command, _args, options) => {
    child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], options);
    closed = once(child, 'close'); return child;
  } };
  const client = kind === 'claude' ? new ClaudeAgentClient(options) : new OpenClawAgentClient(options);
  if (kind === 'openclaw') client.modelCatalogPromise = Promise.resolve([{ id: 'fixture/model' }]);
  const controller = new AbortController();
  try {
    const pending = client.prompt({ prompt: [], instructions: '', mcpConfig: {}, allowedToolNames: [], signal: controller.signal, onEvent: vi.fn() }).catch(error => error);
    await vi.waitFor(() => expect(child?.pid).toBeTypeOf('number'));
    controller.abort();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    await closed;
    expect(child.signalCode).toBe('SIGTERM');
    await vi.waitFor(async () => expect(await readdir(cwd)).toEqual([]));
  } finally { await client.close(); if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await rm(cwd, { recursive: true, force: true }); }
});
