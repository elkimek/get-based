import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), enabled: vi.fn(), unlocked: vi.fn() }));
vi.mock('../js/crypto.js', () => ({ encryptedGetItem: mocks.get, encryptedSetItem: mocks.set, getEncryptionEnabled: mocks.enabled, isUnlocked: mocks.unlocked }));
import { claimAgentDraft } from '../js/agent-draft-claims.js';
let descriptor;
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  mocks.get.mockImplementation(async key => localStorage.getItem(key));
  mocks.set.mockImplementation(async (key, value) => localStorage.setItem(key, value));
  descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  let pending = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_key, _options, callback) => {
    const next = pending.catch(() => {}).then(callback); pending = next; return next;
  } } });
});
afterEach(() => { if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else delete navigator.locks; });
it('allows one claim from concurrent requests and preserves it across later attempts', async () => {
  const results = await Promise.allSettled([claimAgentDraft('a', 'proposal'), claimAgentDraft('a', 'proposal')]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  await expect(claimAgentDraft('a', 'proposal')).rejects.toThrow('already attempted');
  await expect(claimAgentDraft('b', 'proposal')).resolves.toBeUndefined();
  expect(JSON.parse(localStorage.getItem('labcharts-a-agent-draft-claims'))).toEqual({ version: 1, claims: { proposal: true } });
});
it('propagates failed persistence without recording a successful claim', async () => {
  mocks.set.mockRejectedValueOnce(new Error('Quota'));
  await expect(claimAgentDraft('a', 'proposal')).rejects.toThrow('Quota');
  expect(localStorage.getItem('labcharts-a-agent-draft-claims')).toBeNull();
  await expect(claimAgentDraft('a', 'proposal')).resolves.toBeUndefined();
});
it.each(['{broken', '{"version":2,"claims":{}}', '{"version":1,"claims":[]}'])('does not replace unreadable claim history: %s', async raw => {
  localStorage.setItem('labcharts-a-agent-draft-claims', raw);
  await expect(claimAgentDraft('a', 'proposal')).rejects.toThrow();
  expect(mocks.set).not.toHaveBeenCalled();
});
it('rejects unreadable encrypted history instead of treating it as empty', async () => {
  localStorage.setItem('labcharts-a-agent-draft-claims', 'encrypted'); mocks.get.mockResolvedValue(null);
  await expect(claimAgentDraft('a', 'proposal')).rejects.toThrow('could not be read');
  expect(mocks.set).not.toHaveBeenCalled();
});
it('fails closed while profile encryption is locked', async () => {
  mocks.enabled.mockReturnValue(true); mocks.unlocked.mockReturnValue(false);
  await expect(claimAgentDraft('a', 'proposal')).rejects.toThrow('Unlock');
  expect(mocks.set).not.toHaveBeenCalled();
});
it('fails closed when cross-tab locking is unavailable', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(claimAgentDraft('a', 'proposal')).rejects.toThrow('coordinate');
  expect(mocks.set).not.toHaveBeenCalled();
});
it.each(['__proto__', '', 'bad/id'])('rejects unsafe proposal identifiers: %s', async id => {
  await expect(claimAgentDraft('a', id)).rejects.toThrow('identifier');
  expect(mocks.set).not.toHaveBeenCalled();
});
