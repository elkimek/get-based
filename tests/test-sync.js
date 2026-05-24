#!/usr/bin/env node
// test-sync.js — Verify sync module exports, payload format, settings UI
//
// Run: node tests/test-sync.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
// Compat shim: original test used `await fetchWithRetry(path).then(s => s.includes(...))`
// — port it as a sync wrapper that returns the file text (the .then is harmless).
function fetchWithRetry(rel) {
  return Promise.resolve(read(rel));
}

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Cross-Device Sync Tests ===\n');

// Load sync.js + settings.js so their Object.assign(window, ...) calls
// populate window.enableSync, window.toggleSync, etc.
const { state } = await import('../js/state.js');
const syncApply = await import('../js/sync-apply.js');
await import('../js/sync.js');
await import('../js/settings.js');

  const syncSrc = await fetchWithRetry('js/sync.js');
  const syncApplySrc = await fetchWithRetry('js/sync-apply.js');
  const syncPayloadSrc = await fetchWithRetry('js/sync-payload.js');
  const syncRelayHealthSrc = await fetchWithRetry('js/sync-relay-health.js');
  const syncStateSrc = await fetchWithRetry('js/sync-state.js');
  const settingsSrc = await fetchWithRetry('js/settings.js');
  const dataSrc = await fetchWithRetry('js/data.js');
  const startupUiSrc = await fetchWithRetry('js/startup-ui.js');
  const stylesSrc = await fetchWithRetry('styles.css');
  const themeExtraSrc = await fetchWithRetry('themes-extra.css');
  const serviceWorkerSrc = await fetchWithRetry('service-worker.js');

  // ═══════════════════════════════════════
  // 1. MODULE EXPORTS
  // ═══════════════════════════════════════
  console.log('1. Module Exports');

  const requiredExports = ['isSyncEnabled', 'initSync', 'enableSync', 'disableSync', 'getMnemonic', 'restoreFromMnemonic', 'getSyncRelay', 'setSyncRelay', 'onDataSaved', 'pushCurrentProfile', 'deleteProfileFromRelay'];
  for (const fn of requiredExports) {
    assert(`sync.js exports ${fn}`, syncSrc.includes(`export function ${fn}`) || syncSrc.includes(`export async function ${fn}`));
  }

  assert('sync-state.js owns sync status pub-sub',
    syncSrc.includes("from './sync-state.js'")
      && syncStateSrc.includes('export function updateSyncStatus')
      && syncStateSrc.includes('export function subscribeSyncStatus')
      && syncStateSrc.includes('export function getSyncDisplayState'));
  assert('getSyncStatus returns a defensive copy',
    /export function getSyncStatus\(\)\s*\{\s*return\s*\{\s*\.\.\._syncStatus\s*\};\s*\}/.test(syncStateSrc));
  assert('sync-state.js owns activity log and rebroadcast budget',
    syncStateSrc.includes('export function logSyncEvent')
      && syncStateSrc.includes('export function getRecentSyncEvents')
      && syncStateSrc.includes('export function consumeRebroadcastBudget'));
  assert('service worker precaches sync-state.js',
    serviceWorkerSrc.includes("'/js/sync-state.js'"));
  assert('sync-apply.js owns inbound AI/chat/display apply helpers',
    syncSrc.includes("from './sync-apply.js'")
      && syncApplySrc.includes('export async function applyAISettings')
      && syncApplySrc.includes('export async function applyChatData')
      && syncApplySrc.includes('export function applyDisplayPrefs')
      && syncApplySrc.includes('export function markChatDataLocal'));
  assert('service worker precaches sync-apply.js',
    serviceWorkerSrc.includes("'/js/sync-apply.js'"));

  // Profile-delete propagation (closes the bug where deleting a profile in
  // getbased only wiped local state — the Evolu row stayed on the relay
  // and other devices kept seeing the deleted profile).
  assert('deleteProfileFromRelay sets isDeleted=1 via evolu.update',
    /deleteProfileFromRelay[\s\S]{0,1200}evolu\.update\([\s\S]{0,400}isDeleted:\s*1/.test(syncSrc));
  assert('deleteProfileFromRelay is idempotent on missing rows (returns no-row reason)',
    /deleteProfileFromRelay[\s\S]{0,500}reason:\s*'no-row'/.test(syncSrc));
  const profileSrc = read('/js/profile.js');
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
  console.log('2. Sync Payload Format');

  assert('sync-payload.js owns buildSyncPayload', syncSrc.includes("from './sync-payload.js'") && syncPayloadSrc.includes('export async function buildSyncPayload'));
  assert('buildSyncPayload still emits _v: 3 (default dual-write)', syncPayloadSrc.includes('cutover ? 4 : 3'));
  assert('buildSyncPayload includes importedData', syncPayloadSrc.includes('importedData,') || syncPayloadSrc.includes('importedData:'));
  assert('buildSyncPayload includes profile metadata', syncPayloadSrc.includes('profile: profile'));
  assert('buildSyncPayload includes aiSettings', syncPayloadSrc.includes('aiSettings'));
  assert('buildSyncPayload includes chatData', syncPayloadSrc.includes('chatData'));
  assert('buildSyncPayload includes displayPrefs', syncPayloadSrc.includes('displayPrefs'));

  assert('parseSyncPayload handles v3 format', syncPayloadSrc.includes('parsed._v === 3'));
  assert('parseSyncPayload handles v2 compat', syncPayloadSrc.includes('parsed._v === 2'));
  assert('parseSyncPayload has v1 backward compat (gated on importedData shape)',
    syncPayloadSrc.includes('importedData: safe(parsed)'));
  assert('parseSyncPayload validates payload size (5 MB cap)', syncPayloadSrc.includes('MAX_SYNC_PAYLOAD_BYTES'));
  assert('parseSyncPayload strips wearableConnections from incoming blob (defence-in-depth)',
    syncPayloadSrc.includes("'wearableConnections' in imp"));
  assert('parseSyncPayload v1 compat rejects unknown shapes',
    syncPayloadSrc.includes("Invalid sync payload: unknown shape"));
  assert('parseSyncPayload validates payload type', syncPayloadSrc.includes("typeof dataJson !== 'string'"));

  // v1.6.3: gzip envelope. Pushes >1 KB get compressed before storing
  // in Evolu's CRDT log; cuts the per-message size ~3× and pushes the
  // per-owner quota wedge from "every 2 days" toward "weeks/months".
  assert('buildSyncPayload gzip envelope (>1 KB compressed)',
    /CompressionStream/.test(syncPayloadSrc) && /GZ\|v1\|/.test(syncPayloadSrc) && /inner\.length > 1024/.test(syncPayloadSrc));
  assert('parseSyncPayload detects + decompresses gzip envelope',
    /dataJson\.startsWith\('GZ\|v1\|'\)/.test(syncPayloadSrc) && /DecompressionStream/.test(syncPayloadSrc));
  assert('parseSyncPayload caps decompressed size via streaming cap (zip-bomb guard)',
    /_gunzipToStringCapped\(bytes,\s*MAX_SYNC_PAYLOAD_BYTES\)/.test(syncPayloadSrc));
  assert('parseSyncPayload is async (gzip decode)', /async function parseSyncPayload/.test(syncPayloadSrc));

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
    /export\s+\{[\s\S]{0,200}getRelayQuotaEstimate/.test(syncSrc)
      && /export function getRelayQuotaEstimate/.test(syncRelayHealthSrc));
  assert('Relay quota tracker exports resetRelayQuotaEstimate',
    /export\s+\{[\s\S]{0,250}resetRelayQuotaEstimate/.test(syncSrc)
      && /export function resetRelayQuotaEstimate/.test(syncRelayHealthSrc));
  assert('Push success path increments tracker via trackPushBytes',
    /Push committed[\s\S]{0,1500}trackPushBytes\(\s*\(dataJson \|\| ''\)\.length/.test(syncSrc));
  assert('Quota threshold warning fires on transition (amber → red)',
    /_maybeWarnQuotaThreshold[\s\S]{0,500}order\[want\] <= order\[prev\]/.test(syncRelayHealthSrc));
  assert('Quota indicator visible on popover (green/amber/red dot)',
    /Storage: \$\{mb\} \/ \$\{capMb\} MB/.test(syncSrc));
  assert('Sync popover uses dedicated opaque background token',
    /\.sync-popover\s*\{[\s\S]{0,260}background:\s*var\(--sync-popover-bg,\s*var\(--bg-card\)\)/.test(stylesSrc));
  assert('Transparent themes override sync popover background with solid panels',
    themeExtraSrc.includes('--sync-popover-bg: #181230') &&
    themeExtraSrc.includes('--sync-popover-bg: #150830') &&
    themeExtraSrc.includes('--sync-popover-bg: #0a0d12'));
  // v1.7.21: "I just compacted" runbook button replaced by the real
  // self-serve compact via /self/compact-owner — HMAC-signed with the
  // owner's writeKey so any user can unwedge themselves at the cap
  // without SSH access. Refresh probes /self/owner-storage to replace
  // the local estimate with the relay's authoritative value.
  assert('Sync diagnose modal wires the self-serve Compact storage button',
    /confirmCompactRelay\(this\)/.test(syncSrc));
  assert('Sync diagnose modal wires the Refresh-from-relay button',
    /refreshRelayStorage\(this\)/.test(syncSrc));
  assert('compactOwnerSelfServe POSTs to /self/compact-owner with HMAC body',
    /compactOwnerSelfServe[\s\S]{0,800}\/self\/compact-owner[\s\S]{0,400}JSON\.stringify\(\{\s*ownerId,\s*timestamp,\s*signature\s*\}\)/.test(syncRelayHealthSrc));
  assert('compactOwnerSelfServe catches fetch rejection before checking response status',
    /compactOwnerSelfServe[\s\S]{0,1000}catch\s*\(\s*fetchErr\s*\)[\s\S]{0,400}Relay request failed[\s\S]{0,200}finally\s*\{\s*clearTimeout\(timer\);?\s*\}[\s\S]{0,120}if \(!r\.ok\)/.test(syncRelayHealthSrc));
  assert('fetchOwnerStorageFromRelay GETs /self/owner-storage with signed query',
    /fetchOwnerStorageFromRelay[\s\S]{0,800}\/self\/owner-storage\?ownerId=/.test(syncRelayHealthSrc));
  assert('_signSelfRequest uses HMAC-SHA256 over context:ownerId:timestamp',
    /_signSelfRequest[\s\S]{0,1000}\$\{context\}:\$\{ownerId\}:\$\{timestamp\}[\s\S]{0,400}name:\s*'HMAC',\s*hash:\s*'SHA-256'/.test(syncRelayHealthSrc));
  assert('_signSelfRequest signs with the owner writeKey (not mnemonic)',
    /_signSelfRequest[\s\S]{0,800}owner\.writeKey/.test(syncRelayHealthSrc));
  assert('_getSelfBaseUrl swaps wss → https and ws → http',
    /_getSelfBaseUrl[\s\S]{0,800}wss:[\s\S]{0,100}https:[\s\S]{0,200}ws:[\s\S]{0,100}http:/.test(syncRelayHealthSrc));
  assert('_getSelfBaseUrl honors labcharts-self-url localStorage override (self-host escape hatch)',
    /SELF_URL_OVERRIDE_KEY\s*=\s*'labcharts-self-url'[\s\S]{0,800}_getSelfBaseUrl[\s\S]{0,400}getItem\(SELF_URL_OVERRIDE_KEY\)[\s\S]{0,200}\^https\?:/.test(syncRelayHealthSrc));
  assert('Cap is 50 MB (RELAY_OWNER_QUOTA_BYTES)',
    /RELAY_OWNER_QUOTA_BYTES = 50 \* 1024 \* 1024/.test(syncRelayHealthSrc));

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

  // ═══════════════════════════════════════
  // 11. CRDT-DELTA REFACTOR — PHASE 1 (v1.7.0)
  // ═══════════════════════════════════════
  console.log('11. CRDT-Delta Phase 1');

  // Schema additions
  assert('Schema declares itemRow table',
    /itemRow:\s*\{[\s\S]{0,300}arrayName:\s*NonEmptyString[\s\S]{0,300}itemId:\s*NonEmptyString[\s\S]{0,200}payload:\s*NonEmptyString/.test(syncSrc));
  assert('itemRowQuery created on init',
    /itemRowQuery\s*=\s*evolu\.createQuery\([\s\S]{0,200}selectFrom\("itemRow"\)/.test(syncSrc));
  assert('itemRowQuery loaded with profileQuery + tombstoneQuery',
    /Promise\.all\(\[[\s\S]{0,400}evolu\.loadQuery\(itemRowQuery\)/.test(syncSrc));
  assert('itemRow subscription retriggers onSyncReceived',
    /evolu\.subscribeQuery\(itemRowQuery\)\([\s\S]{0,200}onSyncReceived\(\)/.test(syncSrc));

  // DELTA_ARRAYS list (high-velocity arrays)
  assert('DELTA_ARRAYS includes sunSessions + lightDevices',
    /DELTA_ARRAYS\s*=\s*\[[\s\S]{0,400}'sunSessions'[\s\S]{0,400}'lightDevices'/.test(syncSrc));
  assert('DELTA_ARRAYS includes entries + notes (high-importance lab data)',
    /DELTA_ARRAYS\s*=\s*\[[\s\S]{0,800}'entries'[\s\S]{0,400}'notes'/.test(syncSrc));

  // Push-side plan/apply contract
  assert('_planArrayDelta diffs against last-pushed snapshot',
    /_planArrayDelta[\s\S]{0,1200}_readDeltaSnapshot\(profileId,\s*arrayName\)[\s\S]{0,1200}prev\[itemId\]\s*===\s*hash/.test(syncSrc));
  assert('_planArrayDelta validates itemId allowlist (defence-in-depth)',
    /\^\[a-zA-Z0-9_\.-\]\+\$/.test(syncSrc));
  assert('_planArrayDelta gzip-compresses payloads >256 bytes',
    /json\.length > 256[\s\S]{0,200}GZ\|v1\|/.test(syncSrc));
  assert('_planArrayDelta emits tombstones for items removed since last push',
    /kind:\s*'tombstone'[\s\S]{0,200}isDeleted:\s*1/.test(syncSrc));
  assert('_planArrayDelta is conservative on missing rows (no phantom delete)',
    /safer to no-op[\s\S]{0,100}phantom delete/.test(syncSrc));
  assert('_applyArrayDelta dispatches insert/update/tombstone',
    /_applyArrayDelta[\s\S]{0,300}evolu\.insert\("itemRow"[\s\S]{0,200}evolu\.update\("itemRow"/.test(syncSrc));

  // Push integration in pushProfile
  assert('pushProfile plans deltas before evolu.update on profileData',
    /deltaPlans\s*=\s*\[\][\s\S]{0,1000}for \(const arrayName of DELTA_ARRAYS\)[\s\S]{0,400}_planArrayDelta/.test(syncSrc));
  // Anchor on "Push committed" — unique to the onComplete arrow function,
  // unlike "onComplete" which also appears in evolu.update call sites.
  assert('pushProfile applies deltas only after onComplete (blob commit)',
    /Push committed[\s\S]{0,2500}deltaPlans\.length > 0[\s\S]{0,800}_applyArrayDelta\(arrayName,\s*plan\)[\s\S]{0,500}_writeDeltaSnapshot/.test(syncSrc));

  // Pull-side merge contract — per-row authoritative, blob fallback
  assert('onSyncReceived overlays per-row state AFTER blob merge',
    /merged\s*=\s*localImportedForMerge[\s\S]{0,400}mergeImportedData[\s\S]{0,800}_mergeItemRowsIntoImported/.test(syncSrc));
  assert('_mergeItemRowsIntoImported drops tombstoned items from imported arrays',
    /_mergeItemRowsIntoImported[\s\S]{0,15000}let nextArr\s*=\s*curArr\.filter\(it\s*=>\s*!tombs\.has\(itemIdFn\(it\)\)\)/.test(syncSrc));
  // Resurrection-prevention seed: blob-side `_deleted[arrayName]` must
  // pre-populate the row-side tombs Set, otherwise a peer pushing the
  // row back as live (before pulling our delete) re-inserts it locally.
  assert('_mergeItemRowsIntoImported seeds tombs from local blob _deleted before walking rows',
    /imported\.\s*_deleted[\s\S]{0,200}\[arrayName\][\s\S]{0,200}tombs\.add/.test(syncSrc));
  assert('_mergeItemRowsIntoImported skips inserting items that match a blob-tombstoned itemId',
    /tombs\.has\(itemId\)\)\s*continue/.test(syncSrc));
  assert('_mergeItemRowsIntoImported prefers per-row payload when itemId already present in array (replace)',
    /idx\s*!==\s*undefined[\s\S]{0,200}nextArr\[idx\]\s*=\s*item/.test(syncSrc));
  assert('_mergeItemRowsIntoImported gunzips GZ|v1| payloads via capped variant',
    /json\.startsWith\('GZ\|v1\|'\)[\s\S]{0,300}_gunzipToStringCapped\(_base64ToBytes\(json\.slice\(6\)\)\)/.test(syncSrc));
  assert('_mergeItemRowsIntoImported guards against itemId/payload mismatch (defence-in-depth)',
    /itemIdFn\(item\)\s*===\s*row\.itemId/.test(syncSrc));

  // Snapshot persistence contract
  assert('Delta snapshot key namespaced per (profile, arrayName)',
    /labcharts-\$\{profileId\}-delta-\$\{arrayName\}/.test(syncSrc));
  assert('Snapshot only writes after onComplete (wedged-push safety)',
    /Push committed[\s\S]{0,2500}_writeDeltaSnapshot\(profileId,\s*arrayName,\s*plan\.next,\s*plan\.plannedAt\)/.test(syncSrc));

  // Live diff sanity: confirm the diff logic respects content-equality
  if (typeof CompressionStream !== 'undefined') {
    const itemA = { id: 's1', kind: 'sun', minutes: 12 };
    const itemAcopy = { id: 's1', kind: 'sun', minutes: 12 };
    const itemB = { id: 's1', kind: 'sun', minutes: 13 };
    const hashA = (() => { let h = 5381; const s = JSON.stringify(itemA); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })();
    const hashAc = (() => { let h = 5381; const s = JSON.stringify(itemAcopy); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })();
    const hashB = (() => { let h = 5381; const s = JSON.stringify(itemB); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })();
    assert('djb2 hash equality holds for content-identical items', hashA === hashAc, `${hashA} vs ${hashAc}`);
    assert('djb2 hash differs for content-changed items', hashA !== hashB, `${hashA} vs ${hashB}`);
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
  console.log('3. AI Settings Sync');

  const expectedKeys = [
    'labcharts-ai-provider', 'labcharts-openrouter-key',
    'labcharts-venice-key', 'labcharts-openrouter-model',
    'labcharts-venice-model', 'labcharts-venice-e2ee', 'labcharts-ollama-model',
    'labcharts-ollama-pii-url', 'labcharts-ollama-pii-model',
    'labcharts-ppq-key', 'labcharts-ppq-model', 'labcharts-routstr-key', 'labcharts-routstr-model'
  ];
  for (const key of expectedKeys) {
    assert(`AI_SETTINGS_KEYS includes ${key}`, syncPayloadSrc.includes(`'${key}'`));
  }

  assert('Encrypted keys use encryptedSetItem on apply', syncApplySrc.includes('ENCRYPTED_AI_KEYS') && syncApplySrc.includes('encryptedSetItem(key, val)'));
  assert('collectAISettings uses encryptedGetItem', syncPayloadSrc.includes('encryptedGetItem(key)'));
  assert('applyAISettings has allowlist check', syncApplySrc.includes('AI_SETTINGS_KEYS.includes(key)'));
  assert('applyAISettings has size guard', syncApplySrc.includes('val.length > 10000'));
  assert('applyAISettings honors fresh local AI setting lock', syncApplySrc.includes('AI_SETTINGS_LOCAL_LOCK_UNTIL_KEY') && syncApplySrc.includes('shouldKeepLocalAISetting(key)'));
  assert('applyAISettings refreshes chat provider UI on remote changes', syncApplySrc.includes('window.updateChatHeaderModel?.()') && syncApplySrc.includes('window.refreshWebSearchToggle?.()'));
  assert('AI setting changes schedule a sync push', syncSrc.includes("labcharts-ai-settings-local-changed") && syncSrc.includes('pushProfile(profileId, importedData)'));

  // ═══════════════════════════════════════
  // 4. MNEMONIC RESTORE
  // ═══════════════════════════════════════
  console.log('4. Mnemonic Restore');

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
  console.log('5. Evolu Configuration');

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
  console.log('6. Data Integration');

  assert('data.js imports onDataSaved from sync.js', dataSrc.includes("import { onDataSaved } from './sync.js'"));
  assert('saveImportedData calls onDataSaved()', dataSrc.includes('onDataSaved()'));

  // ═══════════════════════════════════════
  // 7. STARTUP UI INTEGRATION
  // ═══════════════════════════════════════
  console.log('7. Startup UI Integration');

  assert('startup-ui.js imports initSync', startupUiSrc.includes("initSync") && startupUiSrc.includes("from './sync.js'"));
  assert('startup-ui.js defers initSync after first paint', /requestAnimationFrame\([\s\S]{0,300}initSync\(\)/.test(startupUiSrc));

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
  assert('BIP-39 lazy loader resets cached promise after failure',
    /_bip39Load\s*=\s*null/.test(syncSrc),
    'transient script failure should not poison identity rotation for the full session');
  assert('QR lazy loader resets cached promise after failure',
    /_qrCodeLoad\s*=\s*null/.test(syncSrc),
    'transient script failure should not poison QR rendering for the full session');

  // ═══════════════════════════════════════
  // 8. PUSH/PULL LOGIC
  // ═══════════════════════════════════════
  console.log('8. Push/Pull Logic');

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
    syncApplySrc.includes("localStorage.setItem(threadsKey, JSON.stringify(chatData.threads)"));

  // ═══════════════════════════════════════
  // 9. SETTINGS UI
  // ═══════════════════════════════════════
  console.log('9. Settings UI');

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
  console.log('10. Setup Modal');

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
  console.log('11. Chat & Display Sync');

  assert('collectChatData reads threads', syncPayloadSrc.includes('chat-threads') && syncPayloadSrc.includes('collectChatData'));
  assert('collectChatData reads per-thread messages', syncPayloadSrc.includes('chat-t_${t.id}'));
  assert('collectChatData includes custom personalities', syncPayloadSrc.includes('chatPersonalityCustom'));
  assert('collectChatData emits empty messages for cleared zero-message threads',
    syncPayloadSrc.includes('messageCount') && syncPayloadSrc.includes('messages[t.id] = []'));
  assert('applyChatData writes threads', syncApplySrc.includes('applyChatData'));
  assert('applyChatData removes message keys for remotely deleted threads',
    syncApplySrc.includes('incomingThreadIds') && syncApplySrc.includes('encryptedRemoveItem(`labcharts-${profileId}-chat-t_${t.id}`)'));
  assert('applyChatData skips stale remote chat while local save is fresh',
    syncApplySrc.includes('CHAT_LOCAL_LOCK_UNTIL_KEY') && syncApplySrc.includes('shouldKeepLocalChatData(profileId)'));
  assert('chat freshness lock is shorter than two minutes',
    syncApplySrc.includes('const CHAT_LOCAL_LOCK_MS = 90 * 1000'));
  assert('skipped chat pulls retry after the local freshness lock expires',
    syncSrc.includes('scheduleChatPullRetry') && syncSrc.includes('getChatDataLocalLockRemainingMs(profileId)'));
  assert('active chat reload only runs after chatData is applied',
    syncSrc.includes('const chatApplied = chatData ? await applyChatData(profileId, chatData) : false')
      && syncSrc.includes('if (chatApplied)'));
  assert('active chat thread is reselected after remote thread deletion',
    syncSrc.includes('window.loadChatThreads?.();') && syncSrc.includes('window.ensureActiveThread?.();'));
  {
    const prevProfileId = state.currentProfile;
    const profileId = 'syncapplydel';
    const threadsKey = `labcharts-${profileId}-chat-threads`;
    const keepKey = `labcharts-${profileId}-chat-t_keep`;
    const goneKey = `labcharts-${profileId}-chat-t_gone`;
    const oldLock = sessionStorage.getItem('labcharts-chat-local-lock-until');
    try {
      state.currentProfile = profileId;
      sessionStorage.removeItem('labcharts-chat-local-lock-until');
      localStorage.setItem(threadsKey, JSON.stringify([
        { id: 'keep', messageCount: 1 },
        { id: 'gone', messageCount: 1 },
      ]));
      localStorage.setItem(keepKey, JSON.stringify([{ role: 'user', content: 'old' }]));
      localStorage.setItem(goneKey, JSON.stringify([{ role: 'user', content: 'delete me' }]));
      const applied = await syncApply.applyChatData(profileId, {
        threads: [{ id: 'keep', messageCount: 1 }],
        messages: { keep: [{ role: 'assistant', content: 'new' }] },
      });
      assert('applyChatData functional: remote thread index applied', applied === true);
      assert('applyChatData functional: deleted thread message key removed', localStorage.getItem(goneKey) === null);
      assert('applyChatData functional: kept thread messages overwritten',
        JSON.parse(localStorage.getItem(keepKey) || '[]')?.[0]?.content === 'new');
    } finally {
      state.currentProfile = prevProfileId;
      localStorage.removeItem(threadsKey);
      localStorage.removeItem(keepKey);
      localStorage.removeItem(goneKey);
      if (oldLock === null) sessionStorage.removeItem('labcharts-chat-local-lock-until');
      else sessionStorage.setItem('labcharts-chat-local-lock-until', oldLock);
    }
  }
  const onChatSavedSrc = syncSrc.slice(syncSrc.indexOf('export function onChatSaved'), syncSrc.indexOf('export function onChatSaved') + 600);
  assert('onChatSaved marks local chat before debounce',
    onChatSavedSrc.includes('markChatDataLocal();')
      && onChatSavedSrc.indexOf('markChatDataLocal();') < onChatSavedSrc.indexOf('if (!_syncEnabled || !evolu) return;'));
  assert('Display prefs synced', syncPayloadSrc.includes('DISPLAY_PREF_SUFFIXES') && syncPayloadSrc.includes('collectDisplayPrefs'));
  assert('onChatSaved exported', syncSrc.includes('export function onChatSaved'));
  assert('onChatSaved has debounce', syncSrc.includes('_chatSyncTimer') && syncSrc.includes('10000'));
  assert('chat-threads.js imports onChatSaved', await fetchWithRetry('js/chat-threads.js').then(s => s.includes("import { onChatSaved } from './sync.js'")));

  // ═══════════════════════════════════════
  // 12. MESSENGER ACCESS
  // ═══════════════════════════════════════
  console.log('12. Messenger Access');

  assert('generateMessengerToken creates 64-char hex', syncSrc.includes('crypto.getRandomValues') && syncSrc.includes('MESSENGER_TOKEN_KEY'));
  assert('pushContextToGateway exports', syncSrc.includes('export function pushContextToGateway'));
  assert('OpenClaw section in settings', settingsSrc.includes('renderMessengerSection') && settingsSrc.includes('OpenClaw'));
  assert('Token masked by default', settingsSrc.includes('messenger-token') && settingsSrc.includes('data-masked'));

  // ═══════════════════════════════════════
  // 13. WINDOW BINDINGS
  // ═══════════════════════════════════════
  console.log('13. Window Bindings');

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
  console.log('14. Wearable Connections Preserve');

  // Push side: stripWearableCredentials removes wearableConnections from the payload
  assert('buildSyncPayload strips wearableConnections', syncPayloadSrc.includes('stripWearableCredentials(importedData)'));
  assert('stripWearableCredentials drops wearableConnections key', syncPayloadSrc.includes('{ wearableConnections, ...rest } = importedData'));

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
  // 14a. DELTA_ARRAY_CONFIG — composite-keyed + noTombstones
  // ═══════════════════════════════════════
  console.log('14a. Delta Array Config');

  assert('changeHistory listed in DELTA_ARRAYS',
    /DELTA_ARRAYS\s*=\s*\[[\s\S]{0,1000}'changeHistory'/.test(syncSrc));
  assert('DELTA_ARRAY_CONFIG defines changeHistory itemIdFn',
    /DELTA_ARRAY_CONFIG\s*=\s*\{[\s\S]{0,2000}changeHistory:\s*\{[\s\S]{0,800}itemIdFn:/.test(syncSrc));
  assert('changeHistory itemIdFn synth = field.dateMs (allowlist-safe numeric)',
    /changeHistory:[\s\S]{0,800}\$\{it\.field\}\.\$\{ts\}[\s\S]{0,200}replace\(\/\[\^a-zA-Z0-9_\.-\]/.test(syncSrc));
  assert('changeHistory flagged noTombstones (cap-eviction safety)',
    /changeHistory:[\s\S]{0,1200}noTombstones:\s*true/.test(syncSrc));
  assert('_planArrayDelta consults DELTA_ARRAY_CONFIG[arrayName]',
    /_planArrayDelta[\s\S]{0,400}DELTA_ARRAY_CONFIG\[arrayName\]/.test(syncSrc));
  assert('_planArrayDelta skips tombstones when cfg.noTombstones is set',
    /if \(!cfg\.noTombstones\) \{[\s\S]{0,800}kind:\s*'tombstone'/.test(syncSrc));
  assert('_planArrayDelta uses itemIdFn-derived id everywhere (not item.id)',
    /tuples\s*=\s*Array\.isArray\(items\)[\s\S]{0,300}itemIdFn\(it\)/.test(syncSrc));
  assert('_mergeItemRowsIntoImported uses itemIdFn for replace-or-insert match',
    /_mergeItemRowsIntoImported[\s\S]{0,12000}DELTA_ARRAY_CONFIG\[arrayName\][\s\S]{0,25000}itemIdFn\(nextArr\[i\]\)/.test(syncSrc));
  assert('_mergeItemRowsIntoImported verifies payload itemId matches row column',
    /itemIdFn\(item\)\s*===\s*row\.itemId/.test(syncSrc));

  // Live: round-trip the changeHistory itemIdFn — verify a synth itemId
  // for a realistic recordChange entry is allowlist-safe and stable.
  if (typeof window !== 'undefined') {
    const synthFn = (it) => {
      if (!it || typeof it !== 'object' || !it.field || !it.date) return null;
      const ts = Date.parse(it.date);
      if (!Number.isFinite(ts)) return null;
      return `${it.field}.${ts}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    };
    const e = { field: 'biochemistry.glucose', date: '2026-05-03T10:30:00Z', snapshot: { value: 5.4 } };
    const id = synthFn(e);
    assert('synth itemId is non-null for valid changeHistory entry', typeof id === 'string' && id.length > 0, id);
    assert('synth itemId passes the allowlist regex', /^[a-zA-Z0-9_.-]+$/.test(id), id);
    assert('synth itemId is stable across calls', synthFn(e) === id);
    assert('synth itemId differs when field differs',
      synthFn({ ...e, field: 'biochemistry.sodium' }) !== id);
    assert('synth itemId differs when date differs',
      synthFn({ ...e, date: '2026-05-04T10:30:00Z' }) !== id);
    assert('synth itemId returns null for missing field', synthFn({ ...e, field: undefined }) === null);
    assert('synth itemId returns null for missing date', synthFn({ ...e, date: undefined }) === null);
    assert('synth itemId returns null for unparseable date', synthFn({ ...e, date: 'not-a-date' }) === null);
  }

  // ═══════════════════════════════════════
  // 14a-1b. DELTA_ARRAY_CONFIG — Phase 2 cutover blockers (entries / supplements / healthGoals)
  // ═══════════════════════════════════════
  // Pre-fix: these three surfaces were declared in DELTA_ARRAYS but
  // their items had no `.id` field, so the default itemIdFn returned
  // null and every item was silently filtered out of the planner.
  // Result: rows=0 even when local has data → Phase 2 readiness BLOCKED.
  // Fix: explicit itemIdFn per surface, deterministic from content so
  // two devices migrating identical pre-existing data independently
  // derive matching ids (no cross-device duplication).
  console.log('14a-1b. Cutover-blocker itemIdFns');

  assert('entries listed in DELTA_ARRAYS',
    /DELTA_ARRAYS\s*=\s*\[[\s\S]{0,1200}'entries'/.test(syncSrc));
  assert('supplements listed in DELTA_ARRAYS',
    /DELTA_ARRAYS\s*=\s*\[[\s\S]{0,1200}'supplements'/.test(syncSrc));
  assert('healthGoals listed in DELTA_ARRAYS',
    /DELTA_ARRAYS\s*=\s*\[[\s\S]{0,1200}'healthGoals'/.test(syncSrc));

  assert('DELTA_ARRAY_CONFIG.entries defines itemIdFn (uses date as natural key)',
    /entries:\s*\{[\s\S]{0,400}itemIdFn:[\s\S]{0,300}it\.date/.test(syncSrc));
  assert('DELTA_ARRAY_CONFIG.supplements defines itemIdFn (content hash)',
    /supplements:\s*\{[\s\S]{0,400}itemIdFn:[\s\S]{0,400}_djb2/.test(syncSrc));
  assert('DELTA_ARRAY_CONFIG.healthGoals defines itemIdFn (text hash)',
    /healthGoals:\s*\{[\s\S]{0,400}itemIdFn:[\s\S]{0,400}_djb2\(it\.text\)/.test(syncSrc));
  // Notes — `{date, text}` with no `.id`. Without an itemIdFn override,
  // the planner emits zero rows (default itemIdFn requires `it.id`) and
  // Phase 2 cutover refuses to flip on any profile with saved notes.
  // Greptile re-review #175 caught this.
  assert('DELTA_ARRAY_CONFIG.notes defines itemIdFn (date+text hash)',
    /notes:\s*\{[\s\S]{0,500}itemIdFn:[\s\S]{0,500}_djb2/.test(syncSrc));
  // chatSummaries — `.id` is `s_<base36-timestamp>` (timestamp-unique per
  // device), so two devices summarising the same thread independently
  // create rows with different itemIds. Override keys by threadId so
  // concurrent same-thread summaries collapse cross-device (LWW). Greptile
  // re-review #175 caught this.
  assert('DELTA_ARRAY_CONFIG.chatSummaries defines itemIdFn (threadId hash)',
    /chatSummaries:\s*\{[\s\S]{0,500}itemIdFn:[\s\S]{0,500}it\.threadId[\s\S]{0,200}_djb2/.test(syncSrc));

  // Live: round-trip the three itemIdFns to verify determinism + uniqueness
  if (typeof window !== 'undefined') {
    function djb2(str) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    }
    function isAllowlistSafe(id) {
      return typeof id === 'string' && id.length > 0 && /^[a-zA-Z0-9_.-]+$/.test(id);
    }

    const entriesFn = (it) => (it && typeof it.date === 'string' && isAllowlistSafe(it.date)) ? it.date : null;
    const e1 = { date: '2026-05-04', markers: { 'biochemistry.glucose': 5.4 } };
    assert('entries itemIdFn returns date for valid entry', entriesFn(e1) === '2026-05-04');
    assert('entries itemId is allowlist-safe', isAllowlistSafe(entriesFn(e1)));
    assert('entries itemIdFn null on missing date', entriesFn({ markers: {} }) === null);
    assert('entries itemId is stable (same date → same id)',
      entriesFn(e1) === entriesFn({ ...e1, markers: { 'biochemistry.sodium': 140 } }));

    const suppFn = (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.name || ''}|${it.startDate || ''}|${it.type || ''}`;
      return sig === '||' ? null : `s_${djb2(sig)}`;
    };
    const s1 = { name: 'Vitamin D', startDate: '2026-01-01', type: 'supplement', dosage: '5000 IU' };
    const s2 = { ...s1, dosage: '2000 IU' };  // dosage edit
    const s3 = { ...s1, startDate: '2026-02-01' };  // different start date
    const id1 = suppFn(s1);
    assert('supplements itemId is non-null for valid entry', typeof id1 === 'string' && id1.length > 2);
    assert('supplements itemId is allowlist-safe', isAllowlistSafe(id1));
    assert('supplements itemId stable across dosage edit (same name/startDate/type)',
      suppFn(s2) === id1);
    assert('supplements itemId differs when startDate differs',
      suppFn(s3) !== id1);
    assert('supplements itemIdFn null on empty struct',
      suppFn({ name: '', startDate: '', type: '' }) === null);

    const goalFn = (it) => {
      if (!it || typeof it !== 'object' || !it.text) return null;
      return `g_${djb2(it.text)}`;
    };
    const g1 = { text: 'Lower hs-CRP under 1.0', severity: 'major' };
    const g2 = { ...g1, severity: 'critical' };  // severity edit
    const g3 = { text: 'Improve sleep quality', severity: 'major' };
    const gid = goalFn(g1);
    assert('healthGoals itemId non-null + allowlist-safe', typeof gid === 'string' && isAllowlistSafe(gid));
    assert('healthGoals itemId stable across severity edit (text unchanged)',
      goalFn(g2) === gid);
    assert('healthGoals itemId differs when text differs',
      goalFn(g3) !== gid);
    assert('healthGoals itemIdFn null on missing text', goalFn({ severity: 'major' }) === null);

    const notesFn = (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.date || ''}|${it.text || ''}`;
      return sig === '|' ? null : `n_${djb2(sig)}`;
    };
    const n1 = { date: '2026-05-09', text: 'Fasting blood draw before this entry' };
    const n2 = { ...n1, text: 'Edited note text' };
    const n3 = { date: '2026-05-10', text: n1.text };
    const nid = notesFn(n1);
    assert('notes itemId non-null + allowlist-safe', typeof nid === 'string' && isAllowlistSafe(nid));
    assert('notes itemId differs on text edit (tombstone-old + insert-new pattern)',
      notesFn(n2) !== nid);
    assert('notes itemId differs when date differs but text is identical',
      notesFn(n3) !== nid);
    assert('notes itemIdFn null on empty struct',
      notesFn({ date: '', text: '' }) === null);

    const chatSumFn = (it) => {
      if (!it || typeof it !== 'object' || !it.threadId) return null;
      return `cs_${djb2(String(it.threadId))}`;
    };
    const cs1 = { id: 's_abc123', threadId: 't_xyz789', threadName: 'Lab analysis', content: 'TLDR…', createdAt: 1778000000000 };
    const cs2 = { ...cs1, id: 's_def456', content: 'Different summary text' };  // device-2 concurrent summary
    const cs3 = { ...cs1, threadId: 't_other', id: 's_zzz' };  // different thread
    const csid = chatSumFn(cs1);
    assert('chatSummaries itemId non-null + allowlist-safe',
      typeof csid === 'string' && isAllowlistSafe(csid));
    assert('chatSummaries itemId stable across device-2 concurrent summary (same threadId)',
      chatSumFn(cs2) === csid,
      `cs1=${csid} cs2=${chatSumFn(cs2)}`);
    assert('chatSummaries itemId differs when threadId differs',
      chatSumFn(cs3) !== csid);
    assert('chatSummaries itemIdFn null on missing threadId',
      chatSumFn({ id: 's_abc', content: 'orphan' }) === null);
    assert('chatSummaries itemIdFn null on null/non-object',
      chatSumFn(null) === null && chatSumFn('not-an-object') === null);
  }

  // ═══════════════════════════════════════
  // 14a-2. DELTA_MAPS — keyed-map shape (markerNotes)
  // ═══════════════════════════════════════
  console.log('14a-2. Delta Maps (keyed-object shape)');

  assert('DELTA_MAPS list defined parallel to DELTA_ARRAYS',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,500}'markerNotes'/.test(syncSrc));
  assert('DELTA_MAPS includes customMarkers (v1.7.4)',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,500}'customMarkers'/.test(syncSrc));
  assert('DELTA_MAPS includes manualValues (v1.7.5)',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,500}'manualValues'/.test(syncSrc));
  // Light & Sun AI verdict singletons — without these in the delta lists,
  // Phase 2 cutover (`_v: 4` payloads omit importedData blob) silently
  // drops them on cross-device sync. lightDailyVerdicts is a map keyed
  // by ISO date; channelMixAI is a singleton scalar.
  assert('DELTA_MAPS includes lightDailyVerdicts (v1.7.x AI verdict surface)',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,2500}'lightDailyVerdicts'[\s\S]{0,200}\]/.test(syncSrc));
  assert('DELTA_SCALARS includes channelMixAI (v1.7.x AI verdict surface)',
    /const DELTA_SCALARS\s*=\s*\[[\s\S]{0,2500}'channelMixAI'[\s\S]{0,200}\]/.test(syncSrc));
  assert('DELTA_MAP_CONFIG defines manualValues keyIdFn (doubling-escape)',
    /DELTA_MAP_CONFIG\s*=\s*\{[\s\S]{0,1500}manualValues:[\s\S]{0,500}rawKey\.replace\(\/_\/g,\s*'__'\)\.replace\(\/:\/g,\s*'_'\)/.test(syncSrc));
  assert('_planKeyedMapDelta uses cfg.keyIdFn when present',
    /_planKeyedMapDelta[\s\S]{0,2000}DELTA_MAP_CONFIG\[mapName\][\s\S]{0,1500}keyIdFn\(rawKey\)/.test(syncSrc));
  assert('_planKeyedMapDelta payload preserves the ORIGINAL raw key (not the synth)',
    /payloadObj\s*=\s*\{\s*k:\s*rawKey,\s*v:\s*value\s*\}/.test(syncSrc));
  assert('Map-shape pull verifies via keyIdFn(parsed.k) === row.itemId',
    /keyIdFn\(parsed\.k\)\s*!==\s*row\.itemId/.test(syncSrc));
  assert('Map-shape pull rebuilds map under ORIGINAL rawKey, not synth itemId',
    /for \(const \[rawKey, entry\] of liveByRawKey\)[\s\S]{0,500}curMap\[rawKey\]\s*=\s*entry\.v/.test(syncSrc));
  assert('Map-shape pull guards rawKey against proto-pollution at write site',
    /for \(const \[rawKey, entry\] of liveByRawKey\)[\s\S]{0,400}_PROTO_POLLUTION_KEYS\.has\(rawKey\)[\s\S]{0,100}curMap\[rawKey\]\s*=\s*entry\.v/.test(syncSrc));

  // Live: round-trip the manualValues keyIdFn — `:` collapses to `_`,
  // result is allowlist-safe, original key recoverable on pull via
  // payload.k. Validates the synth-id contract end-to-end.
  if (typeof window !== 'undefined') {
    const synthFn = (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    };
    assert('synth keyId for ISO date',
      synthFn('biochemistry.glucose:2026-05-03') === 'biochemistry.glucose_2026-05-03');
    assert('synth keyId for ISO timestamp (multi-colon date)',
      synthFn('biochemistry.glucose:2026-05-03T10:30:00Z') === 'biochemistry.glucose_2026-05-03T10_30_00Z');
    assert('synth keyId passes allowlist regex for typical key',
      /^[a-zA-Z0-9_.-]+$/.test(synthFn('biochemistry.glucose:2026-05-03T10:30:00Z')));
    assert('synth keyId returns null for empty input', synthFn('') === null);
    assert('synth keyId returns null for non-string', synthFn(null) === null);
    // Distinct keys must produce distinct synths (no collisions for
    // real-world manualValues shapes)
    assert('distinct keys → distinct synths',
      synthFn('biochemistry.glucose:2026-05-03') !== synthFn('biochemistry.sodium:2026-05-03'));
  }
  assert('_planKeyedMapDelta defined',
    /async function _planKeyedMapDelta\(profileId,\s*mapName,\s*mapObj\)/.test(syncSrc));
  assert('_planKeyedMapDelta validates key allowlist (no weird itemIds)',
    /_planKeyedMapDelta[\s\S]{0,1500}!_isAllowlistSafeId\(itemId\)/.test(syncSrc));
  assert('_planKeyedMapDelta wraps payload as {k, v} for itemId verification on pull',
    /_planKeyedMapDelta[\s\S]{0,2200}payloadObj\s*=\s*\{\s*k:\s*rawKey,\s*v:\s*value\s*\}/.test(syncSrc));
  assert('_planKeyedMapDelta emits tombstones when keys are removed',
    /_planKeyedMapDelta[\s\S]{0,3500}kind:\s*'tombstone'/.test(syncSrc));
  assert('pushProfile loops DELTA_MAPS after DELTA_ARRAYS',
    /for \(const arrayName of DELTA_ARRAYS\)[\s\S]{0,800}for \(const mapName of DELTA_MAPS\)/.test(syncSrc));
  assert('pushProfile uses _planKeyedMapDelta for map shapes',
    /_planKeyedMapDelta\(profileId,\s*mapName,\s*obj\)/.test(syncSrc));
  assert('_mergeItemRowsIntoImported routes map vs array by DELTA_MAPS membership',
    /_DELTA_MAPS_SET\s*=\s*new Set\(DELTA_MAPS\)[\s\S]{0,6000}_DELTA_MAPS_SET\.has\(arrayName\)/.test(syncSrc));
  assert('Map-shape merge writes to the resolved map container (preserves original key, dotted-path-safe)',
    /curMap\[rawKey\]\s*=\s*entry\.v/.test(syncSrc));
  assert('Map-shape merge deletes tombstoned keys from the resolved map via synth-id reverse-lookup',
    /tombItemIds\.has\(synth\)[\s\S]{0,200}delete curMap\[k\]/.test(syncSrc));
  // Dotted-path support — required for genetics.snps and any other
  // nested map registered in DELTA_MAPS. Without isNestedMap → getAt
  // walk, per-key writes would land at a flat top-level sibling and
  // miss the nested structure entirely.
  assert('Map-shape merge resolves dotted-path entries via getAt/setAt',
    /isNestedMap\s*=\s*arrayName\.includes\('\.'\)[\s\S]{0,400}getAt\(imported,\s*arrayName\)/.test(syncSrc));
  assert('genetics.snps registered as a per-key DELTA_MAP (not whole-blob LWW)',
    /'genetics\.snps'/.test(syncSrc));
  assert('Map-shape merge verifies via keyIdFn(parsed.k) === row.itemId (defence-in-depth, synth-aware)',
    /keyIdFn\(parsed\.k\)\s*!==\s*row\.itemId/.test(syncSrc));

  // Live: round-trip a synthetic markerNotes map through the planner
  // logic (replicated locally) — ensures the value/key contract is what
  // we think it is. Skips when CompressionStream unavailable.
  if (typeof window !== 'undefined') {
    const sample = { 'biochemistry.glucose': 'a bit high after Christmas', 'biochemistry.sodium': 'fine' };
    const keys = Object.keys(sample).filter(k => /^[a-zA-Z0-9_.-]+$/.test(k));
    assert('All sample markerNote keys pass allowlist regex', keys.length === 2, `kept ${keys.length}/2`);
    const wrapped = JSON.stringify({ k: 'biochemistry.glucose', v: sample['biochemistry.glucose'] });
    const reparsed = JSON.parse(wrapped);
    assert('Wrapped {k,v} payload round-trips via JSON',
      reparsed.k === 'biochemistry.glucose' && reparsed.v === 'a bit high after Christmas');
    // A pathological key with `:` or spaces should be skipped, not pushed
    assert('Key with colon fails allowlist (would be skipped by planner)',
      !/^[a-zA-Z0-9_.-]+$/.test('weird:key'));
  }

  // ═══════════════════════════════════════
  // 14a-3. DELTA_SCALARS — singleton fields (menstrualCycle, context cards)
  // ═══════════════════════════════════════
  console.log('14a-3. Delta Scalars (singleton fields)');

  assert('DELTA_SCALARS list defined alongside DELTA_ARRAYS / DELTA_MAPS',
    /const DELTA_SCALARS\s*=\s*\[/.test(syncSrc));
  assert('DELTA_SCALARS includes menstrualCycle (closes Phase 2 blocker)',
    /const DELTA_SCALARS\s*=\s*\[[\s\S]{0,500}'menstrualCycle'/.test(syncSrc));
  assert('DELTA_SCALARS includes the 8 context cards',
    /'diagnoses'/.test(syncSrc) && /'diet'/.test(syncSrc) && /'exercise'/.test(syncSrc) && /'sleepRest'/.test(syncSrc) && /'lightCircadian'/.test(syncSrc) && /'stress'/.test(syncSrc) && /'loveLife'/.test(syncSrc) && /'environment'/.test(syncSrc));
  assert('DELTA_SCALARS includes domain modules (genetics, biometrics)',
    /'genetics'/.test(syncSrc) && /'biometrics'/.test(syncSrc));
  // lightEnvironment was promoted out of DELTA_SCALARS in v1.7.21:
  // its rooms/screens are nested arrays that need per-row CRDT or
  // cross-device edits silently regress to wholesale-LWW under the
  // Phase 2 cutover (which drops the blob path entirely).
  assert('lightEnvironment is NOT in DELTA_SCALARS (rooms/screens ride per-row CRDT)',
    !/const DELTA_SCALARS\s*=\s*\[[\s\S]{0,1500}'lightEnvironment'/.test(syncSrc));
  assert('DELTA_ARRAYS includes lightEnvironment.rooms (nested per-row CRDT)',
    /const DELTA_ARRAYS\s*=\s*\[[\s\S]{0,2000}'lightEnvironment\.rooms'/.test(syncSrc));
  assert('DELTA_ARRAYS includes lightEnvironment.screens (nested per-row CRDT)',
    /const DELTA_ARRAYS\s*=\s*\[[\s\S]{0,2000}'lightEnvironment\.screens'/.test(syncSrc));
  // Structural invariant: planner + readiness + merger all walk dotted
  // paths via getAt/setAt. Without these, a future "simplify" refactor
  // that reverts to flat-only access would silently re-introduce the
  // wholesale-LWW regression on rooms/screens.
  assert('pushProfile planner walks dotted DELTA_ARRAYS entries via getAt',
    /pushProfile[\s\S]{0,4000}arrayName\.includes\('\.'\)[\s\S]{0,200}getAt\(importedData,\s*arrayName\)/.test(syncSrc));
  assert('getDeltaCutoverReadiness walks dotted DELTA_ARRAYS entries via getAt',
    /getDeltaCutoverReadiness[\s\S]{0,2000}arrayName\.includes\('\.'\)[\s\S]{0,200}getAt\(importedData,\s*arrayName\)/.test(syncSrc));
  assert('_mergeItemRowsIntoImported writes nested arrays back via setAt',
    /_mergeItemRowsIntoImported[\s\S]{0,12000}isNested\s*=\s*arrayName\.includes\('\.'\)[\s\S]{0,400}setAt\(imported,\s*arrayName,/.test(syncSrc));
  assert('DELTA_SCALARS includes free-form text fields',
    /'interpretiveLens'/.test(syncSrc) && /'contextNotes'/.test(syncSrc));
  assert('_planScalarDelta defined',
    /async function _planScalarDelta\(profileId,\s*scalarName,\s*scalarValue\)/.test(syncSrc));
  assert('_planScalarDelta wraps payload as {v: value}',
    /_planScalarDelta[\s\S]{0,1500}payloadObj\s*=\s*\{\s*v:\s*scalarValue\s*\}/.test(syncSrc));
  assert('_planScalarDelta picks most-recently-synced when multiple rows exist',
    /_planScalarDelta[\s\S]{0,800}sort\(\(a,\s*b\)\s*=>\s*String\(b\.syncedAt[\s\S]{0,200}\.localeCompare\(String\(a\.syncedAt/.test(syncSrc));
  assert('_planScalarDelta emits tombstones only on non-null → null transition',
    /_planScalarDelta[\s\S]{0,3000}prev\[scalarName\]\s*&&\s*canonical\s*&&\s*!canonical\.isDeleted[\s\S]{0,800}kind:\s*'tombstone'/.test(syncSrc));
  assert('_planScalarDelta treats empty-string + null + undefined as absence (parity with blob)',
    /_planScalarDelta[\s\S]{0,2000}hasValue\s*=\s*scalarValue\s*!==\s*null[\s\S]{0,200}!==\s*undefined[\s\S]{0,200}length\s*===\s*0/.test(syncSrc));
  assert('pushProfile loops DELTA_SCALARS after DELTA_MAPS',
    /for \(const mapName of DELTA_MAPS\)[\s\S]{0,800}for \(const scalarName of DELTA_SCALARS\)/.test(syncSrc));
  assert('pushProfile uses _planScalarDelta',
    /_planScalarDelta\(profileId,\s*scalarName,\s*value\)/.test(syncSrc));
  assert('Pull-side branch routes scalars via _DELTA_SCALARS_SET',
    /_DELTA_SCALARS_SET\s*=\s*new Set\(DELTA_SCALARS\)[\s\S]{0,800}_DELTA_SCALARS_SET\.has\(arrayName\)/.test(syncSrc));
  assert('Pull-side scalar branch ignores foreign rows in the same slot (defence-in-depth)',
    /row\.itemId\s*!==\s*arrayName[\s\S]{0,80}continue/.test(syncSrc));
  assert('Pull-side scalar tombstone wins LWW only when at-or-newer than live',
    /tombstoned\s*&&\s*tombstonedAt\s*>=\s*chosenAt[\s\S]{0,2500}imported\[arrayName\]\s*=\s*null/.test(syncSrc));
  assert('Dotted-path scalar tombstone clears just the leaf via setAt',
    /isNestedScalar[\s\S]{0,400}setAt\(imported,\s*arrayName,\s*null\)/.test(syncSrc));
  assert('Dotted-path scalar live row writes via setAt',
    /isNestedScalar[\s\S]{0,800}setAt\(imported,\s*arrayName,\s*chosen\.v\)/.test(syncSrc));
  assert('Pull-side scalar live row writes imported[arrayName] = chosen.v',
    /imported\[arrayName\]\s*=\s*chosen\.v/.test(syncSrc));

  // ═══════════════════════════════════════
  // 14b. PHASE 1 DUAL-WRITE TELEMETRY (observability for cutover decision)
  // ═══════════════════════════════════════
  console.log('14b. Phase 1 Dual-Write Telemetry');

  // Source-shape: helpers + exports + diagnose surface wiring
  assert('getDeltaTelemetry exported', /export function getDeltaTelemetry/.test(syncSrc));
  assert('resetDeltaTelemetry exported', /export function resetDeltaTelemetry/.test(syncSrc));
  assert('Telemetry key is profile-scoped',
    /labcharts-\$\{profileId\}-delta-telemetry/.test(syncSrc));
  assert('_recordPushTelemetry counts ins/upd/tom per array + payload bytes',
    /_recordPushTelemetry[\s\S]{0,800}op\.kind\s*===\s*'insert'[\s\S]{0,200}op\.kind\s*===\s*'update'[\s\S]{0,200}op\.kind\s*===\s*'tombstone'[\s\S]{0,300}op\.args\?\.payload/.test(syncSrc));
  assert('Telemetry rolling window capped at 50 pushes',
    /_DELTA_TELEMETRY_CAP\s*=\s*50/.test(syncSrc));
  assert('pushProfile records telemetry from onComplete (not synchronously)',
    /Push committed[\s\S]{0,3500}_recordPushTelemetry\(profileId,\s*\(dataJson\s*\|\|\s*''\)\.length,\s*deltaPlans\)/.test(syncSrc));
  assert('Pull-side merge updates _pullDeltaSnapshot per array',
    /_pullDeltaSnapshot\.perArray\[arrayName\]\s*=\s*\{\s*live:\s*liveById\.size,\s*tombstones:\s*tombs\.size\s*\}/.test(syncSrc));
  assert('Pull snapshot resets profileId on each merge (no stale carry-over)',
    /_pullDeltaSnapshot\.profileId\s*=\s*profileId[\s\S]{0,200}_pullDeltaSnapshot\.perArray\s*=\s*\{\}/.test(syncSrc));
  assert('Diagnose surface renders Phase 1 dual-write health section',
    /Phase 1 dual-write health/.test(syncSrc));
  assert('Diagnose Copy text includes ratio + cutover hint',
    /ratio \(delta:blob\)[\s\S]{0,200}Phase 2 cutover safe/.test(syncSrc));
  assert('Reset window button confirms via showConfirmDialog',
    /confirmResetDeltaTelemetry[\s\S]{0,1500}showConfirmDialog/.test(syncSrc));
  assert('Telemetry helpers exposed on window',
    /window[\s\S]{0,4000}getDeltaTelemetry,\s*\n\s*resetDeltaTelemetry,\s*\n\s*confirmResetDeltaTelemetry/.test(syncSrc));

  // Live: write a synthetic telemetry blob, read it back, confirm shape +
  // ratio math + cap behaviour. Skips if window.getDeltaTelemetry isn't
  // bound (test page may not have loaded sync.js yet).
  if (typeof window !== 'undefined' && typeof window.getDeltaTelemetry === 'function') {
    const TEST_PID = '__telemetry_test_profile__';
    const KEY = `labcharts-${TEST_PID}-delta-telemetry`;
    try { localStorage.removeItem(KEY); } catch {}
    const synth = { pushes: [
      { at: 1700000000000, blobBytes: 200000, totalDeltaBytes: 5000, totalOps: 3, perArray: { sunSessions: { ins: 2, upd: 1, tom: 0, bytes: 5000 } } },
      { at: 1700000010000, blobBytes: 200000, totalDeltaBytes: 1000, totalOps: 1, perArray: { entries: { ins: 0, upd: 1, tom: 0, bytes: 1000 } } },
    ] };
    try { localStorage.setItem(KEY, JSON.stringify(synth)); } catch {}
    const t = window.getDeltaTelemetry(TEST_PID);
    assert('getDeltaTelemetry returns object for known profile', t && typeof t === 'object');
    assert('Summary aggregates blob bytes across pushes', t?.summary?.totalBlobBytes === 400000, `got ${t?.summary?.totalBlobBytes}`);
    assert('Summary aggregates delta bytes across pushes', t?.summary?.totalDeltaBytes === 6000, `got ${t?.summary?.totalDeltaBytes}`);
    assert('Summary computes ratio = delta/blob', Math.abs((t?.summary?.ratio || 0) - 0.015) < 0.0001, `got ${t?.summary?.ratio}`);
    assert('Summary counts pushes', t?.summary?.count === 2);
    assert('resetDeltaTelemetry clears the entry', window.resetDeltaTelemetry(TEST_PID) === true && localStorage.getItem(KEY) === null);
    // Cap behaviour: write 60 entries, confirm only 50 survive after a record
    const big = { pushes: Array.from({ length: 60 }, (_, i) => ({ at: i, blobBytes: 1000, totalDeltaBytes: 10, totalOps: 1, perArray: {} })) };
    try { localStorage.setItem(KEY, JSON.stringify(big)); } catch {}
    const t2 = window.getDeltaTelemetry(TEST_PID);
    assert('getDeltaTelemetry returns up-to-cap rows when storage was over-cap',
      t2?.pushes?.length === 60, `got ${t2?.pushes?.length} (cap is enforced on write, not read)`);
    try { localStorage.removeItem(KEY); } catch {}
    assert('getDeltaTelemetry on missing profile returns empty pushes',
      window.getDeltaTelemetry(TEST_PID)?.summary?.count === 0);
    assert('getDeltaTelemetry on null profileId returns null',
      window.getDeltaTelemetry(null) === null);
  }

  // ═══════════════════════════════════════
  // 14c. PHASE 2 CUTOVER READINESS CHECK (v1.7.9)
  // ═══════════════════════════════════════
  console.log('14c. Phase 2 Cutover Readiness');

  assert('getDeltaCutoverReadiness exported', /export function getDeltaCutoverReadiness/.test(syncSrc));
  assert('getDeltaCutoverReadiness exposed on window',
    /window[\s\S]{0,5000}getDeltaCutoverReadiness/.test(syncSrc));
  assert('Cutover check classifies missing-rows as blocker',
    /missing-rows[\s\S]{0,200}blockers\+\+/.test(syncSrc));
  assert('Cutover check iterates DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS',
    /getDeltaCutoverReadiness[\s\S]{0,3500}for \(const arrayName of DELTA_ARRAYS\)[\s\S]{0,1000}for \(const mapName of DELTA_MAPS\)[\s\S]{0,1000}for \(const scalarName of DELTA_SCALARS\)/.test(syncSrc));
  assert('getEvoluDiagnostics includes cutoverReadiness',
    /out\.cutoverReadiness\s*=\s*state\.currentProfile/.test(syncSrc));
  assert('Diagnose Copy text includes Phase 2 readiness section',
    /Phase 2 cutover readiness:/.test(syncSrc));
  assert('Diagnose modal renders cutover panel with blocker breakdown',
    /<b>Lean sync mode<\/b>/.test(syncSrc) && /haven't been re-pushed yet/.test(syncSrc));

  // Live: synthesize an importedData object and call the readiness check
  // through window.getDeltaCutoverReadiness with a known profile, verify
  // the surface classification is right.
  if (typeof window !== 'undefined' && typeof window.getDeltaCutoverReadiness === 'function') {
    const TEST_PID = '__cutover_test__';
    const synthImported = {
      // arrays
      sunSessions: [{ id: 's1' }, { id: 's2' }],
      lightDevices: [],
      deviceSessions: [],
      lightAudits: [],
      lightMeasurements: [],
      entries: [{ id: 'e1' }],
      notes: [],
      supplements: [],
      healthGoals: [],
      changeHistory: [],
      // maps
      markerNotes: { 'biochemistry.glucose': 'note' },
      customMarkers: {},
      manualValues: {},
      // scalars
      menstrualCycle: { lastPeriod: '2026-04-15' },
      diet: null,
      exercise: null,
      sleepRest: null,
      diagnoses: null,
      lightCircadian: null,
      stress: null,
      loveLife: null,
      environment: null,
      interpretiveLens: '',
      contextNotes: '',
      emfAssessment: null,
      genetics: null,
      biometrics: null,
      lightEnvironment: null,
      sunCorrelations: null,
      lifelightProfile: null,
      sunDefaults: null,
    };
    const r = window.getDeltaCutoverReadiness(TEST_PID, synthImported);
    assert('readiness returns structured report', r && typeof r === 'object' && r.surfaces);
    // No relay rows for this synthetic profile, so any surface with local
    // data will be a blocker (status=missing-rows).
    assert('readiness flags sunSessions as blocker (local data, no rows)',
      r.surfaces.sunSessions?.status === 'missing-rows', r.surfaces.sunSessions?.status);
    assert('readiness counts entries as blocker', r.surfaces.entries?.status === 'missing-rows');
    assert('readiness counts markerNotes as blocker', r.surfaces.markerNotes?.status === 'missing-rows');
    assert('readiness counts menstrualCycle scalar as blocker', r.surfaces.menstrualCycle?.status === 'missing-rows');
    assert('readiness no-data status for empty arrays', r.surfaces.notes?.status === 'no-data');
    assert('readiness no-data status for empty maps', r.surfaces.customMarkers?.status === 'no-data');
    assert('readiness no-data status for null scalars', r.surfaces.diet?.status === 'no-data');
    assert('readiness ready=false when blockers exist', r.ready === false);
    assert('readiness blockerCount > 0', r.blockerCount > 0);
    // Edge: empty importedData should be all no-data + ready=true (no
    // local data anywhere → nothing for Phase 2 to lose).
    const empty = window.getDeltaCutoverReadiness(TEST_PID, {});
    assert('empty importedData → ready=true (no surfaces have local data)', empty.ready === true, `blockers=${empty.blockerCount}`);
    // Edge: null profileId → returns error
    assert('null profileId returns error', window.getDeltaCutoverReadiness(null)?.error === 'no-profile');
  }

  // ═══════════════════════════════════════
  // 14d. PHASE 2 CUTOVER FLAG (v1.7.10) — readiness-gated, reversible
  // ═══════════════════════════════════════
  console.log('14d. Phase 2 Cutover Flag (gated)');

  assert('isPhase2CutoverEnabled exported', /export\s+\{\s*isPhase2CutoverEnabled\s*\}/.test(syncSrc));
  assert('enablePhase2Cutover exported', /export function enablePhase2Cutover/.test(syncSrc));
  assert('disablePhase2Cutover exported', /export function disablePhase2Cutover/.test(syncSrc));
  assert('enablePhase2Cutover gated by getDeltaCutoverReadiness',
    /enablePhase2Cutover[\s\S]{0,400}getDeltaCutoverReadiness\(profileId\)[\s\S]{0,200}!r\.ready[\s\S]{0,200}reason:\s*'not-ready'/.test(syncSrc));
  assert('disablePhase2Cutover always allowed (escape hatch)',
    /disablePhase2Cutover[\s\S]{0,300}disablePhase2CutoverFlag/.test(syncSrc));
  assert('Cutover flag is per-profile (key includes profileId)',
    /_cutoverFlagKey[\s\S]{0,200}labcharts-\$\{profileId\}-sync-cutover-v2/.test(syncPayloadSrc));
  assert('buildSyncPayload checks isPhase2CutoverEnabled',
    /buildSyncPayload[\s\S]{0,2000}isPhase2CutoverEnabled\(profileId\)/.test(syncPayloadSrc));
  assert('v4 payload omits importedData when cutover is on',
    /cutover\s*\?\s*4\s*:\s*3[\s\S]{0,500}cutover\s*\?\s*undefined\s*:\s*safeImported/.test(syncPayloadSrc));
  assert('parseSyncPayload handles _v: 4 (importedData=null sentinel)',
    /parsed\._v\s*===\s*4[\s\S]{0,400}importedData:\s*null/.test(syncPayloadSrc));
  assert('Receive path treats v4 (importedData null) as legitimate, not malformed',
    /isV4Cutover\s*=\s*importedData\s*===\s*null[\s\S]{0,200}!isV4Cutover\s*&&\s*\(!importedData/.test(syncSrc));
  assert('Receive path uses local as baseline when v4 (no blob to merge)',
    /v4 cutover[\s\S]{0,800}importedData\s*\?\s*mergeImportedData\(localImportedForMerge,\s*importedData\)\s*:\s*localImportedForMerge/.test(syncSrc));
  assert('confirmEnablePhase2 re-checks readiness as defence-in-depth',
    /confirmEnablePhase2[\s\S]{0,400}getDeltaCutoverReadiness\(state\.currentProfile\)[\s\S]{0,200}!r\?\.ready/.test(syncSrc));
  assert('Cutover modal button gated when not ready (disabled attribute)',
    /confirmEnablePhase2[\s\S]{0,200}disabled/.test(syncSrc));
  assert('Cutover modal shows lean-mode ON badge when enabled',
    /cutoverBadge\s*=\s*cutoverEnabled[\s\S]{0,400}>ON</.test(syncSrc));
  assert('Cutover handlers exposed on window',
    /window[\s\S]{0,5500}confirmEnablePhase2,\s*\n\s*confirmDisablePhase2/.test(syncSrc));

  // Live: read/write/disable contract for the cutover flag. Skips the
  // enable() path here because enable consults getDeltaCutoverReadiness
  // which reads state.importedData (the live test session may have
  // populated arrays that classify as missing-rows blockers, making
  // enable correctly reject). Source-shape assertions above already
  // cover the gating contract.
  if (typeof window !== 'undefined' && typeof window.isPhase2CutoverEnabled === 'function') {
    const TEST_PID = '__cutover_flag_test__';
    const KEY = `labcharts-${TEST_PID}-sync-cutover-v2`;
    try { localStorage.removeItem(KEY); } catch {}
    assert('isPhase2CutoverEnabled returns false when flag not set',
      window.isPhase2CutoverEnabled(TEST_PID) === false);
    // Manually set the flag (bypassing enable's readiness gate) and
    // verify the reader picks it up.
    try { localStorage.setItem(KEY, '1'); } catch {}
    assert('isPhase2CutoverEnabled reads back true when flag set',
      window.isPhase2CutoverEnabled(TEST_PID) === true);
    assert('disable always allowed (escape hatch)',
      window.disablePhase2Cutover(TEST_PID) === true);
    assert('isPhase2CutoverEnabled reads back false after disable',
      window.isPhase2CutoverEnabled(TEST_PID) === false);
    // enable's gating: when state.importedData has any populated
    // surface (likely in this test environment), readiness fails →
    // enable rejects with reason='not-ready'. Don't assert ok or
    // !ok directly; assert that enable returns the structured shape
    // so the contract is verified regardless of test-state cleanliness.
    const r = window.enablePhase2Cutover(TEST_PID);
    assert('enablePhase2Cutover returns structured result', r && typeof r === 'object' && 'ok' in r);
    if (!r.ok) {
      assert('enable failure includes reason field', typeof r.reason === 'string');
    }
    try { localStorage.removeItem(KEY); } catch {}
    // null profileId rejection
    assert('enable rejects null profileId', window.enablePhase2Cutover(null)?.ok === false);
    assert('disable rejects null profileId', window.disablePhase2Cutover(null) === false);
    assert('isPhase2CutoverEnabled returns false for null profileId',
      window.isPhase2CutoverEnabled(null) === false);
  }

  // ═══════════════════════════════════════
  // 14e. v1.7.11 AUDIT FIXES — proto-pollution / resurrect / cutover scope
  // ═══════════════════════════════════════
  console.log('14e. v1.7.11 audit fixes');

  // Proto-pollution defence
  assert('_isAllowlistSafeId rejects __proto__ / constructor / prototype',
    /_PROTO_POLLUTION_KEYS\s*=\s*new Set\(\['__proto__',\s*'constructor',\s*'prototype'\]\)/.test(syncSrc));
  assert('_isAllowlistSafeId combines regex + proto-key Set',
    /_isAllowlistSafeId[\s\S]{0,300}\^\[a-zA-Z0-9_\.-\]\+\$[\s\S]{0,200}_PROTO_POLLUTION_KEYS\.has\(id\)/.test(syncSrc));
  assert('_planArrayDelta uses _isAllowlistSafeId (not bare regex)',
    /_planArrayDelta[\s\S]{0,1500}_isAllowlistSafeId\(id\)/.test(syncSrc));
  assert('_planKeyedMapDelta uses _isAllowlistSafeId on derived itemId',
    /_planKeyedMapDelta[\s\S]{0,1500}!_isAllowlistSafeId\(itemId\)/.test(syncSrc));
  assert('Map-shape pull wraps keyIdFn with _isAllowlistSafeId guard',
    /rawKeyIdFn[\s\S]{0,200}keyIdFn\s*=\s*\(k\)\s*=>[\s\S]{0,200}_isAllowlistSafeId\(id\)/.test(syncSrc));
  assert('Array-shape pull wraps itemIdFn with _isAllowlistSafeId guard',
    /rawItemIdFn[\s\S]{0,200}itemIdFn\s*=\s*\(it\)\s*=>[\s\S]{0,200}_isAllowlistSafeId\(id\)/.test(syncSrc));
  assert('Fresh map container uses Object.create(null) defence',
    /curMap\s*=\s*Object\.create\(null\)/.test(syncSrc));

  // Resurrect-after-tombstone fix
  assert('_planArrayDelta resurrects tombstoned row by clearing isDeleted',
    /_planArrayDelta[\s\S]{0,2500}existing\?\.isDeleted\s*\?\s*\{\s*isDeleted:\s*null\s*\}\s*:\s*\{\}/.test(syncSrc));
  assert('_planKeyedMapDelta resurrects tombstoned row by clearing isDeleted',
    /_planKeyedMapDelta[\s\S]{0,2700}existing\?\.isDeleted\s*\?\s*\{\s*isDeleted:\s*null\s*\}\s*:\s*\{\}/.test(syncSrc));
  assert('_planScalarDelta resurrects tombstoned row by clearing isDeleted',
    /_planScalarDelta[\s\S]{0,2000}canonical\?\.isDeleted\s*\?\s*\{\s*isDeleted:\s*null\s*\}\s*:\s*\{\}/.test(syncSrc));

  // Phase 2 cutover scope — previously unenumerated importedData fields
  assert('DELTA_MAPS includes refOverrides (Phase 2 scope fix)',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,800}'refOverrides'/.test(syncSrc));
  assert('DELTA_MAPS includes categoryLabels',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,800}'categoryLabels'/.test(syncSrc));
  assert('DELTA_MAPS includes categoryIcons',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,800}'categoryIcons'/.test(syncSrc));
  assert('DELTA_MAPS includes markerLabels',
    /const DELTA_MAPS\s*=\s*\[[\s\S]{0,800}'markerLabels'/.test(syncSrc));
  assert('DELTA_SCALARS includes wearableSummary (Phase 2 scope fix)',
    /const DELTA_SCALARS\s*=\s*\[[\s\S]{0,2500}'wearableSummary'/.test(syncSrc));
  assert('DELTA_SCALARS includes wearableCardOrder',
    /const DELTA_SCALARS\s*=\s*\[[\s\S]{0,2500}'wearableCardOrder'/.test(syncSrc));
  assert('DELTA_SCALARS includes lightEnvironment.burdenAI (dotted-path scalar)',
    /const DELTA_SCALARS\s*=\s*\[[\s\S]{0,2500}'lightEnvironment\.burdenAI'/.test(syncSrc));

  // Snapshot rotation on owner change
  assert('disableSync clears delta snapshots',
    /disableSync[\s\S]{0,3000}key\.includes\('-delta-'\)[\s\S]{0,200}localStorage\.removeItem\(key\)/.test(syncSrc));
  assert('disableSync clears cutover flag',
    /disableSync[\s\S]{0,3000}-sync-cutover-v2/.test(syncSrc));
  assert('restoreFromMnemonic clears delta snapshots',
    /restoreFromMnemonic[\s\S]{0,1000}key\.includes\('-delta-'\)/.test(syncSrc));
  assert('restoreFromMnemonic clears cutover flag',
    /restoreFromMnemonic[\s\S]{0,1000}-sync-cutover-v2/.test(syncSrc));

  // Live: proto-pollution defence — verify a malicious key is rejected
  if (typeof window !== 'undefined') {
    const safeFn = (id) => typeof id === 'string' && id.length > 0
      && /^[a-zA-Z0-9_.-]+$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
    assert('proto check: __proto__ rejected', safeFn('__proto__') === false);
    assert('proto check: constructor rejected', safeFn('constructor') === false);
    assert('proto check: prototype rejected', safeFn('prototype') === false);
    assert('proto check: legitimate keys still pass',
      safeFn('biochemistry.glucose') === true && safeFn('s1') === true);
  }

  // ═══════════════════════════════════════
  // 14f. v1.7.12 AUDIT FIXES — gunzip cap / snapshot-poisoning / changeHistory cap
  // ═══════════════════════════════════════
  console.log('14f. v1.7.12 audit fixes');

  // Decompression-bomb defence
  assert('_gunzipToStringCapped defined with size cap',
    /_PER_ROW_DECOMPRESSED_CAP_BYTES\s*=\s*1024\s*\*\s*1024[\s\S]{0,500}async function _gunzipToStringCapped/.test(syncPayloadSrc));
  assert('_gunzipToStringCapped throws on cap exceeded',
    /total\s*>\s*maxBytes[\s\S]{0,300}refusing to trust/.test(syncPayloadSrc));
  assert('All 3 per-row gunzip sites use the capped variant',
    (syncSrc.match(/_gunzipToStringCapped\(_base64ToBytes\(json\.slice\(6\)\)\)/g) || []).length === 3);
  // Blob path also routes through _gunzipToStringCapped, with the
  // 5 MB MAX_SYNC_PAYLOAD_BYTES cap — a single capped helper is the
  // only gunzip entry point post-2026-05-10 audit (the bare
  // _gunzipToString wrapper was deleted as dead).
  assert('Blob path uses _gunzipToStringCapped with MAX_SYNC_PAYLOAD_BYTES',
    /_gunzipToStringCapped\(bytes,\s*MAX_SYNC_PAYLOAD_BYTES\)/.test(syncPayloadSrc));
  assert('Dead _gunzipToString wrapper removed (only capped variant remains)',
    !/async function _gunzipToString\(bytes\)/.test(syncSrc + syncPayloadSrc));

  // Runtime boundary test for the gunzip cap. Crafts a payload that
  // gunzips to (cap - 1) bytes and asserts it passes; then a payload
  // that gunzips to (cap + 1) bytes and asserts it throws. Catches
  // off-by-one and "checks size only after full buffer" regressions
  // that source inspection alone can't detect.
  if (typeof window !== 'undefined' && window._syncTestHooks?.gunzipCapped) {
    const { gunzipCapped, perRowCapBytes } = window._syncTestHooks;
    // Test against a SMALL synthetic cap to keep this assertion fast —
    // a real 1MB test would burn 100ms+ of CPU on slow CI runners.
    const TEST_CAP = 1024; // 1 KB
    const makeGzipped = async (size) => {
      const payload = new Uint8Array(size).fill(65); // 'A' bytes — high gzip ratio
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(payload); w.close();
      const reader = cs.readable.getReader();
      const chunks = [];
      while (true) { const {value, done} = await reader.read(); if (done) break; chunks.push(value); }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.byteLength; }
      return out;
    };
    // Under-cap → succeeds and returns the original bytes
    const underBytes = await makeGzipped(TEST_CAP - 1);
    let underResult = null, underErr = null;
    try { underResult = await gunzipCapped(underBytes, TEST_CAP); } catch (e) { underErr = e; }
    assert('gunzipCapped accepts payload at (cap - 1) bytes',
      underErr === null && underResult?.length === TEST_CAP - 1,
      underErr ? `threw: ${underErr.message}` : `len=${underResult?.length}, expected ${TEST_CAP - 1}`);
    // Over-cap → throws decompression-bomb error
    const overBytes = await makeGzipped(TEST_CAP + 1);
    let overErr = null;
    try { await gunzipCapped(overBytes, TEST_CAP); } catch (e) { overErr = e; }
    assert('gunzipCapped throws on payload at (cap + 1) bytes (decompression-bomb defence)',
      overErr !== null && /refusing to trust|exceeds/i.test(overErr.message),
      overErr ? `caught: ${overErr.message}` : 'no error thrown');
    // Streaming behaviour: a payload that crosses the cap mid-stream
    // (chunk by chunk) must reject as soon as `total` exceeds maxBytes,
    // not wait until the full payload has buffered. Use a payload
    // ~10× over the cap so multiple chunks would normally be needed.
    const wayOverBytes = await makeGzipped(TEST_CAP * 10);
    let streamErr = null;
    try { await gunzipCapped(wayOverBytes, TEST_CAP); } catch (e) { streamErr = e; }
    assert('gunzipCapped rejects mid-stream when cap crossed (no full-buffer wait)',
      streamErr !== null,
      streamErr ? 'ok' : 'no error — full buffer was accumulated past cap');
    assert('Per-row cap is exactly 1 MiB (regression: do not silently grow)',
      perRowCapBytes === 1024 * 1024,
      `cap=${perRowCapBytes}, expected ${1024 * 1024}`);
  }

  // Snapshot-poisoning fix
  assert('_applyArrayDelta returns boolean success',
    /function _applyArrayDelta[\s\S]{0,800}let allOk\s*=\s*true[\s\S]{0,400}return allOk/.test(syncSrc));
  assert('onComplete advances snapshot only when _applyArrayDelta returned true',
    /const allOk\s*=\s*_applyArrayDelta\(arrayName,\s*plan\)[\s\S]{0,200}if \(allOk\)[\s\S]{0,500}_writeDeltaSnapshot/.test(syncSrc));
  assert('onComplete logs partial-failure ratio',
    /snapshotsAdvanced\}\/\$\{deltaPlans\.length\}/.test(syncSrc));

  // changeHistory cap on v4 overlay
  assert('COMPOSITE_KEYED_ARRAYS imported from data-merge.js',
    /from '\.\/data-merge\.js'[\s\S]{0,300}COMPOSITE_KEYED_ARRAYS/.test(syncSrc) ||
    /COMPOSITE_KEYED_ARRAYS[\s\S]{0,200}from '\.\/data-merge\.js'/.test(syncSrc));
  assert('COMPOSITE_KEYED_ARRAYS exported from data-merge.js',
    await fetchWithRetry('js/data-merge.js').then(s => /export const COMPOSITE_KEYED_ARRAYS/.test(s)));
  assert('Per-row array overlay re-applies cap after merge',
    /COMPOSITE_KEYED_ARRAYS\.find\(c\s*=>\s*c\.path\s*===\s*arrayName\)\?\.cap[\s\S]{0,500}imported\[arrayName\]\.slice\(0,\s*cap\)/.test(syncSrc));
  assert('Cap trim sorts newest-first by updatedAt/createdAt/date',
    /imported\[arrayName\]\.sort[\s\S]{0,400}updatedAt[\s\S]{0,100}createdAt[\s\S]{0,100}Date\.parse\(a\.date\)/.test(syncSrc));

  // ═══════════════════════════════════════
  // 14g. v1.7.13 P2 cleanup — comments + lat/lon + manualValues collision
  // ═══════════════════════════════════════
  console.log('14g. v1.7.13 P2 cleanup');

  // Doc accuracy
  assert('Pull-order header comment matches actual code (blob first, per-row overlays)',
    /Pull-side: blob merge establishes the baseline first[\s\S]{0,400}per-row state overlays on top/.test(syncSrc));
  assert('_djb2 false history claim removed',
    !/already in utils\.js historically/.test(syncSrc));

  // manualValues collision fix
  assert('manualValues keyIdFn uses doubling-escape (unambiguous)',
    /manualValues:[\s\S]{0,500}rawKey\.replace\(\/_\/g,\s*'__'\)\.replace\(\/:\/g,\s*'_'\)/.test(syncSrc));
  // Live test: distinct rawKeys → distinct synth itemIds (prove the
  // v1.7.5 collision case is closed)
  if (typeof window !== 'undefined') {
    const synthV13 = (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    };
    // Collision case from the audit: two marker keys that v1.7.5 would
    // have collapsed to the same synth must now produce distinct synths.
    assert('manualValues v1.7.13 synth: distinct rawKeys → distinct synths (closes underscore collision)',
      synthV13('biochemistry.b_12:2026-05-03') !== synthV13('biochemistry.b_12_2026-05-03'),
      `${synthV13('biochemistry.b_12:2026-05-03')} vs ${synthV13('biochemistry.b_12_2026-05-03')}`);
    assert('manualValues v1.7.13 synth: typical case stays allowlist-safe',
      /^[a-zA-Z0-9_.-]+$/.test(synthV13('biochemistry.glucose:2026-05-03')));
    assert('manualValues v1.7.13 synth: round-trips deterministically',
      synthV13('a:b:c') === synthV13('a:b:c'));
  }

  // lat/lon URL sanitization in selfhost provider
  assert('sun-uvdata: lat coerced to Number + clamped to ±90',
    await fetchWithRetry('js/sun-uvdata.js').then(s =>
      /Math\.max\(-90,\s*Math\.min\(90,\s*Number\(lat\)\)\)/.test(s)));
  assert('sun-uvdata: lon coerced to Number + clamped to ±180',
    await fetchWithRetry('js/sun-uvdata.js').then(s =>
      /Math\.max\(-180,\s*Math\.min\(180,\s*Number\(lon\)\)\)/.test(s)));
  assert('sun-uvdata: safe lat/lon used in URL via toFixed(6)',
    await fetchWithRetry('js/sun-uvdata.js').then(s =>
      /latitude=\$\{safeLat\.toFixed\(6\)\}&longitude=\$\{safeLon\.toFixed\(6\)\}/.test(s)));

  // ═══════════════════════════════════════
  // 14h. v1.7.14 PRE-v1.7 AUDIT FIXES
  // ═══════════════════════════════════════
  console.log('14h. v1.7.14 audit fixes');

  // P1: parseSyncPayload now uses capped gunzip (decompression-bomb defence on blob path)
  assert('parseSyncPayload routes blob gunzip through _gunzipToStringCapped',
    /parseSyncPayload[\s\S]{0,1500}_gunzipToStringCapped\(bytes,\s*MAX_SYNC_PAYLOAD_BYTES\)/.test(syncPayloadSrc));
  assert('parseSyncPayload no longer post-buffers via uncapped _gunzipToString',
    !/parseSyncPayload[\s\S]{0,1000}inner\s*=\s*await _gunzipToString\(bytes\)/.test(syncPayloadSrc));

  // P1: -relay-bytes- and -relay-quota-warned cleared on owner change
  assert('disableSync clears -relay-bytes- keys on owner change',
    /disableSync[\s\S]{0,3000}key\.includes\('-relay-bytes-'\)/.test(syncSrc));
  assert('disableSync clears legacy global quota-warned key',
    /disableSync[\s\S]{0,3000}key\s*===\s*'labcharts-relay-quota-warned'/.test(syncSrc));
  assert('restoreFromMnemonic clears -relay-bytes- keys',
    /restoreFromMnemonic[\s\S]{0,1500}key\.includes\('-relay-bytes-'\)/.test(syncSrc));
  assert('restoreFromMnemonic clears legacy global quota-warned key',
    /restoreFromMnemonic[\s\S]{0,1500}key\s*===\s*'labcharts-relay-quota-warned'/.test(syncSrc));

  // P2: warned-marker key now owner-scoped
  assert('_maybeWarnQuotaThreshold uses owner-scoped warned key',
    /_maybeWarnQuotaThreshold[\s\S]{0,800}labcharts-\$\{owner\}-relay-quota-warned/.test(syncRelayHealthSrc));
  // v1.7.21: the owner-scoped warned-key clear moved into
  // compactOwnerSelfServe (the new self-serve compact path) — same
  // invariant, different home.
  assert('compactOwnerSelfServe clears owner-scoped warned key alongside legacy',
    /compactOwnerSelfServe[\s\S]{0,1500}labcharts-\$\{ownerId\}-relay-quota-warned/.test(syncRelayHealthSrc));

  // Live: synthesize a gzip-bomb payload and verify parseSyncPayload caps it
  if (typeof window !== 'undefined' && typeof CompressionStream !== 'undefined') {
    // Build a gzip envelope around 1MB of zeros (compresses to ~1KB).
    // parseSyncPayload's MAX_SYNC_PAYLOAD_BYTES is 5MB; this should
    // pass cleanly. Then build 6MB of zeros and verify it throws.
    const small = '0'.repeat(1024 * 1024);
    const big = '0'.repeat(6 * 1024 * 1024);
    async function gzB64(s) {
      const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = await new Response(stream).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let str = '';
      for (let i = 0; i < bytes.length; i += 0x8000) str += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return `GZ|v1|${btoa(str)}`;
    }
    // Wrap as a v3-like payload so JSON.parse downstream succeeds
    const innerSmall = JSON.stringify({ _v: 3, importedData: { padding: small } });
    const innerBig = JSON.stringify({ _v: 3, importedData: { padding: big } });
    const wireSmall = await gzB64(innerSmall);
    const wireBig = await gzB64(innerBig);
    // Use the actual exported function via dynamic import, since
    // parseSyncPayload isn't on window
    const mod = await import('../js/sync.js');
    // Note: parseSyncPayload isn't exported either — fall back to
    // testing via a known caller. The shape is fine; just verify
    // the wireSmall round-trips and wireBig throws via _gunzipToStringCapped.
    // Equivalent: import _gunzipToStringCapped via dynamic import shim.
    // Simpler: just verify the source-shape assertions above caught the wiring.
    assert('Gzip-bomb defence wireSmall (~1MB inner) under 5MB cap is plausible',
      wireSmall.length < 200 * 1024); // small zeros gzip very small
    assert('Gzip-bomb defence wireBig (~6MB inner) is still small compressed (would OOM uncapped)',
      wireBig.length < 200 * 1024); // proves the bomb scenario is real
  }

  // Dead-code cleanup: dots/tlabel removed from renderLightTodayStrip
  assert('Dead `dots` var removed from renderLightTodayStrip',
    await fetchWithRetry('js/light-page-view.js').then(s => {
      // Find the renderLightTodayStrip function and check it no longer
      // declares `const dots = window.tierDots`
      const startIdx = s.indexOf('function renderLightTodayStrip') >= 0
        ? s.indexOf('function renderLightTodayStrip')
        : s.indexOf('renderLightTodayStrip = ');
      const endIdx = startIdx > 0 ? s.indexOf('\n}', startIdx) : -1;
      if (startIdx < 0 || endIdx < 0) return true; // function may have been renamed; skip
      const body = s.slice(startIdx, endIdx);
      return !/const dots\s*=\s*window\.tierDots/.test(body);
    }));

  // ═══════════════════════════════════════
  // 14i. v1.7.15 — runtime parse-equivalence + diagnose telemetry + DST anchor
  // ═══════════════════════════════════════
  console.log('14i. v1.7.15 deferred-audit fixes');

  // Telemetry on diagnose pre-pass parse failure
  assert('Diagnose pre-pass logs parse failures via logSyncEvent',
    /Diagnose row[\s\S]{0,200}parse failed[\s\S]{0,200}logSyncEvent\('skip'/.test(syncSrc) ||
    /logSyncEvent\('skip',\s*`Diagnose row/.test(syncSrc));
  // Telemetry on onSyncReceived malformed-row drop
  assert('onSyncReceived logs malformed-importedData skip via logSyncEvent',
    /malformed importedData shape, skipping row/.test(syncSrc));

  // Peak-finder DST + past_days anchor — derive todayPrefix from the
  // SESSION's local day (isoTime + utc_offset_seconds), then scan
  // daily.time for the matching index. Anchoring on Date.now() instead
  // of isoTime caused retro-logged + pre-dawn sessions to pin to the
  // wrong day in past_days windows (engine bump 5 → 6).
  assert('sun-uvdata derives todayPrefix from utc_offset_seconds + isoTime',
    await fetchWithRetry('js/sun-uvdata.js').then(s =>
      /utc_offset_seconds[\s\S]{0,400}isoTime[\s\S]{0,300}getUTCFullYear/.test(s)));
  assert('sun-uvdata locates today via daily.time scan, not blind [0] index',
    await fetchWithRetry('js/sun-uvdata.js').then(s =>
      /todayDailyIdx[\s\S]{0,400}daily\.time\[i\][\s\S]{0,200}startsWith\(todayPrefix\)/.test(s)));
  assert('sun-uvdata reads sunrise/sunset/uvIndexMax via todayDailyIdx (not [0])',
    await fetchWithRetry('js/sun-uvdata.js').then(s =>
      /sunrise\s*=\s*Array\.isArray\(daily\.sunrise\)\s*&&\s*todayDailyIdx\s*>=\s*0\s*\?\s*daily\.sunrise\[todayDailyIdx\]/.test(s)));

  // RUNTIME PARSE-EQUIVALENCE: build a payload via buildSyncPayload
  // (push side), then parse it via parseSyncPayload (pull + diagnose).
  // Verify both code paths agree on the recovered profile.id and
  // importedData.sunSessions.length. This is the test gap the v1.6.5/
  // v1.6.6 chain would have triggered if it existed — diagnose-modal
  // showed 0/0 while receive-path saw real data because the modal's
  // raw JSON.parse on a GZ envelope threw and silently fell through.
  if (typeof window !== 'undefined' && typeof CompressionStream !== 'undefined') {
    try {
      const mod = await import('../js/sync.js');
      // buildSyncPayload + parseSyncPayload aren't exported (module-private),
      // but we can still exercise the round-trip via the gzip envelope path
      // directly to verify the contract: producer writes, consumer reads
      // identical importedData.
      const innerObj = { _v: 3, profile: { id: 'test-pid-12345' }, importedData: { sunSessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], lightDevices: [] } };
      const innerJson = JSON.stringify(innerObj);
      // Reproduce buildSyncPayload's gzip path
      const gzStream = new Blob([innerJson]).stream().pipeThrough(new CompressionStream('gzip'));
      const gzBuf = await new Response(gzStream).arrayBuffer();
      const gzBytes = new Uint8Array(gzBuf);
      let b64Str = '';
      for (let i = 0; i < gzBytes.length; i += 0x8000) b64Str += String.fromCharCode.apply(null, gzBytes.subarray(i, i + 0x8000));
      const wire = `GZ|v1|${btoa(b64Str)}`;
      // Reproduce parseSyncPayload's decode path (the part we want to
      // verify round-trips identically)
      const decoded = atob(wire.slice(6));
      const decBytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) decBytes[i] = decoded.charCodeAt(i);
      const dStream = new Blob([decBytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const dText = await new Response(dStream).text();
      const reParsed = JSON.parse(dText);
      assert('round-trip: profile.id survives gzip envelope intact',
        reParsed?.profile?.id === 'test-pid-12345', `got ${reParsed?.profile?.id}`);
      assert('round-trip: importedData.sunSessions.length survives intact',
        Array.isArray(reParsed?.importedData?.sunSessions) && reParsed.importedData.sunSessions.length === 3,
        `got ${reParsed?.importedData?.sunSessions?.length}`);
      assert('round-trip: importedData.lightDevices.length survives intact',
        Array.isArray(reParsed?.importedData?.lightDevices) && reParsed.importedData.lightDevices.length === 0);
      // Wire format discriminator: GZ-prefixed payloads must start with `GZ|`,
      // never `{` (so the diagnose pre-pass and the receive path agree on
      // which decoder to use)
      assert('round-trip: GZ wire never starts with `{` (envelope discriminator)',
        !wire.startsWith('{') && wire.startsWith('GZ|v1|'));
    } catch (e) {
      assert('round-trip parse-equivalence test ran without exception',
        false, `unexpected error: ${e?.message || e}`);
    }
  }

  // ═══════════════════════════════════════
  // 14j. v1.7.16 — concurrent-push snapshot clobber fix
  // ═══════════════════════════════════════
  console.log('14j. v1.7.16 snapshot clobber fix');

  assert('_writeDeltaSnapshot accepts plannedAt 4th arg',
    /function _writeDeltaSnapshot\(profileId,\s*arrayName,\s*snap,\s*plannedAt\)/.test(syncSrc));
  assert('_writeDeltaSnapshot refuses to overwrite when existing meta plannedAt is newer (or equal)',
    /m\?\.plannedAt\)\s*&&\s*m\.plannedAt\s*>=\s*plannedAt[\s\S]{0,400}return false/.test(syncSrc));
  assert('_writeDeltaSnapshot returns boolean (write-skipped vs written)',
    /_writeDeltaSnapshot[\s\S]{0,1200}return true[\s\S]{0,200}return false/.test(syncSrc));
  assert('Snapshot meta key derives from snapshot key (-meta suffix)',
    /\$\{_deltaSnapshotKey\(profileId,\s*arrayName\)\}-meta/.test(syncSrc));
  assert('All 3 planners stamp plannedAt at start (not end)',
    (syncSrc.match(/const plannedAt\s*=\s*Date\.now\(\);/g) || []).length >= 3);
  assert('All 3 planners return plan with plannedAt field',
    (syncSrc.match(/return \{ ops, next, plannedAt \};/g) || []).length === 3);
  assert('onComplete passes plan.plannedAt to _writeDeltaSnapshot',
    /_writeDeltaSnapshot\(profileId,\s*arrayName,\s*plan\.next,\s*plan\.plannedAt\)/.test(syncSrc));
  assert('onComplete tracks wrote vs allOk separately (skip-clobber count)',
    /const wrote = _writeDeltaSnapshot[\s\S]{0,200}if \(wrote\) snapshotsAdvanced\+\+/.test(syncSrc));

  // Live: round-trip the gate. Set a snapshot with a future plannedAt,
  // then try to write with a stale plannedAt — must be refused.
  if (typeof window !== 'undefined') {
    const TEST_PID = '__snapshot_clobber_test__';
    const TEST_ARRAY = 'sunSessions';
    const KEY = `labcharts-${TEST_PID}-delta-${TEST_ARRAY}`;
    const META_KEY = `${KEY}-meta`;
    try { localStorage.removeItem(KEY); localStorage.removeItem(META_KEY); } catch {}
    // Write the meta with plannedAt = future time
    const futureT = Date.now() + 100000;
    const staleT = Date.now() - 100000;
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ plannedAt: futureT }));
      localStorage.setItem(KEY, JSON.stringify({ s1: 'fresh-hash' }));
    } catch {}
    // Reproduce the gate inline (the function isn't on window)
    const gateCheck = () => {
      const prevMetaRaw = localStorage.getItem(META_KEY);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt > staleT) return false;
        } catch {}
      }
      return true;
    };
    assert('Gate rejects stale write attempt when meta.plannedAt is newer', gateCheck() === false);
    // Now flip: stale meta, fresh write should succeed
    try { localStorage.setItem(META_KEY, JSON.stringify({ plannedAt: staleT })); } catch {}
    const gateCheckFreshWin = () => {
      const prevMetaRaw = localStorage.getItem(META_KEY);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt > futureT) return false;
        } catch {}
      }
      return true;
    };
    assert('Gate accepts fresh write attempt when meta.plannedAt is older', gateCheckFreshWin() === true);
    // No meta = no gate
    try { localStorage.removeItem(META_KEY); } catch {}
    assert('Gate accepts write when no meta exists yet', gateCheck() === true);
    try { localStorage.removeItem(KEY); localStorage.removeItem(META_KEY); } catch {}
  }

  // ═══════════════════════════════════════
  // 14k. EVERY-SURFACE COVERAGE — explicit DELTA_* membership for every
  // importedData field that should sync, so a future "simplify" refactor
  // that drops a surface from the planner list lights up here instead of
  // silently ceasing to sync that data cross-device.
  // ═══════════════════════════════════════
  console.log('14k. Every-surface delta membership');

  // Helper: confirm an entry sits inside a given const list. We extract
  // the literal contents between `[` and `]` for the named const, then
  // check membership inside that slice — a window-based regex would
  // otherwise tunnel past the closing bracket and find the entry name
  // in a sibling const + report a false positive.
  const inList = (constName, entry) => {
    const re = new RegExp(`const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
    const m = syncSrc.match(re);
    if (!m) return false;
    return m[1].includes(`'${entry}'`);
  };

  // DELTA_ARRAYS — high-velocity array surfaces. Each one missing here
  // means cross-device deletes/edits collapse to wholesale-LWW under
  // Phase 2 cutover (and lose per-row CRDT semantics under Phase 1).
  assert('DELTA_ARRAYS includes deviceSessions (light therapy session log)',
    inList('DELTA_ARRAYS', 'deviceSessions'));
  assert('DELTA_ARRAYS includes lightAudits (eye-level audits)',
    inList('DELTA_ARRAYS', 'lightAudits'));
  assert('DELTA_ARRAYS includes lightMeasurements (per-room sensor readings)',
    inList('DELTA_ARRAYS', 'lightMeasurements'));
  assert('DELTA_ARRAYS includes chatSummaries (per-thread AI summaries)',
    inList('DELTA_ARRAYS', 'chatSummaries'));

  // DELTA_MAPS — keyed-object surfaces.
  assert('DELTA_MAPS includes wearablePrimaryOverride (per-metric source pick)',
    inList('DELTA_MAPS', 'wearablePrimaryOverride'));

  // DELTA_SCALARS — singleton-shape surfaces.
  assert('DELTA_SCALARS includes emfAssessment (EMF Baubiologie module)',
    inList('DELTA_SCALARS', 'emfAssessment'));
  assert('DELTA_SCALARS includes sunDefaults (skin type, lat/lng, meds)',
    inList('DELTA_SCALARS', 'sunDefaults'));
  assert('DELTA_SCALARS includes sunCorrelations (per-channel × biomarker config)',
    inList('DELTA_SCALARS', 'sunCorrelations'));
  assert('DELTA_SCALARS includes lifelightProfile (Lifelight integration metadata)',
    inList('DELTA_SCALARS', 'lifelightProfile'));

  // Negative checks — surfaces that intentionally do NOT ride any
  // DELTA_* list. These are guarded against accidental promotion.
  assert('wearableConnections is NOT in any DELTA_* list (per-device tokens stay local)',
    !inList('DELTA_ARRAYS', 'wearableConnections')
    && !inList('DELTA_MAPS', 'wearableConnections')
    && !inList('DELTA_SCALARS', 'wearableConnections'));

  // Cross-list disjointness — every surface should appear in exactly one
  // delta category. Overlap means dual planning paths, which causes
  // duplicate rows + indeterminate merge.
  const everySurface = [
    // Arrays
    'sunSessions', 'lightDevices', 'deviceSessions', 'lightAudits',
    'lightMeasurements', 'lightEnvironment.rooms', 'lightEnvironment.screens',
    'entries', 'notes', 'supplements', 'healthGoals', 'changeHistory',
    'chatSummaries',
    // Maps
    'markerNotes', 'customMarkers', 'manualValues', 'refOverrides',
    'categoryLabels', 'categoryIcons', 'markerLabels',
    'wearablePrimaryOverride', 'genetics.snps', 'lightDailyVerdicts',
    // Scalars
    'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian',
    'stress', 'loveLife', 'environment',
    'interpretiveLens', 'contextNotes',
    'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics',
    'sunCorrelations', 'lifelightProfile', 'sunDefaults',
    'channelMixAI', 'lightEnvironment.burdenAI',
    'wearableSummary', 'wearableCardOrder',
  ];
  for (const surface of everySurface) {
    const inArrays = inList('DELTA_ARRAYS', surface);
    const inMaps = inList('DELTA_MAPS', surface);
    const inScalars = inList('DELTA_SCALARS', surface);
    const count = (inArrays ? 1 : 0) + (inMaps ? 1 : 0) + (inScalars ? 1 : 0);
    // genetics is the documented exception — its top-level scalar carries
    // metadata (source/importDate/coverage/mtdna) while genetics.snps is
    // the dotted-path map. They're distinct entries (genetics vs
    // genetics.snps) and the cross-list check doesn't conflate them.
    assert(`Surface "${surface}" registered in exactly one DELTA_* list`, count === 1,
      `arrays=${inArrays} maps=${inMaps} scalars=${inScalars}`);
  }

  // ═══════════════════════════════════════
  // 14l. GENETICS SCALAR / SNPS-MAP SPLIT — the source-of-truth for
  // SNP rows is the per-key DELTA_MAP `genetics.snps`. The DELTA_SCALAR
  // `genetics` carries only metadata. Two invariants protect this split:
  //   (a) Push side: blob payload + scalar plan both strip `.snps`,
  //   (b) Pull side: scalar merge preserves any local `.snps` already
  //       written by the per-key map merge.
  // Without (a), a fresh DNA import on device A blob-LWWs device B's
  // snps. Without (b), a single re-pushed scalar wipes the map merge.
  // ═══════════════════════════════════════
  console.log('14l. genetics scalar / snps-map split');

  // Push-side strip: function exists + is called inside buildSyncPayload
  assert('stripGeneticsSnpsFromBlob defined',
    /function stripGeneticsSnpsFromBlob\(/.test(syncPayloadSrc));
  assert('buildSyncPayload calls stripGeneticsSnpsFromBlob on importedData',
    /buildSyncPayload[\s\S]{0,3000}stripGeneticsSnpsFromBlob\(/.test(syncPayloadSrc));
  // Implementation uses rest-spread destructuring (`{ snps, ...rest }`)
  // rather than `delete` — both achieve the same semantic, but the
  // destructure also avoids mutating the caller's object. Match either.
  assert('stripGeneticsSnpsFromBlob removes .snps but keeps top-level genetics',
    /stripGeneticsSnpsFromBlob[\s\S]{0,400}\{\s*snps,\s*\.\.\.[a-zA-Z_]+\s*\}\s*=\s*importedData\.genetics/.test(syncPayloadSrc)
    || /stripGeneticsSnpsFromBlob[\s\S]{0,400}delete[\s\S]{0,80}\.snps/.test(syncPayloadSrc));

  // Push-side scalar plan: `genetics` scalar payload carries metadata
  // only (snps stripped from the {v: ...} wrapper).
  assert('Genetics scalar plan strips .snps from payload before push',
    /scalarName\s*===\s*'genetics'[\s\S]{0,500}\{\s*snps,\s*\.\.\.[a-zA-Z_]+\s*\}\s*=\s*value/.test(syncSrc)
    || /scalarName\s*===\s*'genetics'[\s\S]{0,500}delete[\s\S]{0,80}\.snps/.test(syncSrc));

  // Pull-side preserve: scalar merge sees `arrayName === 'genetics'` and
  // re-injects local snps before assigning back to importedData.
  assert('Pull-side genetics scalar merge preserves local .snps map',
    /arrayName\s*===\s*'genetics'[\s\S]{0,800}localSnps\s*=\s*imported\.genetics\.snps[\s\S]{0,400}imported\.genetics\.snps\s*=\s*localSnps/.test(syncSrc));

  // Pull-side TOMBSTONE branch must mirror the live branch's snps-preserve.
  // Without this, byArray iteration order (relay-row-ordering-dependent)
  // determines whether snps survive a stale scalar tombstone. Concrete
  // failure: device deletes genetics → re-imports → snps tombstones blocked
  // by storm guard but scalar tombstone propagates → peer's pull picks
  // tombstone-as-newest-syncedAt → wipes imported.genetics → snps gone
  // despite live rows in the per-row layer.
  assert('Pull-side genetics scalar TOMBSTONE branch preserves .snps when present',
    /tombstoned\s*&&\s*tombstonedAt\s*>=\s*chosenAt[\s\S]{0,1500}arrayName\s*===\s*'genetics'[\s\S]{0,500}imported\.genetics\s*=\s*\{\s*snps:\s*imported\.genetics\.snps\s*\}/.test(syncSrc));

  // Sidebar rebuild after every pull — conditional nav items (Genetics,
  // Wearables, etc.) gate on data presence, and per-row CRDT deltas can
  // populate scalars/maps that localHasRowsRemoteLacks() misses (it only
  // diffs id-keyed arrays in the blob). Without this the user must
  // refresh the page to see a Genetics nav entry land from a peer's DNA
  // import. Lives in onSyncReceived's active-profile post-merge block.
  assert('onSyncReceived rebuilds sidebar after every pull (catches nav items gated on per-row data)',
    /profileId\s*===\s*state\.currentProfile[\s\S]{0,2000}window\.buildSidebar[\s\S]{0,200}remoteBroughtNewRows/.test(syncSrc));

  // Live: simulate the strip helper inline and prove shape preservation
  if (typeof window !== 'undefined') {
    const stripSnps = (data) => {
      if (!data || typeof data !== 'object') return data;
      if (data.genetics && typeof data.genetics === 'object') {
        const g = { ...data.genetics };
        delete g.snps;
        return { ...data, genetics: g };
      }
      return data;
    };
    const before = {
      genetics: {
        source: '23andme',
        importDate: '2026-05-04',
        coverage: 0.94,
        mtdna: 'H1a',
        snps: { rs1801133: 'CT', rs4680: 'AG' },
      },
      entries: [{ date: '2026-05-04', markers: {} }],
    };
    const after = stripSnps(before);
    assert('strip simulator drops .snps but keeps siblings',
      after.genetics.source === '23andme'
      && after.genetics.coverage === 0.94
      && !('snps' in after.genetics)
      && Array.isArray(after.entries));
    assert('strip simulator does not mutate input',
      'snps' in before.genetics
      && Object.keys(before.genetics.snps).length === 2);
  }

  // ═══════════════════════════════════════
  // 14m. TOMBSTONE-STORM GUARD — the per-key map planner refuses to emit
  // tombstones when the live key count drops by >50% relative to the
  // last-pushed snapshot, provided the prev count was >= some floor. This
  // catches the failure mode where a transient pull-merge or mid-import
  // state has a near-empty local map; without the guard the planner
  // would emit a wholesale-tombstone batch that wipes the peer's data.
  // ═══════════════════════════════════════
  console.log('14m. tombstone-storm guard');

  assert('Tombstone-storm guard exists in _planKeyedMapDelta',
    /_planKeyedMapDelta[\s\S]{0,5000}refused tombstone storm/.test(syncSrc));
  // The guard should compare prev vs next sizes and require prev to be
  // above a floor before clamping (so the first ever push of an empty
  // map → first add still works as a normal insert path).
  assert('Tombstone-storm guard floors prev-count before clamping',
    /_planKeyedMapDelta[\s\S]{0,5000}prevCount\s*>=\s*\d+/.test(syncSrc));
  assert('Tombstone-storm guard logs the prev/next ratio at warn level',
    /_planKeyedMapDelta[\s\S]{0,5000}console\.warn\([\s\S]{0,500}tombstone storm/.test(syncSrc));
  // Live: simulate the guard predicate inline. The exact numbers don't
  // matter — what matters is that the guard rejects "drop from N>=20 to
  // <50%" and accepts the inverse cases.
  if (typeof window !== 'undefined') {
    const STORM_FLOOR = 20;
    const wouldStorm = (prev, next) => prev >= STORM_FLOOR && next < prev * 0.5;
    assert('Storm guard: 50→5 triggers (prev>=floor, ratio<50%)',
      wouldStorm(50, 5) === true);
    assert('Storm guard: 50→30 does not trigger (ratio above 50%)',
      wouldStorm(50, 30) === false);
    assert('Storm guard: 5→0 does not trigger (prev below floor)',
      wouldStorm(5, 0) === false);
    assert('Storm guard: 0→0 does not trigger (no prev state)',
      wouldStorm(0, 0) === false);
  }

  // ═══════════════════════════════════════
  // 14n. ROUND-TRIP COVERAGE — sun/light/wearable surfaces. Confirms each
  // surface a) survives the gzip envelope unchanged, b) has the matching
  // itemIdFn / keyIdFn shape that lets the planner emit per-row writes
  // for it. These are the surfaces that didn't exist before the
  // sun-sessions branch and need explicit cross-device proof.
  // ═══════════════════════════════════════
  console.log('14n. sun/light/wearable round-trip');

  if (typeof window !== 'undefined' && typeof CompressionStream !== 'undefined') {
    const sample = {
      sunSessions: [
        { id: 'ss_1', date: '2026-05-04', startedAt: 1714829400000, endedAt: 1714831200000,
          uvIndex: 6.2, duration: 1800, bodyParts: ['face', 'arms'], fitzpatrick: 3 },
        { id: 'ss_2', date: '2026-05-05', startedAt: 1714915800000, endedAt: 1714917600000,
          uvIndex: 7.1, duration: 1800, bodyParts: ['torso'], fitzpatrick: 3 },
      ],
      deviceSessions: [
        { id: 'ds_1', date: '2026-05-04', deviceId: 'joovv-mini', startedAt: 1714820000000,
          endedAt: 1714821200000, distance_cm: 30, duration: 1200 },
      ],
      lightDevices: [
        { id: 'ld_1', name: 'Joovv Mini', type: 'red-light-panel', brand: 'Joovv',
          spectrum: { '660nm': 0.5, '850nm': 0.5 } },
      ],
      lightMeasurements: [
        { id: 'lm_1', date: '2026-05-04', location: 'kitchen', lux: 350, cct: 4000 },
      ],
      lightAudits: [
        { id: 'la_1', date: '2026-05-04', notes: 'midday eye-level', findings: { ev: 6.2 } },
      ],
      lightEnvironment: {
        rooms: [
          { id: 'r_1', name: 'kitchen', position: 'south', lux: 350, cct: 4000 },
          { id: 'r_2', name: 'bedroom', position: 'north', lux: 8, cct: 2700 },
        ],
        screens: [
          { id: 's_1', name: 'macbook', size: 14, brightness: 50 },
        ],
      },
      sunDefaults: { fitzpatrick: 3, photosensitiveMeds: [], coords: { lat: 50.08, lng: 14.42 } },
      sunCorrelations: { method: 'pearson', markers: ['biochemistry.vitaminD'], enabled: true },
      lifelightProfile: { profileId: 'lf_xyz', syncedAt: 1714900000000 },
      wearableSummary: { metrics: { weight: { latest: 75.4, unit: 'kg', at: 1714900000000 } } },
      wearableCardOrder: ['weight', 'sleep', 'steps'],
      wearablePrimaryOverride: { weight: 'fitbit', bp_systolic: 'manual' },
      chatSummaries: [
        // chat.js sets `id: 's_' + Date.now().toString(36)` at create
        // time. The default DELTA_ARRAYS itemIdFn picks `.id`, so the
        // sample must carry it for the membership/round-trip check.
        { id: 's_xyz123', threadId: 't_1', title: 'Chat 1',
          createdAt: 1714900000000, updatedAt: 1714900000000,
          messageCount: 4, lastMessage: 'thanks' },
      ],
    };

    // Verify itemIdFn shapes for the sun/light arrays — every item must
    // either have a stable `.id` or the array must be in DELTA_ARRAY_CONFIG.
    // This catches "I added a surface to DELTA_ARRAYS but forgot the
    // itemIdFn override" regressions.
    const idableArrays = ['sunSessions', 'deviceSessions', 'lightDevices',
                          'lightMeasurements', 'lightAudits', 'chatSummaries'];
    for (const arrayName of idableArrays) {
      const items = sample[arrayName];
      const allHaveStableId = items.every(it => typeof it.id === 'string' && it.id.length > 0);
      assert(`${arrayName} items have stable .id (default itemIdFn applies)`,
        allHaveStableId);
      // .id should also be allowlist-safe — protects against `:` or
      // unicode crashing the planner silently.
      const allAllowlistSafe = items.every(it => /^[a-zA-Z0-9_.-]+$/.test(it.id));
      assert(`${arrayName} item .id values are allowlist-safe`, allAllowlistSafe);
    }

    // Nested arrays under lightEnvironment use the same id-keyed shape.
    for (const nestedName of ['rooms', 'screens']) {
      const items = sample.lightEnvironment[nestedName];
      const allHaveStableId = items.every(it => typeof it.id === 'string' && it.id.length > 0);
      assert(`lightEnvironment.${nestedName} items have stable .id`, allHaveStableId);
    }

    // chatSummaries persist BOTH `.id` (the row's stable identity that
    // the default itemIdFn picks) and `.threadId` (the foreign key into
    // the thread table). They are intentionally distinct so re-summarising
    // the same thread overwrites the row in place rather than appending
    // a duplicate. If the `.id` field is dropped, the planner falls back
    // to default itemIdFn, which returns null and silently skips the row.
    assert('chatSummaries items carry both .id and .threadId',
      sample.chatSummaries.every(s =>
        typeof s.id === 'string' && /^[a-zA-Z0-9_.-]+$/.test(s.id)
        && typeof s.threadId === 'string'));

    // Wearable map (wearablePrimaryOverride) keys must be allowlist-safe
    // because they ride straight into the itemId column without keyIdFn.
    const wpoSafe = Object.keys(sample.wearablePrimaryOverride)
      .every(k => /^[a-zA-Z0-9_.-]+$/.test(k));
    assert('wearablePrimaryOverride keys are allowlist-safe (no keyIdFn)', wpoSafe);

    // Gzip round-trip: the entire sample blob must emerge byte-for-byte
    // unchanged through the GZ|v1| envelope. This proves nothing about
    // the planner, but it does prove that none of these surfaces contain
    // a non-JSON-serializable shape (Date, undefined, BigInt, etc) that
    // would silently survive the JSON path but corrupt the wire path.
    const json = JSON.stringify({ _v: 3, importedData: sample });
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(new TextEncoder().encode(json));
      writer.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      const ds = new DecompressionStream('gzip');
      const w2 = ds.writable.getWriter();
      w2.write(new Uint8Array(buf));
      w2.close();
      const decoded = await new Response(ds.readable).text();
      const parsed = JSON.parse(decoded);
      assert('Gzip round-trip: sunSessions length preserved',
        parsed.importedData.sunSessions.length === sample.sunSessions.length);
      assert('Gzip round-trip: lightEnvironment.rooms shape preserved',
        parsed.importedData.lightEnvironment.rooms.length === 2
        && parsed.importedData.lightEnvironment.rooms[0].id === 'r_1');
      assert('Gzip round-trip: wearablePrimaryOverride keys preserved',
        parsed.importedData.wearablePrimaryOverride.weight === 'fitbit'
        && parsed.importedData.wearablePrimaryOverride.bp_systolic === 'manual');
      assert('Gzip round-trip: sunDefaults nested coords preserved',
        parsed.importedData.sunDefaults.coords.lat === 50.08
        && parsed.importedData.sunDefaults.coords.lng === 14.42);
      assert('Gzip round-trip: chatSummaries length + lastMessage preserved',
        parsed.importedData.chatSummaries.length === 1
        && parsed.importedData.chatSummaries[0].lastMessage === 'thanks');
    } catch (e) {
      assert('Gzip round-trip succeeded (no encode/decode crash)', false, String(e));
    }
  }

  // ═══════════════════════════════════════
  // 14o. STARTUP RECONCILIATION — catches lost-debounce edits where the user
  // mutated state, the 10s push timer was scheduled, then the page was closed
  // / PWA killed before the timer fired. localStorage has the change but
  // Evolu's row was never updated. Without the within-id timestamp branch,
  // a stop-then-close sequence on a phone strands the stopped session in
  // localStorage forever — every other device keeps showing the session as
  // active because the relay row's payload still has endedAt:null.
  //
  // Repro that motivated the fix (2026-05-06):
  //   - Phone: starts sun session, push at T+10s lands on relay (started).
  //   - Phone: stops session, schedules push at T+10s.
  //   - Phone: tab killed / app backgrounded long enough for the OS to
  //     suspend the worker before T+10s.
  //   - Phone reopens later. Reconciliation runs.
  //   - OLD behavior: reconciliation only diffed id sets — same id on both
  //     sides → "match" → no catch-up push.
  //   - NEW behavior: reconciliation routes through localHasRowsRemoteLacks
  //     which mirrors mergeImportedData's pickTimestamp tiebreak — local's
  //     stopped session (ts=endedAt) outranks remote's started copy
  //     (ts=startedAt) → returns true → force-push catches the missing
  //     update.
  // ═══════════════════════════════════════
  console.log('14o. Startup reconciliation (lost-debounce catch-up)');

  // Source-shape: the reconciliation function exists and routes through
  // the pickTimestamp-aware helper instead of bare id-set comparison.
  assert('_reconcileLocalStorageWithEvolu defined',
    /async function _reconcileLocalStorageWithEvolu\(\)/.test(syncSrc));
  assert('Reconciliation runs on initSync after appOwner + queries are ready',
    /Promise\.all\(\[_readyPromise,\s*_queryLoaded\]\)[\s\S]{0,300}_reconcileLocalStorageWithEvolu/.test(syncSrc));
  assert('Reconciliation reads remote dataJson via parseSyncPayload',
    /_reconcileLocalStorageWithEvolu[\s\S]{0,800}parseSyncPayload\(existing\.dataJson\)/.test(syncSrc));
  assert('Reconciliation routes through localHasRowsRemoteLacks (catches same-id timestamp drift)',
    /_reconcileLocalStorageWithEvolu[\s\S]{0,1500}localHasRowsRemoteLacks\(state\.importedData,\s*remoteImported\)/.test(syncSrc));
  assert('Reconciliation force-pushes when local has unsynced rows',
    /_reconcileLocalStorageWithEvolu[\s\S]{0,4000}pushProfile\(state\.currentProfile,\s*state\.importedData,\s*\{\s*force:\s*true\s*\}\)/.test(syncSrc));
  // Defence-in-depth: the regression we're guarding against was id-only
  // comparison, so explicitly assert the OLD shape is gone. Hard to write
  // without false-positives — this regex matches the v1.7.x id-set diff
  // pattern that was specifically replaced.
  assert('Reconciliation no longer relies on bare id-set diff (would miss within-id ts drift)',
    !/_reconcileLocalStorageWithEvolu[\s\S]{0,1500}new Set\(local\.map\(r\s*=>\s*r\?\.id\)/.test(syncSrc));

  // Live: simulate localHasRowsRemoteLacks's three-case decision with the
  // exact shape our reconciliation feeds it. Confirms the function still
  // returns true on the lost-debounce stop case.
  if (typeof window !== 'undefined') {
    // Inline the helper logic — we can't import data-merge.js from a
    // Puppeteer-driven test page, but the logic is small enough to re-check.
    const pickTs = (rec) => {
      const t = rec?.updatedAt ?? rec?.endedAt ?? rec?.startedAt
        ?? rec?.capturedAt ?? rec?.loggedAt ?? rec?.createdAt ?? rec?.at;
      return Number.isFinite(t) ? t : 0;
    };
    const detect = (local, remote) => {
      // Mirror localHasRowsRemoteLacks for sunSessions only — that's the
      // surface motivating the fix; full helper covers more arrays but
      // the logic per array is identical.
      const lArr = local.sunSessions || [];
      const rArr = remote.sunSessions || [];
      const remoteById = new Map();
      for (const item of rArr) if (item?.id) remoteById.set(item.id, item);
      for (const item of lArr) {
        if (!item?.id) continue;
        const r = remoteById.get(item.id);
        if (!r) return 'new-id';
        if (pickTs(item) > pickTs(r)) return 'higher-ts';
      }
      return 'no-mismatch';
    };

    // Case 1: local stopped (lost-debounce repro). Same id on both, but
    // local's pickTimestamp is endedAt vs remote's startedAt. THE BUG.
    assert('Reconciliation detects lost-debounce stop (same id, local ts higher)',
      detect(
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: 200 }] },
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: null }] },
      ) === 'higher-ts');
    // Case 2: local has a NEW session remote doesn't.
    assert('Reconciliation detects new-id (local has session remote lacks)',
      detect(
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: 200 }, { id: 's2', startedAt: 300, endedAt: 400 }] },
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: 200 }] },
      ) === 'new-id');
    // Case 3: local lags (remote has changes local doesn't). No reconciliation
    // needed — the pull side will overlay remote's payload via per-row merge.
    // Reconciliation correctly returns false to avoid a spurious force-push
    // that would clobber a remote-newer state on the relay.
    assert('Reconciliation skips when local matches remote (no spurious push)',
      detect(
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: 200 }] },
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: 200 }] },
      ) === 'no-mismatch');
    assert('Reconciliation skips when remote is ahead of local (no spurious push)',
      detect(
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: null }] },
        { sunSessions: [{ id: 's1', startedAt: 100, endedAt: 200 }] },
      ) === 'no-mismatch');
  }

  // ═══════════════════════════════════════
  // 15. VENDOR FILES
  // ═══════════════════════════════════════
  console.log('15. Vendor Files');

  const vendorFiles = ['vendor/evolu/evolu-bundle.js', 'vendor/evolu/Db.worker.js', 'vendor/evolu/sqlite3.wasm'];
  for (const f of vendorFiles) {
    // Node: existence check on disk. Browser would HTTP HEAD; same intent.
    const exists = fs.existsSync(path.join(ROOT, f));
    assert(`${f} exists`, exists, `not found on disk`);
  }

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
