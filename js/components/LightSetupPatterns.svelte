<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  import type { LightSetupView } from '../light-setup-presentation.js';
  import { OTT_QUESTIONS, ottScoreToLabel } from '../sun-defaults-model.js';
  let { view }: { view: LightSetupView } = $props();
  const selected = $derived(view.selectedPatterns);
  const meta = $derived(ottScoreToLabel(selected));
</script>

<section class={setupClasses("light-setup-ott")}>
  <div class={setupClasses("light-setup-ott-head")}><div><div class={setupClasses("light-setup-ott-kicker")}>Your typical light day</div>
    <h4 tabindex="-1">Select the timing and spectrum patterns that are true for you</h4>
  </div></div>
  <p class={setupClasses("light-setup-body light-setup-ott-lead")}><strong>Step 2 of 2.</strong> This is an educational context map, not a clinical score. Sunscreen and eyewear record spectral filtering; selecting them is not advice to stop protection.</p>
<div class={setupClasses("light-setup-ott-running light-setup-score-meter")} id="ott-running-score" data-tier="{String(meta.tier)}">
    <div class={setupClasses("light-setup-score-main")}>
      <span>Patterns selected</span>
      <strong id="ott-running-aligned">{selected}/10</strong>
    </div>
    <div class={setupClasses("light-setup-score-bar")} aria-hidden="true">
      <span id="ott-score-fill" style="width:{selected * 10}%"></span>
    </div>
    <div class={setupClasses("light-setup-score-meta")}>
      <span class={setupClasses("light-setup-score-gap-count")}>Context noted: <strong id="ott-running-value">{selected}/10</strong></span>
      <span class={setupClasses(`light-ott-badge light-ott-tier-${meta.tier}`)} id="ott-running-label" data-tier="{String(meta.tier)}">{meta.label}</span>
      <span class={setupClasses("light-setup-ott-summary-score")} id="ott-summary-score">{selected}/10 selected</span>
    </div>
  </div>
<div class={setupClasses("light-setup-ott-questions")}>{#each OTT_QUESTIONS as question, index}
<label class={setupClasses(`light-setup-ott-q light-setup-ott-card${view.defaults.ott?.[question.key] ? ' is-flagged' : ''}`)}>
  <input class={setupClasses("light-setup-ott-input")} type="checkbox" data-ott={question.key} checked={!!view.defaults.ott?.[question.key]} data-light-setup-input="ott-score" />
  <span class={setupClasses("light-setup-ott-card-mark")} aria-hidden="true"><span>{index + 1}</span></span>
  <span class={setupClasses("light-setup-ott-q-body")}><span class={setupClasses("light-setup-ott-q-top")}>
    <span class={setupClasses("light-setup-ott-q-text")}>{question.text}</span>
    <span class={setupClasses("light-setup-ott-q-state light-setup-ott-q-state-clear")}>Not selected</span>
    <span class={setupClasses("light-setup-ott-q-state light-setup-ott-q-state-flagged")}>Context noted</span>
  </span>{#if question.why}<span class={setupClasses("light-setup-ott-q-why")}>{question.why}</span>{/if}</span>
</label>
{/each}</div>
</section>
