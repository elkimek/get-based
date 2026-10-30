// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as utils from '../js/utils.js';
import * as images from '../js/image-utils.js';
import * as pdf from '../js/pdf-import.js';
import * as pii from '../js/pii.js';
import * as controller from '../js/emf.js';
import * as editor from '../js/emf-editor.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { AssistantFeatureRequestOptions } from '../js/ai-feature-routing.js';
import type { ProfileData } from '../types/app-state.js';
const original = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string, callbacks: Record<string, unknown>;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const input = (selector: string) => document.querySelector<HTMLInputElement>(selector)!;
function render() { editor.emfEditorState.editingAssessmentId = 'assessment'; editor.emfEditorState.activeRoomIdx = 0; editor.emfEditorState.compareMode = false; editor.renderEMFEditor(document.getElementById('detail-modal')); }
beforeEach(async () => {
  profile = `emf-native-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); localStorage.setItem('labcharts-active-profile', profile); localStorage.setItem('labcharts-show-product-recs', 'false');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  state.importedData.emfAssessment = { assessments: [{ id: 'assessment', date: '2026-10-20', label: 'Original', consultant: '', note: '', rooms: [{ id: 'bedroom', name: 'Bedroom', sleeping: true, location: 'Pillow', note: '', measurements: { acElectric: { value: 8, unit: 'V/m', meter: 'Meter', source: 'private-source' } }, sources: ['WiFi router'], mitigations: ['custom mitigation'], photos: [{ base64: 'c3ludGhldGlj', mediaType: 'image/png', name: 'Original' }] }, { id: 'office', name: 'Office', sleeping: false, measurements: {} }] }] };
  state.importedData.contextNotes = 'Unrelated note'; expect(await saveImportedData()).toBe(true);
  document.body.innerHTML = '<div id="modal-overlay" class="show"><div id="detail-modal"></div></div>'; callbacks = editor.configureEMFEditor({ closeModal: vi.fn() }); render();
});
afterEach(async () => { editor.configureEMFEditor(callbacks); vi.restoreAllMocks(); clearSyncSaveTimers(); document.body.innerHTML = ''; await storage.encryptedRemoveItem(key); state.currentProfile = original.profile; state.importedData = original.data; });
const actions = {
  field: () => controller.updateEMFField('assessment', 'label', 'Changed'),
  room: () => controller.updateEMFRoom('assessment', 0, 'location', 'Window'),
  reading: () => controller.updateEMFMeasurement('assessment', 0, 'acElectric', '2'),
  meter: () => controller.updateEMFMeter('assessment', 0, 'acElectric', 'New meter'),
  addRoom: () => controller.addEMFRoom('assessment'),
  removeRoom: () => controller.removeEMFRoom('assessment', 1),
  removePhoto: () => controller.removeEMFPhoto('assessment', 0, 0),
  addAssessment: () => controller.addEMFAssessment(),
};
it.each(Object.keys(actions) as (keyof typeof actions)[])('native %s failure leaves live and durable data unchanged', async action => {
  const before = await stored(), observed = state.importedData, write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  expect(await actions[action]()).toBeFalsy(); expect(state.importedData).toBe(observed); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
});
it('explicit Save preserves the typed draft and never announces success after storage failure', async () => {
  const before = await stored(), notice = vi.spyOn(utils, 'showNotification'), write = storage.encryptedSetItem; input('[data-emf-field="note"]').value = 'Unsaved typed note';
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  expect(await controller.saveEMFExplicit()).toBeFalsy(); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before); expect(input('[data-emf-field="note"]').value).toBe('Unsaved typed note'); expect(notice.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
});
it('a room-name prompt cannot write into a replacement profile or root', async () => {
  const before = await stored(), replacement = structuredClone(state.importedData); vi.spyOn(utils, 'showPromptDialog').mockImplementationOnce(async () => { state.currentProfile = 'replacement'; state.importedData = replacement; return 'Nursery'; });
  await controller.handleEMFRoomDropdown('assessment', 0, '_custom', { value: '_custom' }); expect(replacement).toEqual(before); expect(await stored()).toEqual(before);
});
it('a delete confirmation cannot remove an assessment from a replacement profile', async () => {
  const before = await stored(), replacement = structuredClone(state.importedData); vi.spyOn(utils, 'showConfirmDialog').mockImplementationOnce(async () => { state.currentProfile = 'replacement'; state.importedData = replacement; return true; });
  await controller.deleteEMFAssessment('assessment'); expect(replacement).toEqual(before); expect(await stored()).toEqual(before);
});
it('asynchronous chosen photos cannot mutate a retired profile or publish before saving', async () => {
  const before = await stored(), observed = state.importedData, replacement = structuredClone(state.importedData);
  vi.spyOn(images, 'resizeImage').mockImplementationOnce(async () => { state.currentProfile = 'replacement'; state.importedData = replacement; return { base64: 'new-selected-photo', mediaType: 'image/png', width: 1, height: 1, origWidth: 1, origHeight: 1, quality_warnings: [] }; });
  await controller.addEMFPhotos('assessment', 0, [new File(['synthetic'], 'Chosen.png', { type: 'image/png' })]); expect(replacement).toEqual(before); expect(await stored()).toEqual(before); expect(observed).toEqual(before);
});
it('no-op explicit Save does not normalize untouched fields or create source history', async () => {
  const before = await stored(), write = vi.spyOn(storage, 'encryptedSetItem'); await controller.saveEMFExplicit(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(write.mock.calls.filter(([id]) => id === key)).toHaveLength(0);
});
async function proposal() {
  const evidence = 'My bedroom AC electric reading is now 2 V/m.', runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
  const list = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'emfMeasurements' } }); expect(list.success).toBe(true);
  const id = JSON.parse(list.contentItems[0].text).records[0].recordId, read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'emfMeasurements', recordId: id } }); expect(read.success).toBe(true);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'emfMeasurements', operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: '{"value":2,"unit":"V/m"}', reason: 'The user reported a new room reading.', evidence } }); expect(result.success).toBe(true);
  return { ...runtime.getDrafts()[0]!, profileId: profile };
}
it('refreshes a clean open ordinary editor after chat approval without waiting for reopening', async () => {
  const draft = await proposal(); await applyAgentDraft(draft); expect(input('[data-emf-measurement-type="acElectric"]').value).toBe('2'); expect((await stored()).emfAssessment!.assessments[0].rooms[0].measurements.acElectric.value).toBe(2);
});
it('refuses chat Apply while the ordinary editor has an uncommitted DOM draft', async () => {
  const draft = await proposal(), before = await stored(); input('[data-emf-field="note"]').value = 'Do not lose my typed draft';
  await expect(applyAgentDraft(draft)).rejects.toThrow(/draft|changed|save/i); expect(await stored()).toEqual(before); expect(input('[data-emf-field="note"]').value).toBe('Do not lose my typed draft');
});
it('keeps a failed explicit save retryable with its exact typed controls', async () => {
  const before = await stored(), write = storage.encryptedSetItem; input('[data-emf-field="note"]').value = 'A retained draft'; input('[data-emf-field="date"]').value = '2023-12-24';
  const spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  expect(await controller.saveEMFExplicit()).toBe(false); expect(state.importedData).toEqual(before); spy.mockRestore();
  expect(await controller.saveEMFExplicit()).toBe(true); const saved = await stored(); expect(saved.emfAssessment!.assessments[0].note).toBe('A retained draft'); expect(saved.emfAssessment!.assessments[0].date).toBe('2023-12-24'); expect(saved.emfAssessment!.assessments[0].editHistory[0].snapshot).toEqual(before.emfAssessment!.assessments[0]);
});
it('serializes separate native intents and preserves unrelated unsaved profile data', async () => {
  state.importedData.contextNotes = 'Unsaved unrelated context';
  expect(await Promise.all([controller.updateEMFField('assessment', 'label', 'First'), controller.updateEMFMeter('assessment', 0, 'acElectric', 'Second')])).toEqual([true, true]);
  const saved = await stored(); expect(saved.emfAssessment!.assessments[0].label).toBe('First'); expect(saved.emfAssessment!.assessments[0].rooms[0].measurements.acElectric.meter).toBe('Second'); expect(saved.contextNotes).toBe('Unrelated note'); expect(state.importedData.contextNotes).toBe('Unsaved unrelated context');
});
it('blocks invalid native numeric controls without publishing another field', async () => {
  const before = await stored(), reading = input('[data-emf-measurement-type="acElectric"]'); reading.value = ''; Object.defineProperty(reading, 'validity', { configurable: true, value: { badInput: true } });
  expect(await controller.updateEMFField('assessment', 'label', 'Must not publish')).toBe(false); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
});
it('publishes native edits only after the durable storage acknowledgement', async () => {
  const before = await stored(), write = storage.encryptedSetItem; let release!: () => void, started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) { started(); await gate; } return write(...args); });
  const changing = controller.updateEMFField('assessment', 'label', 'Accepted'); await entered;
  try { expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before); } finally { release(); }
  expect(await changing).toBe(true); expect(state.importedData.emfAssessment!.assessments[0].label).toBe('Accepted'); expect((await stored()).emfAssessment!.assessments[0].label).toBe('Accepted');
});
it('close waits for a pending native creation and does not lose its accepted record', async () => {
  editor.openEMFAssessmentEditor(); const close = vi.fn(); editor.configureEMFEditor({ closeModal: close }); const write = storage.encryptedSetItem; let release!: () => void, started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) { started(); await gate; } return write(...args); });
  const creating = controller.addEMFAssessment(); await entered; document.querySelector<HTMLButtonElement>('[data-emf-action="close-editor"]')!.click(); await Promise.resolve(); expect(close).not.toHaveBeenCalled(); release();
  expect(await creating).toBe(true); await expect.poll(() => close.mock.calls.length).toBe(1); expect((await stored()).emfAssessment!.assessments).toHaveLength(2);
});
const parsed = () => ({ date: '2026-10-24', rooms: [{ name: 'Bedroom', measurements: { acElectric: { value: 2, unit: 'V/m' } }, sources: [], mitigations: [] }], note: 'Chosen report' });
it('import approval freezes the reviewed parser data and preserves it privately', async () => {
  const candidate = parsed(), before = await stored(); await editor.showEMFImportPreview(candidate); candidate.rooms[0]!.measurements.acElectric.value = 999;
  document.querySelector<HTMLButtonElement>('#emf-confirm-btn')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile);
  const saved = await stored(), added = saved.emfAssessment!.assessments[1]; expect(added.rooms[0].measurements.acElectric.value).toBe(2); expect(added.source.parserOutput.rooms[0].measurements.acElectric.value).toBe(2); expect(saved.emfAssessment!.assessments[0]).toEqual(before.emfAssessment!.assessments[0]);
});
it('failed import keeps its preview and does not announce success or mutate either source', async () => {
  const candidate = parsed(), before = await stored(), source = structuredClone(candidate), notice = vi.spyOn(utils, 'showNotification'), write = storage.encryptedSetItem;
  await editor.showEMFImportPreview(candidate); vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  document.querySelector<HTMLButtonElement>('#emf-confirm-btn')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile);
  expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before); expect(candidate).toEqual(source); expect(document.querySelector('#emf-confirm-btn')).not.toBeNull(); expect(notice.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
});
it('a retired import preview cannot commit into a replacement root or profile', async () => {
  const before = await stored(); await editor.showEMFImportPreview(parsed()); const replacement = structuredClone(state.importedData); state.importedData = replacement; state.currentProfile = 'replacement';
  document.querySelector<HTMLButtonElement>('#emf-confirm-btn')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile); expect(replacement).toEqual(before); expect(await stored()).toEqual(before);
});
it('rejects invalid report dates and incompatible source units instead of relabelling their values', async () => {
  const before = await stored();
  for (const bad of [{ ...parsed(), date: '2026-02-30' }, { ...parsed(), rooms: [{ name: 'Bedroom', measurements: { acElectric: { value: 2, unit: 'mG' } } }] }]) {
    render(); await editor.showEMFImportPreview(bad); document.querySelector<HTMLButtonElement>('#emf-confirm-btn')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  }
});
it('keeps generated interpretations unsaved on failure and retries saving without another model call', async () => {
  const bridge = await import('../js/emf-interpretation-runtime.js'), feature = await import('../js/emf-interpretation.js');
  const model = vi.fn(async () => ({ text: 'Generated synthetic interpretation', usage: { inputTokens: 8, outputTokens: 3 } })), previous = bridge.configureEMFInterpretationRuntimeDeps({ callClaudeAPI: model });
  const before = await stored(), write = storage.encryptedSetItem, spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  try {
    feature.interpretEMFAssessment('assessment'); document.querySelector<HTMLButtonElement>('#emf-interp-generate')!.click();
    await expect.poll(() => document.querySelector('#emf-interp-generate')!.textContent).toBe('Retry saving'); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before); spy.mockRestore();
    document.querySelector<HTMLButtonElement>('#emf-interp-generate')!.click(); await expect.poll(async () => (await stored()).emfAssessment!.assessments[0].interpretation?.text).toBe('Generated synthetic interpretation'); expect(model).toHaveBeenCalledTimes(1); expect(state.importedData.emfAssessment!.assessments[0].interpretation.text).toBe('Generated synthetic interpretation');
  } finally { feature.closeEMFInterpretation(); bridge.configureEMFInterpretationRuntimeDeps(previous); }
});
it('retains earlier generated output when saving a replacement interpretation', async () => {
  const saved = { text: 'Previous output', date: '2026-10-20', model: 'Previous model' }, previous = structuredClone(saved); state.importedData.emfAssessment!.assessments[0].interpretation = saved; expect(await saveImportedData()).toBe(true);
  const { commitEMFInterpretation } = await import('../js/emf-native-records.js');
  await commitEMFInterpretation('assessment', { text: 'Replacement output', model: 'Synthetic', provider: 'custom', modelId: 'synthetic', date: '2026-10-25', inputTokens: 1, outputTokens: 1 }, () => true);
  const row = (await stored()).emfAssessment!.assessments[0]; expect(row.interpretation.text).toBe('Replacement output'); expect(row.interpretation.history).toEqual([previous]); expect(row.editHistory).toBeUndefined();
});
it('preserves the focused text field and caret when another accepted field refreshes the editor', async () => {
  const focused = input('[data-emf-room-field="location"]'); focused.focus(); focused.setSelectionRange(2, 4);
  expect(await controller.updateEMFField('assessment', 'label', 'Changed')).toBe(true);
  const current = input('[data-emf-room-field="location"]'); expect(document.activeElement).toBe(current); expect(current.value).toBe('Pillow'); expect([current.selectionStart, current.selectionEnd]).toEqual([2, 4]);
});
it('keeps the editor open when a Close-triggered save fails', async () => {
  editor.openEMFAssessmentEditor(); await controller.toggleEMFAssessment('assessment'); const close = vi.fn(); editor.configureEMFEditor({ closeModal: close }); const before = await stored(), write = storage.encryptedSetItem;
  input('[data-emf-field="note"]').value = 'Keep this draft open'; vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  document.querySelector<HTMLButtonElement>('[data-emf-action="close-editor"]')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile); await Promise.resolve();
  expect(close).not.toHaveBeenCalled(); expect(input('[data-emf-field="note"]').value).toBe('Keep this draft open'); expect(await stored()).toEqual(before);
});
it('retires a held interpretation transport when accepted native inputs change', async () => {
  const bridge = await import('../js/emf-interpretation-runtime.js'), feature = await import('../js/emf-interpretation.js');
  let deliver!: (value: unknown) => void; const response = new Promise<unknown>(resolve => { deliver = resolve; });
  const model = vi.fn<(options: AssistantFeatureRequestOptions) => Promise<unknown>>(async () => response), previous = bridge.configureEMFInterpretationRuntimeDeps({ callClaudeAPI: model });
  try {
    feature.interpretEMFAssessment('assessment'); document.querySelector<HTMLButtonElement>('#emf-interp-generate')!.click();
    const signal = model.mock.calls[0]![0].signal!; expect(signal.aborted).toBe(false); expect(await controller.updateEMFField('assessment', 'label', 'New inputs')).toBe(true);
    expect(signal.aborted).toBe(true); expect(document.querySelector('#emf-interp-overlay')).toBeNull(); deliver({ text: 'Retired output' }); await Promise.resolve(); await Promise.resolve();
    expect((await stored()).emfAssessment!.assessments[0].interpretation).toBeUndefined();
  } finally { feature.closeEMFInterpretation(); bridge.configureEMFInterpretationRuntimeDeps(previous); }
});
it('keeps a chosen-file input connected while earlier native saves finish, then refreshes after cancellation', async () => {
  editor.configureEMFEditor({ hasAIProvider: () => true }); editor.openEMFAssessmentEditor(); await controller.toggleEMFAssessment('assessment');
  const picker = input('#emf-pdf-input'); vi.spyOn(picker, 'click').mockImplementation(() => {}); document.querySelector<HTMLButtonElement>('[data-emf-action="trigger-pdf-import"]')!.click();
  expect(await controller.updateEMFField('assessment', 'label', 'Accepted while picking')).toBe(true); expect(input('#emf-pdf-input')).toBe(picker);
  picker.dispatchEvent(new Event('cancel')); expect(input('#emf-pdf-input')).not.toBe(picker); expect(input('[data-emf-field="label"]').value).toBe('Accepted while picking');
});
it('a later chosen report aborts the earlier transport and late output cannot replace its preview', async () => {
  const before = await stored(); vi.spyOn(pdf, 'extractPDFText').mockResolvedValue('Synthetic EMF report with explicit room readings and date.'); vi.spyOn(pii, 'checkOllamaPII').mockResolvedValue({ available: false, models: [] });
  let deliver!: (value: unknown) => void; const held = new Promise<unknown>(resolve => { deliver = resolve; });
  const model = vi.fn<(options: AssistantFeatureRequestOptions) => Promise<unknown>>().mockImplementationOnce(async () => held).mockResolvedValueOnce({ text: JSON.stringify({ ...parsed(), rooms: [{ name: 'Bedroom', measurements: { acElectric: { value: 4, unit: 'V/m' } } }] }) });
  const previous = controller.configureEMFAIDeps({ hasAIProvider: () => true, callClaudeAPI: model });
  try {
    const first = controller.handleEMFPDF(new File(['synthetic'], 'First.pdf', { type: 'application/pdf' })); await expect.poll(() => model.mock.calls.length).toBe(1);
    await controller.handleEMFPDF(new File(['synthetic'], 'Second.pdf', { type: 'application/pdf' })); expect(model.mock.calls[0]![0].signal!.aborted).toBe(true); const preview = document.getElementById('detail-modal')!.innerHTML;
    deliver({ text: JSON.stringify(parsed()) }); await first; expect(document.getElementById('detail-modal')!.innerHTML).toBe(preview); expect(model).toHaveBeenCalledTimes(2); expect(await stored()).toEqual(before);
  } finally { controller.configureEMFAIDeps(previous); }
});
it('a profile switch during report extraction prevents disclosure to the parsing model', async () => {
  const before = await stored(), observed = state.importedData, replacement = structuredClone(state.importedData), model = vi.fn();
  vi.spyOn(pdf, 'extractPDFText').mockImplementationOnce(async () => { state.currentProfile = 'replacement'; state.importedData = replacement; return 'Synthetic private report with explicit room readings.'; });
  const previous = controller.configureEMFAIDeps({ hasAIProvider: () => true, callClaudeAPI: model });
  try { await controller.handleEMFPDF(new File(['synthetic'], 'Private.pdf', { type: 'application/pdf' })); expect(model).not.toHaveBeenCalled(); expect(replacement).toEqual(before); expect(observed).toEqual(before); expect(await stored()).toEqual(before); }
  finally { controller.configureEMFAIDeps(previous); }
});
it('records an instrument without inventing a value and preserves it when a later reading is cleared', async () => {
  expect(await controller.updateEMFMeter('assessment', 0, 'acMagnetic', 'Reported instrument')).toBe(true);
  let reading = (await stored()).emfAssessment!.assessments[0].rooms[0].measurements.acMagnetic; expect(reading).toMatchObject({ value: null, unit: 'nT', meter: 'Reported instrument' });
  expect(await controller.updateEMFMeasurement('assessment', 0, 'acMagnetic', 45)).toBe(true); expect(await controller.updateEMFMeasurement('assessment', 0, 'acMagnetic', '')).toBe(true);
  reading = (await stored()).emfAssessment!.assessments[0].rooms[0].measurements.acMagnetic; expect(reading.value).toBeNull(); expect(reading.meter).toBe('Reported instrument');
});
it('a new report can start after an earlier preview and a pending form save', async () => {
  vi.spyOn(pdf, 'extractPDFText').mockResolvedValue('Synthetic EMF report with explicit room readings and date.'); vi.spyOn(pii, 'checkOllamaPII').mockResolvedValue({ available: false, models: [] });
  const model = vi.fn<(options: AssistantFeatureRequestOptions) => Promise<unknown>>(async () => ({ text: JSON.stringify(parsed()) })), previous = controller.configureEMFAIDeps({ hasAIProvider: () => true, callClaudeAPI: model });
  try {
    await controller.handleEMFPDF(new File(['synthetic'], 'First.pdf', { type: 'application/pdf' })); document.querySelector<HTMLButtonElement>('[data-emf-action="close-preview"]')!.click();
    input('[data-emf-field="note"]').value = 'Save before parsing the next report'; await controller.handleEMFPDF(new File(['synthetic'], 'Second.pdf', { type: 'application/pdf' }));
    expect(model).toHaveBeenCalledTimes(2); expect(model.mock.calls[1]![0].signal!.aborted).toBe(false); expect(document.querySelector('#emf-confirm-btn')).not.toBeNull(); expect((await stored()).emfAssessment!.assessments[0].note).toBe('Save before parsing the next report');
  } finally { controller.configureEMFAIDeps(previous); }
});
it.each([
  { consultant: { forged: true }, rooms: parsed().rooms },
  { rooms: [{ name: { forged: true }, measurements: {} }] },
  { rooms: [{ name: 'Bedroom', measurements: { acElectric: { value: 2, unit: 'V/m', meter: { forged: true } } } }] },
])('rejects malformed parser fields before they can make the native editor unreadable: %j', async patch => {
  const before = await stored(); await editor.showEMFImportPreview({ ...parsed(), ...patch }); document.querySelector<HTMLButtonElement>('#emf-confirm-btn')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});

it('rejects malformed report tags before replacing the current form', async () => {
  const before = await stored(), view = document.getElementById('detail-modal')!.innerHTML;
  await expect(async () => { await editor.showEMFImportPreview({ ...parsed(), rooms: [{ name: 'Bedroom', sources: 'WiFi router', measurements: {} }] }); }).rejects.toThrow('Review the reported source and mitigation tags');
  expect(document.getElementById('detail-modal')!.innerHTML).toBe(view); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});

it.each([null, undefined])('does not assign severity to an unknown reported reading: %s', async value => {
  const before = await stored(); await editor.showEMFImportPreview({ ...parsed(), rooms: [{ name: 'Bedroom', measurements: { acElectric: { value, unit: 'V/m', meter: 'Reported instrument' } } }] });
  expect(document.querySelector('.emf-measurements')!.textContent).toContain('Unknown'); expect(document.querySelector('.emf-severity-dot')).toBeNull(); expect(await stored()).toEqual(before);
});
it('displays the actual incompatible report unit without a severity badge', async () => {
  const before = await stored(); await editor.showEMFImportPreview({ ...parsed(), rooms: [{ name: 'Bedroom', measurements: { acElectric: { value: 2, unit: 'mV/m' } } }] });
  expect(document.querySelector('.emf-measurement-unit')!.textContent).toBe('mV/m'); expect(document.querySelector('.emf-severity-dot')).toBeNull();
  document.querySelector<HTMLButtonElement>('#emf-confirm-btn')!.click(); await (await import('../js/emf-native-records.js')).waitForEMFNativeWrites(profile); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});
