<script lang="ts">
  import { untrack } from 'svelte';
  import type { NutritionFluidView, NutritionEntryActions, FluidDraft } from '../nutrition-entry-model.js';
  import { FLUID_KINDS, fluidPreview, fluidDraftError } from '../nutrition-entry-model.js';
  import { button, primary, panel, copy, field, input, formHead } from '../nutrition-view-classes.js';
  let { view, actions }: { view: NutritionFluidView; actions: NutritionEntryActions } = $props();
  let draft: FluidDraft = $state(untrack(() => ({ ...view.initial })));
  let form: HTMLFormElement;
  let busy = $state(false), status = $state('');
  const preview = $derived(fluidPreview(draft));
  export function update() {
    if (!actions.current() || busy || !form) return;
    const amount = form.querySelector<HTMLInputElement>('#nutrition-fluid-amount');
    const kind = form.querySelector<HTMLInputElement>('input[name="nutrition-fluid-kind"]:checked');
    const at = form.querySelector<HTMLInputElement>('#nutrition-fluid-at');
    const label = form.querySelector<HTMLInputElement>('#nutrition-fluid-label');
    if (amount) draft.amount = amount.value === '' ? undefined : amount.valueAsNumber;
    if (kind) draft.kind = kind.value;
    if (at) draft.at = at.value;
    if (label) draft.label = label.value;
  }
  export async function save(): Promise<boolean> {
    if (!actions.current() || busy || !form) return false;
    update(); const error = fluidDraftError(draft);
    if (error) {
      status = error.message; actions.notify(status);
      form.querySelector<HTMLElement>(`#${error.field}`)?.focus(); return false;
    }
    status = ''; busy = true;
    try {
      const saved = await actions.saveFluid({ ...draft });
      if (!saved && actions.current()) status = actions.failureMessage?.() || 'Drink could not be saved. Your entry is still here; try again.';
      return saved;
    } finally { if (actions.current()) busy = false; }
  }
</script>
<button type="button" class="modal-close {button}" aria-label="Close drink log" data-nutrition-action="close">×</button>
<header class="nutrition-modal-head gb:nutrition:pr-11">
  <h3 id="nutrition-entry-title" class="gb:nutrition:mt-0 gb:nutrition:text-xl">Log a drink</h3>
</header>
<form bind:this={form} novalidate class="nutrition-fluid-log gb:nutrition:mt-5 gb:nutrition:grid gb:nutrition:grid-cols-2 gb:nutrition:gap-3 gb:nutrition:max-[600px]:grid-cols-1"
  onsubmit={event => { event.preventDefault(); event.stopPropagation(); void save(); }}>
  <fieldset class="nutrition-fluid-kind-fieldset gb:nutrition:col-span-full gb:nutrition:m-0 gb:nutrition:min-w-0 gb:nutrition:border-0 gb:nutrition:p-0">
    <legend class="gb:nutrition:mb-2 gb:nutrition:text-xs gb:nutrition:font-bold">Beverage type</legend>
    <div class="nutrition-fluid-kind-grid gb:nutrition:grid gb:nutrition:grid-cols-3 gb:nutrition:gap-2 gb:nutrition:max-[600px]:grid-cols-1">
      {#each FLUID_KINDS as kind}
        <label class="nutrition-fluid-kind gb:nutrition:flex gb:nutrition:min-h-[68px] gb:nutrition:min-w-0 gb:nutrition:items-center gb:nutrition:gap-2 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-3 gb:nutrition:cursor-pointer gb:nutrition:has-checked:border-accent gb:nutrition:has-checked:bg-hover gb:nutrition:focus-within:outline-2 gb:nutrition:focus-within:outline-accent gb:nutrition:focus-within:outline-offset-2">
          <input type="radio" name="nutrition-fluid-kind" value={kind.key} bind:group={draft.kind} disabled={busy} class="gb:nutrition:m-0 gb:nutrition:accent-accent"/>
          <span aria-hidden="true">{kind.icon}</span>
          <span class="gb:nutrition:grid gb:nutrition:gap-1">
            <strong class="gb:nutrition:text-xs">{kind.title}</strong><small class={copy}>{kind.detail}</small>
          </span>
        </label>
      {/each}
    </div>
  </fieldset>
  <section class="nutrition-fluid-amount-panel {panel} gb:nutrition:col-span-full" aria-label="Drink amount">
    <div class="nutrition-comparison-section-title {formHead}"><strong class="gb:nutrition:text-xs">Amount</strong><span class={copy}>milliliters</span></div>
    <div class="nutrition-fluid-presets gb:nutrition:grid gb:nutrition:grid-cols-4 gb:nutrition:gap-2 gb:nutrition:max-[380px]:grid-cols-2" role="group" aria-label="Common drink amounts">
      {#each [250, 350, 500, 750] as amount}
        <button type="button" class="nutrition-fluid-preset {button} gb:nutrition:aria-pressed:border-accent gb:nutrition:aria-pressed:bg-accent gb:nutrition:aria-pressed:text-on-accent" class:is-selected={draft.amount === amount}
          aria-pressed={draft.amount === amount} data-nutrition-action="set-fluid-amount" data-nutrition-amount={amount} disabled={busy}
          onclick={event => { event.stopPropagation(); if (actions.current()) draft.amount = amount; }}>{amount} <small>mL</small></button>
      {/each}
    </div>
    <label class={field}><span>Custom amount <small class={copy}>mL</small></span>
      <input id="nutrition-fluid-amount" type="number" inputmode="decimal" min="1" max="10000" step="10" class={input} bind:value={draft.amount} disabled={busy}/>
    </label>
  </section>
  <label class={field}><span>When</span><input id="nutrition-fluid-at" type="datetime-local" class={input} bind:value={draft.at} disabled={busy}/></label>
  <label class={field}><span>Label <small class={copy}>optional</small></span><input id="nutrition-fluid-label" maxlength="80" placeholder="e.g. Sparkling water, green tea" class={input} bind:value={draft.label} disabled={busy}/></label>
  <div id="nutrition-fluid-preview" class="nutrition-fluid-preview {panel} gb:nutrition:col-span-full gb:nutrition:flex gb:nutrition:items-center gb:nutrition:gap-3" aria-live="polite">
    <span aria-hidden="true">＋</span><div class="gb:nutrition:grid gb:nutrition:gap-1"><strong class="gb:nutrition:text-xs">{preview.title}</strong><small class={copy}>{preview.detail}</small></div>
  </div>
  <div class="nutrition-fluid-explainer {panel} gb:nutrition:col-span-full gb:nutrition:border-l-[3px] gb:nutrition:border-l-accent">
    <strong class="gb:nutrition:text-xs">Hydration, without false precision</strong>
    <span class={copy}>This records beverage volume. It does not estimate absorption, subtract caffeine, or present a medical hydration score.</span>
  </div>
  <footer class="nutrition-target-actions gb:nutrition:col-span-full gb:nutrition:grid gb:nutrition:gap-2">
    <p role="status" aria-live="polite" class="{copy} gb:nutrition:text-danger-ink">{status}</p>
    <button type="submit" class={primary} data-nutrition-action="save-fluid" disabled={busy}
      onclick={event => event.stopPropagation()}>{busy ? 'Saving…' : preview.button}</button>
  </footer>
</form>
