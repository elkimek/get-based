import { expect, test } from './coverage-fixture.js';
import { seedLocalKnowledgeCorpus, knowledgeCorpusReceipt } from '../helpers/knowledge-browser-fixture.js';
import type { WorkerRequest } from '../../js/lens-local-protocol.js';
interface RecoveryWindow extends Window { libraryFault: 'before' | 'primary' | 'unconfirmed' | null; libraryPackets: WorkerRequest[] }
test('native library saves recover from a failed request and an accepted backup while retaining documents and opaque metadata', async ({ page, context }, info) => {
  const errors: string[] = [], downloads: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/huggingface|jsdelivr|\.onnx/.test(request.url())) downloads.push(request.url()); });
  await context.addInitScript(() => {
    const state = window as unknown as RecoveryWindow; state.libraryFault = null; state.libraryPackets = []; const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(input: string | URL, options?: WorkerOptions) {
        const url = new URL(String(input), location.href), local = url.origin === location.origin && url.pathname === '/js/lens-local-worker.js'; if (local) url.searchParams.set('mock', '1'); super(local ? url : input, options);
        if (!local) return; const post = this.postMessage.bind(this);
        this.postMessage = ((message: WorkerRequest) => {
          if (message.type === 'create_library' && (state.libraryFault === 'before' || state.libraryFault === 'unconfirmed') || message.type === 'rename_library' && state.libraryFault === 'primary') {
            post({ type: state.libraryFault === 'before' ? 'test_fail_next_registry_persist' : state.libraryFault === 'unconfirmed' ? 'test_fail_next_registry_confirmation' : 'test_fail_next_registry_primary_persist' }); state.libraryFault = null;
          }
          state.libraryPackets.push(structuredClone(message)); post(message);
        }) as Worker['postMessage'];
      }
    };
  });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic library save recovery', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed'); localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
    (await import('/js/api.js')).setAIPaused(true); const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Synthetic baseline failed');
  });
  const libraryId = await seedLocalKnowledgeCorpus(page);
  await page.evaluate(async () => {
    const saved = await (await navigator.storage.getDirectory()).getDirectoryHandle('lens-local');
    for (const name of ['_libraries.json', '_libraries.backup.json']) {
      const handle = await saved.getFileHandle(name), registry = JSON.parse(await (await handle.getFile()).text()); registry.extension = { keep: 'private-registry-sentinel' }; registry.libraries = registry.libraries.map((row: object) => ({ ...row, origin: { keep: 'private-origin-sentinel' } }));
      const stream = await handle.createWritable(); await stream.write(JSON.stringify(registry)); await stream.close();
    }
  });
  const profile = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return { live: structuredClone(state.importedData), stored: await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')) }; });
  const beforeProfile = await profile(), before = await knowledgeCorpusReceipt(page, libraryId);
  const failed = await page.evaluate(async () => {
    const lens = await (await import('/js/lens-local.js')).openLocalLens(); (window as unknown as RecoveryWindow).libraryFault = 'before';
    let failure = ''; try { await lens.createLibrary('Failed synthetic library'); } catch (error) { failure = String(error); }
    return { failure, listed: await lens.listLibraries() };
  });
  expect(failed.failure).toContain('Test registry persist failure'); expect(failed.listed.libraries).toHaveLength(1); expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(before); expect(await profile()).toEqual(beforeProfile);
  const accepted = await page.evaluate(async libraryId => {
    const lens = await (await import('/js/lens-local.js')).openLocalLens(), created = await lens.createLibrary('Retried synthetic library'); (window as unknown as RecoveryWindow).libraryFault = 'primary'; const renamed = await lens.renameLibrary(libraryId, 'Accepted synthetic rename'); return { created, renamed, listed: await lens.listLibraries() };
  }, libraryId);
  expect(accepted.created.name).toBe('Retried synthetic library'); expect(accepted.renamed.name).toBe('Accepted synthetic rename'); expect(accepted.listed.libraries).toHaveLength(2);
  const saved = await knowledgeCorpusReceipt(page, libraryId), registries = saved.registry.map(bytes => JSON.parse(new TextDecoder().decode(new Uint8Array(bytes!))));
  expect(registries[1].revision).toBe(registries[0].revision + 1); expect(registries[0].libraries.find((row: { id: string }) => row.id === libraryId).name).not.toBe('Accepted synthetic rename'); expect(registries[1].libraries.find((row: { id: string }) => row.id === libraryId)).toMatchObject({ name: 'Accepted synthetic rename', origin: { keep: 'private-origin-sentinel' } }); expect(registries[1].extension).toEqual({ keep: 'private-registry-sentinel' }); expect(saved.corpus).toEqual(before.corpus); expect(saved.config).toBe(before.config); expect(await profile()).toEqual(beforeProfile);
  const unconfirmed = await page.evaluate(async () => {
    const lens = await (await import('/js/lens-local.js')).openLocalLens(); (window as unknown as RecoveryWindow).libraryFault = 'unconfirmed';
    let failure = '', requiresReload = false; try { await lens.createLibrary('Unconfirmed synthetic library'); } catch (error) { failure = String(error); requiresReload = error instanceof Error && 'requiresReload' in error && error.requiresReload === true; }
    return { failure, requiresReload, listed: await lens.listLibraries(), requests: (window as unknown as RecoveryWindow).libraryPackets.filter(message => message.type === 'create_library' && message.name === 'Unconfirmed synthetic library').length };
  });
  expect(unconfirmed.failure).toContain('could not be confirmed'); expect(unconfirmed.requiresReload).toBe(true); expect(unconfirmed.requests).toBe(1); expect(unconfirmed.listed.libraries).toHaveLength(3); expect(unconfirmed.listed.libraries.filter(row => row.name === 'Unconfirmed synthetic library')).toHaveLength(1);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => { await (await import('/js/lens.js')).openKnowledgeBaseModal(); });
  await expect(page.locator('#lens-library-select option:checked')).toContainText('Accepted synthetic rename'); await expect(page.locator('#lens-local-stats')).not.toContainText('Loading');
  const reopened = await knowledgeCorpusReceipt(page, libraryId), copies = reopened.registry.map(bytes => JSON.parse(new TextDecoder().decode(new Uint8Array(bytes!)))); expect(copies[0]).toEqual(copies[1]); expect(copies[0].libraries).toEqual(unconfirmed.listed.libraries); expect(copies[0].extension).toEqual(registries[1].extension); expect(reopened.corpus).toEqual(before.corpus); expect(JSON.parse(reopened.config!).name).toBe('Accepted synthetic rename'); expect(await profile()).toEqual(beforeProfile); expect(downloads).toEqual([]); expect(errors).toEqual([]);
  await info.attach('library-save-recovery', { body: JSON.stringify({ libraryId, failed, accepted, unconfirmed, before, saved, reopened, errors, downloads, boundary: 'Real native client/Worker/OPFS/native picker and reload; mock embedding only. Before-save, after-backup and lost-confirmation test faults, no actual disk failure or live provider/model inference claim.' }), contentType: 'application/json' });
});
