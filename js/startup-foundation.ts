// startup-foundation.js - blocking foundation work before profile startup

import { initEncryption, initBroadcastChannel, initFolderBackup } from './crypto.js';
import { initMeteoConfigCache } from './sun-uvdata-config.js';

export async function initializeStartupFoundation() {
  if (localStorage.getItem('labcharts-backup-restore-pending') !== null) {
    const { recoverPendingBackupRestore } = await import('./backup.js');
    await recoverPendingBackupRestore();
  }
  // Initialize encryption (shows passphrase modal if enabled, blocks until unlocked).
  await initEncryption();
  if (localStorage.getItem('getbased-profile-shares-v1') !== null) {
    const { hydrateShareHistory } = await import('./profile-share-history.js');
    try { await hydrateShareHistory(); } catch { /* Preserve original credentials for migration retry in Sharing. */ }
  }
  // Decrypt the meteo config (selfhostBearer is sensitive at-rest; see
  // sun-uvdata-config.js). Run AFTER initEncryption so the session
  // key is available to encryptedGetItem; the cache is then sync-readable
  // by getMeteoConfig() callers (sun-context.js, settings.js, providers).
  await initMeteoConfigCache();
  // Initialize cross-tab sync.
  initBroadcastChannel();
  // Initialize folder backup (restore persisted handle, check permission).
  await initFolderBackup();
}
