<script lang="ts">
  import { untrack } from 'svelte';
  import type { NutritionMealDetailView, NutritionMealDetailActions, MealResponseDraft } from '../nutrition-meal-detail-model.js';
  import { primary, readableCopy as copy, textAction } from '../nutrition-view-classes.js';
  let { view, actions }: { view: NutritionMealDetailView; actions: NutritionMealDetailActions } = $props();
  let response: MealResponseDraft = $state(untrack(() => ({ ...view.response })));
  let form: HTMLFormElement;
  let busy = $state(false), status = $state('');
  const groups = [
    { key: 'satiety2h', name: 'nutrition-response-satiety', legend: 'Hunger', labels: ['Hungry again', 'Neutral', 'Still satisfied'] },
    { key: 'energy2h', name: 'nutrition-response-energy', legend: 'Energy', labels: ['Slump', 'Steady', 'Energized'] },
  ] as const;
  export async function save(clear = false): Promise<boolean> {
    if (!actions.current() || busy || !form) return false;
    for (const group of groups) {
      const value = Number(form.querySelector<HTMLInputElement>(`input[name="${group.name}"]:checked`)?.value);
      response[group.key] = Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
    }
    if (!clear && response.satiety2h === null && response.energy2h === null) {
      status = 'Choose hunger, energy, or both before saving the check-in.'; actions.notify(status);
      form.querySelector<HTMLInputElement>('input')?.focus(); return false;
    }
    busy = true; status = '';
    try {
      const saved = await actions.save(clear ? null : { ...response });
      if (!saved && actions.current()) status = actions.failureMessage() || 'The check-in could not be saved. Your choices are still here; try again.';
      return saved;
    } finally { if (actions.current()) busy = false; }
  }
</script>
<form bind:this={form} class="nutrition-response-card gb:nutrition:grid gb:nutrition:gap-3 gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_3%,var(--bg-card))] gb:nutrition:p-3.5"
  onsubmit={event => { event.preventDefault(); event.stopPropagation(); void save(); }} aria-labelledby="nutrition-response-title" aria-describedby="nutrition-response-help">
  <div class="nutrition-response-head gb:nutrition:flex gb:nutrition:items-start gb:nutrition:justify-between gb:nutrition:gap-3">
    <div class="gb:nutrition:grid gb:nutrition:gap-1 gb:nutrition:min-w-0">
      <span class="nutrition-fuel-kicker {copy}">Personal evidence</span>
      <strong id="nutrition-response-title" class="gb:nutrition:text-[13px]">How did this meal feel 2–3 hours later?</strong>
      <small id="nutrition-response-help" class={copy}>Repeated check-ins can compare meals with different carb/fat compositions. They do not measure metabolism or prove cause.</small>
    </div>
    <span class="nutrition-fuel-badge gb:nutrition:shrink-0 gb:nutrition:rounded-full gb:nutrition:border gb:nutrition:border-line gb:nutrition:px-2 gb:nutrition:py-1 gb:nutrition:text-[10px]">{view.checkedIn ? 'Checked in' : 'Optional'}</span>
  </div>
  <div class="nutrition-response-fields gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-2.5 gb:nutrition:max-[600px]:grid-cols-1">
    {#each groups as group}
      <fieldset disabled={busy} class="gb:nutrition:min-w-0 gb:nutrition:m-0 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-2.5">
        <legend class="gb:nutrition:px-1 gb:nutrition:text-[10px] gb:nutrition:font-bold">{group.legend}</legend>
        <div class="gb:nutrition:grid gb:nutrition:grid-cols-3 gb:nutrition:gap-1.5">
          {#each group.labels as label, index}
            <label class="nutrition-response-choice gb:nutrition:relative gb:nutrition:grid gb:nutrition:min-h-[38px] gb:nutrition:[@media(pointer:coarse)]:min-h-11 gb:nutrition:min-w-0 gb:nutrition:place-items-center gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:p-1.5 gb:nutrition:text-center gb:nutrition:text-[9px] gb:nutrition:leading-[1.25] gb:nutrition:font-bold gb:nutrition:text-secondary gb:nutrition:cursor-pointer gb:nutrition:has-checked:border-accent gb:nutrition:has-checked:bg-hover gb:nutrition:has-checked:text-ink gb:nutrition:focus-within:outline-2 gb:nutrition:focus-within:outline-accent gb:nutrition:focus-within:outline-offset-2">
              <input type="radio" name={group.name} value={index + 1} bind:group={response[group.key]} class="gb:nutrition:absolute gb:nutrition:inset-0 gb:nutrition:h-full gb:nutrition:w-full gb:nutrition:m-0 gb:nutrition:opacity-0 gb:nutrition:cursor-pointer"/><span>{label}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/each}
  </div>
  <div class="nutrition-response-actions gb:nutrition:flex gb:nutrition:items-center gb:nutrition:justify-between gb:nutrition:gap-3 gb:nutrition:max-[600px]:flex-col gb:nutrition:max-[600px]:items-stretch">
    <small class="{copy} gb:nutrition:max-w-[470px]">Saved and cross-synced with this meal. It is not added to the compact AI nutrition summary.</small>
    <div class="gb:nutrition:flex gb:nutrition:justify-end gb:nutrition:gap-2">
      {#if view.checkedIn}<button type="button" class="nutrition-text-btn {textAction}" data-nutrition-action="clear-response" data-nutrition-id={view.id} disabled={busy} onclick={event => { event.stopPropagation(); void save(true); }}>Clear</button>{/if}
      <button type="submit" class="import-btn import-btn-primary {primary}" data-nutrition-action="save-response" data-nutrition-id={view.id} disabled={busy} onclick={event => event.stopPropagation()}>{busy ? 'Saving…' : 'Save check-in'}</button>
    </div>
  </div>
  <p role="status" aria-live="polite" class="{copy} gb:nutrition:m-0 gb:nutrition:text-danger-ink">{status}</p>
</form>
