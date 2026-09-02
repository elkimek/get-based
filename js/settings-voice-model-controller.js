// @ts-check
// settings-voice-model-controller.js — local model UI state and actions.

import { getErrorMessage } from './caught-error.js';
import { localModelStatusText } from './settings-voice-hardware.js';
import { showNotification } from './utils.js';
import {
  getLocalVoiceModelStatus,
  installLocalVoiceModel,
  isLocalVoiceModelReady,
  removeLocalVoiceModel,
  verifyLocalVoiceModelReady,
} from './voice-local-engine.js';
import {
  LOCAL_STT_MODELS,
  LOCAL_TTS_MODELS,
  getLocalModelStorageCopy,
} from './voice-model-catalog.js';
import { getVoiceSettings } from './voice-settings-storage.js';

/** @typedef {{ id: number, model: string, backend: string }} ModelOperation */
/** @type {{ stt: ModelOperation | null, tts: ModelOperation | null }} */
const activeModelOperations = { stt: null, tts: null };
let nextOperationId = 1;

function currentModel(kind) {
  const settings = getVoiceSettings();
  return kind === 'tts' ? settings.localTtsModel : settings.localSttModel;
}

function selectedBackend(kind) {
  const settings = getVoiceSettings();
  return kind === 'tts' ? settings.localTtsBackend : settings.localSttBackend;
}

export function localModelUiStatus(kind, modelId) {
  const backend = selectedBackend(kind);
  if (!isLocalVoiceModelReady(kind, modelId, backend)) {
    const status = getLocalVoiceModelStatus(kind, modelId);
    if (!status) return 'Not downloaded yet';
    if (kind !== 'tts') return 'Ready to use with either processor';
    const selected = backend === 'webgpu' ? 'GPU' : 'CPU';
    const other = selected === 'GPU' ? 'CPU' : 'GPU';
    return `${selected} weights need a separate download · ${other} weights remain stored`;
  }
  return localModelStatusText(getLocalVoiceModelStatus(kind, modelId), kind);
}

function setActionBusy(button, busy, label = 'Working…') {
  if (!(button instanceof HTMLButtonElement)) return;
  if (busy) {
    button.dataset.previousLabel = button.textContent || '';
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.previousLabel || button.textContent || '';
    button.disabled = false;
    delete button.dataset.previousLabel;
  }
}

function setModelControlsBusy(panel, kind, busy) {
  const prefix = kind === 'tts' ? 'localTts' : 'localStt';
  for (const setting of [`${prefix}Model`, `${prefix}Backend`]) {
    const control = panel.querySelector(`[data-voice-setting="${setting}"]`);
    if (control instanceof HTMLSelectElement) control.disabled = busy;
  }
}

function beginModelOperation(kind, model, backend) {
  if (activeModelOperations[kind]) return null;
  const operation = {
    id: nextOperationId++,
    model,
    backend,
  };
  activeModelOperations[kind] = operation;
  return operation;
}

function isActiveModelOperation(kind, operation) {
  return activeModelOperations[kind] === operation;
}

function isSelectedModelOperation(kind, operation) {
  return isActiveModelOperation(kind, operation)
    && currentModel(kind) === operation.model
    && selectedBackend(kind) === operation.backend;
}

function updateModelStatus(panel, kind, text, state = '') {
  const status = panel.querySelector(`[data-voice-model-status="${kind}"]`);
  if (!(status instanceof HTMLElement)) return;
  status.textContent = text;
  if (state) status.dataset.state = state;
  status.removeAttribute('title');
}

export function updateModelActions(panel, kind, modelId) {
  const ready = isLocalVoiceModelReady(kind, modelId, selectedBackend(kind));
  const busy = !!activeModelOperations[kind];
  const download = panel.querySelector(
    `[data-voice-action="install-model"][data-kind="${kind}"]`,
  );
  const remove = panel.querySelector(
    `[data-voice-action="remove-model"][data-kind="${kind}"]`,
  );
  if (download instanceof HTMLButtonElement) {
    download.disabled = busy || ready;
    if (!busy) download.textContent = ready ? 'Ready' : 'Download';
  }
  if (remove instanceof HTMLButtonElement) remove.disabled = busy || !ready;
}

export function refreshLocalModelDetails(panel, kind) {
  const modelId = currentModel(kind);
  const models = kind === 'tts' ? LOCAL_TTS_MODELS : LOCAL_STT_MODELS;
  const model = models.find(item => item.id === modelId) || models[0];
  const row = panel.querySelector(`[data-voice-model-kind="${kind}"]`);
  if (!(row instanceof HTMLElement)) return;
  const title = row.querySelector('.settings-copy-title');
  const description = row.querySelector('.settings-copy-desc');
  if (title) title.textContent = model.label;
  if (description) {
    description.textContent = getLocalModelStorageCopy(kind, model.id, selectedBackend(kind));
  }
  const progress = row.querySelector(`[data-voice-model-progress="${kind}"]`);
  if (progress instanceof HTMLElement) progress.hidden = true;
  const ready = isLocalVoiceModelReady(kind, model.id, selectedBackend(kind));
  updateModelStatus(
    panel,
    kind,
    localModelUiStatus(kind, model.id),
    ready ? 'ready' : 'missing',
  );
  updateModelActions(panel, kind, model.id);
}

