<script lang="ts">
  import { untrack } from 'svelte';
  import type { NutritionTargetsView, NutritionTargetDraft, NutritionEntryActions } from '../nutrition-entry-model.js';
  import { TARGET_FIELDS, PROTEIN_OPTIONS, PROTEIN_PRESETS, targetProteinPreview } from '../nutrition-entry-model.js';
  import { normalizeNutritionTargets } from '../nutrition-targets.js';
  import { button, primary, targetPanel as panel, readableCopy as copy, readableModalCopy as modalCopy, field, input, summary, formGrid, formHead, focus , closeButton } from '../nutrition-view-classes.js';
  import NumberField from './NutritionNumberField.svelte';
  let { view, actions }: { view: NutritionTargetsView; actions: NutritionEntryActions } = $props();
  let draft: NutritionTargetDraft = $state(untrack(() => structuredClone(view.targets)));
  let form: HTMLFormElement;
  let busy = $state(false), status = $state('');
  const fixed = $derived(draft.proteinBasis === 'fixed');
  const preset = $derived(Object.hasOwn(PROTEIN_PRESETS, draft.proteinBasis));
  const preview = $derived(targetProteinPreview(view.profile, draft));
  const mainFields = TARGET_FIELDS.slice(1, 5), optionalFields = TARGET_FIELDS.slice(5, 7);
  const orderedNutrients = () => view.groups.flatMap(group => group.nutrients)
    .filter(nutrient => draft.widgetNutrients.includes(nutrient.key)).map(nutrient => nutrient.key);
  function basisChanged(value: string) {
    draft.proteinBasis = value;
    if (Object.hasOwn(PROTEIN_PRESETS, value)) draft.proteinGPerKg = PROTEIN_PRESETS[value];
  }
  function selectNutrient(key: string, selected: boolean) {
    draft.widgetNutrients = selected ? [...new Set([...draft.widgetNutrients, key])] : draft.widgetNutrients.filter(value => value !== key);
  }
  // Compatibility entrypoints synchronize only this owned form, never another modal.
  export function update() {
    if (!actions.current() || busy || !form) return;
    for (const definition of TARGET_FIELDS) {
      const element = form.querySelector<HTMLInputElement>(`#nutrition-target-${definition.id}`);
      if (element) draft[definition.key] = element.value === '' ? undefined : element.valueAsNumber;
    }
    const basis = form.querySelector<HTMLSelectElement>('#nutrition-target-protein-basis');
    if (basis) basisChanged(basis.value);
    draft.widgetNutrients = Array.from(form.querySelectorAll<HTMLInputElement>('[data-nutrition-widget-metric]:checked')).map(element => element.value);
  }
  export async function save(closeOnSave?: boolean): Promise<boolean> {
    if (!actions.current() || busy || !form) return false;
    update();
    form.querySelectorAll('[aria-invalid="true"]').forEach(element => element.removeAttribute('aria-invalid'));
    for (const definition of TARGET_FIELDS) {
      const element = form.querySelector<HTMLInputElement>(`#nutrition-target-${definition.id}`);
      if (!element || element.disabled) continue;
      if (!element.value.trim() || !element.checkValidity()) {
        status = `Review ${definition.label.startsWith('Protein') ? 'Protein' : definition.label}; it is blank or outside the allowed range.`;
        element.setAttribute('aria-invalid', 'true');
        const details = element.closest('details'); if (details) details.open = true;
        actions.notify(status); element.focus(); element.reportValidity();
        return false;
      }
    }
    status = ''; busy = true;
    try {
      const saved = await actions.saveTargets(normalizeNutritionTargets({ ...draft, configured: true, widgetNutrients: orderedNutrients() }), closeOnSave);
      if (!saved && actions.current()) status = actions.failureMessage?.() || 'Nutrition setup could not be saved; your previous settings are unchanged.';
      return saved;
    } finally { if (actions.current()) busy = false; }
  }
