import { expect, test } from './coverage-fixture.js';
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
    const second = render(); input(second, 'Current shared draft');
    const viewsSyncImmediately = first.querySelector('textarea')!.value === 'Current shared draft' && status(first) === 'Saving…';
    await waitFor(() => status(first) === 'Saved' && status(second) === 'Saved');
    const committed = await read(other);
    input(second, 'Draft survives rerender'); first.remove(); second.remove(); const replacement = render();
    const draftSurvivedRerender = replacement.querySelector('textarea')!.value === 'Draft survives rerender';
    await waitFor(() => status(replacement) === 'Saved'); const final = await read(other);
    return { originStayedScoped, viewsSyncImmediately, currentStored: committed.contextNotes, draftSurvivedRerender, finalStored: final.contextNotes,
      historyStored: final.changeHistory?.some(entry => entry.field === 'contextNotes' && entry.snapshot === 'Draft survives rerender') };
  });
  expect(results).toEqual({ originStayedScoped: true, viewsSyncImmediately: true, currentStored: 'Current shared draft', draftSurvivedRerender: true, finalStored: 'Draft survives rerender', historyStored: true });
});
