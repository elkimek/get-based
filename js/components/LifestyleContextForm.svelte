<script lang="ts">
  import { untrack } from 'svelte';
  import { lifestyleMeals, lifestyleSectionSummary, toggleLifestyleChoice } from '../context-lifestyle-form-model.js';
  import type { LifestyleDraft, LifestyleField, LifestyleFormModel } from '../context-lifestyle-form-model.js';
  let { model, initial, hasCurrent, current, save, clear, close }: {
    model: LifestyleFormModel; initial: LifestyleDraft; hasCurrent: boolean; current(): boolean;
    save(): void; clear(): void; close(): void;
  } = $props();
  let draft = $state<LifestyleDraft>(untrack(() => structuredClone(initial)));
  let busy = $state(false), status = $state('');
  export function readDraft(): LifestyleDraft { return $state.snapshot(draft); }
  export function report(message: string, pending: boolean): void { status = message; busy = pending; }
  const focus = 'gb:context-form:focus-visible:outline-2 gb:context-form:focus-visible:outline-accent gb:context-form:focus-visible:outline-offset-2';
  const label = 'gb:context-form:block gb:context-form:mb-2 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:tracking-[0.05em] gb:context-form:text-secondary';
  const button = `gb:context-form:min-h-11 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:px-3 gb:context-form:py-2 gb:context-form:text-[13px] gb:context-form:font-body gb:context-form:leading-snug gb:context-form:text-left gb:context-form:whitespace-normal gb:context-form:cursor-pointer gb:context-form:disabled:cursor-wait ${focus}`;
  const input = `gb:context-form:block gb:context-form:w-full gb:context-form:min-w-0 gb:context-form:min-h-11 gb:context-form:box-border gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-[var(--bg-primary)] gb:context-form:p-2.5 gb:context-form:text-ink gb:context-form:font-body gb:context-form:text-[13px] gb:context-form:max-[720px]:text-base gb:context-form:placeholder:text-secondary gb:context-form:disabled:cursor-not-allowed ${focus}`;
  const surfaceButton = `${button} gb:context-form:bg-surface gb:context-form:text-ink gb:context-form:hover:bg-hover`;
  function selected(field: LifestyleField, value: string): boolean {
    const answer = draft[field.key]; return Array.isArray(answer) ? answer.includes(value) : answer === value;
  }
