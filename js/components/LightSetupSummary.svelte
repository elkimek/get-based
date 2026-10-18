<script lang="ts">
  import LightOnboardingAI from './LightOnboardingAI.svelte';
  import { setupClasses, setupChipClasses } from '../light-setup-classes.js';
  import type { LightSetupView } from '../light-setup-presentation.js';
  let { view }: { view: LightSetupView } = $props();
</script>

<div class={setupClasses("light-setup-summary")} data-light-setup-presentation data-light-setup-owner={view.ownerTicket || undefined}>
  <div class={setupClasses("light-setup-summary-head")}><span class={setupClasses("light-setup-summary-headline")}><span class={setupClasses("light-setup-summary-tick")}>✓</span>Your light setup</span>
    <button type="button" class={setupClasses("import-btn import-btn-secondary light-setup-summary-edit")} data-light-setup-action="reopen">Edit</button>
  </div>
  {#if view.photoWarning}<div class={setupClasses("light-setup-photo-banner")} title="Medication, dose, formulation, and reaction differ too much for a universal burn multiplier.">⚠ {view.photoWarning} — burn time remains an unadjusted base estimate; follow the label or clinician.</div>{/if}
  <div class={setupClasses("light-setup-chips-grid")}>{#each view.chips as chip}
    <div class={setupChipClasses(chip)} title={chip.title || undefined}>
      <div class={setupClasses("light-setup-chip-icon")}>{chip.icon}</div>
      <div class={setupClasses("light-setup-chip-body")}><div class={setupClasses("light-setup-chip-label")}>{chip.label}</div><div class={setupClasses("light-setup-chip-value")}>{chip.value}</div>
        {#if chip.sub}<div class={setupClasses("light-setup-chip-sub")}>{chip.sub}</div>{/if}
      </div>
    </div>
  {/each}</div>
  {#if view.ai}<LightOnboardingAI view={view.ai}/>{/if}
</div>
