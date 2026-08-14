// @ts-check
// sun-defaults-setup-ui.js — Light setup modal lifecycle and delegated behavior.

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
  renderSetupActions,
  renderSetupCard,
  renderSetupEditor,
  renderSetupLocationStatus,
} from './sun-defaults-setup-renderer.js';
import {
  hasSunSetupPreciseLocationRequester,
  navigateSunDefaultsRoute,
  openSunSetupProfileLocationRuntime,
  requestSunSetupPreciseLocationRuntime,
} from './sun-defaults-runtime.js';
import { escapeHTML, showNotification } from './utils.js';

const LIGHT_SETUP_OVERLAY_ID = 'light-setup-focus-overlay';

/** @type {{ getSunDefaults: AnyFunction, isOnboardingComplete: AnyFunction, saveSunDefaults: AnyFunction, persistSunSetupValues: AnyFunction, maybeAnalyzeOnboardingAfterSave: AnyFunction, renderOnboardingAIBlock: AnyFunction }} */
const setupDeps = {
  getSunDefaults: () => null,
  isOnboardingComplete: () => false,
  saveSunDefaults: async () => false,
  persistSunSetupValues: async () => null,
  maybeAnalyzeOnboardingAfterSave: () => {},
  renderOnboardingAIBlock: () => '',
};

function syncRendererDeps() {
  configureSunDefaultsSetupRenderer({
    getSunDefaults: setupDeps.getSunDefaults,
    isOnboardingComplete: setupDeps.isOnboardingComplete,
    renderOnboardingAIBlock: setupDeps.renderOnboardingAIBlock,
  });
}

export function configureSunDefaultsSetupUI(deps = {}) {
  Object.assign(setupDeps, deps);
  syncRendererDeps();
}

// Public startup hook retained by the sun-defaults facade.
export function configureSunDefaults(deps = {}) {
  Object.assign(setupDeps, deps);
  syncRendererDeps();
}

function maybeAnalyzeOnboardingAfterSave() {
  try { setupDeps.maybeAnalyzeOnboardingAfterSave(); } catch (_) {}
}

function isOnboardingComplete() {
  return !!setupDeps.isOnboardingComplete();
}

let lightSetupDelegatesInstalled = false;

function parseSetupIndex(value) {
  const index = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(index) ? index : null;
}

function selectSetupSkinIndex(rawIndex) {
  const index = parseSetupIndex(rawIndex);
  if (index == null) return;
  const range = /** @type {HTMLInputElement | null} */ (
    document.getElementById('setup-skin-range')
  );
  if (range) range.value = String(index);
  updateSetupSkinSlider(index);
}

function handleLightSetupClick(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionElement = /** @type {HTMLElement | null} */ (
    target.closest('[data-light-setup-action]')
  );
  if (!actionElement?.dataset) return;

  switch (actionElement.dataset.lightSetupAction || '') {
    case 'reopen':
      event.preventDefault();
      reopenSunSetup();
      break;
    case 'dismiss':
      event.preventDefault();
      void dismissSunSetup();
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
  }
}

function handleLightSetupInput(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (!input?.dataset?.lightSetupInput) return;
  switch (input.dataset.lightSetupInput) {
    case 'ott-score':
      updateOttRunningScore();
      break;
    case 'skin-range':
      updateSetupSkinSlider(input.value);
      break;
  }
}

function handleLightSetupKeydown(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  const actionElement = /** @type {HTMLElement | null} */ (
    target.closest('[data-light-setup-action="select-skin"]')
  );
  if (!actionElement?.dataset) return;
  const index = parseSetupIndex(actionElement.dataset.lightSetupSkinIdx);
  if (index != null) skinFaceKeydown(event, index);
}

