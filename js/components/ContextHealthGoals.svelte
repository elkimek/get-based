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
  const focus = 'gb:context-form:focus-visible:outline-2 gb:context-form:focus-visible:outline-accent gb:context-form:focus-visible:outline-offset-2';
  const button = `gb:context-form:min-h-11 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:px-3 gb:context-form:py-2 gb:context-form:font-body gb:context-form:text-[13px] gb:context-form:leading-snug gb:context-form:text-left gb:context-form:cursor-pointer gb:context-form:disabled:cursor-wait ${focus}`;
  const surface = `${button} gb:context-form:bg-surface gb:context-form:text-ink gb:context-form:hover:bg-hover`;
  const priorityColor: Record<string, string> = { major: 'gb:context-form:border-danger gb:context-form:text-danger-ink', mild: 'gb:context-form:border-warning gb:context-form:text-warning-ink', minor: 'gb:context-form:border-success gb:context-form:text-success-ink' };
  function submit(): void { if (current() && !busy) add(); }
</script>
<div data-context-form-view="healthGoals" data-context-goals-view class="gb:context-form:min-w-0 gb:context-form:[overflow-wrap:anywhere]">
  <header class="gb:context-form:sticky gb:context-form:top-0 gb:context-form:z-[8] gb:context-form:flex gb:context-form:items-start gb:context-form:justify-between gb:context-form:gap-4 gb:context-form:border-b gb:context-form:border-line gb:context-form:bg-dialog-head gb:context-form:px-[26px] gb:context-form:py-5 gb:context-form:max-[720px]:px-[18px]">
    <div><div class="gb:context-form:text-[10px] gb:context-form:uppercase gb:context-form:tracking-wider gb:context-form:text-secondary">Profile context</div><h2 id="context-health-goals-title" class="gb:context-form:m-0 gb:context-form:text-xl gb:context-form:font-semibold gb:context-form:text-ink">Health Goals</h2></div>
    <button type="button" aria-label="Close Health Goals" class={`gb:context-form:min-h-11 gb:context-form:min-w-11 gb:context-form:shrink-0 gb:context-form:border-0 gb:context-form:bg-transparent gb:context-form:text-2xl gb:context-form:text-secondary gb:context-form:cursor-pointer ${focus}`} onclick={() => { if (current()) close(); }}>×</button>
  </header>
  <div class="gb:context-form:px-[26px] gb:context-form:pt-[22px] gb:context-form:max-[720px]:px-[18px]">
    <p class="gb:context-form:mt-0 gb:context-form:mb-5 gb:context-form:text-[13px] gb:context-form:leading-normal gb:context-form:text-secondary">List things you want to solve or improve. The AI will prioritize analysis around your stated goals.</p>
    {#if rows.length}<ul class="gb:context-form:m-0 gb:context-form:mb-4 gb:context-form:list-none gb:context-form:p-0" aria-label="Saved health goals">
      {#each rows as row (row)}<li class="gb:context-form:mb-1.5 gb:context-form:grid gb:context-form:grid-cols-[auto_minmax(0,1fr)_44px] gb:context-form:items-center gb:context-form:gap-2.5 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-surface gb:context-form:py-2 gb:context-form:pl-3 gb:context-form:pr-1 gb:context-form:text-[13px] gb:context-form:max-[480px]:grid-cols-[minmax(0,1fr)_44px]">
        <span class={`gb:context-form:justify-self-start gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-secondary-surface gb:context-form:px-2 gb:context-form:py-0.5 gb:context-form:text-[11px] gb:context-form:font-bold gb:context-form:uppercase gb:context-form:text-ink ${priorityColor[row.severity] || ''}`}>{row.priority}</span>
        <span class="goals-text gb:context-form:min-w-0 gb:context-form:text-ink gb:context-form:max-[480px]:col-start-1">{row.text}</span>
        <button type="button" aria-label={`Remove goal: ${row.text}`} title="Remove goal" disabled={busy} class={`gb:context-form:min-h-11 gb:context-form:min-w-11 gb:context-form:border-0 gb:context-form:bg-transparent gb:context-form:text-xl gb:context-form:text-secondary gb:context-form:cursor-pointer gb:context-form:hover:text-danger-ink gb:context-form:disabled:cursor-wait gb:context-form:max-[480px]:col-start-2 gb:context-form:max-[480px]:row-start-1 gb:context-form:max-[480px]:row-span-2 ${focus}`} onclick={() => { if (current() && !busy && rows.includes(row)) remove(row.index); }}>×</button>
      </li>{/each}
    </ul>{/if}
    <div id="goal-starters-label" class="gb:context-form:mb-2 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:text-secondary">Common starting points</div>
    <div role="group" aria-labelledby="goal-starters-label" class="gb:context-form:mb-4 gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5">
      {#each HEALTH_GOAL_STARTERS as starter}<button type="button" class={surface} disabled={busy} onclick={() => { if (current() && !busy) { text = starter; focusInput(); } }}>{starter}</button>{/each}
    </div>
    <label for="goal-text-input" class="gb:context-form:mb-2 gb:context-form:block gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:text-secondary">Add goal</label>
    <input bind:this={input} id="goal-text-input" type="text" placeholder="e.g. Improve insulin sensitivity, Optimize thyroid function" value={text} disabled={busy} class={`gb:context-form:block gb:context-form:box-border gb:context-form:w-full gb:context-form:min-w-0 gb:context-form:min-h-11 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-[var(--bg-primary)] gb:context-form:p-2.5 gb:context-form:font-body gb:context-form:text-[13px] gb:context-form:text-ink gb:context-form:placeholder:text-secondary gb:context-form:max-[720px]:text-base ${focus}`} oninput={event => { if (current() && !busy) text = event.currentTarget.value; }} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} />
    <div class="gb:context-form:mt-3 gb:context-form:flex gb:context-form:items-end gb:context-form:justify-between gb:context-form:gap-3.5 gb:context-form:max-[600px]:flex-col gb:context-form:max-[600px]:items-stretch">
      <div><div id="goal-priority-label" class="gb:context-form:mb-2 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:text-secondary">Priority</div><div id="goal-severity-select" role="group" aria-labelledby="goal-priority-label" class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5">
        {#each HEALTH_GOAL_PRIORITIES as option}<button type="button" class={`${surface} gb:context-form:aria-pressed:border-accent gb:context-form:aria-pressed:bg-accent-fill gb:context-form:aria-pressed:hover:bg-accent-fill`} data-context-value={option.value} aria-pressed={severity === option.value} disabled={busy} onclick={() => { if (current() && !busy) severity = option.value; }}>{option.label}</button>{/each}
      </div></div><button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} disabled={busy} onclick={submit}>{busy ? 'Saving…' : 'Add goal'}</button>
    </div>
    <p role="status" aria-live="polite" class="gb:context-form:my-2 gb:context-form:text-xs gb:context-form:text-secondary">{status}</p>
    <footer class="gb:context-form:sticky gb:context-form:bottom-0 gb:context-form:z-[7] gb:context-form:-mx-[26px] gb:context-form:mt-[22px] gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-2 gb:context-form:border-t gb:context-form:border-line gb:context-form:bg-secondary-surface gb:context-form:px-[26px] gb:context-form:pt-3.5 gb:context-form:pb-[calc(14px+env(safe-area-inset-bottom))] gb:context-form:max-[720px]:-mx-[18px] gb:context-form:max-[720px]:px-[18px]">
      <button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} disabled={busy} onclick={() => { if (current() && !busy) done(); }}>Done</button>
      {#if rows.length}<button type="button" class={`${button} gb:context-form:ml-auto gb:context-form:border-danger gb:context-form:bg-surface gb:context-form:text-danger-ink gb:context-form:hover:bg-hover`} disabled={busy} onclick={() => { if (current() && !busy) clear(); }}>Clear All</button>{/if}
    </footer>
  </div>
</div>