</script>
{#snippet fieldControl(field: LifestyleField)}
  <div class="gb:context-form:mb-4">
    <div id={`${field.id}-label`} class={label}>{field.label}</div>
    <div id={field.id} role="group" aria-labelledby={`${field.id}-label`} class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5">
      {#each field.options as option}
        <button type="button" class={`${field.multiple ? 'lifestyle-tag' : 'lifestyle-option'} ${surfaceButton} gb:context-form:aria-pressed:border-accent gb:context-form:aria-pressed:bg-accent-fill gb:context-form:aria-pressed:hover:bg-accent-fill ${selected(field, option.value) ? 'active' : ''}`} aria-pressed={selected(field, option.value)} data-context-value={option.value} disabled={busy} onclick={() => { if (current() && !busy) toggleLifestyleChoice(field, draft, option.value); }}>{option.label}</button>
      {/each}
    </div>
  </div>
{/snippet}
<div data-context-form-view={model.key} class="gb:context-form:min-w-0 gb:context-form:[overflow-wrap:anywhere]">
  <div class="gb:context-form:sticky gb:context-form:top-0 gb:context-form:z-[8] gb:context-form:flex gb:context-form:items-start gb:context-form:justify-between gb:context-form:gap-4 gb:context-form:border-b gb:context-form:border-line gb:context-form:bg-dialog-head gb:context-form:px-[26px] gb:context-form:py-5 gb:context-form:max-[720px]:px-[18px] gb:context-form:max-[720px]:py-4">
    <div><div class="gb:context-form:text-[10px] gb:context-form:uppercase gb:context-form:tracking-wider gb:context-form:text-secondary">Profile context</div><h2 id="lifestyle-form-title" class="gb:context-form:m-0 gb:context-form:text-xl gb:context-form:font-semibold gb:context-form:text-ink">{model.title}</h2></div>
    <button type="button" class={`gb:context-form:shrink-0 gb:context-form:min-h-11 gb:context-form:min-w-11 gb:context-form:border-0 gb:context-form:bg-transparent gb:context-form:text-2xl gb:context-form:text-secondary gb:context-form:cursor-pointer ${focus}`} aria-label={`Close ${model.title}`} onclick={() => { if (current()) close(); }}>×</button>
  </div>
  <div class="gb:context-form:px-[26px] gb:context-form:pt-[22px] gb:context-form:max-[720px]:px-[18px] gb:context-form:max-[720px]:pt-[18px]">
    <p class="gb:context-form:mt-0 gb:context-form:mb-5 gb:context-form:text-[13px] gb:context-form:leading-normal gb:context-form:text-secondary">{model.subtitle}</p>
    {#if model.mismatch}
      <div class="ctx-data-mismatch gb:context-form:grid gb:context-form:gap-1 gb:context-form:mb-4 gb:context-form:px-3 gb:context-form:py-[11px] gb:context-form:border gb:context-form:border-warning gb:context-form:rounded-control gb:context-form:bg-[color-mix(in_srgb,var(--orange)_8%,var(--bg-card))] gb:context-form:text-xs gb:context-form:leading-normal gb:context-form:text-secondary" role="status"><strong class="gb:context-form:text-ink gb:context-form:text-[13px]">Profile and tracked sleep differ</strong><span>{model.mismatch}.</span><small class="gb:context-form:text-[11px] gb:context-form:text-secondary">Both are kept. Recent device data can differ from your usual experience or have incomplete coverage.</small></div>
    {/if}
    {#each model.fields as field}{@render fieldControl(field)}{/each}
    {#each model.sections as section}
      <details class="gb:context-form:my-3.5 gb:context-form:overflow-clip gb:context-form:rounded-[var(--radius-md)] gb:context-form:border gb:context-form:border-line gb:context-form:bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)]">
        <summary class={`gb:context-form:min-h-14 gb:context-form:px-3.5 gb:context-form:py-[11px] gb:context-form:text-ink gb:context-form:cursor-pointer gb:context-form:hover:bg-hover ${focus}`}><span class="gb:context-form:text-[13px] gb:context-form:font-bold">{section.title}</span><span class="gb:context-form:block gb:context-form:mt-1 gb:context-form:text-[11px] gb:context-form:leading-snug gb:context-form:text-secondary">{lifestyleSectionSummary(section, draft)}</span></summary>
        <div class="gb:context-form:border-t gb:context-form:border-line gb:context-form:px-3.5 gb:context-form:pt-3.5">{#each section.fields as field}{@render fieldControl(field)}{/each}
          {#if section.meals}
            {#if section.meals.disabled}
              <div id="diet-meal-precedence" role="status" class="gb:context-form:grid gb:context-form:gap-1 gb:context-form:mb-3.5 gb:context-form:p-3 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-accent gb:context-form:bg-accent-fill gb:context-form:text-xs gb:context-form:leading-normal gb:context-form:text-secondary"><strong class="gb:context-form:text-[13px] gb:context-form:text-ink">Detailed meal log has priority</strong><span>Saved examples stay here but are not sent to AI while Meals &amp; Nutrition context is active.</span><small class="gb:context-form:text-[11px]">Logs may be partial; unlogged meals stay unknown.</small></div>
            {/if}
            {#each lifestyleMeals as meal}
              <div class="gb:context-form:mb-4 gb:context-form:grid gb:context-form:grid-cols-[110px_minmax(0,1fr)] gb:context-form:gap-2 gb:context-form:max-[480px]:grid-cols-1">
                <div><label class={label} for={`diet-${meal.key}-time`}>{meal.label} time</label><input type="text" id={`diet-${meal.key}-time`} placeholder={section.meals.timePlaceholder} value={draft[`${meal.key}Time`]} disabled={busy || section.meals.disabled} aria-describedby={section.meals.disabled ? 'diet-meal-precedence' : undefined} class={input} oninput={event => { if (current() && !busy && !section.meals?.disabled) draft[`${meal.key}Time`] = event.currentTarget.value; }} /></div>
                <div><label class={label} for={`diet-${meal.key}`}>{meal.label}</label><input type="text" id={`diet-${meal.key}`} placeholder={meal.placeholder} value={draft[meal.key]} disabled={busy || section.meals.disabled} aria-describedby={section.meals.disabled ? 'diet-meal-precedence' : undefined} class={input} oninput={event => { if (current() && !busy && !section.meals?.disabled) draft[meal.key] = event.currentTarget.value; }} /></div>
              </div>
            {/each}
          {/if}
        </div>
      </details>
    {/each}
    <label class={`${label} gb:context-form:mt-4`} for="ctx-note-input">Notes</label>
    <textarea id="ctx-note-input" rows="2" placeholder="Anything else that may be relevant" value={typeof draft.note === 'string' ? draft.note : ''} disabled={busy} oninput={event => { if (current() && !busy) draft.note = event.currentTarget.value; }} class={`gb:context-form:block gb:context-form:w-full gb:context-form:box-border gb:context-form:resize-y gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-[var(--bg-primary)] gb:context-form:p-2.5 gb:context-form:text-ink gb:context-form:font-body gb:context-form:text-[13px] gb:context-form:max-[720px]:text-base gb:context-form:placeholder:text-secondary ${focus}`}></textarea>
    <p role="status" aria-live="polite" class="gb:context-form:my-2 gb:context-form:text-xs gb:context-form:text-secondary">{status}</p>
    <div class="gb:context-form:sticky gb:context-form:bottom-0 gb:context-form:z-[7] gb:context-form:-mx-[26px] gb:context-form:mt-[22px] gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-2 gb:context-form:border-t gb:context-form:border-line gb:context-form:bg-secondary-surface gb:context-form:px-[26px] gb:context-form:pt-3.5 gb:context-form:pb-[calc(14px+env(safe-area-inset-bottom))] gb:context-form:max-[720px]:-mx-[18px] gb:context-form:max-[720px]:px-[18px]">
      <button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent gb:context-form:hover:bg-accent`} disabled={busy} onclick={() => { if (current() && !busy) save(); }}>{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" class={surfaceButton} onclick={() => { if (current()) close(); }}>Cancel</button>
      {#if hasCurrent}<button type="button" class={`${button} gb:context-form:bg-surface gb:context-form:hover:bg-hover gb:context-form:ml-auto gb:context-form:border-danger gb:context-form:text-danger-ink`} disabled={busy} onclick={() => { if (current() && !busy) clear(); }}>Clear</button>{/if}
    </div>
  </div>
</div>