export function installLightSetupDelegates(
  root = typeof document !== 'undefined' ? document : null,
) {
  if (!root || lightSetupDelegatesInstalled) return;
  lightSetupDelegatesInstalled = true;
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
  const existing = document.getElementById(LIGHT_SETUP_OVERLAY_ID);
  if (existing) removeModalOverlay(existing);

  const overlay = document.createElement('div');
  overlay.id = LIGHT_SETUP_OVERLAY_ID;
  overlay.className = 'modal-overlay light-setup-focus-overlay';
  overlay.innerHTML = `<div class="modal light-setup-focus-modal" data-setup-step="core" role="dialog" aria-modal="true" aria-labelledby="light-setup-focus-title">
    <header class="light-setup-focus-head">
      <div>
        <div class="gb-modal-kicker">Light baseline</div>
        <h3 id="light-setup-focus-title">Personalize Light</h3>
        <p>Connect skin, location, indoor lighting, eyewear, and daily spectrum patterns to your Light context.</p>
      </div>
      <button type="button" class="modal-close" aria-label="Close light setup" data-light-setup-close>&times;</button>
    </header>
    <div class="light-setup-focus-body" tabindex="-1">
      ${renderSetupEditor({ includeActions: false })}
    </div>
    ${renderSetupActions()}
  </div>`;

  overlay.querySelector('[data-light-setup-close]')
    ?.addEventListener('click', closeSunSetupOverlay);
  openAppendedModalOverlay(overlay, closeSunSetupOverlay);

  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setLightSetupStep('core', { focus: false });
  const focusBody = () => {
    const body = /** @type {HTMLElement | null} */ (
      overlay.querySelector('.light-setup-focus-body')
    );
    body?.focus({ preventScroll: true });
  };
  setTimeout(() => {
    refreshSetupProgress();
    focusBody();
  }, 40);
  setTimeout(focusBody, 120);
}

function closeSunSetupOverlay() {
  const overlay = typeof document !== 'undefined'
    ? document.getElementById(LIGHT_SETUP_OVERLAY_ID)
    : null;
  if (overlay) removeModalOverlay(overlay);
}

