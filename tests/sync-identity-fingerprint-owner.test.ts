import { afterEach, expect, it, vi } from 'vitest';
import { configureSyncIdentity, getSyncIdentityFingerprint, getSyncIdentityOwnerId } from '../js/sync-identity.js';
afterEach(() => { configureSyncIdentity({ getAppOwner: () => null }); vi.restoreAllMocks(); });
it('does not return an obsolete owner code when the identity changes during digest', async () => {
  let finish!: (value: ArrayBuffer) => void;
  const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let owner = { id: 'synthetic-original-owner' };
  configureSyncIdentity({ getAppOwner: () => owner });
  const result = getSyncIdentityFingerprint();
  owner = { id: 'synthetic-replacement-owner' }; finish(new Uint8Array(32).buffer);
  expect(await result).toBeNull(); expect(digest).toHaveBeenCalledOnce();
});
it('returns a stable non-secret comparison code for the current owner', async () => {
  configureSyncIdentity({ getAppOwner: () => ({ id: 'synthetic-owner', mnemonic: 'Never copy recovery words into a fingerprint' }) });
  const code = await getSyncIdentityFingerprint();
  expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/); expect(await getSyncIdentityFingerprint()).toBe(code);
});

it('exposes only a public identity ID without reading recovery words', () => {
  const owner = { id: 'synthetic-public-id' };
  Object.defineProperty(owner, 'mnemonic', { get: () => { throw new Error('Recovery words must not be read'); } });
  configureSyncIdentity({ getAppOwner: () => owner }); expect(getSyncIdentityOwnerId()).toBe('synthetic-public-id');
  configureSyncIdentity({ getAppOwner: () => { throw new Error('Owner unavailable'); } }); expect(getSyncIdentityOwnerId()).toBeNull();
});
