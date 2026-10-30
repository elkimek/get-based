// Ordinary form edits share the same captured-profile owner as chat approvals.
import { renderHTML } from './components/LabSampleEditor.svelte.html.js';
import { readLabSampleForEditor } from './lab-sample-records.js';
import { commitLabSampleCommand } from './lab-sample-record-store.js';
import type { LabSampleCommand } from './lab-sample-mutations.js';
import { state } from './state.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { buildMarkerDetailSidebarRuntime, navigateMarkerDetailRuntime, openWithMarkerDetailStylesheet, setDetailModalShell } from './marker-detail-runtime.js';
import { updateHeaderDates } from './data.js';

export async function openLabSampleEditor(markerId: string, panelId: string, showDetailModal: (id: string, options: { showAllHistory: boolean }) => unknown) {
  const profileId = state.currentProfile, { data, record } = await readLabSampleForEditor(profileId, panelId);
  if (state.currentProfile !== profileId) return;
  await openWithMarkerDetailStylesheet(() => {
    const modal = setDetailModalShell('gb-form-modal', 'marker-form-modal'), overlay = document.getElementById('modal-overlay');
    if (!modal || !overlay || state.currentProfile !== profileId) return;
    modal.dataset.syncRefreshKind = 'lab-sample';
    modal.innerHTML = renderHTML({ view: record });
    const form = modal.querySelector<HTMLFormElement>('#lab-sample-form')!, status = modal.querySelector<HTMLElement>('#lab-sample-status')!;
    const owns = () => state.currentProfile === profileId && form.isConnected && document.getElementById('lab-sample-form') === form;
    const dirty = new Set<string>(); let saving = false;
    const track = (event: Event) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) dirty.add(event.target.name); };
    form.addEventListener('input', track); form.addEventListener('change', track);
    for (const button of modal.querySelectorAll('[data-lab-sample-back]')) button.addEventListener('click', () => { if (!saving && owns()) void showDetailModal(markerId, { showAllHistory: true }); });
    form.addEventListener('submit', event => {
      event.preventDefault(); if (saving || !owns()) return;
      const values = new FormData(form), command: LabSampleCommand = { kind: 'update', panelId, now: Date.now() };
      if (dirty.has('date')) command.date = String(values.get('date') || '');
      if (dirty.has('specimen')) command.specimen = String(values.get('specimen') || '').trim() || null;
      if (dirty.has('sampleTime')) command.sampleTime = String(values.get('sampleTime') || '') || null;
      if (dirty.has('fasting')) command.fasting = values.get('fasting') === 'yes' ? true : values.get('fasting') === 'no' ? false : null;
      if (dirty.has('cycleDay')) command.cycleDay = values.get('cycleDay') ? Number(values.get('cycleDay')) : null;
      if (dirty.has('cyclePhase')) command.cyclePhase = String(values.get('cyclePhase') || '') || null;
      if (dirty.has('cyclePhaseDetail')) command.cyclePhaseDetail = String(values.get('cyclePhaseDetail') || '') || null;
      saving = true; const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!; submit.disabled = true; status.textContent = 'Saving…';
      const labels = record.results.flatMap(row => [{ key: 'markerLabels' as const, id: row[0], value: data.markerLabels?.[row[0]] ?? null },
        { key: 'categoryLabels' as const, id: row[0].split('.')[0]!, value: data.categoryLabels?.[row[0].split('.')[0]!] ?? null }]);
      void commitLabSampleCommand(profileId, data, command, () => state.currentProfile === profileId, {
        expectedContextField: { key: 'customMarkers', value: data.customMarkers ?? null }, expectedProfileMapEntries: labels,
      }).then(async () => {
        if (state.currentProfile !== profileId || !form.isConnected) return;
        buildMarkerDetailSidebarRuntime(); updateHeaderDates(); navigateMarkerDetailRuntime(state.currentView || 'dashboard');
        await showDetailModal(markerId, { showAllHistory: true });
      }).catch(error => { if (form.isConnected) { saving = false; submit.disabled = false; status.textContent = error instanceof Error ? error.message : 'Could not save this sample.'; } });
    });
    openModalOverlay(overlay); form.querySelector<HTMLInputElement>('input')?.focus();
  });
}
