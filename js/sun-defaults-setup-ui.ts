import type { SunSetupDefaults, SunSetupValues } from './sun-defaults-model.js';
import type { SunSetupRendererDeps } from './sun-defaults-setup-renderer.js';
// sun-defaults-setup-ui.js — Light setup modal lifecycle and delegated behavior.

import { createSunSetupSession, captureSunSetupIdentity, isCurrentSunSetupIdentity } from './sun-defaults-session.js';
import type { SunSetupSession } from './sun-defaults-session.js';
import { setupClasses } from './light-setup-classes.js';
import { SKIN_TYPE } from './constants.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  FITZPATRICK_DESCRIPTOR,
  FITZPATRICK_ROMAN,
  OTT_QUESTIONS,
  ottScoreToLabel,
} from './sun-defaults-model.js';
import {
  configureSunDefaultsSetupRenderer,
  renderSetupModal,
  renderSetupSkinLabel,
  renderSetupCard,
  renderSetupLocationStatus,
} from './sun-defaults-setup-renderer.js';
import {
  clearSunSetupCurrentLocationRuntime,
  hasSunSetupPreciseLocationRequester,
  navigateSunDefaultsRoute,
  openSunSetupProfileLocationRuntime,
  requestSunSetupPreciseLocationRuntime,
} from './sun-defaults-runtime.js';
import { showNotification } from './utils.js';

const LIGHT_SETUP_OVERLAY_ID = 'light-setup-focus-overlay';

export interface SunSetupDependencies extends SunSetupRendererDeps {
  saveSunDefaults: (patch: Partial<SunSetupDefaults>, session?: SunSetupSession) => unknown;
  persistSunSetupValues: (values: SunSetupValues, now?: number, session?: SunSetupSession) => unknown;
  maybeAnalyzeOnboardingAfterSave: () => unknown;
}

type CollectedSunSetup =
  | { ok: false; reason: 'missing-root' | 'skin-type-required'; values?: never }
  | { ok: true; values: SunSetupValues; reason?: never };

const setupDeps: SunSetupDependencies = {
  getSunDefaults: () => null,
  isOnboardingComplete: () => false,
  saveSunDefaults: async () => false,
  persistSunSetupValues: async () => null,
  maybeAnalyzeOnboardingAfterSave: () => {},
  getOnboardingAIView: () => null,
};

function syncRendererDeps() {
  configureSunDefaultsSetupRenderer({
    getSunDefaults: setupDeps.getSunDefaults,
    isOnboardingComplete: setupDeps.isOnboardingComplete,
    getOnboardingAIView: setupDeps.getOnboardingAIView,
  });
}

export function configureSunDefaultsSetupUI(deps: Partial<SunSetupDependencies> = {}) {
  Object.assign(setupDeps, deps);
  syncRendererDeps();
}

// Public startup hook retained by the sun-defaults facade.
export function configureSunDefaults(deps: Partial<SunSetupDependencies> = {}) {
  Object.assign(setupDeps, deps);
  syncRendererDeps();
}

function maybeAnalyzeOnboardingAfterSave() {
  try { setupDeps.maybeAnalyzeOnboardingAfterSave(); } catch (_) {}
}

function isOnboardingComplete() {
  return !!setupDeps.isOnboardingComplete();
}

