// Private native completion proof; imported conversation records are not consent.
import type { ContextPreferenceControlIdentity } from '../shared/context-preference-contract.js';
import { contextPreferenceControlSignature } from '../shared/context-preference-contract.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
const key = (record: ContextPreferenceControlIdentity) => `labcharts-${record.profileId}-app-control-${record.id}`;
export async function saveContextPreferenceReceipt(record: ContextPreferenceControlIdentity) {
  await encryptedSetItem(key(record), JSON.stringify({ version: 1, signature: contextPreferenceControlSignature(record), outcome: 'changed' }));
}
export async function restoreContextPreferenceReceipts(messages: readonly { appControls?: AppControlRecord[] }[], profileId: string, threadId: string, current: () => boolean) {
  const records = messages.flatMap(message => message.appControls || []).filter((record): record is Extract<AppControlRecord, { action: 'context.preferences' }> => record.action === 'context.preferences');
  for (const record of records) if (record.status === 'changed') { record.status = 'failed'; record.undoAvailable = false; }
  for (const record of records.slice(-200)) {
    if (!current()) return;
    if (record.profileId !== profileId || record.threadId !== threadId) continue;
    try {
      const raw = await encryptedGetItem(key(record), { throwOnDecryptError: true }), proof: unknown = raw ? JSON.parse(raw) : null;
      if (!current()) return;
      if (proof && typeof proof === 'object' && 'version' in proof && proof.version === 1 && 'outcome' in proof && proof.outcome === 'changed'
        && 'signature' in proof && proof.signature === contextPreferenceControlSignature(record)) { record.status = 'changed'; record.undoAvailable = false; }
    } catch { /* Imported or damaged conversation metadata cannot prove disclosure consent. */ }
  }
}
