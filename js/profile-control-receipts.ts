// Native-only completion evidence. Conversation imports cannot fabricate it.
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
type ProfileControl = Extract<AppControlRecord, { action: 'profile.selection' }>;
const key = (record: ProfileControl) => `labcharts-${record.profileId}-app-control-${record.id}`;
const signature = (record: ProfileControl) => JSON.stringify({ id: record.id, action: record.action, profileId: record.profileId, threadId: record.threadId,
  parameters: record.parameters, baseline: record.baseline, proposed: record.proposed, leaseId: record.leaseId, reason: record.reason, evidence: record.evidence });
export async function saveProfileControlReceipt(record: ProfileControl) {
  await encryptedSetItem(key(record), JSON.stringify({ version: 1, completed: true, signature: signature(record) }));
}
export async function restoreProfileControlReceipts(messages: readonly { appControls?: AppControlRecord[] }[], profileId: string, threadId: string, current: () => boolean) {
  const records = messages.flatMap(message => message.appControls || []).filter((record): record is ProfileControl => record.action === 'profile.selection');
  // Bound imported histories and fail closed for any unverified saved label.
  for (const record of records) if (record.status === 'changed') record.status = 'failed';
  const recent = records.slice(-200);
  for (let offset = 0; offset < recent.length && current(); offset += 8) await Promise.all(recent.slice(offset, offset + 8).map(async record => {
    if (record.profileId !== profileId || record.threadId !== threadId) return;
    try {
      const raw = await encryptedGetItem(key(record), { throwOnDecryptError: true });
      if (!raw || !current()) return;
      const proof: unknown = JSON.parse(raw);
      if (proof && typeof proof === 'object' && 'version' in proof && proof.version === 1 && 'completed' in proof && proof.completed === true
        && 'signature' in proof && proof.signature === signature(record)) { record.status = 'changed'; record.undoAvailable = false; }
    } catch { /* Keep the chat readable; an unverified receipt stays inactive. */ }
  }));
}
