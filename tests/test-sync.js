// test-sync.js — Verify sync module exports, payload format, settings UI
// Run: fetch('tests/test-sync.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Cross-Device Sync Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const syncSrc = await fetchWithRetry('js/sync.js');
  const settingsSrc = await fetchWithRetry('js/settings.js');
  const dataSrc = await fetchWithRetry('js/data.js');
  const mainSrc = await fetchWithRetry('js/main.js');

  // ═══════════════════════════════════════
  // 1. MODULE EXPORTS
  // ═══════════════════════════════════════
  console.log('%c 1. Module Exports ', 'font-weight:bold;color:#f59e0b');

  const requiredExports = ['isSyncEnabled', 'initSync', 'enableSync', 'disableSync', 'getMnemonic', 'restoreFromMnemonic', 'getSyncRelay', 'setSyncRelay', 'onDataSaved', 'pushCurrentProfile', 'deleteProfileFromRelay'];
  for (const fn of requiredExports) {
    assert(`sync.js exports ${fn}`, syncSrc.includes(`export function ${fn}`) || syncSrc.includes(`export async function ${fn}`));
  }

  // Profile-delete propagation (closes the bug where deleting a profile in
  // getbased only wiped local state — the Evolu row stayed on the relay
  // and other devices kept seeing the deleted profile).
  assert('deleteProfileFromRelay sets isDeleted=1 via evolu.update',
    /deleteProfileFromRelay[\s\S]{0,800}evolu\.update\([\s\S]{0,200}isDeleted:\s*1/.test(syncSrc));
  assert('deleteProfileFromRelay is idempotent on missing rows (returns no-row reason)',
    /deleteProfileFromRelay[\s\S]{0,500}reason:\s*'no-row'/.test(syncSrc));
  const profileSrc = await fetch('/js/profile.js').then(r => r.text());
  assert('deleteProfile in profile.js calls deleteProfileFromRelay',
    /deleteProfile\([\s\S]+?deleteProfileFromRelay/.test(profileSrc));

  // Tombstone-aware pull: a remote delete from another device wipes the
  // local copy on next sync, so multi-device cleanup completes itself.
  assert('sync.js declares a tombstoneQuery selecting isDeleted = 1 rows',
    /tombstoneQuery\s*=\s*evolu\.createQuery[\s\S]{0,300}isDeleted[",\s]+=[",\s]+1/.test(syncSrc));
  assert('applyRemoteTombstones wipes the local imported blob for tombstoned profiles',
    /applyRemoteTombstones[\s\S]{0,4000}localStorage\.removeItem\(profileStorageKey\(tombId,\s*'imported'\)\)/.test(syncSrc));
  // Quarantine: a remote-driven mass-delete (≥ 2 profiles tombstoned at
  // once) is auth'd only by the BIP-39 mnemonic. If the mnemonic leaks,
  // an attacker could publish tombstones for every profileId. Single-
  // profile deletes auto-apply (most common: user just deleted on
  // another device); batched deletes require user confirm.
  assert('applyRemoteTombstones quarantines batches >= TOMBSTONE_BATCH_THRESHOLD',
    syncSrc.includes('TOMBSTONE_BATCH_THRESHOLD') && syncSrc.includes('Quarantined'));
  assert('Settings can apply / reject pending tombstones (out-of-band confirm)',
    syncSrc.includes('export function listPendingTombstones')
      && syncSrc.includes('export async function applyPendingTombstone')
      && syncSrc.includes('export async function rejectPendingTombstone'));
  assert('applyRemoteTombstones runs before the active-rows pass in onSyncReceived',
    /async function onSyncReceived[\s\S]{0,800}await\s+applyRemoteTombstones[\s\S]{0,400}getQueryRows\(profileQuery\)/.test(syncSrc));
  assert('applyRemoteTombstones keeps at least one survivor (mass-delete safety)',
    /survivors\.length\s*===\s*0[\s\S]{0,200}return/.test(syncSrc));

  // ═══════════════════════════════════════
  // 2. SYNC PAYLOAD FORMAT
  // ═══════════════════════════════════════
  console.log('%c 2. Sync Payload Format ', 'font-weight:bold;color:#f59e0b');

  assert('buildSyncPayload includes _v: 3', syncSrc.includes('_v: 3'));
  assert('buildSyncPayload includes importedData', syncSrc.includes('importedData,') || syncSrc.includes('importedData:'));
  assert('buildSyncPayload includes profile metadata', syncSrc.includes('profile: profile'));
  assert('buildSyncPayload includes aiSettings', syncSrc.includes('aiSettings'));
  assert('buildSyncPayload includes chatData', syncSrc.includes('chatData'));
  assert('buildSyncPayload includes displayPrefs', syncSrc.includes('displayPrefs'));

  assert('parseSyncPayload handles v3 format', syncSrc.includes('parsed._v === 3'));
  assert('parseSyncPayload handles v2 compat', syncSrc.includes('parsed._v === 2'));
  assert('parseSyncPayload has v1 backward compat (gated on importedData shape)',
    syncSrc.includes('importedData: safe(parsed)'));
  assert('parseSyncPayload validates payload size (5 MB cap)', syncSrc.includes('MAX_SYNC_PAYLOAD_BYTES'));
  assert('parseSyncPayload strips wearableConnections from incoming blob (defence-in-depth)',
    syncSrc.includes("'wearableConnections' in imp"));
  assert('parseSyncPayload v1 compat rejects unknown shapes',
    syncSrc.includes("Invalid sync payload: unknown shape"));
  assert('parseSyncPayload validates payload type', syncSrc.includes("typeof dataJson !== 'string'"));

  // ═══════════════════════════════════════
  // 3. AI SETTINGS SYNC
  // ═══════════════════════════════════════
  console.log('%c 3. AI Settings Sync ', 'font-weight:bold;color:#f59e0b');

  const expectedKeys = [
    'labcharts-ai-provider', 'labcharts-openrouter-key',
    'labcharts-venice-key', 'labcharts-openrouter-model',
    'labcharts-venice-model', 'labcharts-venice-e2ee', 'labcharts-ollama-model',
    'labcharts-ollama-pii-url', 'labcharts-ollama-pii-model',
    'labcharts-ppq-key', 'labcharts-ppq-model', 'labcharts-routstr-key', 'labcharts-routstr-model'
  ];
  for (const key of expectedKeys) {
    assert(`AI_SETTINGS_KEYS includes ${key}`, syncSrc.includes(`'${key}'`));
  }

  assert('Encrypted keys use encryptedSetItem on apply', syncSrc.includes('ENCRYPTED_AI_KEYS') && syncSrc.includes('encryptedSetItem(key, val)'));
  assert('collectAISettings uses encryptedGetItem', syncSrc.includes('encryptedGetItem(key)'));
  assert('applyAISettings has allowlist check', syncSrc.includes('AI_SETTINGS_KEYS.includes(key)'));
  assert('applyAISettings has size guard', syncSrc.includes('val.length > 10000'));

  // ═══════════════════════════════════════
  // 4. MNEMONIC RESTORE
  // ═══════════════════════════════════════
  console.log('%c 4. Mnemonic Restore ', 'font-weight:bold;color:#f59e0b');

  assert('restoreFromMnemonic clears sync-ts after success', syncSrc.includes("'-sync-ts'") && syncSrc.includes('localStorage.removeItem(key)'));
  assert('restoreFromMnemonic calls evolu.restoreAppOwner', syncSrc.includes('evolu.restoreAppOwner(mnemonic)'));
  // Verify timestamps are cleared AFTER restoreAppOwner within restoreFromMnemonic (not before)
  const restoreIdx = syncSrc.indexOf('evolu.restoreAppOwner(mnemonic)');
  const clearTsInRestore = syncSrc.indexOf("'-sync-ts'", restoreIdx);
  assert('Sync-ts cleared after restoreAppOwner (not before)', restoreIdx > 0 && clearTsInRestore > restoreIdx,
    `restoreAppOwner at ${restoreIdx}, sync-ts clear at ${clearTsInRestore}`);

  // ═══════════════════════════════════════
  // 5. EVOLU CONFIG
  // ═══════════════════════════════════════
  console.log('%c 5. Evolu Configuration ', 'font-weight:bold;color:#f59e0b');

  assert('reloadUrl uses window.location.pathname', syncSrc.includes('reloadUrl: window.location.pathname'));
  assert('enableLogging gated on debug mode', syncSrc.includes('enableLogging: isDebugMode()'));
  assert('Default relay is wss://sync.getbased.health', syncSrc.includes("wss://sync.getbased.health"));
  assert('Transport uses plural "transports" array (not singular)', syncSrc.includes('transports: [{ type:') && !syncSrc.includes('transport: { type:'));
  assert('COOP header in dev-server', await fetchWithRetry('dev-server.js').then(s => s.includes('Cross-Origin-Opener-Policy')));
  assert('initSync has re-entrancy guard', syncSrc.includes('if (evolu) return'));
  assert('checkRelayConnection exported', syncSrc.includes('export function checkRelayConnection'));

  // ═══════════════════════════════════════
  // 6. DATA.JS INTEGRATION
  // ═══════════════════════════════════════
  console.log('%c 6. Data Integration ', 'font-weight:bold;color:#f59e0b');

  assert('data.js imports onDataSaved from sync.js', dataSrc.includes("import { onDataSaved } from './sync.js'"));
  assert('saveImportedData calls onDataSaved()', dataSrc.includes('onDataSaved()'));

  // ═══════════════════════════════════════
  // 7. MAIN.JS INTEGRATION
  // ═══════════════════════════════════════
  console.log('%c 7. Main Integration ', 'font-weight:bold;color:#f59e0b');

  assert('main.js imports initSync', mainSrc.includes("initSync") && mainSrc.includes("from './sync.js'"));
  assert('main.js calls initSync()', mainSrc.includes('await initSync()'));

  // getSyncBlocker must NOT check SharedWorker — Evolu uses dedicated
  // Workers + BroadcastChannel + navigator.locks, not the SharedWorker
  // API. A SharedWorker gate wrongly blocked sync on Chrome for Android.
  assert('getSyncBlocker is exported', syncSrc.includes('export function getSyncBlocker'));
  assert('getSyncBlocker does not gate on SharedWorker', !/getSyncBlocker[\s\S]*?SharedWorker/.test(syncSrc),
    'Evolu does not use the SharedWorker API — gating on it blocks Chrome for Android unnecessarily');
  assert('getSyncBlocker still gates on navigator.locks', /getSyncBlocker[\s\S]*?navigator\.locks/.test(syncSrc));
  assert('getSyncBlocker still gates on OPFS (navigator.storage.getDirectory)',
    /getSyncBlocker[\s\S]*?navigator\.storage\.getDirectory/.test(syncSrc));
  assert('getSyncBlocker still gates on crypto.subtle', /getSyncBlocker[\s\S]*?crypto\?\.subtle/.test(syncSrc));
  assert('Settings banner copy updated to "in this browser"',
    settingsSrc.includes('Sync unavailable in this browser') && !settingsSrc.includes('Sync unavailable in this build'));

  // ═══════════════════════════════════════
  // 8. PUSH/PULL LOGIC
  // ═══════════════════════════════════════
  console.log('%c 8. Push/Pull Logic ', 'font-weight:bold;color:#f59e0b');

  assert('pushProfile guards on _syncing', syncSrc.includes('!_syncing') && syncSrc.includes('_syncing = true'));
  assert('pushProfile uses insert/update pattern', syncSrc.includes('evolu.insert(') && syncSrc.includes('evolu.update('));
  assert('onDataSaved has 2s debounce', syncSrc.includes('}, 2000)'));
  assert('onDataSaved captures profileId at schedule time', syncSrc.includes('const profileId = state.currentProfile') && syncSrc.includes('pushProfile(profileId'));
  assert('onDataSaved retries if _syncing', syncSrc.includes('if (_syncing)') && syncSrc.includes('pushProfile(profileId, data)'));
  assert('onSyncReceived checks remoteUpdated > localUpdated', syncSrc.includes('remoteUpdated <= localUpdated'));
  assert('onSyncReceived guards on _pulling', syncSrc.includes('_pulling') && syncSrc.includes('_pulling = true'));
  assert('Pull handles encryption', syncSrc.includes('getEncryptionEnabled()') && syncSrc.includes('encryptedSetItem(localKey'));
  assert('Pull merges profiles with allowlist', syncSrc.includes('PROFILE_MERGE_FIELDS') && syncSrc.includes('saveProfiles(profiles)'));
  assert('Pull calls navigate for active profile', syncSrc.includes("window.navigate?.('dashboard')"));
  assert('Pull calls migrateProfileData', syncSrc.includes('migrateProfileData(state.importedData)'));
  assert('pushAllProfiles pushes all profiles on first enable', syncSrc.includes('async function pushAllProfiles'));
  assert('disableSync clears _appOwner', syncSrc.includes('_appOwner = null'));
  // disableSync intentionally NO LONGER waits for in-flight ops or awaits
  // Evolu reset — both introduced hang risks (Evolu worker stuck on OPFS
  // or a Web Lock). The page reload below kills the worker process
  // anyway. The persisted SYNC_STORAGE_KEY flips before any await so a
  // hard refresh always sees sync as off.
  assert('disableSync flips SYNC_STORAGE_KEY before any await',
    /localStorage\.setItem\(SYNC_STORAGE_KEY,\s*['"]false['"]\)[\s\S]{0,200}_syncEnabled = false/.test(syncSrc));
  assert('disableSync does not block on Evolu reset (fire-and-forget)',
    /Promise\.resolve\(evolu\.resetAppOwner/.test(syncSrc),
    'awaiting resetAppOwner blocks the toggle when Evolu worker is hung');
  assert('disableSync resets Evolu identity for mnemonic regeneration', syncSrc.includes('evolu.resetAppOwner('));
  assert('disableSync reloads page after reset to kill Worker', syncSrc.includes('window.location.reload()'));
  assert('disableSync clears sync timestamps', syncSrc.includes("'-sync-ts'") && syncSrc.indexOf("'-sync-ts'") < restoreIdx);
  assert('applyChatData uses plain localStorage for thread index (matches saveChatThreadIndex)',
    syncSrc.includes("localStorage.setItem(threadsKey, JSON.stringify(chatData.threads)"));

  // ═══════════════════════════════════════
  // 9. SETTINGS UI
  // ═══════════════════════════════════════
  console.log('%c 9. Settings UI ', 'font-weight:bold;color:#f59e0b');

  assert('Settings imports sync functions', settingsSrc.includes("from './sync.js'"));
  assert('renderSyncSection exists', settingsSrc.includes('function renderSyncSection'));
  assert('Sync section in Data tab', settingsSrc.includes('Cross-Device Sync'));
  assert('Connected indicator with green dot', settingsSrc.includes('#22c55e') && settingsSrc.includes('Connected to relay'));
  assert('Mnemonic display with mask', settingsSrc.includes('sync-mnemonic') && settingsSrc.includes('MNEMONIC_MASK'));
  assert('Mnemonic toggle button has id', settingsSrc.includes('sync-mnemonic-toggle'));
  assert('Mnemonic toggle uses getElementById', settingsSrc.includes("getElementById('sync-mnemonic-toggle')"));
  assert('Restore from mnemonic button', settingsSrc.includes('Restore from mnemonic'));
  assert('Relay input under Advanced', settingsSrc.includes('sync-relay-input') && settingsSrc.includes('Advanced'));
  assert('Relay validation rejects non-wss and non-ws', settingsSrc.includes("!url.startsWith('wss://')") && settingsSrc.includes("!url.startsWith('ws://')"));
  assert('toggleSync function', settingsSrc.includes('async function toggleSync'));
  assert('copyMnemonic has error handler', settingsSrc.includes('.catch(') && settingsSrc.includes('Could not access clipboard'));

  // ═══════════════════════════════════════
  // 10. SETUP MODAL
  // ═══════════════════════════════════════
  console.log('%c 10. Setup Modal ', 'font-weight:bold;color:#f59e0b');

  assert('showSyncSetupModal exists', settingsSrc.includes('function showSyncSetupModal'));
  assert('Setup modal has two choices', settingsSrc.includes('New setup') && settingsSrc.includes('Join existing'));
  assert('syncSetupNew generates mnemonic', settingsSrc.includes('async function syncSetupNew') || settingsSrc.includes('syncSetupNew'));
  assert('syncSetupNew has double-click guard', settingsSrc.includes('_syncSetupInProgress'));
  assert('syncSetupNew shows mnemonic in cleartext', settingsSrc.includes('escapeHTML(mnemonic)'));
  assert('syncSetupNew requires checkbox acknowledgment', settingsSrc.includes('I have saved my mnemonic'));
  assert('Done button has disabled styling', settingsSrc.includes("opacity:0.45") || settingsSrc.includes("opacity: 0.45"));
  assert('syncSetupRestore shows textarea', settingsSrc.includes('function syncSetupRestore'));
  assert('syncSetupDoRestore validates 24 words', settingsSrc.includes("words.length !== 24"));
  assert('syncSetupDoRestore cleans up on failure', settingsSrc.includes('await disableSync()') && settingsSrc.includes('Restore failed'));
  assert('syncSetupBack returns to choices', settingsSrc.includes('function syncSetupBack'));
  assert('closeSyncSetup disables sync if started', settingsSrc.includes('async function closeSyncSetup') && settingsSrc.includes('disableSync'));
  assert('closeSyncSetup releases _syncToggling', settingsSrc.includes('_syncToggling = false'));
  assert('Clipboard auto-clear after 60s', settingsSrc.includes('60000') && settingsSrc.includes("writeText('')"));
  assert('loadMnemonic retry timer is cancellable', settingsSrc.includes('_mnemonicRetryTimer') && settingsSrc.includes('clearTimeout(_mnemonicRetryTimer)'));
  assert('Dynamic relay status indicator', settingsSrc.includes('updateRelayStatus') && settingsSrc.includes('sync-status-dot'));
  assert('Relay status shows connected or unreachable', settingsSrc.includes('Connected to relay') && settingsSrc.includes('Relay unreachable'));

  // ═══════════════════════════════════════
  // 11. CHAT SYNC
  // ═══════════════════════════════════════
  console.log('%c 11. Chat & Display Sync ', 'font-weight:bold;color:#f59e0b');

  assert('collectChatData reads threads', syncSrc.includes('chat-threads') && syncSrc.includes('collectChatData'));
  assert('collectChatData reads per-thread messages', syncSrc.includes('chat-t_${t.id}'));
  assert('collectChatData includes custom personalities', syncSrc.includes('chatPersonalityCustom'));
  assert('applyChatData writes threads', syncSrc.includes('applyChatData'));
  assert('Display prefs synced', syncSrc.includes('DISPLAY_PREF_SUFFIXES') && syncSrc.includes('collectDisplayPrefs'));
  assert('onChatSaved exported', syncSrc.includes('export function onChatSaved'));
  assert('onChatSaved has debounce', syncSrc.includes('_chatSyncTimer') && syncSrc.includes('10000'));
  assert('chat-threads.js imports onChatSaved', await fetchWithRetry('js/chat-threads.js').then(s => s.includes("import { onChatSaved } from './sync.js'")));

  // ═══════════════════════════════════════
  // 12. MESSENGER ACCESS
  // ═══════════════════════════════════════
  console.log('%c 12. Messenger Access ', 'font-weight:bold;color:#f59e0b');

  assert('generateMessengerToken creates 64-char hex', syncSrc.includes('crypto.getRandomValues') && syncSrc.includes('MESSENGER_TOKEN_KEY'));
  assert('pushContextToGateway exports', syncSrc.includes('export function pushContextToGateway'));
  assert('OpenClaw section in settings', settingsSrc.includes('renderMessengerSection') && settingsSrc.includes('OpenClaw'));
  assert('Token masked by default', settingsSrc.includes('messenger-token') && settingsSrc.includes('data-masked'));

  // ═══════════════════════════════════════
  // 13. WINDOW BINDINGS
  // ═══════════════════════════════════════
  console.log('%c 13. Window Bindings ', 'font-weight:bold;color:#f59e0b');

  const syncWindowFns = ['enableSync', 'disableSync', 'getMnemonic', 'restoreFromMnemonic', 'isSyncEnabled', 'isMessengerEnabled', 'getMessengerToken', 'generateMessengerToken', 'revokeMessengerToken'];
  for (const fn of syncWindowFns) {
    assert(`window.${fn} exists`, typeof window[fn] === 'function');
  }

  const settingsWindowFns = [
    'toggleSync', 'toggleMnemonicVisibility', 'copyMnemonic',
    'saveSyncRelay', 'closeSyncSetup', 'syncSetupNew',
    'syncSetupRestore', 'syncSetupBack', 'syncSetupDoRestore', 'syncSetupDone',
    'toggleMessenger', 'toggleMessengerToken', 'copyMessengerToken', 'regenerateMessengerToken'
  ];
  for (const fn of settingsWindowFns) {
    assert(`window.${fn} exists`, typeof window[fn] === 'function');
  }

  // ═══════════════════════════════════════
  // 14. WEARABLE CONNECTIONS PRESERVE
  // ═══════════════════════════════════════
  console.log('%c 14. Wearable Connections Preserve ', 'font-weight:bold;color:#f59e0b');

  // Push side: stripWearableCredentials removes wearableConnections from the payload
  assert('buildSyncPayload strips wearableConnections', syncSrc.includes('stripWearableCredentials(importedData)'));
  assert('stripWearableCredentials drops wearableConnections key', syncSrc.includes('{ wearableConnections, ...rest } = importedData'));

  // Pull side: must re-inject local wearableConnections into incoming blob so it isn't clobbered.
  // The stripped remote payload arrives with no wearableConnections; without this preserve step
  // the overwrite at setItem(localKey, importedJson) would wipe every device's OAuth tokens.
  assert('Pull preserves local wearableConnections (active profile)',
    syncSrc.includes('state.importedData?.wearableConnections'));
  assert('Pull preserves local wearableConnections (inactive profile)',
    syncSrc.includes('parsed?.wearableConnections'));
  assert('Pull re-injects preserved wearableConnections into pulled blob',
    syncSrc.includes('importedData.wearableConnections = localWearableConnections'));

  // Guard: preserve branch must run before the localStorage write (otherwise stale)
  const preserveIdx = syncSrc.indexOf('importedData.wearableConnections = localWearableConnections');
  const writeIdx = syncSrc.indexOf('setItem(localKey, importedJson)');
  assert('Preserve runs before localStorage write', preserveIdx > 0 && preserveIdx < writeIdx,
    `preserve at ${preserveIdx}, write at ${writeIdx}`);

  // ═══════════════════════════════════════
  // 15. VENDOR FILES
  // ═══════════════════════════════════════
  console.log('%c 15. Vendor Files ', 'font-weight:bold;color:#f59e0b');

  const vendorFiles = ['vendor/evolu/evolu-bundle.js', 'vendor/evolu/Db.worker.js', 'vendor/evolu/sqlite3.wasm'];
  for (const f of vendorFiles) {
    const res = await fetch(f, { method: 'HEAD' });
    assert(`${f} exists`, res.ok, `status: ${res.status}`);
  }

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
  console.log(`%c\n Sync Tests: ${pass} passed, ${fail} failed `, fail ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS !== 'undefined') window.__TEST_RESULTS = { pass, fail };
})();
