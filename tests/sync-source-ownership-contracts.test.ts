import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { syncChatSaveSourceContracts, syncHealthGoalsSourceContracts } from './helpers/sync-push-source-contracts.js';

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
