<script lang="ts">
  import { untrack } from 'svelte';
  import type { ContextHubModel, ContextSourceRow } from '../context-hub-model.js';
  import type { ContextSettingMutation } from '../context-hub-session.js';
  let { initial, current, change, retry, discard, close, pick }: {
    initial: ContextHubModel; current(): boolean; change(value: ContextSettingMutation): void;
    retry(): void; discard(): void; close(): void; pick(key: 'lens' | 'kb'): void;
  } = $props();
  let model = $state(untrack(() => initial)), busy = $state(false), pending = $state<ContextSettingMutation | null>(null), error = $state('');
  export function update(next: ContextHubModel, saving: boolean, intent: ContextSettingMutation | null, message: string): void {
    model = next; busy = saving; pending = intent; error = message;
  }
  const focus = 'gb:context-hub:focus-visible:outline-2 gb:context-hub:focus-visible:outline-accent gb:context-hub:focus-visible:outline-offset-2';
  const control = `gb:context-hub:pointer-coarse:min-h-11 gb:context-hub:max-[760px]:min-h-11 gb:context-hub:rounded-control gb:context-hub:border gb:context-hub:border-line gb:context-hub:px-[18px] gb:context-hub:py-2 gb:context-hub:[font-family:inherit] gb:context-hub:text-sm gb:context-hub:font-semibold gb:context-hub:leading-[normal] gb:context-hub:cursor-pointer ${focus}`;
  const text = 'gb:context-hub:text-xs gb:context-hub:leading-[1.35] gb:context-hub:text-secondary';
  const timeframe = `gb:context-hub:min-h-[34px] gb:context-hub:pointer-coarse:min-h-11 gb:context-hub:max-[760px]:min-h-11 gb:context-hub:rounded-[7px] gb:context-hub:border gb:context-hub:border-line gb:context-hub:py-[5px] gb:context-hub:pl-[9px] gb:context-hub:pr-7 gb:context-hub:[font-family:inherit] gb:context-hub:text-[11px] gb:context-hub:font-[650] gb:context-hub:leading-[normal] ${focus}`;
  function checked(row: ContextSourceRow): boolean {
    return pending?.kind === 'toggle' && pending.key === row.toggleKey && pending.group === row.group ? pending.checked : row.checked;
  }
