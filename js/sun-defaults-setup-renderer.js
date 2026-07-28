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
    'none': '👁', 'sunglasses': '🕶', 'clear-prescription': '👓',
    'both': '🕶', 'contacts-uv': '👀',
  };
  const eyewearIcon = eyewearIconMap[defaults.eyewear] || '👁';
  const eyewearShort = (eyewearMeta?.label || defaults.eyewear || 'Not set')
    .split('—')[0].split(/[(,]/)[0].trim();

  let burdenChip;
  if (typeof defaults.ottScore === 'number') {
    const { label, tier } = ottScoreToLabel(defaults.ottScore);
    burdenChip = `<div class="light-setup-chip light-setup-chip-ott light-setup-chip-tier-${tier}" title="Indoor-light burden score (0–10): counts modern light-environment gaps — morning light deficit, glass-mediated days, dim workspace, cool LED at night, evening screens, bright after sunset, sleep darkness, sunscreen UVB block, sunglasses outdoors, total outdoor time.">
      <div class="light-setup-chip-icon">☀</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light burden</div>
        <div class="light-setup-chip-value">${escapeHTML(label)}</div>
        <div class="light-setup-chip-sub">${defaults.ottScore}/10 burden score</div>
      </div>
    </div>`;
  } else if (defaults.skipped) {
    burdenChip = `<div class="light-setup-chip light-setup-chip-skipped">
      <div class="light-setup-chip-icon">⏭</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light burden</div>
        <div class="light-setup-chip-value">Skipped</div>
        <div class="light-setup-chip-sub">tap Edit to fill in</div>
      </div>
    </div>`;
  } else {
    burdenChip = `<div class="light-setup-chip light-setup-chip-unset">
      <div class="light-setup-chip-icon">·</div>
      <div class="light-setup-chip-body">
        <div class="light-setup-chip-label">Light burden</div>
        <div class="light-setup-chip-value">—</div>
      </div>
    </div>`;
  }

  const psmTier = photosensitiveTierOf(defaults.photosensitiveMeds);
  const psmCopy = {
    mild:     { mult: '~1.4×', label: 'mild' },
    moderate: { mult: '~2.5×', label: 'moderate' },
    severe:   { mult: '~4×',   label: 'severe' },
  }[psmTier];
  const photoBanner = psmCopy
    ? `<div class="light-setup-photo-banner" title="${escapeAttr(`Burn threshold reduced ${psmCopy.mult} for ${psmCopy.label} photosensitizers. Edit to change tier or clear when no longer applicable.`)}">⚠ ${psmCopy.label.charAt(0).toUpperCase() + psmCopy.label.slice(1)} photosensitizer active — burn alerts trigger ${psmCopy.mult} sooner.</div>`
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
  return `<div class="light-setup-prompt light-widget-prompt">
    <div class="light-widget-prompt-copy">
      <strong>Set up your light assumptions</strong>
      <p>Skin type, home lighting, and eyewear drive burn math and channel estimates.</p>
    </div>
    <div class="light-setup-prompt-actions">
      <button type="button" class="dashboard-action-btn" ${lightSetupActionAttrs('dismiss')}>Later</button>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-widget-prompt-cta" ${lightSetupActionAttrs('reopen')}>Set up</button>
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
         <button class="import-btn import-btn-primary light-setup-next-btn" ${lightSetupActionAttrs('set-step', { step: 'score' })}>Next: Light score</button>`
      : `<button class="import-btn import-btn-tertiary light-setup-skip-btn" ${lightSetupActionAttrs('dismiss')}>I'll do this later</button>
         <button class="import-btn import-btn-primary light-setup-next-btn" ${lightSetupActionAttrs('set-step', { step: 'score' })}>Next: Light score</button>`}
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
    <div class="light-setup-choice-grid ${className}" role="group">
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
  const burden = Math.max(0, Math.min(10, Number(score) || 0));
  const aligned = 10 - burden;
  const meta = ottScoreToLabel(burden);
  return `<div class="light-setup-ott-running light-setup-score-meter" id="ott-running-score" data-tier="${escapeAttr(String(meta.tier))}">
    <div class="light-setup-score-main">
      <span>Alignment</span>
      <strong id="ott-running-aligned">${aligned}/10</strong>
    </div>
    <div class="light-setup-score-bar" aria-hidden="true">
      <span id="ott-score-fill" style="width:${aligned * 10}%"></span>
    </div>
    <div class="light-setup-score-meta">
      <span class="light-setup-score-gap-count">Gaps flagged: <strong id="ott-running-value">${burden}/10</strong></span>
      <span class="light-ott-badge light-ott-tier-${meta.tier}" id="ott-running-label" data-tier="${escapeAttr(String(meta.tier))}">${escapeHTML(meta.label)}</span>
      <span class="light-setup-ott-summary-score" id="ott-summary-score">${aligned}/10 aligned</span>
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
        <span class="light-setup-ott-q-state light-setup-ott-q-state-clear">Aligned</span>
        <span class="light-setup-ott-q-state light-setup-ott-q-state-flagged">Gap flagged</span>
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
        <span>Core assumptions</span>
      </button>
      <button type="button" class="light-setup-step-tab" data-setup-tab="score" role="tab" aria-selected="false" ${lightSetupActionAttrs('set-step', { step: 'score' })}>
        <span class="light-setup-step-tab-index">2</span>
        <span>Light score check</span>
      </button>
    </div>

    <section class="light-setup-pane" data-setup-pane="core">
    <div class="light-setup-title" tabindex="-1">Core assumptions
      <span class="light-setup-progress" aria-label="${filledCount} of 3 questions done">${filledCount}/3 done</span>
    </div>
    <p class="light-setup-lead"><strong>Step 1 of 2.</strong> Calibrate the assumptions that drive burn threshold, indoor-light context, and eye-channel estimates. The next step asks the 10 light-score questions.</p>
    ${renderSetupLocationStatus()}

    <div class="light-setup-fields-grid">
    <div class="light-setup-step">
      <label class="ctx-label" id="setup-skin-label-id">Skin type</label>
      <p class="light-setup-step-why">Sets your burn threshold (MED) and how much UV you can take before getting red.</p>
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
      <p class="light-setup-photo-why">Lowers your sunburn threshold so burn alerts trigger sooner. <a href="https://www.aad.org/public/everyday-care/sun-protection/sunburn/photosensitive-medications" target="_blank" rel="noopener">AAD list →</a></p>
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Home lighting</div>
      <p class="light-setup-step-why">Shapes your indoor melanopic dose — what the AI sees for the half of your day spent inside.</p>
      ${renderSetupChoiceGroup('setup-homelight', HOME_LIGHT_OPTIONS, defaults.homeLight, 'light-setup-choice-grid-compact')}
    </div>

    <div class="light-setup-step">
      <div class="ctx-label">Eyewear outside</div>
      <p class="light-setup-step-why">Eye exposure to UV / 360–400 nm violet drives circadian + α-MSH / dopamine signals.</p>
      ${renderSetupChoiceGroup('setup-eyewear', EYEWEAR_OPTIONS, defaults.eyewear)}
    </div>

    </div>
    </section>

    <section class="light-setup-pane" data-setup-pane="score">
    <section class="light-setup-ott">
      <div class="light-setup-ott-head">
        <div>
          <div class="light-setup-ott-kicker">Light score check</div>
          <h4 tabindex="-1">Flag the light-environment gaps that are true for you</h4>
        </div>
      </div>
      <p class="light-setup-body light-setup-ott-lead"><strong>Step 2 of 2.</strong> Tapped cards count as gaps. Leave a card unselected when the statement is not true for you.</p>
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

  if (coords?.source === 'profile-precise') {
    return {
      tone: 'precise',
      value: 'Precise location saved',
      badge: 'highest accuracy',
      detail: 'Drives sun-angle and UV-index math with saved lat/lon.',
      preciseLabel: 'Refresh precise location',
    };
  }
  if (coords?.source === 'country-band') {
    return {
      tone: 'estimate',
      value: `Profile estimate${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'profile',
      detail: `${country ? `${country} profile location. ` : ''}Country-level is enough for setup; precise location sharpens live sun timing.`,
      preciseLabel: 'Use precise location',
    };
  }
  return {
    tone: 'missing',
    value: 'No profile location set',
    badge: 'optional',
    detail: 'Set country in Profile for daylight and UV estimates, or share precise location once.',
    preciseLabel: 'Use precise location',
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
    </div>
  </div>`;
}
