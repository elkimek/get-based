import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHAT_CONTROLS_KEY, CHAT_CONTROLS_NOTICE, captureChatControlAuthorization, isChatControlEnabled, setChatControlsEnabled } from '../js/chat-control-settings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { normalizeChatRecordId } from '../js/chat-storage-safety.js';
beforeEach(() => localStorage.removeItem(CHAT_CONTROLS_KEY));
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(CHAT_CONTROLS_KEY); });
it('preserves existing chat by default and makes repeated settings idempotent', async () => {
  expect(isChatControlEnabled()).toBe(true);
  const original = captureChatControlAuthorization('existing-review');
  await setChatControlsEnabled(true); expect(original.current()).toBe(true);
  expect(localStorage.getItem(CHAT_CONTROLS_KEY)).toBeNull();
  await setChatControlsEnabled(false); const saved = localStorage.getItem(CHAT_CONTROLS_KEY);
  await setChatControlsEnabled(false); expect(localStorage.getItem(CHAT_CONTROLS_KEY)).toBe(saved);
  expect(isChatControlEnabled()).toBe(false); expect(original.current()).toBe(false);
});
it('expires old reviews across re-enabling and module reload without changing other data', async () => {
  localStorage.setItem('health-fixture', '{"goals":["keep"]}');
  const initial = captureChatControlAuthorization(), old = initial.createId();
  await setChatControlsEnabled(false); await setChatControlsEnabled(true);
  expect(initial.current()).toBe(false); expect(captureChatControlAuthorization(old).current()).toBe(false);
  const next = captureChatControlAuthorization(), id = next.createId();
  expect(normalizeChatRecordId(id)).toBe(id); expect(normalizeChatRecordId(id + '-app')).toBe(id + '-app');
  expect(captureChatControlAuthorization(id).current()).toBe(true);
  vi.resetModules(); const reloaded = await import('../js/chat-control-settings.js');
  expect(reloaded.isChatControlEnabled()).toBe(true);
  expect(reloaded.captureChatControlAuthorization(old).current()).toBe(false);
  expect(reloaded.captureChatControlAuthorization(id).current()).toBe(true);
  await reloaded.setChatControlsEnabled(false); await reloaded.setChatControlsEnabled(true);
  expect(next.current()).toBe(false); expect(reloaded.captureChatControlAuthorization(id).current()).toBe(false);
  expect(localStorage.getItem('health-fixture')).toBe('{"goals":["keep"]}'); localStorage.removeItem('health-fixture');
});
it.each(['', 'true', '1:bad', 'corrupt', '0:7a12f909-9a2a-41d0-a812-3662105bc1d9'])('fails closed for stored value %s', raw => {
  localStorage.setItem(CHAT_CONTROLS_KEY, raw);
  expect(isChatControlEnabled()).toBe(false); expect(captureChatControlAuthorization().current()).toBe(false);
  expect(() => captureChatControlAuthorization().createId()).toThrow(CHAT_CONTROLS_NOTICE);
});
it('does not change the setting for a retired view', async () => {
  await setChatControlsEnabled(false, () => false); expect(isChatControlEnabled()).toBe(true);
});
it('fails closed on unreadable storage and reports failed writes without false success', async () => {
  const getter = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(isChatControlEnabled()).toBe(false); await expect(setChatControlsEnabled(true)).rejects.toThrow('unavailable'); getter.mockRestore();
  const setter = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(setChatControlsEnabled(false)).rejects.toThrow('quota'); expect(isChatControlEnabled()).toBe(true); setter.mockRestore();
});
it('denies every tool before dispatch when disabled, including forged read and navigation calls', async () => {
  await setChatControlsEnabled(false); const readContext = vi.fn(), navigate = vi.fn();
  const authorization = captureChatControlAuthorization();
  const runtime = createAgentToolRuntime({ canUseTools: authorization.current, readContext, navigate });
  expect(runtime.tools).toEqual([]);
  for (const tool of ['getbased_lab_context', 'getbased_read_context_card', 'getbased_draft_context', 'getbased_navigate', 'getbased_request_app']) {
    expect(await runtime.execute({ tool, arguments: '{}' })).toMatchObject({ success: false });
  }
  expect(readContext).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(runtime.getDrafts()).toEqual([]);
});
it('does not return a private read after controls are revoked during the read', async () => {
  let release!: (value: { context: string }) => void;
  const authorization = captureChatControlAuthorization();
  const runtime = createAgentToolRuntime({ canUseTools: authorization.current, readContext: () => new Promise(resolve => { release = resolve; }) });
  const pending = runtime.execute({ tool: 'getbased_lab_context', arguments: '{}' });
  await setChatControlsEnabled(false); release({ context: 'PRIVATE_RESULT' });
  const result = await pending; expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_RESULT');
});
