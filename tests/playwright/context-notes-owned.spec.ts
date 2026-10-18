import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test('context notes persist to their origin and synchronize current catalogs through actual storage', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const results = await page.evaluate(async () => {
    const [{ state }, profile, data, writes, cards, store] = await Promise.all([
      import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/profile-data-writes.js'), import('/js/context-cards.js'), import('/js/crypto.js'),
    ]);
    localStorage.setItem('labcharts-ai-paused', 'true');
    const origin = 'context-notes-original', other = 'context-notes-current';
    const key = (id: string) => profile.profileStorageKey(id, 'imported');
    const read = async (id: string) => JSON.parse(await store.encryptedGetItem(key(id)) || '{}') as { contextNotes?: string; changeHistory?: { field: string; snapshot: string }[] };
    const waitFor = async (predicate: () => Promise<boolean> | boolean) => {
      for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(done => setTimeout(done, 25)); }
      throw new Error('Notes persistence did not settle');
    };
    const render = () => { const host = document.createElement('div'); host.innerHTML = cards.renderProfileContextCards(); document.body.append(host); return host; };
    const input = (host: HTMLElement, value: string) => { const field = host.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea')!; field.value = value; field.dispatchEvent(new InputEvent('input', { bubbles: true })); };
    const status = (host: HTMLElement) => host.querySelector('.ctx-notes-status')!.textContent;
    state.currentProfile = origin; state.importedData = profile.createDefaultProfileData(); writes.rememberProfileData(state.importedData);
    await store.encryptedSetItem(key(origin), JSON.stringify(state.importedData)); data.invalidateActiveDataCache();
    const original = render(); input(original, 'Origin <literal> & saved'); original.remove();
    state.currentProfile = other; state.importedData = profile.createDefaultProfileData(); state.importedData.contextNotes = 'Other profile'; writes.rememberProfileData(state.importedData);
    await store.encryptedSetItem(key(other), JSON.stringify(state.importedData)); data.invalidateActiveDataCache();
    const first = render(); await waitFor(async () => (await read(origin)).contextNotes === 'Origin <literal> & saved');
    const originStayedScoped = state.importedData.contextNotes === 'Other profile' && (await read(other)).contextNotes === 'Other profile' && status(first) === 'Saved as you type';
    const second = render();
    const field = second.querySelector<HTMLTextAreaElement>('textarea')!; field.focus(); field.setSelectionRange(0, 0);
    const uniqueLabels = first.querySelector('textarea')!.id !== field.id && second.querySelector<HTMLLabelElement>('label')!.htmlFor === field.id;
    input(second, 'Current shared draft');
    const ownsOriginalInput = second.querySelector('textarea') === field && document.activeElement === field;
    const viewsSyncImmediately = first.querySelector('textarea')!.value === 'Current shared draft' && status(first) === 'Saving…';
    await waitFor(() => status(first) === 'Saved' && status(second) === 'Saved');
    const committed = await read(other);
    input(second, 'Draft survives rerender'); first.remove(); second.remove(); const replacement = render();
    const draftSurvivedRerender = replacement.querySelector('textarea')!.value === 'Draft survives rerender';
    await waitFor(() => status(replacement) === 'Saved'); const final = await read(other);
    return { originStayedScoped, viewsSyncImmediately, uniqueLabels, ownsOriginalInput, currentStored: committed.contextNotes, draftSurvivedRerender, finalStored: final.contextNotes,
      historyStored: final.changeHistory?.some(entry => entry.field === 'contextNotes' && entry.snapshot === 'Draft survives rerender') };
  });
  expect(results).toEqual({ originStayedScoped: true, viewsSyncImmediately: true, uniqueLabels: true, ownsOriginalInput: true, currentStored: 'Current shared draft', draftSurvivedRerender: true, finalStored: 'Draft survives rerender', historyStored: true });
});

