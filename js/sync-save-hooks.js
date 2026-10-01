// @ts-check
// sync-save-hooks.js - Connect typed save scheduling to crypto, chat and messenger services.
// Preserve dependency initialization order while the imported services migrate.
import './caught-error.js';
import './state.js';
import './profile-storage-key.js';
import { encryptedGetItem } from './crypto.js';
import { markChatDataLocal, markCustomPersonalityDataLocal } from './sync-chat-apply.js';
import { pushContextToGateway } from './sync-messenger.js';
import './utils-runtime.js';
import './sync-dirty-state.js';
import './profile-sync-policy.js';
import { createSyncSaveHooks } from './sync-save-hooks-core.js';

export const {
  configureSyncSaveHooks, bindSyncSaveHookEvents, clearSyncSaveTimers,
  readProfileImportedData, onProfileSaved, onDataSaved, onChatSaved,
} = createSyncSaveHooks({
  encryptedGetItem: key => encryptedGetItem(key),
  markChatDataLocal: () => markChatDataLocal(),
  markCustomPersonalityDataLocal: () => markCustomPersonalityDataLocal(),
  pushContextToGateway: () => pushContextToGateway(),
});
