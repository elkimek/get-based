// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as data from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { createContextHubSession } from '../js/context-hub-session.js';
import { readContextHubSnapshot } from '../js/context-hub-data.js';
import { projectContextHub } from '../js/context-hub-model.js';
const profile = 'context-hub-owner', key = profileStorageKey(profile, 'imported');
const stored = async () => JSON.parse((await crypto.encryptedGetItem(key))!);
beforeEach(async () => {
  localStorage.clear(); localStorage.setItem('labcharts-active-profile', profile);
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.nutritionSummary = null;
  await crypto.encryptedRemoveItem(key); expect(await saveImportedData()).toBe(true);
});
afterEach(() => vi.restoreAllMocks());
it('projects every original source in order, disabled genome prerequisites and nutrition defaults', () => {
  const model = projectContextHub(readContextHubSnapshot());
  expect(model.sections.map(section => section.key)).toEqual(['profile', 'genome', 'labs', 'light-sun', 'body']);
  expect(model.sections.flatMap(section => section.rows).map(row => row.key)).toEqual(['insight-cards', 'supplements-meds', 'genome-summary', 'genome-priority', 'genome-lookup', 'lab-markers', 'light-sun', 'body-wearables', 'body-nutrition']);
  expect(model.sections[1]!.rows.every(row => row.disabled && !row.checked)).toBe(true);
  expect(model.nutritionDays).toBe(30); expect(model.grounding.map(card => card.key)).toEqual(['lens', 'kb']);
});
it('preserves specialty products, parent lab gating and literal names without mutating the snapshot', () => {
  const snapshot = readContextHubSnapshot(); snapshot.labOn = false;
  snapshot.labStats = { coreMarkers: 1, totalMarkers: 3, groups: [{ name: 'Fatty Acids', products: ['<Product> & panel'], sections: ['Original'], count: 2, enabled: true }] };
  snapshot.kbSet = true; snapshot.kbName = '<Library> & documents'; const before = structuredClone(snapshot);
  const model = projectContextHub(snapshot), row = model.sections[2]!.rows[1]!;
  expect(row).toMatchObject({ title: '<Product> & panel · Fatty Acids', group: 'Fatty Acids', checked: true, status: 'Prepared, but ignored while Blood marker results is off.' });
  expect(model.metrics[1]!.items).toContain(row.title); expect(model.grounding[1]!.subtitle).toContain(snapshot.kbName); expect(snapshot).toEqual(before);
});
for (const [control, slug] of [['insight-cards', 'insight-cards'], ['supplements-meds', 'supplements-meds'], ['lab-markers', 'lab-markers'], ['genome-summary', 'genetics-summary'], ['genome-priority', 'genetics-priority'], ['genome-lookup', 'genetics-inventory'], ['light-sun', 'light-sun'], ['body-wearables', 'wearables'], ['body-nutrition', 'meals-nutrition']] as const) it(`commits ${control} to its canonical profile source and local mirror`, async () => {
  expect(await createContextHubSession().save({ kind: 'toggle', key: control, checked: false })).toBe('saved');
  expect((await stored()).contextSourceSettings[slug]).toBe(false); expect(state.importedData.contextSourceSettings?.[slug]).toBe(false);
  expect(localStorage.getItem(`labcharts-${profile}-ai-ctx-${slug}`)).toBe('off'); expect((await stored()).changeHistory).toEqual([]);
  if (control === 'light-sun') expect((await stored()).biologyScoreContextSettings.includeLightContext).toBe(false);
  if (control === 'body-wearables') expect((await stored()).biologyScoreContextSettings.includeBodyContext).toBe(false);
});
it('keeps lab groups and all nutrition windows stable and rejects invalid controls without writes', async () => {
  const session = createContextHubSession();
  expect(await session.save({ kind: 'toggle', key: 'lab-group', group: 'Fatty Acids', checked: false })).toBe('saved');
  for (const days of [7, 90, 30]) { expect(await session.save({ kind: 'nutrition', days })).toBe('saved'); expect((await stored()).nutritionContextDays).toBe(days); }
  expect((await stored()).contextSourceSettings['lab-group-Fatty Acids']).toBe(false);
  const before = await stored();
  for (const mutation of [{ kind: 'toggle', key: 'unknown', checked: true }, { kind: 'toggle', key: 'constructor', checked: true }, { kind: 'toggle', key: '__proto__', checked: true }, { kind: 'toggle', key: 'lab-group', group: '', checked: true }, { kind: 'nutrition', days: 20 }] as const) expect(await session.save(mutation)).toBe('invalid');
  expect(await stored()).toEqual(before);
});
it('does not publish or mirror failed writes and supports an explicit retry', async () => {
  const before = await stored(), session = createContextHubSession();
  const writer = vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('Storage failed'));
  const intent = { kind: 'toggle', key: 'light-sun', checked: false } as const;
  expect(await session.save(intent)).toBe('failed'); expect(await stored()).toEqual(before);
  expect(state.importedData.contextSourceSettings?.['light-sun']).toBeUndefined(); expect(localStorage.getItem(`labcharts-${profile}-ai-ctx-light-sun`)).toBeNull();
  writer.mockRestore(); expect(await session.save(intent)).toBe('saved'); expect((await stored()).biologyScoreContextSettings.includeLightContext).toBe(false);
});
it('finishes an accepted pending write on its original profile and retires new actions', async () => {
  const origin = state.importedData, writer = crypto.encryptedSetItem;
  let release!: () => void, started!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), writing = new Promise<void>(resolve => { started = resolve; });
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => { started(); await held; return writer(...args); });
  const session = createContextHubSession(), pending = session.save({ kind: 'toggle', key: 'light-sun', checked: false }); await writing;
  expect(origin.contextSourceSettings?.['light-sun']).toBeUndefined(); expect(await session.save({ kind: 'nutrition', days: 7 })).toBe('busy');
  session.retire(); state.currentProfile = 'other-context-profile'; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', state.currentProfile);
  release(); expect(await pending).toBe('saved'); expect((await stored()).contextSourceSettings['light-sun']).toBe(false); expect(origin.contextSourceSettings?.['light-sun']).toBe(false);
  expect(state.importedData.contextSourceSettings?.['light-sun']).toBeUndefined(); expect(localStorage.getItem('labcharts-other-context-profile-ai-ctx-light-sun')).toBeNull();
  expect(await session.save({ kind: 'nutrition', days: 7 })).toBe('retired');
});
it('refreshes a conflicting peer setting, preserves unrelated drafts and requires explicit retry', async () => {
  const peer = await stored(); peer.contextSourceSettings = { 'supplements-meds': false }; peer.contextNotes = 'Peer notes'; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  state.importedData.stress = { note: 'Unsaved stress' };
  const session = createContextHubSession(), intent = { kind: 'toggle', key: 'light-sun', checked: false } as const;
  expect(await session.save(intent)).toBe('conflict'); expect(await stored()).toEqual(peer); expect(state.importedData.contextSourceSettings).toEqual(peer.contextSourceSettings); expect(state.importedData.stress).toEqual({ note: 'Unsaved stress' });
  expect(await session.save(intent)).toBe('saved'); const saved = await stored(); expect(saved.contextSourceSettings).toEqual({ 'supplements-meds': false, 'light-sun': false }); expect(saved.contextNotes).toBe('Peer notes'); expect(saved.stress).toBeNull();
});
it('atomically rejects a peer write between the settings read and commit', async () => {
  const reader = crypto.encryptedGetItem;
  vi.spyOn(crypto, 'encryptedGetItem').mockImplementationOnce(async (...args) => { const raw = await reader(...args); const peer = JSON.parse(raw!); peer.contextSourceSettings = { 'meals-nutrition': false }; await crypto.encryptedSetItem(key, JSON.stringify(peer)); return raw; });
  expect(await createContextHubSession().save({ kind: 'toggle', key: 'light-sun', checked: false })).toBe('failed');
  expect((await stored()).contextSourceSettings).toEqual({ 'meals-nutrition': false }); expect(state.importedData.contextSourceSettings?.['light-sun']).toBeUndefined();
});
it('migrates existing scoped and legacy source choices durably without activating new defaults', async () => {
  localStorage.setItem(`labcharts-${profile}-ai-ctx-insight-cards`, 'off'); localStorage.setItem('labcharts-ai-ctx-genetics-inventory', 'on'); localStorage.setItem('labcharts-ai-ctx-Fatty Acids', 'off');
  const session = createContextHubSession(); expect(await session.save({ kind: 'migrate' })).toBe('saved');
  expect((await stored()).contextSourceSettings).toEqual({ 'insight-cards': false, 'genetics-inventory': true, 'lab-group-Fatty Acids': false });
  expect(await session.save({ kind: 'migrate' })).toBe('unchanged');
});

