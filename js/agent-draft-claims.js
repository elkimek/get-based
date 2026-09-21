// @ts-check
// Local durable proposal claims survive stale conversation saves and reloads.
// The journal intentionally contains identifiers only, never proposal payloads.
import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled, isUnlocked } from './crypto.js';
import { normalizeChatRecordId } from './chat-storage-safety.js';

export async function claimAgentDraft(profileId, draftId) {
  if (!normalizeChatRecordId(profileId) || !normalizeChatRecordId(draftId)) {
    throw new Error('The proposal has an invalid identifier.');
  }
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) throw new Error('This browser cannot safely coordinate proposal changes across tabs.');
  const key = `labcharts-${profileId}-agent-draft-claims`;
  return locks.request(key, { mode: 'exclusive' }, async () => {
    if (getEncryptionEnabled() && !isUnlocked()) throw new Error('Unlock your data before applying a proposal.');
    const stored = await encryptedGetItem(key);
    if (stored === null && localStorage.getItem(key) !== null) throw new Error('Proposal history could not be read.');
    const journal = stored === null ? { version: 1, claims: {} } : JSON.parse(stored);
    if (journal?.version !== 1 || !journal.claims || typeof journal.claims !== 'object' || Array.isArray(journal.claims)) {
      throw new Error('Proposal history could not be read.');
    }
    if (Object.hasOwn(journal.claims, draftId)) {
      throw new Error('This proposal was already attempted. Check your data before proposing the change again.');
    }
    journal.claims[draftId] = true;
    // A failed or interrupted mutation keeps its claim: storage and the actual
    // change are not an atomic transaction, so retrying may duplicate the data.
    await encryptedSetItem(key, JSON.stringify(journal));
  });
}