</script>
<button type="button" class={closeButton} aria-label="Close nutrition customization" data-nutrition-action="close">×</button>
{#if view.returnTo === 'history'}
  <button type="button" class="nutrition-route-back {button}" data-nutrition-action="return-history">← Meals &amp; Nutrition</button>
{/if}
<header class="nutrition-modal-head gb:nutrition:pr-11">
  <h3 id="nutrition-entry-title" class="gb:nutrition:mt-0 gb:nutrition:text-xl gb:nutrition:leading-normal">Nutrition setup</h3>
  <p class={modalCopy}>Set daily guides and choose the nutrients you want in your widget.</p>
</header>
<form bind:this={form} id="nutrition-target-settings" tabindex="-1" novalidate
  class="nutrition-target-settings nutrition-target-settings-standalone {panel} {focus} gb:nutrition:mt-[18px]"
  onsubmit={event => { event.preventDefault(); event.stopPropagation(); void save(); }}>
  <div class="nutrition-target-settings-head {formHead}">
    <h4 class="gb:nutrition:mt-0.5 gb:nutrition:mb-[3px] gb:nutrition:text-[17px]">Daily targets</h4>
    <span class="nutrition-target-weight {copy} gb:nutrition:rounded-full gb:nutrition:bg-hover gb:nutrition:px-3 gb:nutrition:py-1.5">{view.weight}</span>
  </div>
  {#if !view.targets.configured}
    <div class="nutrition-target-setup-state {copy} gb:nutrition:rounded-lg gb:nutrition:bg-hover gb:nutrition:p-2.5">Starter guides — review and save to make them personal.</div>
  {/if}
  <div class="nutrition-target-form {formGrid}">
    <NumberField definition={TARGET_FIELDS[0]!} bind:value={draft.energyKcal} disabled={busy}/>
    <label class="nutrition-target-protein-basis {field} gb:nutrition:col-span-2 gb:nutrition:max-[720px]:col-span-full">
      <span>Protein target</span>
      <div class="gb:nutrition:relative gb:nutrition:grid gb:nutrition:min-w-0">
        <!-- Native WebKit select chrome can overflow narrow monospace themes. -->
        <select id="nutrition-target-protein-basis" class="{input} gb:nutrition:appearance-none gb:nutrition:pr-9" value={draft.proteinBasis} disabled={busy}
          onchange={event => basisChanged(event.currentTarget.value)}>
          {#each PROTEIN_OPTIONS as [value, label]}<option {value}>{label}</option>{/each}
        </select>
        <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" class="gb:nutrition:pointer-events-none gb:nutrition:absolute gb:nutrition:right-3 gb:nutrition:top-1/2 gb:nutrition:size-4 gb:nutrition:-translate-y-1/2" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6 4 4 4-4"/></svg>
      </div>
    </label>
    <NumberField definition={TARGET_FIELDS[7]!} bind:value={draft.proteinGPerKg} hidden={fixed} disabled={preset || fixed || busy}/>
    <NumberField definition={TARGET_FIELDS[8]!} bind:value={draft.proteinFixedG} hidden={!fixed} disabled={!fixed || busy}/>
    {#each mainFields as definition}
      <NumberField {definition} bind:value={draft[definition.key]} disabled={busy}/>
    {/each}
  </div>
  <div class="nutrition-target-note gb:nutrition:rounded-lg gb:nutrition:border-l-[3px] gb:nutrition:border-accent gb:nutrition:bg-hover gb:nutrition:p-3">
    <span id="nutrition-target-protein-preview" class="gb:nutrition:text-xs gb:nutrition:font-bold">{preview}</span>
  </div>
  <details class="nutrition-target-optional gb:nutrition:border-t gb:nutrition:border-line gb:nutrition:pt-[11px]">
    <summary class={summary}>Optional sugar and sodium guides</summary>
    <div class="nutrition-target-optional-form gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-3 gb:nutrition:max-[380px]:grid-cols-1">
      {#each optionalFields as definition}<NumberField {definition} bind:value={draft[definition.key]} disabled={busy}/>{/each}
      <p class="{copy} gb:nutrition:col-span-full">Optional references. Meal-photo estimates may not reliably separate total, added, and free sugar.</p>
    </div>
  </details>
  <details class="nutrition-target-about gb:nutrition:border-t gb:nutrition:border-line gb:nutrition:pt-[11px]">
    <summary class={summary}>About these guides</summary>
    <p class={copy}>Targets are planning guides, not medical recommendations. Meal-photo values are estimates. Logged drinks measure beverage volume, not net hydration or water from food.</p>
  </details>
  <div class="nutrition-widget-metric-settings gb:nutrition:grid gb:nutrition:gap-3">
    <div class="nutrition-widget-metric-settings-head {formHead}">
      <strong class="gb:nutrition:text-sm">Widget nutrients</strong>
      <span id="nutrition-widget-metric-count" class={copy} role="status" aria-live="polite">{draft.widgetNutrients.length} selected</span>
    </div>
    <div class="nutrition-widget-metric-groups gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-3 gb:nutrition:max-[600px]:grid-cols-1">
      {#each view.groups as group}
        <fieldset class="nutrition-widget-metric-group gb:nutrition:m-0 gb:nutrition:min-w-0 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-2.5">
          <legend class="{copy} gb:nutrition:px-1 gb:nutrition:font-bold gb:nutrition:uppercase">{group.label}</legend>
          <div class="gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-1 gb:nutrition:max-[380px]:grid-cols-1">
            {#each group.nutrients as nutrient}
              <label class="nutrition-widget-metric-option gb:nutrition:flex gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:min-w-0 gb:nutrition:items-center gb:nutrition:gap-2 gb:nutrition:text-xs gb:nutrition:cursor-pointer">
                <input type="checkbox" value={nutrient.key} data-nutrition-widget-metric disabled={busy}
                  class="gb:nutrition:accent-accent {focus}" checked={draft.widgetNutrients.includes(nutrient.key)}
                  onchange={event => selectNutrient(nutrient.key, event.currentTarget.checked)}/>
                <span>{nutrient.label}</span>
              </label>
            {/each}
          </div>
        </fieldset>
      {/each}
    </div>
  </div>
  <footer class="nutrition-target-actions {formHead} gb:nutrition:items-center">
    <p id="nutrition-target-status" role="status" aria-live="polite" class="{copy} gb:nutrition:text-danger-ink">{status}</p>
    <button type="submit" class={primary} data-nutrition-action="save-targets" data-nutrition-return={view.returnTo}
      disabled={busy} onclick={event => event.stopPropagation()}>{busy ? 'Saving…' : 'Save nutrition setup'}</button>
  </footer>
</form>