interface SetupOwner { root: HTMLElement; session: SunSetupSession; pending: boolean }
let activeSetup: SetupOwner | null = null;
const pendingPrompts = new WeakSet<HTMLElement>();
function currentOwner(owner: SetupOwner) {
  return owner.root.isConnected && owner.session.current()
    && (owner.root.id !== LIGHT_SETUP_OVERLAY_ID || activeSetup === owner);
}
function ownsAction(element: Element) {
  if (!element.isConnected) return false;
  const ticket = element.closest<HTMLElement>('[data-light-setup-owner]')?.dataset.lightSetupOwner;
  if (ticket && !isCurrentSunSetupIdentity(ticket)) return false;
  const overlay = element.closest<HTMLElement>(`#${LIGHT_SETUP_OVERLAY_ID}`);
  return !overlay || !!activeSetup && activeSetup.root === overlay && currentOwner(activeSetup);
}
function saveFailure(owner: SetupOwner) {
  if (!currentOwner(owner)) return;
  const result = owner.session.result();
  const message = result === 'conflict'
    ? 'Light settings changed elsewhere. Your draft is still here. Reopen setup to review the latest settings.'
    : result === 'blocked' ? 'Reload this profile successfully before saving. Your draft is still here.'
    : 'Could not save Light setup. Your draft is still here; try again.';
  const status = owner.root.querySelector<HTMLElement>('[data-light-setup-status]');
  if (status) { status.textContent = message; status.hidden = false; }
  else showNotification(message, 'error');
}
async function writeSetup(owner: SetupOwner, write: () => unknown) {
  if (!currentOwner(owner) || owner.pending) return false;
  owner.pending = true;
  const busyRoot = owner.root.querySelector('.light-setup-focus-modal') || owner.root;
  busyRoot.setAttribute('aria-busy', 'true');
  const controls = [...owner.root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')]
    .filter(control => !control.matches('[data-light-setup-close], [data-light-setup-action="cancel-reopen"]'));
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  const status = owner.root.querySelector<HTMLElement>('[data-light-setup-status]');
  if (status) status.hidden = true;
  try {
    const saved = !!await write();
    if (!saved) saveFailure(owner);
    return saved && currentOwner(owner);
  } catch { saveFailure(owner); return false; }
  finally {
    owner.pending = false;
    if (currentOwner(owner)) {
      busyRoot.removeAttribute('aria-busy');
      controls.forEach((control, index) => { control.disabled = disabled[index]!; });
    }
  }
}

const lightSetupDelegateRoots = new WeakSet<Document | Element>();

function parseSetupIndex(value: unknown) {
  const index = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(index) ? index : null;
}

function selectSetupSkinIndex(rawIndex: unknown) {
  const index = parseSetupIndex(rawIndex);
  if (index == null) return;
  const range = (document.getElementById('setup-skin-range') as HTMLInputElement | null);
  if (range) range.value = String(index);
  updateSetupSkinSlider(index);
}

function handleLightSetupClick(event: Event) {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  const actionElement = (target.closest('[data-light-setup-action]') as HTMLElement | null);
  if (!actionElement?.dataset || !ownsAction(actionElement)) return;

  if (activeSetup?.pending && actionElement.closest(`#${LIGHT_SETUP_OVERLAY_ID}`) && actionElement.dataset.lightSetupAction !== 'cancel-reopen') return;
  switch (actionElement.dataset.lightSetupAction || '') {
    case 'reopen':
      event.preventDefault();
      reopenSunSetup();
      break;
    case 'dismiss':
      event.preventDefault();
      void dismissSunSetup(actionElement);
      break;
    case 'cancel-reopen':
      event.preventDefault();
      cancelReopenSunSetup();
      break;
    case 'set-step':
      event.preventDefault();
      setLightSetupStep(actionElement.dataset.lightSetupStep || 'core');
      break;
    case 'save':
      event.preventDefault();
      void saveSunSetup();
      break;
    case 'select-choice':
      event.preventDefault();
      selectSetupChoice(actionElement);
      break;
    case 'select-skin':
      event.preventDefault();
      selectSetupSkinIndex(actionElement.dataset.lightSetupSkinIdx);
      break;
    case 'open-profile-location':
      event.preventDefault();
      openLightSetupProfileLocation();
      break;
    case 'request-precise-location':
      event.preventDefault();
      void requestLightSetupPreciseLocation();
      break;
    case 'clear-current-location':
      event.preventDefault();
      clearLightSetupCurrentLocation();
      break;
  }
}

function handleLightSetupInput(event: Event) {
  const input = (event.target as HTMLInputElement);
  if (!input?.dataset?.lightSetupInput || !ownsAction(input) || activeSetup?.pending) return;
  switch (input.dataset.lightSetupInput) {
    case 'ott-score':
      updateOttRunningScore();
      break;
    case 'skin-range':
      updateSetupSkinSlider(input.value);
      break;
  }
}

function handleLightSetupKeydown(event: Event) {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  if (!ownsAction(target) || activeSetup?.pending) return;
  const tab = target.closest<HTMLElement>('[data-setup-tab]');
  const key = (event as KeyboardEvent).key;
  if (tab?.closest('.light-setup-focus-modal') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
    event.preventDefault();
    const step = key === 'Home' ? 'core' : key === 'End' ? 'score'
      : tab.dataset.setupTab === 'core' ? 'score' : 'core';
    setLightSetupStep(step, { focus: false });
    tab.closest('.light-setup-focus-modal')?.querySelector<HTMLElement>(`[data-setup-tab="${step}"]`)?.focus();
    return;
  }
  const actionElement = (target.closest('[data-light-setup-action="select-skin"]') as HTMLElement | null);
  if (!actionElement?.dataset || !ownsAction(actionElement)) return;
  const index = parseSetupIndex(actionElement.dataset.lightSetupSkinIdx);
  if (index != null) skinFaceKeydown(event as KeyboardEvent, index);
}

export function installLightSetupDelegates(
  root: Document | Element | null = typeof document !== 'undefined' ? document : null,
) {
  if (!root || lightSetupDelegateRoots.has(root)) return;
  lightSetupDelegateRoots.add(root);
  root.addEventListener('click', handleLightSetupClick);
  root.addEventListener('input', handleLightSetupInput);
  root.addEventListener('keydown', handleLightSetupKeydown);
}

export function reopenSunSetup() {
  openSunSetupOverlay();
}

function cancelReopenSunSetup() {
  closeSunSetupOverlay();
}

function openSunSetupOverlay() {
  if (typeof document === 'undefined') return;
  closeSunSetupOverlay();
  const existing = document.getElementById(LIGHT_SETUP_OVERLAY_ID);
  if (existing) removeModalOverlay(existing);

  const overlay = document.createElement('div');
  overlay.id = LIGHT_SETUP_OVERLAY_ID;
  overlay.className = setupClasses('modal-overlay light-setup-focus-overlay');
  overlay.setAttribute('data-light-setup-presentation', '');
  overlay.innerHTML = renderSetupModal();

  const owner: SetupOwner = { root: overlay, session: createSunSetupSession(), pending: false };
  activeSetup = owner;
  const close = () => closeSunSetupOverlay(owner);
  overlay.querySelector('[data-light-setup-close]')?.addEventListener('click', close);
  openAppendedModalOverlay(overlay, close, {
    initialFocus: '.light-setup-focus-body', focusDelay: 40,
  });
  setLightSetupStep('core', { focus: false });
  refreshSetupProgress();
}

function closeSunSetupOverlay(owner: SetupOwner | null = activeSetup) {
  if (!owner) return;
  owner.session.retire();
  if (activeSetup === owner) activeSetup = null;
  removeModalOverlay(owner.root);
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-profile-switched', () => closeSunSetupOverlay());
}

function setLightSetupStep(step: string, opts: { focus?: boolean } = {}) {
  if (typeof document === 'undefined') return;
  const nextStep = step === 'score' ? 'score' : 'core';
  const modal = (document.querySelector('.light-setup-focus-modal') as HTMLElement | null);
  if (!modal) return;
  modal.dataset.setupStep = nextStep;
  modal.querySelectorAll('[data-setup-tab]').forEach(tab => {
    const setupTab = (tab as HTMLElement);
    const active = setupTab.dataset.setupTab === nextStep;
    setupTab.classList.toggle('active', active);
    setupTab.setAttribute('aria-selected', active ? 'true' : 'false');
    setupTab.tabIndex = active ? 0 : -1;
  });
  modal.querySelectorAll('[data-setup-pane]').forEach(pane => {
    const setupPane = (pane as HTMLElement);
    const active = setupPane.dataset.setupPane === nextStep;
    setupPane.toggleAttribute('hidden', !active);
  });
  const body = modal.querySelector('.light-setup-focus-body');
  if (body) body.scrollTop = 0;
  if (opts.focus !== false) {
    const target = (modal.querySelector(
        `[data-setup-pane="${nextStep}"] .light-setup-title, `
        + `[data-setup-pane="${nextStep}"] h4`,
      ) as HTMLElement | null);
    const focusOwner = document.activeElement;
    setTimeout(() => {
      if (target?.isConnected && modal.dataset.setupStep === nextStep && document.activeElement === focusOwner) target.focus({ preventScroll: true });
    }, 0);
  }
}

function refreshSetupLocationStatus(root: ParentNode = document) {
  if (typeof document === 'undefined') return;
  const row = root.querySelector('.light-setup-location-status');
  if (row) row.outerHTML = renderSetupLocationStatus();
}

function openLightSetupProfileLocation() {
  const ticket = captureSunSetupIdentity();
  cancelReopenSunSetup();
  setTimeout(() => { if (isCurrentSunSetupIdentity(ticket)) openSunSetupProfileLocationRuntime(); }, 0);
}

async function requestLightSetupPreciseLocation() {
  const owner = activeSetup;
  if (!owner || !currentOwner(owner)) return null;
  if (!hasSunSetupPreciseLocationRequester()) {
    showNotification('Precise location is unavailable here.');
    return null;
  }
  try {
    const coords = await requestSunSetupPreciseLocationRuntime();
    if (currentOwner(owner)) refreshSetupLocationStatus(owner.root);
    return coords;
  } catch {
    if (currentOwner(owner)) showNotification('Current location could not be read. Try again.');
    return null;
  }
}

function clearLightSetupCurrentLocation() {
  if (!clearSunSetupCurrentLocationRuntime()) {
    showNotification('Current location could not be cleared here.');
    return false;
  }
  refreshSetupLocationStatus();
  showNotification('Current location cleared — your home or country location is active again.');
  return true;
}

function readSetupFieldValue(root: Element | null, id: string) {
  const element = root?.querySelector?.(`#${id}`);
  if (!element || !('value' in element)) return null;
  const value = String(element.value || '');
  return value || null;
}

function readSetupPhotosensitiveValue(root: Element | null) {
  const element = root?.querySelector?.('#setup-photosensitive');
  if (!element) return 'unknown';
  const type = 'type' in element ? String(element.type || '') : '';
  if (type === 'checkbox') return (element as HTMLInputElement).checked ? 'moderate' : 'none';
  return readSetupFieldValue(root, 'setup-photosensitive') || 'unknown';
}

export function collectSunSetupValues(root: Element | null): CollectedSunSetup {
  if (!root) return { ok: false, reason: 'missing-root' };
  const slider = (root.querySelector('#setup-skin-range') as HTMLInputElement | null);
  const skinIndex = slider?.dataset?.set === '1'
    ? parseInt(slider.value || '', 10)
    : -1;
  const fitzpatrick = skinIndex >= 0 && skinIndex < FITZPATRICK_ROMAN.length
    ? FITZPATRICK_ROMAN[skinIndex]
    : null;
  if (!fitzpatrick) return { ok: false, reason: 'skin-type-required' };

  const ott: Record<string, boolean> = {};
  let ottScore = 0;
  for (const question of OTT_QUESTIONS) {
    const checkbox = (root.querySelector(`input[data-ott="${question.key}"]`) as HTMLInputElement | null);
    if (checkbox) {
      ott[question.key] = !!checkbox.checked;
      if (checkbox.checked) ottScore++;
    }
  }
  return {
    ok: true,
    values: {
      skinIdx: skinIndex,
      fitzpatrick,
      photosensitiveMeds: readSetupPhotosensitiveValue(root),
      homeLight: readSetupFieldValue(root, 'setup-homelight'),
      eyewear: readSetupFieldValue(root, 'setup-eyewear'),
      ott,
      ottScore,
    },
  };
}

async function saveSunSetup() {
  const owner = activeSetup;
  if (!owner || !currentOwner(owner) || owner.pending) return false;
  const root = owner.root.querySelector('.light-setup-card');
  const collected = collectSunSetupValues(root);
  if (!collected.ok) {
    if (collected.reason === 'skin-type-required') {
      setLightSetupStep('core');
      showNotification('Tap a face to confirm your skin type.');
    }
    return false;
  }
  const values = collected.values;
  if (!values) return false;
  if (!await writeSetup(owner, () => setupDeps.persistSunSetupValues(values, Date.now(), owner.session))) return false;
  closeSunSetupOverlay(owner);
  showNotification(`Light setup saved · ${values.ottScore}/10 context patterns selected`);
  maybeAnalyzeOnboardingAfterSave();
  navigateSunDefaultsRoute('light');
  return true;
}

function updateOttRunningScore() {
  const root = document.querySelector('.light-setup-card');
  if (!root) return;
  const checkboxes = root.querySelectorAll('input[data-ott]');
  let score = 0;
  checkboxes.forEach(checkbox => {
    const input = (checkbox as HTMLInputElement);
    input.closest('.light-setup-ott-card')
      ?.classList.toggle('is-flagged', input.checked);
    if (input.checked) score++;
  });
  const value = root.querySelector('#ott-running-value');
  const alignedValue = root.querySelector('#ott-running-aligned');
  const label = (root.querySelector('#ott-running-label') as HTMLElement | null);
  const summary = root.querySelector('#ott-summary-score');
  const meter = (root.querySelector('#ott-running-score') as HTMLElement | null);
  const fill = (root.querySelector('#ott-score-fill') as HTMLElement | null);
  const meta = ottScoreToLabel(score);
  if (value) value.textContent = `${score}/10`;
  if (alignedValue) alignedValue.textContent = `${score}/10`;
  if (meter) meter.dataset.tier = String(meta.tier);
  if (fill) fill.style.width = `${score * 10}%`;
  if (label) {
    const previousTier = label.dataset.tier;
    const nextTier = String(meta.tier);
    label.textContent = meta.label;
    for (const token of [...label.classList]) {
      if (/^light-ott-tier-\d+$/.test(token)) label.classList.remove(token);
    }
    label.classList.add(`light-ott-tier-${meta.tier}`);
    label.dataset.tier = nextTier;
    if (previousTier !== undefined && previousTier !== nextTier) {
      label.classList.add('tier-changed');
      setTimeout(() => label.classList.remove('tier-changed'), 600);
    }
  }
  if (summary) summary.textContent = `${score}/10 selected`;
}

function updateSetupSkinSlider(value: string | number) {
  const index = parseInt(value as string, 10);
  document.querySelectorAll('.light-setup-card .ctx-skin-face')
    .forEach((element, elementIndex) => {
      const active = elementIndex === index;
      element.classList.toggle('active', active);
      element.setAttribute('aria-checked', active ? 'true' : 'false');
      element.setAttribute('tabindex', active ? '0' : '-1');
    });
  const label = document.getElementById('setup-skin-label');
  const valid = index >= 0 && index < SKIN_TYPE.length;
  const skinLabel = valid
    ? SKIN_TYPE[index]!
    : 'Tap a face or drag the slider';
  const descriptor = valid ? FITZPATRICK_DESCRIPTOR[index] : '';
  if (label) {
    if (valid) {
      label.innerHTML = renderSetupSkinLabel(index);
    } else {
      label.textContent = skinLabel;
    }
  }
  const range = document.getElementById('setup-skin-range');
  if (range) {
    range.dataset.set = '1';
    range.setAttribute(
      'aria-valuetext',
      valid ? `${skinLabel} — ${descriptor}` : 'not set',
    );
  }
  refreshSetupProgress();
}

function selectSetupChoice(button: HTMLElement | null) {
  const group = button?.dataset?.choiceGroup;
  if (!group) return;
  const card = button.closest('.light-setup-card');
  const input = card?.querySelector(`#${group}`);
  if (!input) return;
  (input as HTMLInputElement).value = button.dataset.value || '';
  card!.querySelectorAll(`[data-choice-group="${group}"]`).forEach(element => {
    const active = element === button;
    element.classList.toggle('active', active);
    element.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  refreshSetupProgress();
}

function refreshSetupProgress() {
  const card = document.querySelector('.light-setup-card');
  if (!card) return;
  const skin = (card.querySelector('#setup-skin-range') as HTMLInputElement | null);
  const home = (card.querySelector('#setup-homelight') as HTMLSelectElement | null);
  const eyewear = (card.querySelector('#setup-eyewear') as HTMLSelectElement | null);
  const filled = [
    skin?.dataset.set === '1',
    !!home?.value,
    !!eyewear?.value,
  ].filter(Boolean).length;
  const progress = card.querySelector('.light-setup-progress');
  if (progress) {
    progress.textContent = `${filled}/3 done`;
    progress.setAttribute('aria-label', `${filled} of 3 questions done`);
  }
  const saveButton = card.closest('.light-setup-focus-modal')
    ?.querySelector('.light-setup-save-btn')
    || card.querySelector('.light-setup-save-btn');
  if (saveButton && !isOnboardingComplete()) {
    saveButton.textContent = 'Save setup';
  }
}

async function dismissSunSetup(action: HTMLElement) {
  const prompt = action.closest<HTMLElement>('[data-light-widget-prompt]');
  if (prompt && (pendingPrompts.has(prompt) || isOnboardingComplete())) return;
  const owner = prompt ? { root: prompt, session: createSunSetupSession(), pending: false } : activeSetup;
  if (!owner) return;
  if (prompt) pendingPrompts.add(prompt);
  try {
    if (!await writeSetup(owner, () => setupDeps.saveSunDefaults({ skipped: true, setupPromptDismissedAt: Date.now() }, owner.session))) return;
    if (!prompt) closeSunSetupOverlay(owner);
    navigateSunDefaultsRoute('light');
  } finally {
    if (prompt) { pendingPrompts.delete(prompt); owner.session.retire(); }
  }
}

function skinFaceKeydown(event: KeyboardEvent, index: number) {
  const max = FITZPATRICK_ROMAN.length - 1;
  let next: number | null = null;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown': next = (index + 1) % (max + 1); break;
    case 'ArrowLeft':
    case 'ArrowUp': next = (index - 1 + (max + 1)) % (max + 1); break;
    case 'Home': next = 0; break;
    case 'End': next = max; break;
    case 'Enter':
    case ' ': {
      event.preventDefault();
      const range = (document.getElementById('setup-skin-range') as HTMLInputElement | null);
      if (range) range.value = String(index);
      updateSetupSkinSlider(index);
      return;
    }
  }
  if (next == null) return;
  event.preventDefault();
  const target = (document.querySelector(`.ctx-skin-face[data-idx="${next}"]`) as HTMLElement | null);
  target?.focus();
}

installLightSetupDelegates();

export { renderSetupCard };
