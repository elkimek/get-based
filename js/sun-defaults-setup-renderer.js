// @ts-check
// sun-defaults-setup-renderer.js — Light setup cards, editor, and location HTML.

import { SKIN_TYPE } from './constants.js';
import { state } from './state.js';
import {
  getSunSetupCoords,
  getSunSetupProfileLocation,
} from './sun-defaults-runtime.js';
import {
  EYEWEAR_OPTIONS,
  FITZPATRICK_DESCRIPTOR,
  FITZPATRICK_ROMAN,
  fitzpatrickToSkinTypeIndex,
  HOME_LIGHT_OPTIONS,
  OTT_QUESTIONS,
  ottScoreToLabel,
  PHOTOSENSITIVE_OPTIONS,
  photosensitiveTierOf,
  skinTypeToFitzpatrick,
} from './sun-defaults-model.js';
import { escapeAttr, escapeHTML } from './utils.js';

/** @type {{ getSunDefaults: AnyFunction, isOnboardingComplete: AnyFunction, renderOnboardingAIBlock: AnyFunction }} */
const rendererDeps = {
  getSunDefaults: () => null,
  isOnboardingComplete: () => false,
  renderOnboardingAIBlock: () => '',
};

export function configureSunDefaultsSetupRenderer(deps = {}) {
  Object.assign(rendererDeps, deps);
}

function getSunDefaults() {
  return rendererDeps.getSunDefaults();
}

function isOnboardingComplete() {
  return !!rendererDeps.isOnboardingComplete();
}

function renderOnboardingAIBlock() {
  try { return rendererDeps.renderOnboardingAIBlock() || ''; } catch (_) { return ''; }
}

function getInitialFitzpatrick() {
  const saved = state.importedData?.sunDefaults?.fitzpatrick;
  if (saved) return saved;
  return skinTypeToFitzpatrick(state.importedData?.lightCircadian?.skinType);
}

