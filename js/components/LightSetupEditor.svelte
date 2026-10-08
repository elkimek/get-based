<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  import type { LightSetupView } from '../light-setup-presentation.js';
  import { SKIN_TYPE } from '../constants.js';
  import { FITZPATRICK_ROMAN, HOME_LIGHT_OPTIONS, EYEWEAR_OPTIONS, PHOTOSENSITIVE_OPTIONS, photosensitiveTierOf } from '../sun-defaults-model.js';
  import LightSetupLocation from './LightSetupLocation.svelte';
  import LightSetupChoiceGroup from './LightSetupChoiceGroup.svelte';
  import LightSetupPatterns from './LightSetupPatterns.svelte';
  import LightSetupActions from './LightSetupActions.svelte';
  import LightSetupSkinLabel from './LightSetupSkinLabel.svelte';
  let { view, includeActions = true }: { view: LightSetupView; includeActions?: boolean } = $props();
  const defaults = $derived(view.defaults);
  const initialFitzpatrick = $derived(view.initialFitzpatrick);
  const skinIndex = $derived(view.skinIndex);
  const filledCount = $derived(view.filledCount);
</script>

<div class={setupClasses("light-setup-card light-setup-card-editor")} data-light-setup-presentation data-light-setup-owner={view.ownerTicket || undefined}>
    <div class={setupClasses("light-setup-step-tabs")} role="tablist" aria-label="Light setup steps">
      <button type="button" class={setupClasses("light-setup-step-tab active")} id="light-setup-tab-core" data-setup-tab="core" aria-controls="light-setup-pane-core" tabindex="0" role="tab" aria-selected="true" data-light-setup-action="set-step" data-light-setup-step="core">
        <span class={setupClasses("light-setup-step-tab-index")}>1</span>
        <span>Your baseline</span>
      </button>
      <button type="button" class={setupClasses("light-setup-step-tab")} id="light-setup-tab-score" data-setup-tab="score" aria-controls="light-setup-pane-score" tabindex="-1" role="tab" aria-selected="false" data-light-setup-action="set-step" data-light-setup-step="score">
        <span class={setupClasses("light-setup-step-tab-index")}>2</span>
        <span>Light patterns</span>
      </button>
    </div>

    <div class={setupClasses("light-setup-pane")} id="light-setup-pane-core" role="tabpanel" aria-labelledby="light-setup-tab-core" data-setup-pane="core">
    <div class={setupClasses("light-setup-title")} tabindex="-1">Your light baseline
      <span class={setupClasses("light-setup-progress")} aria-label="{filledCount} of 3 questions done">{filledCount}/3 done</span>
    </div>
    <p class={setupClasses("light-setup-lead")}><strong>Step 1 of 2.</strong> Connect skin, location, typical indoor lighting, and eyewear to one shared Light baseline. These answers shape context and estimates; they do not guarantee a safe exposure.</p>
    <LightSetupLocation status={view.location} />

    <div class={setupClasses("light-setup-fields-grid")}>
    <div class={setupClasses("light-setup-step")}>
      <label class={setupClasses("ctx-label")} id="setup-skin-label-id" for="setup-skin-range">Skin type</label>
      <p class={setupClasses("light-setup-step-why")}>Required before sun or device sessions. It selects the rough Fitzpatrick base-MED reference used by UV estimates; it is not a personal safe-time guarantee.</p>
      <div class={setupClasses("ctx-skin-slider-wrap")}>
        <div class={setupClasses("ctx-skin-emojis")} role="radiogroup" aria-labelledby="setup-skin-label-id">{#each FITZPATRICK_ROMAN as roman, index}
  <button type="button" class={setupClasses(`ctx-skin-face${initialFitzpatrick === roman ? ' active' : ''}`)} data-idx={index} data-roman={roman} role="radio" tabindex={initialFitzpatrick === roman || (!initialFitzpatrick && index === 2) ? 0 : -1} aria-checked={initialFitzpatrick === roman} aria-label={`Fitzpatrick ${SKIN_TYPE[index]}`} data-light-setup-action="select-skin" data-light-setup-skin-idx={index}>{['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'][index]}</button>
{/each}</div>
        <input type="range" min="0" max="5" value="{skinIndex}" class={setupClasses("ctx-skin-range")} id="setup-skin-range" aria-labelledby="setup-skin-label-id" data-light-setup-input="skin-range" data-set="{initialFitzpatrick ? '1' : '0'}" aria-valuetext="{initialFitzpatrick ? SKIN_TYPE[skinIndex] : 'not set — tap a face'}">
        <div class={setupClasses("ctx-skin-label")} id="setup-skin-label"><LightSetupSkinLabel skinIndex={initialFitzpatrick ? skinIndex : -1} /></div>
      </div>
    </div>

    <div class={setupClasses("light-setup-step light-setup-photo-row")}>
      <div class={setupClasses("ctx-label")}><strong>Photosensitizing meds / supplements</strong></div>
      <LightSetupChoiceGroup id="setup-photosensitive" options={PHOTOSENSITIVE_OPTIONS} selected={photosensitiveTierOf(defaults.photosensitiveMeds)} />
      <p class={setupClasses("light-setup-photo-why")}>Records a separate caution. The app does not invent a universal burn multiplier because drug, dose, formulation, and reaction type matter. <a href="https://www.aad.org/public/everyday-care/sun-protection/sunburn/photosensitive-medications" target="_blank" rel="noopener">Review examples →</a></p>
    </div>

    <div class={setupClasses("light-setup-step")}>
      <div class={setupClasses("ctx-label")}>Home lighting</div>
      <p class={setupClasses("light-setup-step-why")}>Adds qualitative indoor-spectrum context. A bulb category alone cannot determine melanopic dose without intensity, distance, timing, and spectrum.</p>
      <LightSetupChoiceGroup id="setup-homelight" options={HOME_LIGHT_OPTIONS} selected={defaults.homeLight} />
    </div>

    <div class={setupClasses("light-setup-step")}>
      <div class={setupClasses("ctx-label")}>Eyewear outside</div>
      <p class={setupClasses("light-setup-step-why")}>Eyewear changes the spectrum reaching the eye. Circadian input is mainly visible light; ocular UV–POMC / α-MSH signaling is an exploratory mouse finding, not a reason to expose eyes to UV or remove protection.</p>
      <LightSetupChoiceGroup id="setup-eyewear" options={EYEWEAR_OPTIONS} selected={defaults.eyewear} />
    </div>

    </div>
    </div>

    <div class={setupClasses("light-setup-pane")} id="light-setup-pane-score" role="tabpanel" aria-labelledby="light-setup-tab-score" data-setup-pane="score" hidden>
    <LightSetupPatterns {view} />

    </div>

    {#if includeActions}<LightSetupActions complete={view.complete} />{/if}
  </div>
