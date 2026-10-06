// Local-model operations own feedback; Svelte owns its presentation.
import type { VoiceKind, VoiceReply } from '../types/voice-local.js';
import type { VoiceModelView } from './settings-voice-contract.js';
import { voiceActionId } from './settings-voice-contract.js';
import { currentVoiceSettingsView, getVoiceSettingsView } from './settings-voice-view-runtime.js';
import { getErrorMessage } from './caught-error.js';
import { localModelStatusText } from './settings-voice-hardware.js';
import { showNotification } from './utils.js';
import { getLocalVoiceModelStatus, installLocalVoiceModel, isLocalVoiceModelReady, removeLocalVoiceModel, verifyLocalVoiceModelReady } from './voice-local-engine.js';
import { getLocalModel, getLocalModelStorageCopy } from './voice-model-catalog.js';
import { getVoiceSettings } from './voice-settings-storage.js';
type ModelOperation = { id: number; model: string; backend: string; action: 'install-model' | 'remove-model' };
type ModelFeedback = { model: string; backend: string; view: Partial<VoiceModelView> };
const activeModelOperations: Record<VoiceKind, ModelOperation | null> = { stt: null, tts: null };
const modelFeedback: Record<VoiceKind, ModelFeedback | null> = { stt: null, tts: null };
let nextOperationId = 1;
function currentModel(kind: VoiceKind): string { const settings = getVoiceSettings(); return kind === 'tts' ? settings.localTtsModel : settings.localSttModel; }
function selectedBackend(kind: VoiceKind): string { const settings = getVoiceSettings(); return kind === 'tts' ? settings.localTtsBackend : settings.localSttBackend; }
export function localModelUiStatus(kind: VoiceKind, modelId: string): string {
  const backend = selectedBackend(kind);
  if (!isLocalVoiceModelReady(kind, modelId, backend)) {
    const status = getLocalVoiceModelStatus(kind, modelId);
    if (!status) return 'Not downloaded yet';
    if (kind !== 'tts') return 'Ready to use with either processor';
    const selected = backend === 'webgpu' ? 'GPU' : 'CPU'; const other = selected === 'GPU' ? 'CPU' : 'GPU';
    return `${selected} weights need a separate download · ${other} weights remain stored`;
  }
  return localModelStatusText(getLocalVoiceModelStatus(kind, modelId), kind);
}
export function readVoiceModelView(kind: VoiceKind): VoiceModelView {
  const model = getLocalModel(kind, currentModel(kind)); const backend = selectedBackend(kind);
  const ready = isLocalVoiceModelReady(kind, model.id, backend); const operation = activeModelOperations[kind];
  const feedback = modelFeedback[kind];
  // Cache readiness is authoritative even after a completed operation or storage reset.
  if (!ready && feedback?.view.state === 'ready') modelFeedback[kind] = null;
  const selectedFeedback = modelFeedback[kind]?.model === model.id && modelFeedback[kind]?.backend === backend ? modelFeedback[kind]?.view : {};
  return { label: model.label, description: getLocalModelStorageCopy(kind, model.id, backend), status: localModelUiStatus(kind, model.id), state: ready ? 'ready' : 'missing',
    progress: false, progressPhase: 'preparing', progressLabel: 'Preparing model…', ...selectedFeedback, ready, busy: !!operation, operation: operation?.action ?? null };
}
function publishModel(kind: VoiceKind, next: Partial<VoiceModelView>): void {
  const model = currentModel(kind); const backend = selectedBackend(kind); const previous = modelFeedback[kind];
  modelFeedback[kind] = { model, backend, view: { ...(previous?.model === model && previous.backend === backend ? previous.view : {}), ...next } };
  currentVoiceSettingsView()?.setModel(kind, readVoiceModelView(kind));
}
export function setActionBusy(button: Element | null | undefined, busy: boolean, label = 'Working…'): void {
  if (!(button instanceof HTMLButtonElement)) return;
  const panel = button.closest<HTMLElement>('[data-tab-panel="voice"]');
  if (panel) getVoiceSettingsView(panel)?.setActionBusy(voiceActionId(button.dataset.voiceAction || '', button.dataset.provider, button.dataset.kind), busy, label);
}
function beginModelOperation(kind: VoiceKind, model: string, backend: string, action: ModelOperation['action']): ModelOperation | null {
  if (activeModelOperations[kind]) return null;
  const operation = { id: nextOperationId++, model, backend, action }; activeModelOperations[kind] = operation; return operation;
}
function isSelectedModelOperation(kind: VoiceKind, operation: ModelOperation): boolean {
  return activeModelOperations[kind] === operation && currentModel(kind) === operation.model && selectedBackend(kind) === operation.backend;
}
export function refreshLocalModelDetails(panel: HTMLElement, kind: VoiceKind): void {
  // Selection changes discard feedback for the preceding model/backend.
  const feedback = modelFeedback[kind];
  if (feedback && (feedback.model !== currentModel(kind) || feedback.backend !== selectedBackend(kind))) modelFeedback[kind] = null;
  getVoiceSettingsView(panel)?.refresh();
}
function finishModelOperation(kind: VoiceKind, operation: ModelOperation): void {
  if (activeModelOperations[kind] !== operation) return;
  activeModelOperations[kind] = null;
  currentVoiceSettingsView()?.setModel(kind, readVoiceModelView(kind));
}
async function installModel(_panel: HTMLElement, button: HTMLButtonElement): Promise<void> {
  const kind = button.dataset.kind === 'tts' ? 'tts' : 'stt'; const model = currentModel(kind); const backend = selectedBackend(kind);
  const operation = beginModelOperation(kind, model, backend, 'install-model'); if (!operation) return;
  publishModel(kind, { status: 'Preparing download…', state: 'working', progress: true, progressPhase: 'preparing', progressLabel: 'Preparing download…', detail: undefined });
  try {
    const result = await installLocalVoiceModel(kind, model, undefined, backend);
    if (isSelectedModelOperation(kind, operation)) publishModel(kind, { status: localModelStatusText(result, kind), state: 'ready', progressPhase: 'complete', progressLabel: 'Download complete · model is ready', ready: true });
    const execution = result.backend === 'webgpu' ? 'GPU' : result.backend === 'wasm' ? 'CPU' : 'local runtime';
    showNotification(`${kind === 'tts' ? 'Speech' : 'Transcription'} model is ready using ${execution}.`, 'success');
  } catch (error) {
    const detail = getErrorMessage(error, 'Unknown model error');
    const message = backend === 'webgpu' ? `Could not use experimental graphics processing. Choose Automatic or Main processor and retry. ${detail}` : `Could not prepare this model. ${detail}`;
    if (isSelectedModelOperation(kind, operation)) publishModel(kind, { status: message, state: 'error', detail, progressPhase: 'failed', progressLabel: 'Download did not complete' });
    showNotification(message, 'error', 6000);
  } finally { finishModelOperation(kind, operation); }
}
async function removeModel(_panel: HTMLElement, button: HTMLButtonElement): Promise<void> {
  const kind = button.dataset.kind === 'tts' ? 'tts' : 'stt'; const model = currentModel(kind); const backend = selectedBackend(kind);
  const operation = beginModelOperation(kind, model, backend, 'remove-model'); if (!operation) return;
  currentVoiceSettingsView()?.setModel(kind, readVoiceModelView(kind));
  try {
    await removeLocalVoiceModel(kind, model);
    if (isSelectedModelOperation(kind, operation)) publishModel(kind, { status: 'Not downloaded yet', state: 'missing', progress: false, ready: false });
    showNotification('Local model cache removed.', 'info');
  } catch (error) { showNotification(getErrorMessage(error, 'Could not remove the model cache'), 'error'); }
  finally { finishModelOperation(kind, operation); }
}
export async function handleLocalModelAction(panel: HTMLElement, button: HTMLButtonElement): Promise<boolean> {
  if (button.dataset.voiceAction === 'install-model') { await installModel(panel, button); return true; }
  if (button.dataset.voiceAction === 'remove-model') { await removeModel(panel, button); return true; }
  return false;
}
export function handleLocalModelProgress(event: Event, _panel: HTMLElement): void {
  const detail = event instanceof CustomEvent ? event.detail as Pick<VoiceReply, 'kind' | 'model' | 'backend' | 'progress'> | null : null;
  const kind = detail?.kind === 'tts' ? 'tts' : 'stt'; const operation = activeModelOperations[kind];
  if (!operation || detail?.model !== operation.model || detail.backend !== operation.backend || !isSelectedModelOperation(kind, operation)) return;
  const file = String(detail.progress?.file || '').split('/').pop();
  publishModel(kind, { progress: true, progressPhase: 'preparing', progressLabel: file ? `Downloading model files · ${file}` : 'Preparing model runtime…' });
}
export async function verifyRenderedLocalModels(panel: HTMLElement): Promise<void> {
  for (const kind of (['stt', 'tts'] as VoiceKind[])) {
    const model = currentModel(kind); const backend = selectedBackend(kind);
    if (!isLocalVoiceModelReady(kind, model, backend)) continue;
    const ready = await verifyLocalVoiceModelReady(kind, model, backend);
    if (ready || !getVoiceSettingsView(panel) || model !== currentModel(kind) || backend !== selectedBackend(kind)) continue;
    publishModel(kind, { status: 'Download needed because cached model files are missing.', state: 'missing', ready: false, progress: false });
  }
}
