<script lang="ts">
  import { untrack } from 'svelte';
  import type { NutritionAISettingsSnapshot } from '../nutrition-ai-settings-contract.js';
  import { MEAL_MODEL_PANEL, MEAL_MODEL_TITLE, MEAL_MODEL_COPY, MEAL_MODEL_SELECT, MEAL_MODEL_SUMMARY, MEAL_MODEL_LINK } from '../nutrition-ai-settings-classes.js';

  let { initial }: { initial: NutritionAISettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let selectedValue = $state(untrack(() => initial.selectedValue));
  let detailsOpen = $state(false);

  export function refresh(next: NutritionAISettingsSnapshot): void {
    snapshot = next;
    selectedValue = next.selectedValue;
  }
</script>

<div class="settings-group-title">Feature models</div>
<section id="nutrition-ai-model-settings" class={MEAL_MODEL_PANEL} data-nutrition-ai-view aria-labelledby="meal-model-title">
  <div id="meal-model-title" class={MEAL_MODEL_TITLE}>Meal photos and labels</div>
  <div class={MEAL_MODEL_COPY}>Follow the chat assistant when it supports images, or use the configured feature fallback.</div>
  <select class={MEAL_MODEL_SELECT} aria-label="Meal photo and nutrition label model" data-settings-action="set-nutrition-ai-route" bind:value={selectedValue}>
    <option value="" disabled={snapshot.automaticDisabled}>{snapshot.automaticLabel}</option>
    {#each snapshot.groups as group (group.label)}
      <optgroup label={group.label}>
        {#each group.options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </optgroup>
    {/each}
  </select>
  <details class="nutrition-ai-model-details gb:group gb:meal-model:mt-2" bind:open={detailsOpen}>
    <summary class={MEAL_MODEL_SUMMARY}><span class="gb:meal-model:group-open:rotate-90" aria-hidden="true">▸</span> About this list</summary>
    <div class={MEAL_MODEL_COPY}>
      Only models with confirmed image input are shown. CLI models use their existing account or configured provider; API and Local models use the configured {snapshot.providerDisplay} route.
      Evidence informs ordering only and does not prove accuracy.
      <a class={MEAL_MODEL_LINK} href="https://doi.org/10.3390/nu18122017" target="_blank" rel="noopener noreferrer">Claude study ↗</a>
      · <a class={MEAL_MODEL_LINK} href="https://doi.org/10.64898/2026.07.26.740845" target="_blank" rel="noopener noreferrer">Gemini preprint ↗</a>
    </div>
  </details>
</section>