</script>
<div data-context-hub-view data-context-save-state={busy ? 'saving' : error ? 'failed' : 'idle'} class="confirm-dialog context-hub-dialog gb:context-hub:flex gb:context-hub:flex-col gb:context-hub:w-[min(980px,calc(100vw-32px))] gb:context-hub:max-w-[980px] gb:context-hub:max-h-[min(92dvh,860px)] gb:context-hub:overflow-hidden gb:context-hub:p-0 gb:context-hub:bg-secondary-surface gb:context-hub:text-ink gb:context-hub:shadow-dialog gb:context-hub:[overflow-wrap:anywhere] gb:context-hub:max-[760px]:w-[calc(100vw-20px)] gb:context-hub:max-[760px]:max-h-[calc(100dvh-20px)]" role="dialog" aria-modal="true" aria-labelledby="context-hub-title" aria-describedby="context-hub-description">
  <header class="context-hub-header gb:context-hub:flex gb:context-hub:shrink-0 gb:context-hub:items-start gb:context-hub:justify-between gb:context-hub:gap-4 gb:context-hub:border-b gb:context-hub:border-line gb:context-hub:bg-dialog-head gb:context-hub:px-[26px] gb:context-hub:py-[22px] gb:context-hub:max-[760px]:px-[15px]">
    <div class="gb:context-hub:min-w-0">
      <h2 id="context-hub-title" class="gb:context-hub:mt-[3px] gb:context-hub:mb-0 gb:context-hub:font-display gb:context-hub:text-[22px] gb:context-hub:font-bold">Context</h2>
      <p id="context-hub-description" class={`gb:context-hub:mt-[5px] gb:context-hub:mb-0 gb:context-hub:text-xs gb:context-hub:leading-[1.4] gb:context-hub:text-secondary`}>Control what can influence AI answers, Biology Scores, and source-driven warnings.</p>
    </div>
    <button type="button" id="context-hub-close" aria-label="Close Context" class={`gb:context-hub:size-10 gb:context-hub:pointer-coarse:min-w-11 gb:context-hub:pointer-coarse:min-h-11 gb:context-hub:max-[760px]:min-h-11 gb:context-hub:inline-flex gb:context-hub:items-center gb:context-hub:justify-center gb:context-hub:p-0 gb:context-hub:shrink-0 gb:context-hub:rounded-control gb:context-hub:border gb:context-hub:border-line gb:context-hub:bg-surface gb:context-hub:text-secondary gb:context-hub:text-[22px] gb:context-hub:leading-none gb:context-hub:cursor-pointer ${focus}`} onclick={() => { if (current()) close(); }}>×</button>
  </header>
  <div class="context-hub-body gb:context-hub:flex gb:context-hub:min-h-0 gb:context-hub:flex-1 gb:context-hub:overflow-hidden gb:context-hub:flex-col gb:context-hub:px-[22px] gb:context-hub:pt-5 gb:context-hub:pb-[22px] gb:context-hub:max-[760px]:p-[15px]">
    <div class="context-hub-scroll gb:context-hub:min-h-0 gb:context-hub:overflow-y-auto gb:context-hub:overscroll-contain gb:context-hub:pr-0.5">
      <section class="context-grounding-panel gb:context-hub:mb-3 gb:context-hub:border-b gb:context-hub:border-line gb:context-hub:pb-3" aria-labelledby="context-grounding-title">
        <h3 id="context-grounding-title" class="gb:context-hub:m-0 gb:context-hub:text-[13px] gb:context-hub:font-bold">Answer grounding</h3>
        <p class={`gb:context-hub:mt-0.5 gb:context-hub:mb-2 ${text}`}>Optional instructions and documents that guide how AI answers, separate from profile data.</p>
        <div class="gb:context-hub:grid gb:context-hub:grid-cols-2 gb:context-hub:gap-2 gb:context-hub:max-[640px]:grid-cols-1">
          {#each model.grounding as card (card.key)}
            <button type="button" class={`ai-picker-card gb:context-hub:flex gb:context-hub:min-h-[106px] gb:context-hub:min-w-0 gb:context-hub:flex-col gb:context-hub:gap-1.5 gb:context-hub:rounded-control gb:context-hub:border gb:context-hub:border-line gb:context-hub:border-l-[3px] gb:context-hub:border-l-accent gb:context-hub:bg-surface gb:context-hub:py-3 gb:context-hub:pl-4 gb:context-hub:pr-3.5 gb:context-hub:text-left gb:context-hub:font-body gb:context-hub:text-ink gb:context-hub:cursor-pointer gb:context-hub:hover:bg-hover ${focus}`} data-pick={card.key} onclick={() => { if (current()) pick(card.key); }}>
              <span class="ai-picker-kicker gb:context-hub:text-[10px] gb:context-hub:font-bold gb:context-hub:uppercase gb:context-hub:tracking-wider gb:context-hub:text-secondary">{card.kicker}</span>
              <span class="gb:context-hub:text-sm gb:context-hub:font-semibold">{card.title} {#if card.configured}<span aria-label="Configured" class="gb:context-hub:text-success-ink">✓</span>{/if}</span>
              <span class={text}>{card.subtitle}</span>
              <span class="gb:context-hub:mt-auto gb:context-hub:text-xs gb:context-hub:font-semibold gb:context-hub:text-link-ink">{card.action} →</span>
            </button>
          {/each}
        </div>
      </section>
      <section class="context-source-panel gb:context-hub:mt-3.5 gb:context-hub:mb-2.5" aria-labelledby="context-data-sources-title">
        <h3 id="context-data-sources-title" class="gb:context-hub:m-0 gb:context-hub:text-[13px] gb:context-hub:font-bold">Data sources</h3>
        <p class={`gb:context-hub:mt-0.5 gb:context-hub:mb-2 ${text}`}>Choose exactly which profile data can influence AI answers and score context. The same source choices apply to external Agent Access.</p>
        <div class="gb:context-hub:mb-3 gb:context-hub:grid gb:context-hub:grid-cols-3 gb:context-hub:gap-2 gb:context-hub:max-[760px]:grid-cols-1" aria-label="Current context source summary">
          {#each model.metrics as metric (metric.tone)}
            <div class="context-summary-metric gb:context-hub:flex gb:context-hub:min-w-0 gb:context-hub:items-center gb:context-hub:gap-[9px] gb:context-hub:rounded-control gb:context-hub:border gb:context-hub:border-[color-mix(in_srgb,var(--border)_70%,transparent)] gb:context-hub:bg-[color-mix(in_srgb,var(--bg-secondary)_42%,transparent)] gb:context-hub:px-2.5 gb:context-hub:py-[9px]" aria-label={`${metric.label}: ${metric.items.length ? metric.items.join(', ') : 'none'}`}>
              <span class={`gb:context-hub:flex gb:context-hub:size-[30px] gb:context-hub:shrink-0 gb:context-hub:items-center gb:context-hub:justify-center gb:context-hub:rounded-[9px] gb:context-hub:text-[15px] gb:context-hub:font-[750] ${metric.tone === 'included' ? 'gb:context-hub:bg-[color-mix(in_srgb,var(--green)_14%,var(--bg-card))] gb:context-hub:text-[var(--green)]' : 'gb:context-hub:bg-surface gb:context-hub:text-ink'}`}>{metric.items.length}</span>
              <span class="gb:context-hub:flex gb:context-hub:min-w-0 gb:context-hub:flex-col gb:context-hub:gap-px"><span class="gb:context-hub:text-xs gb:context-hub:font-bold">{metric.label}</span><span class="gb:context-hub:text-[10px] gb:context-hub:leading-normal gb:context-hub:text-secondary">{metric.detail}</span></span>
            </div>
          {/each}
        </div>
        <div class="gb:context-hub:grid gb:context-hub:grid-cols-2 gb:context-hub:gap-4 gb:context-hub:max-[760px]:grid-cols-1">
          {#each model.sections as section (section.key)}
            <section data-context-section={section.key} class={`gb:context-hub:min-w-0 gb:context-hub:rounded-xl gb:context-hub:border gb:context-hub:border-line gb:context-hub:bg-secondary-surface gb:context-hub:p-3 ${section.wide ? 'context-source-section-wide gb:context-hub:col-span-2 gb:context-hub:max-[760px]:col-span-1' : ''}`} aria-labelledby={`context-section-${section.key}`}>
              <h4 id={`context-section-${section.key}`} class="gb:context-hub:m-0 gb:context-hub:text-xs gb:context-hub:font-[750]">{section.title}</h4>
              <p class="gb:context-hub:mt-0.5 gb:context-hub:mb-[9px] gb:context-hub:text-[11px] gb:context-hub:leading-[1.35] gb:context-hub:text-secondary">{section.subtitle}</p>
              <div class={`gb:context-hub:grid gb:context-hub:gap-1.5 ${section.wide && section.rows.length > 1 ? 'gb:context-hub:grid-cols-2 gb:context-hub:max-[760px]:grid-cols-1' : 'gb:context-hub:grid-cols-1'}`}>
                {#each section.rows as row (row.key)}
                  <div data-context-source={row.key} data-context-group={row.group} class={`context-source-row gb:context-hub:flex gb:context-hub:min-w-0 gb:context-hub:items-center gb:context-hub:justify-between gb:context-hub:gap-2.5 gb:context-hub:rounded-control gb:context-hub:border gb:context-hub:bg-surface gb:context-hub:pl-2.5 gb:context-hub:pr-[9px] gb:context-hub:py-2 gb:context-hub:focus-within:outline-2 gb:context-hub:focus-within:outline-accent ${checked(row) ? 'gb:context-hub:border-[color-mix(in_srgb,var(--accent)_36%,var(--border))]' : 'gb:context-hub:border-[color-mix(in_srgb,var(--border)_82%,transparent)]'} ${row.child && !section.wide ? 'gb:context-hub:ml-1.5 gb:context-hub:max-[760px]:ml-0' : ''}`}>
                    <div class="gb:context-hub:flex gb:context-hub:min-w-0 gb:context-hub:flex-col gb:context-hub:gap-0.5">
                      <span id={`context-source-${row.key}-title`} class="gb:context-hub:text-[13px] gb:context-hub:font-[650]">{row.title}</span>
                      <span id={`context-source-${row.key}-description`} class={`context-source-desc ${text}`}>{row.description}</span>
                      <span class="context-source-affects gb:context-hub:mt-0.5 gb:context-hub:flex gb:context-hub:flex-wrap gb:context-hub:gap-[5px]">
                        {#each row.affects as effect}<span class="context-affect-chip gb:context-hub:rounded-full gb:context-hub:border gb:context-hub:border-line gb:context-hub:bg-secondary-surface gb:context-hub:px-1.5 gb:context-hub:py-px gb:context-hub:inline-flex gb:context-hub:items-center gb:context-hub:min-h-[18px] gb:context-hub:leading-[1.25] gb:context-hub:text-[10px] gb:context-hub:font-[650] gb:context-hub:text-secondary">{effect}</span>{/each}
                      </span>
                      <span id={`context-source-${row.key}-status`} class="gb:context-hub:text-xs gb:context-hub:leading-[1.35] gb:context-hub:text-secondary">{row.status}</span>
                      {#if row.key === 'body-nutrition'}
                        <label for="nutrition-context-days" class="gb:context-hub:mt-[5px] gb:context-hub:flex gb:context-hub:flex-wrap gb:context-hub:items-center gb:context-hub:justify-between gb:context-hub:gap-2 gb:context-hub:text-[11px] gb:context-hub:font-[650] gb:context-hub:text-secondary">Automatic timeframe
                          <select id="nutrition-context-days" data-context-range="nutrition" aria-label="Meals & Nutrition automatic timeframe" class={`${timeframe} gb:context-hub:min-w-0 gb:context-hub:max-w-full gb:context-hub:bg-surface gb:context-hub:text-ink gb:context-hub:max-[760px]:text-base`} value={pending?.kind === 'nutrition' ? pending.days : model.nutritionDays} disabled={busy || !!pending || !row.checked} onchange={event => { if (current()) change({ kind: 'nutrition', days: Number(event.currentTarget.value) }); }}>
                            {#each [7, 30, 90] as days}<option value={days}>Last {days} days</option>{/each}
                          </select>
                        </label>
                      {/if}
                    </div>
                    <label for={`context-source-${row.key}`} class="gb:context-hub:relative gb:context-hub:flex gb:context-hub:w-9 gb:context-hub:h-5 gb:context-hub:pointer-coarse:min-h-11 gb:context-hub:pointer-coarse:min-w-11 gb:context-hub:shrink-0 gb:context-hub:items-center gb:context-hub:justify-center">
                      <input type="checkbox" id={`context-source-${row.key}`} data-context-toggle={row.toggleKey} aria-labelledby={`context-source-${row.key}-title`} aria-describedby={`context-source-${row.key}-description context-source-${row.key}-status`} checked={checked(row)} disabled={busy || !!pending || row.disabled} class="gb:peer gb:context-hub:absolute gb:context-hub:inset-0 gb:context-hub:z-[1] gb:context-hub:m-0 gb:context-hub:size-full gb:context-hub:cursor-pointer gb:context-hub:opacity-0" onchange={event => { if (current()) change({ kind: 'toggle', key: row.toggleKey, checked: event.currentTarget.checked, ...(row.group ? { group: row.group } : {}) }); }} />
                      <span aria-hidden="true" class="gb:context-hub:relative gb:context-hub:block gb:context-hub:h-5 gb:context-hub:w-9 gb:context-hub:box-border gb:context-hub:rounded-full gb:context-hub:border gb:context-hub:border-secondary gb:context-hub:bg-secondary-surface gb:context-hub:after:absolute gb:context-hub:after:left-0.5 gb:context-hub:after:top-0.5 gb:context-hub:after:size-3.5 gb:context-hub:after:rounded-full gb:context-hub:after:bg-secondary gb:context-hub:after:content-[''] gb:context-hub:peer-checked:bg-accent gb:context-hub:peer-checked:after:translate-x-4 gb:context-hub:peer-checked:after:bg-white gb:context-hub:peer-focus-visible:outline-2 gb:context-hub:peer-focus-visible:outline-accent gb:context-hub:peer-focus-visible:outline-offset-2"></span>
                    </label>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </section>
    </div>
    <footer class="context-hub-actions gb:context-hub:flex gb:context-hub:shrink-0 gb:context-hub:flex-wrap gb:context-hub:items-center gb:context-hub:justify-between gb:context-hub:gap-3 gb:context-hub:border-t gb:context-hub:border-line gb:context-hub:bg-secondary-surface gb:context-hub:mt-3.5 gb:context-hub:pt-3.5 gb:context-hub:max-[760px]:flex-col gb:context-hub:max-[760px]:items-stretch">
      <div class="gb:context-hub:text-[11px] gb:context-hub:text-secondary"><span>Changes save automatically.</span> <span role="status" aria-live="polite">{busy ? 'Saving changes…' : error}</span>
        {#if error && pending}<div class="gb:context-hub:mt-2 gb:context-hub:flex gb:context-hub:flex-wrap gb:context-hub:gap-2">
          <button type="button" class={`${control} gb:context-hub:bg-surface gb:context-hub:text-ink`} onclick={() => { if (current()) retry(); }}>Retry</button>
          <button type="button" class={`${control} gb:context-hub:bg-surface gb:context-hub:text-ink`} onclick={() => { if (current()) discard(); }}>Keep saved settings</button>
        </div>{/if}
      </div>
      <button type="button" id="context-hub-cancel" class={`${control} gb:context-hub:bg-accent gb:context-hub:text-on-accent`} onclick={() => { if (current()) close(); }}>Done</button>
    </footer>
  </div>
</div>