export function lightSetupActionAttrs(action, data = {}) {
  const attrs = [`data-light-setup-action="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') {
      attrs.push(`data-light-setup-${key}="${escapeAttr(String(value))}"`);
    }
  }
  return attrs.join(' ');
}

function lightSetupInputAttrs(input) {
  return `data-light-setup-input="${escapeAttr(input)}"`;
}

function renderSavedSummary() {
  const defaults = getSunDefaults() || {};
  const lightSkin = state.importedData?.lightCircadian?.skinType;
  const fitzpatrick = defaults.fitzpatrick || skinTypeToFitzpatrick(lightSkin);
  const skinIndex = fitzpatrick ? fitzpatrickToSkinTypeIndex(fitzpatrick) : -1;
  const skinLabel = skinIndex >= 0 ? SKIN_TYPE[skinIndex] : '—';
  const homeMeta = HOME_LIGHT_OPTIONS.find(option => option.key === defaults.homeLight);
  const eyewearMeta = EYEWEAR_OPTIONS.find(option => option.key === defaults.eyewear);

  const skinEmoji = ['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'][skinIndex] || '🧑';
  const homeIconMap = {
    'led-cool': '💡', 'led-warm': '💡', 'led-tunable': '💡',
    'fluorescent': '🌫️', 'incandescent': '🔥', 'halogen': '🔥',
    'candle': '🕯️', 'mixed': '✨', 'natural-only': '☀️', 'unknown': '❔',
  };
  const homeAccentMap = {
    'led-cool': 'cool', 'led-warm': 'warm', 'led-tunable': 'cool',
    'fluorescent': 'cool', 'incandescent': 'warm', 'halogen': 'warm',
    'candle': 'warm', 'natural-only': 'sun', 'mixed': 'neutral', 'unknown': 'neutral',
  };
  const homeIcon = homeIconMap[defaults.homeLight] || '💡';
  const homeAccent = homeAccentMap[defaults.homeLight] || 'neutral';
  const homeShort = (homeMeta?.label || defaults.homeLight || 'Not set').replace(/\s*\(.*\)/, '');
  const eyewearIconMap = {
    'none': '👁', 'sunglasses': '🕶', 'clear-glasses': '👓',
    'both': '🕶', 'contacts-uv': '👀',
  };
  const eyewearIcon = eyewearIconMap[defaults.eyewear] || '👁';
  const eyewearShort = (eyewearMeta?.label || defaults.eyewear || 'Not set')
    .split('—')[0].split(/[(,]/)[0].trim();

  let burdenChip;
  if (typeof defaults.ottScore === 'number') {
    const { label, tier } = ottScoreToLabel(defaults.ottScore);
    burdenChip = `<div class="light-setup-chip light-setup-chip-ott light-setup-chip-tier-${tier}" title="Context patterns selected (0–10). This educational map mixes established circadian factors with exploratory spectrum questions; it is not a clinical score.">
      <div class="light-setup-chip-icon">☀</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light patterns</div>
        <div class="light-setup-chip-value">${escapeHTML(label)}</div>
        <div class="light-setup-chip-sub">${defaults.ottScore}/10 selected</div>
      </div>
    </div>`;
  } else if (defaults.skipped) {
    burdenChip = `<div class="light-setup-chip light-setup-chip-skipped">
      <div class="light-setup-chip-icon">⏭</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light patterns</div>
        <div class="light-setup-chip-value">Skipped</div>
        <div class="light-setup-chip-sub">tap Edit to fill in</div>
      </div>
    </div>`;
  } else {
    burdenChip = `<div class="light-setup-chip light-setup-chip-unset">
      <div class="light-setup-chip-icon">·</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light patterns</div>
        <div class="light-setup-chip-value">—</div>
      </div>
    </div>`;
  }

  const psmTier = photosensitiveTierOf(defaults.photosensitiveMeds);
  const psmCopy = {
    unknown:  { label: 'Medication and product sunlight warnings not reviewed' },
    mild:     { label: 'Possible photosensitivity warning recorded' },
    moderate: { label: 'Known photosensitivity warning recorded' },
    severe:   { label: 'Prior reaction or strict sun warning recorded' },
  }[psmTier];
  const photoBanner = psmCopy
    ? `<div class="light-setup-photo-banner" title="Medication, dose, formulation, and reaction differ too much for a universal burn multiplier.">⚠ ${escapeHTML(psmCopy.label)} — burn time remains an unadjusted base estimate; follow the label or clinician.</div>`
    : '';

  return `<div class="light-setup-summary">
    <div class="light-setup-summary-head">
      <span class="light-setup-summary-headline">
        <span class="light-setup-summary-tick">✓</span>
        Your light setup
      </span>
      <button class="import-btn import-btn-secondary light-setup-summary-edit" ${lightSetupActionAttrs('reopen')}>Edit</button>
    </div>
    ${photoBanner}
    <div class="light-setup-chips-grid">
      <div class="light-setup-chip light-setup-chip-skin" title="${escapeAttr('Fitzpatrick ' + skinLabel + ' — drives MED math + UV tolerance.')}">
        <div class="light-setup-chip-icon">${skinEmoji}</div>
        <div class="light-setup-chip-body">
          <div class="light-setup-chip-label">Skin type</div>
          <div class="light-setup-chip-value">${escapeHTML(skinLabel)}</div>
        </div>
      </div>
      <div class="light-setup-chip light-setup-chip-home light-setup-chip-home-${homeAccent}" title="${escapeAttr(homeMeta?.label || defaults.homeLight || 'Not set')}">
        <div class="light-setup-chip-icon">${homeIcon}</div>
        <div class="light-setup-chip-body">
          <div class="light-setup-chip-label">Home lighting</div>
          <div class="light-setup-chip-value">${escapeHTML(homeShort)}</div>
        </div>
      </div>
      <div class="light-setup-chip light-setup-chip-eyewear" title="${escapeAttr(eyewearMeta?.label || defaults.eyewear || 'Not set')}">
        <div class="light-setup-chip-icon">${eyewearIcon}</div>
        <div class="light-setup-chip-body">
          <div class="light-setup-chip-label">Eyewear outside</div>
          <div class="light-setup-chip-value">${escapeHTML(eyewearShort)}</div>
        </div>
      </div>
      ${burdenChip}
    </div>
    ${renderOnboardingAIBlock()}
  </div>`;
}

export function renderSetupCard() {
  return isOnboardingComplete() ? renderSavedSummary() : renderSetupPrompt();
}

function renderSetupPrompt() {
  const deferred = !!getSunDefaults()?.setupPromptDismissedAt;
  return `<div class="light-setup-prompt light-widget-prompt">
    <div class="light-widget-prompt-copy">
      <strong>${deferred ? 'Light setup not finished' : 'Make light part of your health picture'}</strong>
      <p>${deferred
        ? 'Confirm skin type before starting sun or device sessions; add the rest whenever you are ready.'
        : 'A short setup connects skin, daylight, indoor lighting, eyewear, and spectrum patterns to your Light context.'}</p>
    </div>
    <div class="light-setup-prompt-actions">
      ${deferred ? '' : `<button type="button" class="dashboard-action-btn" ${lightSetupActionAttrs('dismiss')}>Later</button>`}
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta" ${lightSetupActionAttrs('reopen')}>Personalize Light</button>
    </div>
  </div>`;
}

function getSetupFilledCount() {
  const defaults = getSunDefaults() || {};
  const filled = [
    !!getInitialFitzpatrick(),
    !!defaults.homeLight,
    !!defaults.eyewear,
  ];
  return filled.filter(Boolean).length;
}

export function renderSetupActions() {
  return `<div class="light-setup-actions" data-setup-actions="core">
    ${isOnboardingComplete()
      ? `<button class="import-btn import-btn-secondary" ${lightSetupActionAttrs('cancel-reopen')}>Cancel</button>
         <button class="import-btn import-btn-primary light-setup-next-btn" ${lightSetupActionAttrs('set-step', { step: 'score' })}>Next: Light patterns</button>`
      : `<button class="import-btn import-btn-tertiary light-setup-skip-btn" ${lightSetupActionAttrs('dismiss')}>I'll do this later</button>
         <button class="import-btn import-btn-primary light-setup-next-btn" ${lightSetupActionAttrs('set-step', { step: 'score' })}>Next: Light patterns</button>`}
  </div>
  <div class="light-setup-actions" data-setup-actions="score">
    <button class="import-btn import-btn-secondary" ${lightSetupActionAttrs('set-step', { step: 'core' })}>Back</button>
    ${isOnboardingComplete()
      ? `<button class="import-btn import-btn-primary light-setup-save-btn" ${lightSetupActionAttrs('save')}>Save changes</button>`
      : `<button class="import-btn import-btn-primary light-setup-save-btn" ${lightSetupActionAttrs('save')}>Save setup</button>`}
  </div>`;
}

function renderSetupChoiceGroup(id, options, selected, className = '') {
  return `<input type="hidden" id="${escapeAttr(id)}" value="${escapeAttr(selected || '')}">
    <div class="light-setup-choice-grid ${className}" role="group" aria-label="${escapeAttr(id.replace(/^setup-/, '').replaceAll('-', ' '))}">
      ${options.map(option => {
        const active = selected === option.key;
        return `<button type="button" class="light-setup-choice${active ? ' active' : ''}" data-choice-group="${escapeAttr(id)}" data-value="${escapeAttr(option.key)}" aria-pressed="${active ? 'true' : 'false'}" ${lightSetupActionAttrs('select-choice')}>
          <span class="light-setup-choice-label">${escapeHTML(option.label)}</span>
          ${option.sub ? `<span class="light-setup-choice-sub">${escapeHTML(option.sub)}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`;
}

function renderOttScoreMeter(score) {
  const selected = Math.max(0, Math.min(10, Number(score) || 0));
  const meta = ottScoreToLabel(selected);
  return `<div class="light-setup-ott-running light-setup-score-meter" id="ott-running-score" data-tier="${escapeAttr(String(meta.tier))}">
    <div class="light-setup-score-main">
      <span>Patterns selected</span>
      <strong id="ott-running-aligned">${selected}/10</strong>
    </div>
    <div class="light-setup-score-bar" aria-hidden="true">
      <span id="ott-score-fill" style="width:${selected * 10}%"></span>
    </div>
    <div class="light-setup-score-meta">
      <span class="light-setup-score-gap-count">Context noted: <strong id="ott-running-value">${selected}/10</strong></span>
      <span class="light-ott-badge light-ott-tier-${meta.tier}" id="ott-running-label" data-tier="${escapeAttr(String(meta.tier))}">${escapeHTML(meta.label)}</span>
      <span class="light-setup-ott-summary-score" id="ott-summary-score">${selected}/10 selected</span>
    </div>
  </div>`;
}

function renderOttQuestion(question, index, checked) {
  return `<label class="light-setup-ott-q light-setup-ott-card${checked ? ' is-flagged' : ''}">
    <input class="light-setup-ott-input" type="checkbox" data-ott="${escapeAttr(question.key)}"${checked ? ' checked' : ''} ${lightSetupInputAttrs('ott-score')}>
    <span class="light-setup-ott-card-mark" aria-hidden="true"><span>${index + 1}</span></span>
    <span class="light-setup-ott-q-body">
      <span class="light-setup-ott-q-top">
        <span class="light-setup-ott-q-text">${escapeHTML(question.text)}</span>
        <span class="light-setup-ott-q-state light-setup-ott-q-state-clear">Not selected</span>
        <span class="light-setup-ott-q-state light-setup-ott-q-state-flagged">Context noted</span>
      </span>
      ${question.why ? `<span class="light-setup-ott-q-why">${escapeHTML(question.why)}</span>` : ''}
    </span>
  </label>`;
}

export function renderSetupEditor({ includeActions = true } = {}) {
  const defaults = getSunDefaults() || {};
  const filledCount = getSetupFilledCount();
  const burden = defaults.ott
    ? Object.values(defaults.ott).filter(value => value).length
    : 0;
  const initialFitzpatrick = getInitialFitzpatrick();
  const skinIndex = initialFitzpatrick
    ? fitzpatrickToSkinTypeIndex(initialFitzpatrick)
    : 2;

  return `<div class="light-setup-card light-setup-card-editor">
    <div class="light-setup-step-tabs" role="tablist" aria-label="Light setup steps">
      <button type="button" class="light-setup-step-tab active" data-setup-tab="core" role="tab" aria-selected="true" ${lightSetupActionAttrs('set-step', { step: 'core' })}>
        <span class="light-setup-step-tab-index">1</span>
        <span>Your baseline</span>
      </button>
      <button type="button" class="light-setup-step-tab" data-setup-tab="score" role="tab" aria-selected="false" ${lightSetupActionAttrs('set-step', { step: 'score' })}>
        <span class="light-setup-step-tab-index">2</span>
        <span>Light patterns</span>
      </button>
    </div>

    <section class="light-setup-pane" data-setup-pane="core">
    <div class="light-setup-title" tabindex="-1">Your light baseline
      <span class="light-setup-progress" aria-label="${filledCount} of 3 questions done">${filledCount}/3 done</span>
    </div>
    <p class="light-setup-lead"><strong>Step 1 of 2.</strong> Connect skin, location, typical indoor lighting, and eyewear to one shared Light baseline. These answers shape context and estimates; they do not guarantee a safe exposure.</p>
    ${renderSetupLocationStatus()}

    <div class="light-setup-fields-grid">
    <div class="light-setup-step">
      <label class="ctx-label" id="setup-skin-label-id">Skin type</label>
      <p class="light-setup-step-why">Required before sun or device sessions. It selects the rough Fitzpatrick base-MED reference used by UV estimates; it is not a personal safe-time guarantee.</p>
      <div class="ctx-skin-slider-wrap">
        <div class="ctx-skin-emojis" role="radiogroup" aria-labelledby="setup-skin-label-id">${['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'].map((emoji, index) => {
          const active = initialFitzpatrick === FITZPATRICK_ROMAN[index];
          const inTabOrder = active || (!initialFitzpatrick && index === 2);
          return `<span class="ctx-skin-face${active ? ' active' : ''}" data-idx="${index}" data-roman="${FITZPATRICK_ROMAN[index]}" role="radio" tabindex="${inTabOrder ? '0' : '-1'}" aria-checked="${active ? 'true' : 'false'}" aria-label="Fitzpatrick ${escapeAttr(SKIN_TYPE[index])}" ${lightSetupActionAttrs('select-skin', { 'skin-idx': index })}>${emoji}</span>`;
        }).join('')}</div>
        <input type="range" min="0" max="5" value="${skinIndex}" class="ctx-skin-range" id="setup-skin-range" ${lightSetupInputAttrs('skin-range')} data-set="${initialFitzpatrick ? '1' : '0'}" aria-valuetext="${initialFitzpatrick ? escapeAttr(SKIN_TYPE[skinIndex]) : 'not set — tap a face'}">
        <div class="ctx-skin-label" id="setup-skin-label">${initialFitzpatrick ? `${escapeHTML(SKIN_TYPE[skinIndex])}<span class="ctx-skin-label-detail" id="setup-skin-label-detail">${escapeHTML(FITZPATRICK_DESCRIPTOR[skinIndex])}</span>` : 'Tap a face or drag the slider'}</div>
      </div>
    </div>

    <div class="light-setup-step light-setup-photo-row">
      <div class="ctx-label"><strong>Photosensitizing meds / supplements</strong></div>
      ${renderSetupChoiceGroup('setup-photosensitive', PHOTOSENSITIVE_OPTIONS, photosensitiveTierOf(defaults.photosensitiveMeds), 'light-setup-choice-grid-compact')}
      <p class="light-setup-photo-why">Records a separate caution. The app does not invent a universal burn multiplier because drug, dose, formulation, and reaction type matter. <a href="https://www.aad.org/public/everyday-care/sun-protection/sunburn/photosensitive-medications" target="_blank" rel="noopener">Review examples →</a></p>
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Home lighting</div>
      <p class="light-setup-step-why">Adds qualitative indoor-spectrum context. A bulb category alone cannot determine melanopic dose without intensity, distance, timing, and spectrum.</p>
      ${renderSetupChoiceGroup('setup-homelight', HOME_LIGHT_OPTIONS, defaults.homeLight, 'light-setup-choice-grid-compact')}
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Eyewear outside</div>
      <p class="light-setup-step-why">Eyewear changes the spectrum reaching the eye. Circadian input is mainly visible light; ocular UV–POMC / α-MSH signaling is an exploratory mouse finding, not a reason to expose eyes to UV or remove protection.</p>
      ${renderSetupChoiceGroup('setup-eyewear', EYEWEAR_OPTIONS, defaults.eyewear)}
    </div>

    </div>
    </section>

    <section class="light-setup-pane" data-setup-pane="score">
    <section class="light-setup-ott">
      <div class="light-setup-ott-head">
        <div>
          <div class="light-setup-ott-kicker">Your typical light day</div>
          <h4 tabindex="-1">Select the timing and spectrum patterns that are true for you</h4>
        </div>
      </div>
      <p class="light-setup-body light-setup-ott-lead"><strong>Step 2 of 2.</strong> This is an educational context map, not a clinical score. Sunscreen and eyewear record spectral filtering; selecting them is not advice to stop protection.</p>
      ${renderOttScoreMeter(defaults.ott ? burden : ((typeof defaults.ottScore === 'number') ? defaults.ottScore : 0))}
      <div class="light-setup-ott-questions">
        ${OTT_QUESTIONS.map((question, index) => renderOttQuestion(question, index, !!(defaults.ott && defaults.ott[question.key]))).join('')}
      </div>
    </section>
    </section>

    ${includeActions ? renderSetupActions() : ''}
  </div>`;
}

function formatSetupLatitude(latitude) {
  const numericLatitude = Number(latitude);
  if (!Number.isFinite(numericLatitude)) return '';
  const digits = Math.abs(numericLatitude) >= 10 ? 1 : 2;
  return `${Math.abs(numericLatitude).toFixed(digits)}°${numericLatitude < 0 ? 'S' : 'N'}`;
}

function getSetupLocationStatus() {
  const coords = getSunSetupCoords();
  const location = getSunSetupProfileLocation();
  const country = (location?.country || '').trim();
  const latitude = coords ? formatSetupLatitude(coords.lat) : '';

  if (coords?.source === 'current-device') {
    return {
      tone: 'precise',
      value: `Current location${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'today only',
      detail: 'Privacy-rounded in this tab and cleared at local midnight; it is not saved to your profile.',
      preciseLabel: 'Refresh current location',
      clearLabel: 'Use home instead',
    };
  }
  if (coords?.source === 'profile-precise') {
    return {
      tone: 'precise',
      value: 'Saved location',
      badge: 'legacy profile',
      detail: 'Existing saved coordinates drive sun-angle and UV-index math. New device locations are temporary.',
      preciseLabel: 'Use current location today',
      clearLabel: '',
    };
  }
  if (coords?.source === 'home-postal') {
    return {
      tone: 'estimate',
      value: `Home postal area${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'home context',
      detail: 'A privacy-rounded home area supports circadian, daylight, and UV estimates without tracking travel.',
      preciseLabel: 'Use current location today',
      clearLabel: '',
    };
  }
  if (coords?.source === 'country-band') {
    return {
      tone: 'estimate',
      value: `Profile estimate${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'profile',
      detail: `${country ? `${country} profile location. ` : ''}Add an optional postal code for home context, or use current location for today's conditions.`,
      preciseLabel: 'Use current location today',
      clearLabel: '',
    };
  }
  return {
    tone: 'missing',
    value: 'No profile location set',
    badge: 'optional',
    detail: 'Set a home country in Profile, or explicitly share a privacy-rounded current location for today.',
    preciseLabel: 'Use current location today',
    clearLabel: '',
  };
}

export function renderSetupLocationStatus() {
  const status = getSetupLocationStatus();
  return `<div class="light-setup-location-status light-setup-location-${escapeAttr(status.tone)}" aria-label="Location status">
    <div class="light-setup-location-copy">
      <div class="light-setup-location-label">Location</div>
      <div class="light-setup-location-value-row">
        <strong>${escapeHTML(status.value)}</strong>
        <span class="light-setup-location-badge">${escapeHTML(status.badge)}</span>
      </div>
      <p>${escapeHTML(status.detail)}</p>
    </div>
    <div class="light-setup-location-actions">
      <button type="button" class="import-btn import-btn-secondary" ${lightSetupActionAttrs('open-profile-location')}>Edit profile</button>
      <button type="button" class="import-btn import-btn-secondary" ${lightSetupActionAttrs('request-precise-location')}>${escapeHTML(status.preciseLabel)}</button>
      ${status.clearLabel ? `<button type="button" class="import-btn import-btn-secondary" ${lightSetupActionAttrs('clear-current-location')}>${escapeHTML(status.clearLabel)}</button>` : ''}
    </div>
  </div>`;
}
