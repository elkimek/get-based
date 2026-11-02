// Old chat cards cannot mutate application settings or replay their Undo receipts.
import { CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
export interface AppControlReceipt { changed: string[]; refreshed: boolean; undoAvailable: boolean; undoNotOffered?: boolean; transitioned?: boolean; receiptSaved?: boolean; destinationProfileId?: string }
export async function executeAppControl(_raw: AppControlRecord, _undo: boolean, _canCommit: () => boolean): Promise<AppControlReceipt> {
  throw new Error(CHAT_NATIVE_UI_NOTICE);
}
