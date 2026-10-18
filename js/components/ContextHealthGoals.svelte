<script lang="ts">
  import { untrack } from 'svelte';
  import { HEALTH_GOAL_STARTERS, HEALTH_GOAL_PRIORITIES, healthGoalRows } from '../health-goals-utils.js';
  let { initial, current, add, remove, clear, done, close }: {
    initial: unknown; current(): boolean; add(): void; remove(index: number): void; clear(): void; done(): void; close(): void;
  } = $props();
  let goals = $state.raw(untrack(() => initial)), text = $state(''), severity = $state('mild');
  let busy = $state(false), status = $state('');
  let input: HTMLInputElement;
  const rows = $derived(healthGoalRows(goals));
  export function readDraft() { return { text, severity }; }
  export function refresh(value: unknown): void { goals = value; }
  export function report(message: string, pending: boolean, reset = false): void {
    status = message; busy = pending; if (reset) { text = ''; severity = 'mild'; }
  }
  export function focusInput(): void { input?.focus({ preventScroll: true }); }
  import { button, surfaceButton, choiceButton, input as inputClass, closeButton, goalRemove, editorHeader, editorKicker, editorTitle, editorFooter } from '../context-form-classes.js';
  const surface = choiceButton;
  const priorityColor: Record<string, string> = { major: 'gb:context-form:border-danger gb:context-form:text-danger-ink', mild: 'gb:context-form:border-warning gb:context-form:text-warning-ink', minor: 'gb:context-form:border-success gb:context-form:text-success-ink' };
  function submit(): void { if (current() && !busy) add(); }
</script>
<div data-context-form-view="healthGoals" data-context-goals-view class="gb:context-form:min-w-0 gb:context-form:[overflow-wrap:anywhere]">
  <header class={editorHeader}>
    <div><div class={editorKicker}>Profile context</div><h2 id="context-health-goals-title" class={editorTitle}>Health Goals</h2></div>
    <button type="button" aria-label="Close Health Goals" class={closeButton} onclick={() => { if (current()) close(); }}>×</button>
  </header>
  <div class="gb:context-form:px-[26px] gb:context-form:pt-[22px] gb:context-form:max-[720px]:px-[18px]">
    <p class="gb:context-form:mt-0 gb:context-form:mb-5 gb:context-form:text-[13px] gb:context-form:leading-normal gb:context-form:text-secondary">List things you want to solve or improve. The AI will prioritize analysis around your stated goals.</p>
    {#if rows.length}<ul class="gb:context-form:m-0 gb:context-form:mb-4 gb:context-form:list-none gb:context-form:p-0" aria-label="Saved health goals">
      {#each rows as row (row)}<li class="gb:context-form:mb-1.5 gb:context-form:flex gb:context-form:items-center gb:context-form:gap-2.5 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-surface gb:context-form:py-2.5 gb:context-form:px-3 gb:context-form:text-[13px] gb:context-form:max-[480px]:flex-wrap">
        <span class={`gb:context-form:justify-self-start gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-secondary-surface gb:context-form:px-2 gb:context-form:py-0.5 gb:context-form:text-[11px] gb:context-form:font-bold gb:context-form:uppercase gb:context-form:text-ink ${priorityColor[row.severity] || ''}`}>{row.priority}</span>
        <span class="goals-text gb:context-form:flex-1 gb:context-form:min-w-0 gb:context-form:text-ink gb:context-form:max-[480px]:col-start-1">{row.text}</span>
        <button type="button" aria-label={`Remove goal: ${row.text}`} title="Remove goal" disabled={busy} class={goalRemove} onclick={() => { if (current() && !busy && rows.includes(row)) remove(row.index); }}>×</button>
      </li>{/each}
    </ul>{/if}
    <div id="goal-starters-label" class="gb:context-form:mb-2 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:text-secondary">Common starting points</div>
    <div role="group" aria-labelledby="goal-starters-label" class="gb:context-form:mb-4 gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5">
      {#each HEALTH_GOAL_STARTERS as starter}<button type="button" class={surface} disabled={busy} onclick={() => { if (current() && !busy) { text = starter; focusInput(); } }}>{starter}</button>{/each}
    </div>
    <label for="goal-text-input" class="gb:context-form:mb-2 gb:context-form:block gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:text-secondary">Add goal</label>
    <input bind:this={input} id="goal-text-input" type="text" placeholder="e.g. Improve insulin sensitivity, Optimize thyroid function" value={text} disabled={busy} class={inputClass} oninput={event => { if (current() && !busy) text = event.currentTarget.value; }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} />
    <div class="gb:context-form:mt-3 gb:context-form:flex gb:context-form:items-end gb:context-form:justify-between gb:context-form:gap-3.5 gb:context-form:max-[600px]:flex-col gb:context-form:max-[600px]:items-stretch">
      <div><div id="goal-priority-label" class="gb:context-form:mb-2 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:text-secondary">Priority</div><div id="goal-severity-select" role="group" aria-labelledby="goal-priority-label" class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5">
        {#each HEALTH_GOAL_PRIORITIES as option}<button type="button" class={`${surface}`} data-context-value={option.value} aria-pressed={severity === option.value} disabled={busy} onclick={() => { if (current() && !busy) severity = option.value; }}>{option.label}</button>{/each}
      </div></div><button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} disabled={busy} onclick={submit}>{busy ? 'Saving…' : 'Add goal'}</button>
    </div>
    <p role="status" aria-live="polite" class="gb:context-form:my-2 gb:context-form:text-xs gb:context-form:text-secondary">{status}</p>
    <footer class={editorFooter}>
      <button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} disabled={busy} onclick={() => { if (current() && !busy) done(); }}>Done</button>
      {#if rows.length}<button type="button" class={`${surfaceButton} gb:context-form:ml-auto gb:context-form:border-danger gb:context-form:bg-surface gb:context-form:text-danger-ink gb:context-form:hover:bg-hover`} disabled={busy} onclick={() => { if (current() && !busy) clear(); }}>Clear All</button>{/if}
    </footer>
  </div>
</div>