it('publishes a committed setting when the optional local mirror is unavailable', async () => {
  const notify = vi.spyOn(data, 'notifyProfileDataContextChanged');
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === `labcharts-${profile}-ai-ctx-light-sun`) throw new Error('Local mirror unavailable');
    return write.call(this, key, value);
  });
  expect(await createContextHubSession().save({ kind: 'toggle', key: 'light-sun', checked: false })).toBe('saved');
  expect((await stored()).contextSourceSettings['light-sun']).toBe(false);
  expect(state.importedData.contextSourceSettings?.['light-sun']).toBe(false);
  expect(notify).toHaveBeenCalledWith(profile);
});

it('reads and migrates this tab profile choices when another tab changes the shared selection', async () => {
  localStorage.setItem(`labcharts-${profile}-ai-ctx-insight-cards`, 'off');
  localStorage.setItem(`labcharts-${profile}-ai-ctx-lab-group-Fatty Acids`, 'off');
  localStorage.setItem('labcharts-other-tab-ai-ctx-insight-cards', 'on');
  localStorage.setItem('labcharts-other-tab-ai-ctx-lab-group-Specialty Panel', 'on');
  localStorage.setItem('labcharts-active-profile', 'other-tab');
  expect(readContextHubSnapshot().insightOn).toBe(false);
  expect(await createContextHubSession().save({ kind: 'migrate' })).toBe('saved');
  expect((await stored()).contextSourceSettings).toEqual({ 'insight-cards': false, 'lab-group-Fatty Acids': false });
  expect(localStorage.getItem('labcharts-other-tab-ai-ctx-insight-cards')).toBe('on');
  expect(localStorage.getItem('labcharts-active-profile')).toBe('other-tab');
});
