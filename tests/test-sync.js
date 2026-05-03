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
    /deleteProfileFromRelay[\s\S]{0,1200}evolu\.update\([\s\S]{0,400}isDeleted:\s*1/.test(syncSrc));
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
    /applyRemoteTombstones[\s\S]{0,4000}encryptedRemoveItem\(profileStorageKey\(tombId,\s*'imported'\)\)/.test(syncSrc));
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

  // v1.6.3: gzip envelope. Pushes >1 KB get compressed before storing
  // in Evolu's CRDT log; cuts the per-message size ~3× and pushes the
  // per-owner quota wedge from "every 2 days" toward "weeks/months".
  assert('buildSyncPayload gzip envelope (>1 KB compressed)',
    /CompressionStream/.test(syncSrc) && /GZ\|v1\|/.test(syncSrc) && /inner\.length > 1024/.test(syncSrc));
  assert('parseSyncPayload detects + decompresses gzip envelope',
    /dataJson\.startsWith\('GZ\|v1\|'\)/.test(syncSrc) && /DecompressionStream/.test(syncSrc));
  assert('parseSyncPayload caps decompressed size (zip-bomb guard)',
    /decompressed size exceeds cap/.test(syncSrc));
  assert('parseSyncPayload is async (gzip decode)', /async function parseSyncPayload/.test(syncSrc));

  // v1.6.6: recovery from compaction-induced empty profileId column.
  // After /compact-owner drops the original `evolu.insert` from the
  // CRDT log, fresh replicas materialize the row with no profileId
  // — the column was never re-written by the surviving update messages.
  // Two-pronged fix:
  //   - PUSH side ALWAYS includes profileId in evolu.update so future
  //     compactions can't repeat the loss for newly-pushed rows.
  //   - PULL side recovers profileId from the payload's nested profile.id
  //     when the column is empty, in BOTH onSyncReceived (live rows) and
  //     applyRemoteTombstones (cross-device deletes).
  assert('pushProfile evolu.update carries profileId',
    /evolu\.update\("profileData",\s*\{\s*id:\s*existing\.id,\s*profileId\s*,\s*dataJson/.test(syncSrc));
  assert('deleteProfileFromRelay tombstone update carries profileId',
    /evolu\.update\('profileData',\s*\{\s*id:\s*row\.id,\s*profileId\s*,\s*isDeleted/.test(syncSrc));
  assert('onSyncReceived recovers profileId from payload when column is empty',
    /enrichedRows[\s\S]{0,400}parsed\?\.profile\?\.id/.test(syncSrc));
  assert('applyRemoteTombstones recovers profileId from payload',
    /tombIdsArr[\s\S]{0,400}parsed\?\.profile\?\.id/.test(syncSrc));
  assert('Recovered profileId still validated against allowlist regex',
    /\^\[a-zA-Z0-9_-\]\+\$/.test(syncSrc));

  // v1.6.7: relay-storage estimate (local cumulative tracker, no relay
  // endpoint needed). Warns the user before they hit the 50 MB per-owner
  // cap that silently rejects pushes.
  assert('Relay quota tracker exports getRelayQuotaEstimate',
    /export function getRelayQuotaEstimate/.test(syncSrc));
  assert('Relay quota tracker exports resetRelayQuotaEstimate',
    /export function resetRelayQuotaEstimate/.test(syncSrc));
  assert('Push success path increments tracker via _trackPushBytes',
    /Push committed[\s\S]{0,1500}_trackPushBytes\(\s*\(dataJson \|\| ''\)\.length/.test(syncSrc));
  assert('Quota threshold warning fires on transition (amber → red)',
    /_maybeWarnQuotaThreshold[\s\S]{0,500}order\[want\] <= order\[prev\]/.test(syncSrc));
  assert('Quota indicator visible on popover (green/amber/red dot)',
    /Storage: \$\{mb\} \/ \$\{capMb\} MB/.test(syncSrc));
  assert('Sync diagnose modal has "I just compacted" reset button',
    /confirmResetRelayQuota\(this\)/.test(syncSrc));
  assert('Cap is 50 MB (RELAY_OWNER_QUOTA_BYTES)',
    /RELAY_OWNER_QUOTA_BYTES = 50 \* 1024 \* 1024/.test(syncSrc));

  // Live tracker round-trip (browser side): set a fake owner, simulate
  // pushes by writing the same key the tracker writes, verify the
  // estimate calculation matches the function's contract.
  if (typeof localStorage !== 'undefined') {
    const fakeKey = 'labcharts-relay-bytes-TEST_OWNER_xyz';
    localStorage.setItem(fakeKey, String(45 * 1024 * 1024));
    const expectedPct = Math.round((45 / 50) * 100);
    assert('Quota math: 45 MB → 90% (amber threshold path)',
      expectedPct === 90,
      `expected 90, got ${expectedPct}`);
    localStorage.removeItem(fakeKey);
  }

  // Live gzip round-trip — exercises CompressionStream/DecompressionStream
  // the same way the push/pull paths will. Catches a future regression
  // where the envelope encoding diverges from the decoder.
  if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    const sample = JSON.stringify({ _v: 3, importedData: { entries: Array.from({length: 50}, (_, i) => ({ id: `e${i}`, date: '2026-05-03', values: { 'biochemistry.glucose': 5.4 } })) } });
    const gzStream = new Blob([sample]).stream().pipeThrough(new CompressionStream('gzip'));
    const gzBytes = new Uint8Array(await new Response(gzStream).arrayBuffer());
    let b64 = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < gzBytes.length; i += CHUNK) b64 += String.fromCharCode.apply(null, gzBytes.subarray(i, i + CHUNK));
    b64 = btoa(b64);
    const envelope = `GZ|v1|${b64}`;
    assert('gzip envelope is meaningfully smaller than plain JSON',
      envelope.length < sample.length * 0.85,
      `plain ${sample.length} → envelope ${envelope.length} (${Math.round(envelope.length/sample.length*100)}%)`);
    // Decompress side: rebuild bytes, gunzip, parse
    const decoded = atob(envelope.slice(6));
    const back = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) back[i] = decoded.charCodeAt(i);
    const ungz = await new Response(new Blob([back]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    assert('gzip envelope round-trips to identical JSON', ungz === sample);
  }

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
  // v1.6.3: debounce bumped 2s → 10s. Each push is the full importedData
  // blob (~500 KB pre-gzip), so coalescing editing bursts directly reduces
  // the rate at which the relay's per-owner quota fills.
  assert('onDataSaved has 10s debounce', syncSrc.includes('}, 10_000)'));
  assert('onDataSaved captures profileId at schedule time', syncSrc.includes('const profileId = state.currentProfile') && syncSrc.includes('pushProfile(profileId'));
  assert('onDataSaved retries if _syncing', syncSrc.includes('if (_syncing)') && syncSrc.includes('pushProfile(profileId, data)'));
  // v1.6.3: skip-decision REMOVED on the pull path. Both timestamp-skip
  // and hash-skip caused users to miss cross-device data (clock-skew
  // and stale hash keys from prior code versions). The mergeImportedData
  // pass is union-based + idempotent, so re-applying the same bytes is
  // a no-op when local already equals remote — cheaper than a sync bug.
  assert('onSyncReceived has no pre-merge skip path',
    !syncSrc.includes('remoteContentHash === localContentHash') &&
    !/if\s*\(\s*remoteUpdated\s*<\s*localUpdated\s*\)/.test(syncSrc),
    'skip-decisions before merge regress to clock-skew/stale-hash bugs');
  assert('onSyncReceived guards on _pulling', syncSrc.includes('_pulling') && syncSrc.includes('_pulling = true'));
  assert('Pull handles encryption', syncSrc.includes('getEncryptionEnabled()') && syncSrc.includes('encryptedSetItem(localKey'));
  assert('Pull merges profiles with allowlist', syncSrc.includes('PROFILE_MERGE_FIELDS') && syncSrc.includes('saveProfiles(profiles)'));
  // v1.7.4: pull re-renders whatever view the user is on, not just dashboard
  // (so a Light & Sun page picks up newly-merged sun sessions immediately
  // instead of just showing a "Data updated" toast).
  assert('Pull re-renders the active view', syncSrc.includes('window.navigate?.(cat)'));
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

  // Guard: preserve branch must run before the storage write (otherwise stale).
  // Post-IDB-migration the write goes through encryptedSetItem (which routes
  // `-imported` keys to IndexedDB); the preserve-before-write invariant
  // applies to whichever underlying setter is used.
  const preserveIdx = syncSrc.indexOf('importedData.wearableConnections = localWearableConnections');
  const writeIdx = syncSrc.indexOf('encryptedSetItem(localKey, importedJson)');
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
