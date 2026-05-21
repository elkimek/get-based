// startup-foundation.js - blocking foundation work before profile startup

import { initEncryption, initBroadcastChannel, initFolderBackup } from './crypto.js';
import { initMeteoConfigCache } from './sun-uvdata.js';

export async function initializeStartupFoundation() {
  // Initialize encryption (shows passphrase modal if enabled, blocks until unlocked).
  await initEncryption();
  // Decrypt the meteo config (selfhostBearer is sensitive at-rest; see
  // sun-uvdata.js header note). Run AFTER initEncryption so the session
  // key is available to encryptedGetItem; the cache is then sync-readable
  // by getMeteoConfig() callers (sun-context.js, settings.js, providers).
  await initMeteoConfigCache();
  // Initialize cross-tab sync.
  initBroadcastChannel();
  // Initialize folder backup (restore persisted handle, check permission).
  await initFolderBackup();
}
