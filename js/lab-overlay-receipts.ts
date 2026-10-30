import type { LabOverlayControlIdentity, LabOverlayKey } from '../shared/lab-overlay-contract.js';
import { labOverlaySignature } from '../shared/lab-overlay-contract.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { readLabOverlayPreferences, overlayConflict } from './lab-overlay-preferences.js';
import { canDiscloseLabOverlays } from './lab-overlay-policy.js';
export type OverlayProof = { version: 1; signature: string; outcome: 'changed' | 'undoing' | 'undone' };
const key = (record: LabOverlayControlIdentity) => `labcharts-${record.profileId}-app-control-${record.id}`;
export async function writeOverlayProof(record: LabOverlayControlIdentity, outcome: OverlayProof['outcome']) { await encryptedSetItem(key(record), JSON.stringify({ version: 1, signature: labOverlaySignature(record), outcome })); }
export async function readOverlayProof(record: LabOverlayControlIdentity): Promise<OverlayProof> {
  const raw = await encryptedGetItem(key(record), { throwOnDecryptError: true }), proof: unknown = raw ? JSON.parse(raw) : null;
  if (!proof || typeof proof !== 'object' || !('version' in proof) || proof.version !== 1 || !('signature' in proof) || proof.signature !== labOverlaySignature(record)
    || !('outcome' in proof) || !['changed', 'undoing', 'undone'].includes(String(proof.outcome))) overlayConflict('No matching native chart-layer receipt is available. Read a fresh review.');
  return proof as OverlayProof;
}
export async function restoreLabOverlayReceipts(messages: readonly { appControls?: AppControlRecord[] }[], profile: string, thread: string, current: () => boolean) {
  const records = messages.flatMap(message => message.appControls || []).filter((record): record is Extract<AppControlRecord, { action: 'labs.overlays' }> => record.action === 'labs.overlays');
  for (const record of records) if (['changed', 'undone'].includes(record.status)) { record.status = 'failed'; record.undoAvailable = false; }
  if (!records.length) return;
  let claims: Record<string, unknown> | null = null;
  try { const raw = await encryptedGetItem(`labcharts-${profile}-agent-draft-claims`, { throwOnDecryptError: true }), value = raw ? JSON.parse(raw) : null; if (value?.claims && typeof value.claims === 'object' && !Array.isArray(value.claims)) claims = value.claims; } catch { /* Missing claim evidence withholds Undo. */ }
  for (const record of records.slice(-200)) {
    if (!current()) return;
    if (record.profileId !== profile || record.threadId !== thread || !canDiscloseLabOverlays(record)) continue;
    try { const proof = await readOverlayProof(record); if (!current()) return;
      if (proof.outcome === 'undoing') continue;
      record.status = proof.outcome; record.undoAvailable = false;
      if (proof.outcome !== 'changed' || !claims || claims[`${record.id}-undo`]) continue;
      const values = readLabOverlayPreferences(profile);
      record.undoAvailable = Object.entries(record.parameters).every(([key, value]) => values[key as LabOverlayKey] === value);
    } catch { /* Conversation metadata alone is not saved execution evidence. */ }
  }
}