test('context notes recover real storage failures and review conflicting saved text safely', async ({ page }) => {
  await page.addInitScript({ path: axeScriptPath });
  await page.goto('/app', { waitUntil: 'load' });
  const results = await page.evaluate(async () => {
    const [{ state }, profile, writes, cards, store] = await Promise.all([
      import('/js/state.js'), import('/js/profile.js'), import('/js/profile-data-writes.js'), import('/js/context-cards.js'), import('/js/crypto.js'),
    ]);
    localStorage.setItem('labcharts-ai-paused', 'true');
    const id = 'context-notes-recovery', key = profile.profileStorageKey(id, 'imported');
    const read = async () => JSON.parse(await store.encryptedGetItem(key) || '{}') as typeof state.importedData;
    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(done => setTimeout(done, 25)); }
      throw new Error('Context notes recovery did not settle');
    };
    const render = () => { const host = document.createElement('div'); host.innerHTML = cards.renderProfileContextCards(); document.body.append(host); return host; };
    const input = (host: HTMLElement, value: string) => { const field = host.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea')!; field.value = value; field.dispatchEvent(new InputEvent('input', { bubbles: true })); };
    const status = (host: HTMLElement) => host.querySelector('.ctx-notes-status')!.textContent;
    state.currentProfile = id; state.importedData = profile.createDefaultProfileData(); state.importedData.contextNotes = 'Original saved';
    await store.encryptedSetItem(key, JSON.stringify(state.importedData)); writes.rememberProfileData(state.importedData);
    const originalPut = IDBObjectStore.prototype.put;
    let failOnce = true, writesCount = 0;
    IDBObjectStore.prototype.put = function(value, putKey) {
      if (putKey === key) {
        writesCount++;
        if (failOnce) { failOnce = false; throw new DOMException('Simulated profile storage quota', 'QuotaExceededError'); }
      }
      return originalPut.call(this, value, putKey);
    };
    try {
      const original = render(); input(original, 'Recover <literal> & draft'); await waitFor(() => status(original)?.startsWith('Not saved') === true);
      const failedDidNotWrite = (await read()).contextNotes === 'Original saved';
      original.remove(); state.importedData = await read(); writes.rememberProfileData(state.importedData); const recovered = render();
      const recoveredDraft = recovered.querySelector('textarea')!.value;
      recovered.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.click(); await waitFor(() => status(recovered) === 'Saved');
      const retryStored = (await read()).contextNotes;
      input(recovered, 'Local conflicting draft');
      const peer = await read(); peer.contextNotes = 'Newer saved <literal>'; await store.encryptedSetItem(key, JSON.stringify(peer));
      await waitFor(() => status(recovered)?.startsWith('Not saved') === true);
      const conflictVisible = !recovered.querySelector<HTMLElement>('.ctx-notes-conflict')!.hidden
        && recovered.querySelector('.ctx-notes-conflict-saved')!.textContent === 'Newer saved <literal>';
      const recovery = recovered.querySelector<HTMLElement>('.ctx-notes-section')!;
      const accessibility = await (window as unknown as { axe: typeof import('axe-core') }).axe.run(recovery, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      const recoveryWidth = recovery.getBoundingClientRect().width;
      const recoveryFits = recoveryWidth > 0 && recovery.scrollWidth <= recovery.clientWidth + 1;

      state.importedData.interpretiveLens = 'Unrelated unsaved lens'; const beforeKeep = writesCount;
      recovered.querySelector<HTMLButtonElement>('.ctx-notes-use-saved')!.click();
      const keepingSavedDoesNotWrite = writesCount === beforeKeep && state.importedData.contextNotes === 'Newer saved <literal>'
        && state.importedData.interpretiveLens === 'Unrelated unsaved lens';
      input(recovered, 'Explicit replacement draft');
      const newer = await read(); newer.contextNotes = 'Newest saved'; newer.notes.push({ date: '2026-10-07', text: 'Independent peer note' });
      await store.encryptedSetItem(key, JSON.stringify(newer)); await waitFor(() => status(recovered)?.startsWith('Not saved') === true);
      const reobserved = recovered.querySelector('.ctx-notes-conflict-saved')!.textContent;
      recovered.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.click(); await waitFor(() => status(recovered) === 'Saved');
      const final = await read();
      return { failedDidNotWrite, recoveredDraft, retryStored, conflictVisible, keepingSavedDoesNotWrite, reobserved,
        recoveryFits, accessibility: accessibility.violations.map(item => item.id), finalStored: final.contextNotes, peerPreserved: final.notes.some(note => note.text === 'Independent peer note'),
        unrelatedUnsavedExcluded: final.interpretiveLens === '' && state.importedData.interpretiveLens === 'Unrelated unsaved lens' };
    } finally { IDBObjectStore.prototype.put = originalPut; }
  });
  expect(results).toEqual({ failedDidNotWrite: true, recoveredDraft: 'Recover <literal> & draft', retryStored: 'Recover <literal> & draft',
    conflictVisible: true, keepingSavedDoesNotWrite: true, reobserved: 'Newest saved', recoveryFits: true, accessibility: [], finalStored: 'Explicit replacement draft', peerPreserved: true, unrelatedUnsavedExcluded: true });
});


