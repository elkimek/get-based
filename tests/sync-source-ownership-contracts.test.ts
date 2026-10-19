import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { syncChatSaveSourceContracts, syncHealthGoalsSourceContracts, syncPullEncryptionSourceContract } from './helpers/sync-push-source-contracts.js';

const chat = readFileSync('js/sync-save-hooks-core.js', 'utf8');
const goals = readFileSync('js/context-health-goals-view.js', 'utf8');
function change(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}

describe('maintained Sync source ownership contracts', () => {
  it('requires the actual debounce, latest-data read and bounded retry owner', () => {
    expect(syncChatSaveSourceContracts(chat)).toEqual({
      latestDataBeforeRetry: true, noOneShotPush: true, retryWhileSyncing: true,
    });
  });

  it('rejects a stale captured object in the debounced send', () => {
    const changed = change(chat, 'scheduleProfilePush(profileId, latest);\n    }, 10000)', 'scheduleProfilePush(profileId, data);\n    }, 10000)');
    expect(syncChatSaveSourceContracts(changed).latestDataBeforeRetry).toBe(false);
  });

  it('rejects bypassing the retry owner with a one-shot push', () => {
    const changed = change(chat, 'scheduleProfilePush(profileId, latest);\n    }, 10000)', '(0, syncSaveHooksDeps.pushProfile)(profileId, latest);\n    }, 10000)');
    const contract = syncChatSaveSourceContracts(changed);
    expect(contract.latestDataBeforeRetry).toBe(false);
    expect(contract.noOneShotPush).toBe(false);
  });

  it('rejects losing the syncing gate, retry budget or retry interval', () => {
    for (const [before, after] of [
      ['scheduleProfilePush(profileId, data, attempt + 1);', 'scheduleProfilePush(profileId, data, attempt);'],
      ['}, 1000);', '}, 1001);'],
      ['if (attempt < 60) {\n        const retry', 'if (attempt < 61) {\n        const retry'],
    ] as const) {
      expect(syncChatSaveSourceContracts(change(chat, before, after)).retryWhileSyncing).toBe(false);
    }
    const changed = chat.replaceAll('(0, syncSaveHooksDeps.isSyncing)()', 'false');
    expect(changed).not.toBe(chat);
    expect(syncChatSaveSourceContracts(changed).retryWhileSyncing).toBe(false);
  });

  it('requires the live goals-view sync subscription and draft-preserving refresh chain', () => {
    expect(syncHealthGoalsSourceContracts(goals)).toBe(true);
    const presentation = readFileSync('js/components/ContextHealthGoals.svelte', 'utf8');
    const draftPreservingRefresh = /export function refresh\(value: unknown\): void\s*\{\s*goals = value;\s*\}/;
    expect(presentation).toMatch(draftPreservingRefresh);
    expect(change(presentation, 'goals = value;', "goals = value; text = '';")).not.toMatch(draftPreservingRefresh);
    expect(syncHealthGoalsSourceContracts(change(goals, "'labcharts-sync-applied'", "'unrelated-event'"))).toBe(false);
    expect(syncHealthGoalsSourceContracts(change(goals, 'owned.session.current()', 'true'))).toBe(false);
    expect(syncHealthGoalsSourceContracts(change(goals, 'owned.component.refresh(owned.observed);', 'owned.component.report(owned.observed);'))).toBe(false);
    expect(syncHealthGoalsSourceContracts(change(goals, 'owned.observed = structuredClone(state.importedData.healthGoals);', 'owned.observed = [];'))).toBe(false);
  });
});


const pullMerge=readFileSync('js/sync-pull-merge.js','utf8');
it('requires both exact queued imported-profile encrypted reads, decode guards and encrypted committed write',()=>{
 expect(syncPullEncryptionSourceContract(pullMerge)).toBe(true);
});
it.each([
 ['capture foreign profile key',"encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true })","encryptedGetItem(profileStorageKey(profileId, 'foreign'), { throwOnDecryptError: true })"],
 ['capture decrypt fallback',"encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true })","encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: false })"],
 ['commit decrypt fallback','encryptedGetItem(localKey, { throwOnDecryptError: true })','encryptedGetItem(localKey, { throwOnDecryptError: false })'],
 ['foreign merge storage key',"const localKey = profileStorageKey(profileId, 'imported');","const localKey = profileStorageKey(profileId, 'foreign');"],
 ['commit foreign read key','encryptedGetItem(localKey, { throwOnDecryptError: true })',"encryptedGetItem('foreign-imported', { throwOnDecryptError: true })"],
 ['unawaited capture',"await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true })","encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true })"],
 ['unawaited commit','await encryptedGetItem(localKey, { throwOnDecryptError: true })','encryptedGetItem(localKey, { throwOnDecryptError: true })'],
 ['capture decode bypass','JSON.parse(rawStored)','{}'],
 ['commit decode bypass','JSON.parse(raw)','{}'],
 ['plaintext write','encryptedSetItem(localKey, JSON.stringify(committed))','localStorage.setItem(localKey, JSON.stringify(committed))'],
 ['foreign write key','encryptedSetItem(localKey, JSON.stringify(committed))',"encryptedSetItem('foreign-imported', JSON.stringify(committed))"],
] as const)('rejects actual Pull encryption ownership corruption: %s',(_name,before,after)=>{
 expect(syncPullEncryptionSourceContract(change(pullMerge,before,after))).toBe(false);
});


it.each(['capture','commit','write'] as const)('rejects an uncalled nested %s encryption decoy in place of actual queue work',owner=>{
 let changed=pullMerge;
 if(owner==='capture'){
  changed=change(changed,"const rawStored = await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true });",
   "async function unusedRead(){const rawStored = await encryptedGetItem(profileStorageKey(profileId, 'imported'), { throwOnDecryptError: true });return JSON.parse(rawStored);}");
  changed=change(changed,'stored: rawStored ? JSON.parse(rawStored) : null','stored: {}');
 }else if(owner==='commit'){
  changed=change(changed,'const raw = await encryptedGetItem(localKey, { throwOnDecryptError: true });',
   'async function unusedRead(){const raw = await encryptedGetItem(localKey, { throwOnDecryptError: true });return JSON.parse(raw);}');
  changed=change(changed,'const latest = raw ? JSON.parse(raw) : null;','const latest = {};');
 }else changed=change(changed,'await encryptedSetItem(localKey, JSON.stringify(committed));','async function unusedWrite(){await encryptedSetItem(localKey, JSON.stringify(committed));}');
 expect(syncPullEncryptionSourceContract(changed)).toBe(false);
});