async function installModel(panel, button) {
  const kind = button.dataset.kind === 'tts' ? 'tts' : 'stt';
  const model = currentModel(kind);
  const backend = selectedBackend(kind);
  const operation = beginModelOperation(kind, model, backend);
  if (!operation) return;
  const progress = panel.querySelector(`[data-voice-model-progress="${kind}"]`);
  const track = progress?.querySelector('.voice-model-progress-track');
  const progressLabel = progress?.querySelector('small');
  if (progress instanceof HTMLElement) progress.hidden = false;
  if (track instanceof HTMLElement) {
    track.classList.add('indeterminate');
    track.classList.remove('complete');
    track.removeAttribute('aria-valuenow');
  }
  if (progressLabel) progressLabel.textContent = 'Preparing download…';
  setActionBusy(button, true, 'Downloading…');
  setModelControlsBusy(panel, kind, true);
  updateModelStatus(panel, kind, 'Preparing download…', 'working');
  try {
    const result = await installLocalVoiceModel(
      kind,
      model,
      undefined,
      backend,
    );
    if (isSelectedModelOperation(kind, operation)) {
      updateModelStatus(panel, kind, localModelStatusText(result, kind), 'ready');
      if (track instanceof HTMLElement) {
        track.classList.remove('indeterminate');
        track.classList.add('complete');
        track.setAttribute('aria-valuenow', '100');
      }
      if (progressLabel) progressLabel.textContent = 'Download complete · model is ready';
    }
    const execution = result.backend === 'webgpu'
      ? 'GPU'
      : result.backend === 'wasm'
        ? 'CPU'
        : 'local runtime';
    showNotification(
      `${kind === 'tts' ? 'Speech' : 'Transcription'} model is ready using ${execution}.`,
      'success',
    );
  } catch (error) {
    const detail = getErrorMessage(error, 'Unknown model error');
    const message = backend === 'webgpu'
      ? `Could not use experimental graphics processing. Choose Automatic or Main processor and retry. ${detail}`
      : `Could not prepare this model. ${detail}`;
    if (isSelectedModelOperation(kind, operation)) {
      updateModelStatus(panel, kind, message, 'error');
      const status = panel.querySelector(`[data-voice-model-status="${kind}"]`);
      if (status instanceof HTMLElement) status.title = detail;
      if (track instanceof HTMLElement) track.classList.remove('indeterminate', 'complete');
      if (progressLabel) progressLabel.textContent = 'Download did not complete';
    }
    showNotification(message, 'error', 6000);
  } finally {
    if (isActiveModelOperation(kind, operation)) {
      const selectionChanged = !isSelectedModelOperation(kind, operation);
      activeModelOperations[kind] = null;
      setActionBusy(button, false);
      setModelControlsBusy(panel, kind, false);
      if (selectionChanged) refreshLocalModelDetails(panel, kind);
      else updateModelActions(panel, kind, model);
    }
  }
}

async function removeModel(panel, button) {
  const kind = button.dataset.kind === 'tts' ? 'tts' : 'stt';
  const model = currentModel(kind);
  const backend = selectedBackend(kind);
  const operation = beginModelOperation(kind, model, backend);
  if (!operation) return;
  setActionBusy(button, true, 'Removing…');
  setModelControlsBusy(panel, kind, true);
  try {
    await removeLocalVoiceModel(kind, model);
    if (isSelectedModelOperation(kind, operation)) {
      updateModelStatus(panel, kind, 'Not downloaded yet', 'missing');
      const progress = panel.querySelector(`[data-voice-model-progress="${kind}"]`);
      if (progress instanceof HTMLElement) progress.hidden = true;
    }
    showNotification('Local model cache removed.', 'info');
  } catch (error) {
    showNotification(getErrorMessage(error, 'Could not remove the model cache'), 'error');
  } finally {
    if (isActiveModelOperation(kind, operation)) {
      const selectionChanged = !isSelectedModelOperation(kind, operation);
      activeModelOperations[kind] = null;
      setActionBusy(button, false);
      setModelControlsBusy(panel, kind, false);
      if (selectionChanged) refreshLocalModelDetails(panel, kind);
      else updateModelActions(panel, kind, model);
    }
  }
}

export async function handleLocalModelAction(panel, button) {
  if (button.dataset.voiceAction === 'install-model') {
    await installModel(panel, button);
    return true;
  }
  if (button.dataset.voiceAction === 'remove-model') {
    await removeModel(panel, button);
    return true;
  }
  return false;
}

export function handleLocalModelProgress(event, panel) {
  const detail = event instanceof CustomEvent ? event.detail : null;
  const progress = detail?.progress || {};
  const kind = detail?.kind === 'tts' ? 'tts' : 'stt';
  const operation = activeModelOperations[kind];
  if (
    !operation
    || detail?.model !== operation.model
    || detail?.backend !== operation.backend
    || !isSelectedModelOperation(kind, operation)
  ) {
    return;
  }
  const wrap = panel.querySelector(`[data-voice-model-progress="${kind}"]`);
  if (!(wrap instanceof HTMLElement)) return;
  wrap.hidden = false;
  const track = wrap.querySelector('.voice-model-progress-track');
  const label = wrap.querySelector('small');
  if (track instanceof HTMLElement) {
    track.classList.add('indeterminate');
    track.classList.remove('complete');
    track.removeAttribute('aria-valuenow');
  }
  const file = String(progress.file || '').split('/').pop();
  if (label) label.textContent = file
    ? `Downloading model files · ${file}`
    : 'Preparing model runtime…';
}

export async function verifyRenderedLocalModels(panel) {
  for (const kind of ['stt', 'tts']) {
    const model = currentModel(kind);
    if (!isLocalVoiceModelReady(kind, model, selectedBackend(kind))) continue;
    const ready = await verifyLocalVoiceModelReady(kind, model, selectedBackend(kind));
    if (ready) continue;
    updateModelStatus(panel, kind, 'Download needed because cached model files are missing.', 'missing');
    updateModelActions(panel, kind, model);
  }
}