test('Sync between notes keystrokes preserves the peer profile until explicit draft replacement', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const results = await page.evaluate(async () => {
    const [{ state }, profile, data, writes, cards, store] = await Promise.all([
      import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/profile-data-writes.js'), import('/js/context-cards.js'), import('/js/crypto.js'),
    ]);
    localStorage.setItem('labcharts-ai-paused', 'true');
    const id = 'context-notes-keystroke-sync', key = profile.profileStorageKey(id, 'imported');
    const read = async () => JSON.parse(await store.encryptedGetItem(key) || '{}') as typeof state.importedData;
    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(done => setTimeout(done, 25)); }
      throw new Error('Notes Sync conflict did not settle');
    };
    state.currentProfile = id; state.importedData = profile.createDefaultProfileData(); state.importedData.contextNotes = 'Original saved';
    writes.rememberProfileData(state.importedData); await store.encryptedSetItem(key, JSON.stringify(state.importedData)); data.invalidateActiveDataCache();
    const host = document.createElement('div'); host.innerHTML = cards.renderProfileContextCards(); document.body.append(host);
    const input = (value: string) => { const field = host.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea')!; field.value = value; field.dispatchEvent(new InputEvent('input', { bubbles: true })); };
    const status = () => host.querySelector('.ctx-notes-status')!.textContent;
    input('Local first input');
    const peer = structuredClone(state.importedData); peer.contextNotes = 'Peer saved during draft'; peer.notes.push({ date: '2026-10-18', text: 'Independent synced record' });
    await store.encryptedSetItem(key, JSON.stringify(peer)); writes.adoptProfileData(state.importedData, peer); writes.rememberProfileData(state.importedData); data.invalidateActiveDataCache();
    input('Local second input'); await waitFor(() => status() === 'Not saved — try again');
    const peerPreservedAfterSync = JSON.stringify(await read()) === JSON.stringify(peer);
    const draftRetained = host.querySelector('textarea')!.value === 'Local second input';
    const conflictShown = host.querySelector('.ctx-notes-conflict-saved')!.textContent === 'Peer saved during draft';
    input('Local third input'); await waitFor(() => status() === 'Not saved — try again');
    const peerPreservedAfterMoreTyping = JSON.stringify(await read()) === JSON.stringify(peer);
    const replace = host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!;
    const explicitLabel = replace.textContent;
    const nextPeer = structuredClone(peer); nextPeer.contextNotes = 'Second peer saved after review';
    await store.encryptedSetItem(key, JSON.stringify(nextPeer)); writes.adoptProfileData(state.importedData, nextPeer); writes.rememberProfileData(state.importedData); data.invalidateActiveDataCache();
    const reviewedPeerStillDisplayed = host.querySelector('.ctx-notes-conflict-saved')!.textContent === 'Peer saved during draft';
    replace.click(); await waitFor(() => status() === 'Not saved — try again');
    const unseenPeerPreservedAfterReplacement = JSON.stringify(await read()) === JSON.stringify(nextPeer)
      && host.querySelector('.ctx-notes-conflict-saved')!.textContent === nextPeer.contextNotes;
    host.querySelector<HTMLButtonElement>('.ctx-notes-retry')!.click(); await waitFor(() => status() === 'Saved');
    const replaced = await read(); input('Normal subsequent edit'); await waitFor(() => status() === 'Saved'); const final = await read();
    const unrelated = (value: typeof state.importedData) => { const copy = structuredClone(value); delete (copy as Partial<typeof copy>).contextNotes; delete (copy as Partial<typeof copy>).changeHistory; return JSON.stringify(copy); };
    return { peerPreservedAfterSync, draftRetained, conflictShown, peerPreservedAfterMoreTyping, explicitLabel, reviewedPeerStillDisplayed, unseenPeerPreservedAfterReplacement,
      replacedNotes: replaced.contextNotes, finalNotes: final.contextNotes, unrelatedPeerDataPreserved: unrelated(final) === unrelated(peer) };
  });
  expect(results).toEqual({ peerPreservedAfterSync: true, draftRetained: true, conflictShown: true, peerPreservedAfterMoreTyping: true,
    explicitLabel: 'Save draft instead', reviewedPeerStillDisplayed: true, unseenPeerPreservedAfterReplacement: true, replacedNotes: 'Local third input', finalNotes: 'Normal subsequent edit', unrelatedPeerDataPreserved: true });
});