function setLightSetupStep(step, opts = {}) {
  if (typeof document === 'undefined') return;
  const nextStep = step === 'score' ? 'score' : 'core';
  const modal = /** @type {HTMLElement | null} */ (
    document.querySelector('.light-setup-focus-modal')
  );
  if (!modal) return;
  modal.dataset.setupStep = nextStep;
  modal.querySelectorAll('[data-setup-tab]').forEach(tab => {
    const setupTab = /** @type {HTMLElement} */ (tab);
    const active = setupTab.dataset.setupTab === nextStep;
    setupTab.classList.toggle('active', active);
    setupTab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  modal.querySelectorAll('[data-setup-pane]').forEach(pane => {
    const setupPane = /** @type {HTMLElement} */ (pane);
    const active = setupPane.dataset.setupPane === nextStep;
    setupPane.toggleAttribute('hidden', !active);
  });
  const body = modal.querySelector('.light-setup-focus-body');
  if (body) body.scrollTop = 0;
  if (opts.focus !== false) {
    const target = /** @type {HTMLElement | null} */ (
      modal.querySelector(
        `[data-setup-pane="${nextStep}"] .light-setup-title, `
        + `[data-setup-pane="${nextStep}"] h4`,
      )
    );
    setTimeout(() => target?.focus({ preventScroll: true }), 0);
  }
}

function refreshSetupLocationStatus() {
  if (typeof document === 'undefined') return;
  const row = document.querySelector('.light-setup-location-status');
  if (row) row.outerHTML = renderSetupLocationStatus();
}

function openLightSetupProfileLocation() {
  cancelReopenSunSetup();
  setTimeout(openSunSetupProfileLocationRuntime, 0);
}

async function requestLightSetupPreciseLocation() {
  if (!hasSunSetupPreciseLocationRequester()) {
    showNotification('Precise location is unavailable here.');
    return null;
  }
  const coords = await requestSunSetupPreciseLocationRuntime();
  refreshSetupLocationStatus();
  return coords;
}

function readSetupFieldValue(root, id) {
  const element = root?.querySelector?.(`#${id}`);
  if (!element || !('value' in element)) return null;
  const value = String(element.value || '');
  return value || null;
}

function readSetupPhotosensitiveValue(root) {
  const element = root?.querySelector?.('#setup-photosensitive');
  if (!element) return 'unknown';
  const type = 'type' in element ? String(element.type || '') : '';
  if (type === 'checkbox') return element.checked ? 'moderate' : 'none';
  return readSetupFieldValue(root, 'setup-photosensitive') || 'unknown';
}

export function collectSunSetupValues(root) {
  if (!root) return { ok: false, reason: 'missing-root' };
  const slider = /** @type {HTMLInputElement | null} */ (
    root.querySelector('#setup-skin-range')
  );
  const skinIndex = slider?.dataset?.set === '1'
    ? parseInt(slider.value || '', 10)
    : -1;
  const fitzpatrick = skinIndex >= 0 && skinIndex < FITZPATRICK_ROMAN.length
    ? FITZPATRICK_ROMAN[skinIndex]
    : null;
  if (!fitzpatrick) return { ok: false, reason: 'skin-type-required' };

  const ott = {};
  let ottScore = 0;
  for (const question of OTT_QUESTIONS) {
    const checkbox = /** @type {HTMLInputElement | null} */ (
      root.querySelector(`input[data-ott="${question.key}"]`)
    );
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
  const root = document.querySelector('.light-setup-card');
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
  await setupDeps.persistSunSetupValues(values);
  closeSunSetupOverlay();
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
    const input = /** @type {HTMLInputElement} */ (checkbox);
    input.closest('.light-setup-ott-card')
      ?.classList.toggle('is-flagged', input.checked);
    if (input.checked) score++;
  });
  const value = root.querySelector('#ott-running-value');
  const alignedValue = root.querySelector('#ott-running-aligned');
  const label = /** @type {HTMLElement | null} */ (
    root.querySelector('#ott-running-label')
  );
  const summary = root.querySelector('#ott-summary-score');
  const meter = /** @type {HTMLElement | null} */ (
    root.querySelector('#ott-running-score')
  );
  const fill = /** @type {HTMLElement | null} */ (
    root.querySelector('#ott-score-fill')
  );
  const meta = ottScoreToLabel(score);
  if (value) value.textContent = `${score}/10`;
  if (alignedValue) alignedValue.textContent = `${score}/10`;
  if (meter) meter.dataset.tier = String(meta.tier);
  if (fill) fill.style.width = `${score * 10}%`;
  if (label) {
    const previousTier = label.dataset.tier;
    const nextTier = String(meta.tier);
    label.textContent = meta.label;
    label.className = `light-ott-badge light-ott-tier-${meta.tier}`;
    label.dataset.tier = nextTier;
    if (previousTier !== undefined && previousTier !== nextTier) {
      label.classList.add('tier-changed');
      setTimeout(() => label.classList.remove('tier-changed'), 600);
    }
  }
  if (summary) summary.textContent = `${score}/10 selected`;
}

function updateSetupSkinSlider(value) {
  const index = parseInt(value, 10);
  document.querySelectorAll('.light-setup-card .ctx-skin-face')
    .forEach((element, elementIndex) => {
      const active = elementIndex === index;
      element.classList.toggle('active', active);
      element.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  const label = document.getElementById('setup-skin-label');
  const valid = index >= 0 && index < SKIN_TYPE.length;
  const skinLabel = valid
    ? SKIN_TYPE[index]
    : 'Tap a face or drag the slider';
  const descriptor = valid ? FITZPATRICK_DESCRIPTOR[index] : '';
  if (label) {
    if (valid) {
      label.innerHTML = `${escapeHTML(skinLabel)}<span class="ctx-skin-label-detail" id="setup-skin-label-detail">${escapeHTML(descriptor)}</span>`;
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

function selectSetupChoice(button) {
  const group = button?.dataset?.choiceGroup;
  if (!group) return;
  const card = button.closest('.light-setup-card');
  const input = card?.querySelector(`#${group}`);
  if (!input) return;
  input.value = button.dataset.value || '';
  card.querySelectorAll(`[data-choice-group="${group}"]`).forEach(element => {
    const active = element === button;
    element.classList.toggle('active', active);
    element.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  refreshSetupProgress();
}

function refreshSetupProgress() {
  const card = document.querySelector('.light-setup-card');
  if (!card) return;
  const skin = /** @type {HTMLInputElement | null} */ (
    card.querySelector('#setup-skin-range')
  );
  const home = /** @type {HTMLSelectElement | null} */ (
    card.querySelector('#setup-homelight')
  );
  const eyewear = /** @type {HTMLSelectElement | null} */ (
    card.querySelector('#setup-eyewear')
  );
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

async function dismissSunSetup() {
  await setupDeps.saveSunDefaults({
    skipped: true,
    setupPromptDismissedAt: Date.now(),
  });
  closeSunSetupOverlay();
  navigateSunDefaultsRoute('light');
}

function skinFaceKeydown(event, index) {
  const max = FITZPATRICK_ROMAN.length - 1;
  let next = null;
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
      const range = /** @type {HTMLInputElement | null} */ (
        document.getElementById('setup-skin-range')
      );
      if (range) range.value = String(index);
      updateSetupSkinSlider(index);
      return;
    }
  }
  if (next == null) return;
  event.preventDefault();
  const target = /** @type {HTMLElement | null} */ (
    document.querySelector(`.ctx-skin-face[data-idx="${next}"]`)
  );
  target?.focus();
}

installLightSetupDelegates();

export { renderSetupCard };
