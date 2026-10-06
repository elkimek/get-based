<script lang="ts">
  import { untrack } from 'svelte';
  import type { BenchmarkActions, BenchmarkCard, BenchmarkDifference, BenchmarkSnapshot } from '../import-benchmark-contract.js';
  import { BENCHMARK_CELL, BENCHMARK_DANGER, BENCHMARK_LABEL, BENCHMARK_PRIMARY, BENCHMARK_SECONDARY, BENCHMARK_TONES, BENCHMARK_VALUE } from '../import-benchmark-classes.js';
  let { initial, actions, mode = 'dialog', showDifferenceClose = false }: { initial: BenchmarkSnapshot; actions: BenchmarkActions; mode?: 'dialog'|'body'|'differences'; showDifferenceClose?: boolean } = $props();
  let snapshot = $state(untrack(() => initial));
  let reviewPanel: HTMLElement | null = $state(null);
  export function refresh(next: BenchmarkSnapshot): void { snapshot = next; }
  export function getSnapshot(): BenchmarkSnapshot { return snapshot; }
  export function scrollReview(): void {
    reviewPanel?.scrollIntoView({ block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  const differenceLabel = (count: number) => `${count} difference${count === 1 ? '' : 's'}`;
</script>

{#snippet differences(detail: BenchmarkDifference, showClose = false)}
  {#if detail.unavailable}
    <div class="import-benchmark-difference-unavailable gb:benchmark:grid gb:benchmark:gap-1 gb:benchmark:rounded-control gb:benchmark:bg-hover gb:benchmark:p-3">
      <strong class={BENCHMARK_VALUE}>Detailed differences were not saved for this older test.</strong>
      <span class={BENCHMARK_LABEL}>Run {detail.model} again to capture the exact markers and fields that differ.</span>
    </div>
  {:else if detail.count > 0}
    <div class="import-benchmark-difference-details gb:benchmark:min-w-0">
      <div class="import-benchmark-difference-details-head gb:benchmark:flex gb:benchmark:items-start gb:benchmark:justify-between gb:benchmark:gap-3 gb:benchmark:max-[500px]:flex-col">
        <div class="gb:benchmark:min-w-0">
        <strong class={BENCHMARK_VALUE}>What {detail.model} got differently</strong>
        <span class={BENCHMARK_LABEL}>{detail.summary}</span>
        </div>
        {#if showClose}<button type="button" class={BENCHMARK_SECONDARY} data-import-benchmark-differences-close aria-label="Close difference review" onclick={actions.closeReview}>Close</button>{/if}
      </div>
      <p class="import-benchmark-difference-note {BENCHMARK_LABEL}">Expected values come from the verified sample-report answer key. “Model returned” shows the raw model answer before getbased applies automatic marker corrections. This benchmark is not a clinical safety certification.</p>
      <div class="import-benchmark-difference-list gb:benchmark:grid gb:benchmark:gap-3">
        {#each detail.groups as group}
          <article class="import-benchmark-difference-item {group.report ? 'report-detail' : 'lab-data'} gb:benchmark:rounded-control gb:benchmark:border gb:benchmark:border-line gb:benchmark:bg-secondary-surface gb:benchmark:p-3">
            <div class="import-benchmark-difference-item-head gb:benchmark:mb-2 gb:benchmark:flex gb:benchmark:justify-between gb:benchmark:gap-3 gb:benchmark:max-[500px]:flex-wrap">
        <div class="gb:benchmark:min-w-0">
        <strong class={BENCHMARK_VALUE}>{group.marker}</strong>
        <small class={BENCHMARK_LABEL}>{group.section}</small>
        </div>
        <span class={BENCHMARK_LABEL}>{group.report ? 'Report detail' : 'Lab data'}</span>
        </div>
            {#each group.issues as issue}
              <div class="import-benchmark-difference-issue gb:benchmark:mt-3">
                <span class={BENCHMARK_LABEL}>{issue.label}</span>
                <div class="import-benchmark-difference-values gb:benchmark:grid gb:benchmark:grid-cols-2 gb:benchmark:gap-2 gb:benchmark:max-[720px]:grid-cols-1">
                  <div class="gb:benchmark:rounded-control gb:benchmark:bg-surface gb:benchmark:p-2">
        <small class={BENCHMARK_LABEL}>Expected</small><strong class={BENCHMARK_VALUE}>{issue.expected}</strong>
        </div>
                  <div class="gb:benchmark:rounded-control gb:benchmark:bg-surface gb:benchmark:p-2">
        <small class={BENCHMARK_LABEL}>Model returned</small><strong class={BENCHMARK_VALUE}>{issue.actual}</strong>
        </div>
                </div>
                {#if issue.note}<p class={BENCHMARK_LABEL}>{issue.note}</p>{/if}
              </div>
            {/each}
          </article>
        {/each}
      </div>
      {#if detail.truncated}<p class="import-benchmark-difference-truncated {BENCHMARK_LABEL}">The model returned more differences than this view can safely display.</p>{/if}
    </div>
  {/if}
{/snippet}

{#snippet card(item: BenchmarkCard)}
  <article class="import-benchmark-card {item.reference ? 'reference' : ''} {item.gold ? 'gold-standard' : ''} {item.diagnostic ? 'diagnostic' : ''} {item.selected ? 'selected' : ''} {item.incompatible ? 'comparison-incompatible' : ''} gb:benchmark:min-w-0 gb:benchmark:rounded-control gb:benchmark:border gb:benchmark:p-4 {item.selected ? 'gb:benchmark:border-accent gb:benchmark:bg-hover' : item.gold ? 'gb:benchmark:border-success gb:benchmark:bg-surface' : 'gb:benchmark:border-line gb:benchmark:bg-surface'}" data-import-benchmark-card={item.id}>
    <div class="import-benchmark-head gb:benchmark:mb-3 gb:benchmark:flex gb:benchmark:items-start gb:benchmark:justify-between gb:benchmark:gap-3 gb:benchmark:max-[720px]:flex-wrap">
      {#if !item.diagnostic}
        <label class="import-benchmark-selector gb:benchmark:relative gb:benchmark:flex gb:benchmark:min-h-[46px] gb:benchmark:min-w-11 gb:benchmark:shrink-0 gb:benchmark:cursor-pointer gb:benchmark:items-center gb:benchmark:gap-2 gb:benchmark:rounded-full gb:benchmark:border gb:benchmark:border-line gb:benchmark:px-3 gb:benchmark:py-2 gb:benchmark:text-xs gb:benchmark:text-secondary gb:benchmark:has-focus-visible:outline-2 gb:benchmark:has-focus-visible:outline-offset-2 gb:benchmark:has-focus-visible:outline-accent" title={item.incompatible ? 'Only tests of the same report and test protocol can be compared.' : 'Add this test to the comparison'}>
          <input type="checkbox" class="gb:benchmark:absolute gb:benchmark:inset-0 gb:benchmark:m-0 gb:benchmark:h-full gb:benchmark:w-full gb:benchmark:cursor-pointer gb:benchmark:opacity-0" checked={item.selected} disabled={item.incompatible || snapshot.deleting} data-import-benchmark-select={item.id} aria-label="Compare {item.fileName}" onchange={event => { const next = event.currentTarget.checked; event.currentTarget.checked = item.selected; actions.select(item.id,next); }}>
          <span aria-hidden="true" class="gb:benchmark:text-base">{item.selected ? '☑' : '☐'}</span>
        <span>Compare</span><strong class="import-benchmark-selection-order gb:benchmark:text-[11px] gb:benchmark:font-mono" aria-hidden="true">{item.order}</strong>
        </label>
      {/if}
      <div class="import-benchmark-title gb:benchmark:min-w-0 gb:benchmark:flex-1 gb:benchmark:max-[720px]:order-first gb:benchmark:max-[720px]:basis-full">
        <div class="import-benchmark-file gb:benchmark:truncate gb:benchmark:text-sm gb:benchmark:font-semibold" title={item.fileName}>{item.fileName}</div>
        <div class="import-benchmark-date {BENCHMARK_LABEL}">{item.recorded}</div>
      </div>
      <div class="import-benchmark-head-actions gb:benchmark:flex gb:benchmark:shrink-0 gb:benchmark:flex-wrap gb:benchmark:items-center gb:benchmark:justify-end gb:benchmark:gap-2 gb:benchmark:max-[720px]:ml-auto">
        <span class="import-benchmark-status {item.reference ? 'reference' : item.retried ? 'retried' : ''} gb:benchmark:rounded-full gb:benchmark:border gb:benchmark:border-line gb:benchmark:px-2 gb:benchmark:py-1 gb:benchmark:font-mono gb:benchmark:text-[11px] {item.retried ? 'gb:benchmark:text-warning-ink' : 'gb:benchmark:text-success-ink'}">{item.status}</span>
        {#if !item.gold}<button type="button" class="import-benchmark-delete {BENCHMARK_DANGER}" disabled={snapshot.deleting} data-import-benchmark-delete={item.id} aria-label="Delete model test for {item.fileName}" onclick={() => actions.remove(item.id)}>Delete</button>{/if}
      </div>
    </div>
    <div class="import-benchmark-grid gb:benchmark:grid gb:benchmark:grid-cols-4 gb:benchmark:gap-3 gb:benchmark:max-[720px]:grid-cols-2 gb:benchmark:max-[380px]:grid-cols-1">
      {#each item.fields as field}
        <div class="{field.wide ? 'gb:benchmark:col-span-full' : field.label === 'Changes during review' ? 'import-benchmark-review-findings gb:benchmark:col-span-2 gb:benchmark:max-[380px]:col-span-1' : ''} gb:benchmark:min-w-0">
        <span class={BENCHMARK_LABEL}>{field.label}</span><strong class={BENCHMARK_VALUE} title={field.title}>{field.text}</strong>
        </div>
      {/each}
    </div>
    {#if item.reference && !item.gold}
      {#if item.differences.count > 0}
        <details class="import-benchmark-difference-disclosure gb:benchmark:mt-3 gb:benchmark:border-t gb:benchmark:border-line gb:benchmark:pt-2">
        <summary class="gb:benchmark:min-h-11 gb:benchmark:cursor-pointer gb:benchmark:py-3 gb:benchmark:text-xs gb:benchmark:font-semibold gb:benchmark:text-warning-ink gb:benchmark:focus-visible:outline-2 gb:benchmark:focus-visible:outline-accent">Review {differenceLabel(item.differences.count)}</summary>{@render differences(item.differences)}</details>
      {:else if item.differences.unavailable}{@render differences(item.differences)}{/if}
    {/if}
  </article>
{/snippet}

{#snippet body()}
  <p class="import-benchmarks-note gb:benchmark:mb-3 gb:benchmark:mt-0 {BENCHMARK_LABEL}">Test different models with the same report, then compare accuracy and speed side by side. Only tests using the same report and test protocol can be compared. Test history stays on this device and is never replaced by cross-device sync.</p>
  <div class="import-benchmarks-summary gb:benchmark:mb-3 gb:benchmark:grid gb:benchmark:grid-cols-4 gb:benchmark:gap-2 gb:benchmark:max-[500px]:grid-cols-2" aria-label="Saved model tests summary">
    {#each snapshot.summary as item}<div class="gb:benchmark:min-w-0 gb:benchmark:rounded-control gb:benchmark:border gb:benchmark:border-line gb:benchmark:bg-surface gb:benchmark:p-3">
        <span class={BENCHMARK_LABEL}>{item.label}</span><strong class="gb:benchmark:block gb:benchmark:font-mono gb:benchmark:text-lg">{item.value}</strong>
        </div>{/each}
  </div>
  <section class="import-reference-benchmark gb:benchmark:mb-3 gb:benchmark:flex gb:benchmark:items-center gb:benchmark:justify-between gb:benchmark:gap-4 gb:benchmark:rounded-control gb:benchmark:border gb:benchmark:border-success gb:benchmark:bg-surface gb:benchmark:p-4 gb:benchmark:max-[720px]:flex-col gb:benchmark:max-[720px]:items-stretch" aria-label="Built-in benchmark answer key">
    <div class="gb:benchmark:min-w-0 gb:benchmark:flex-1">
        <span class="import-reference-benchmark-kicker gb:benchmark:block gb:benchmark:text-[11px] gb:benchmark:leading-relaxed gb:benchmark:text-success-ink">Built-in answer key</span><strong class={BENCHMARK_VALUE}>68-result sample lab report</strong>
        <p class={BENCHMARK_LABEL}>We verified every result in this three-page PDF. Test a model with it to measure both accuracy and speed. The answer key is always 100% and has no runtime of its own.</p>
        <a href={snapshot.sampleUrl} target="_blank" rel="noopener" class="gb:benchmark:inline-flex gb:benchmark:min-h-11 gb:benchmark:items-center gb:benchmark:text-xs gb:benchmark:text-ink gb:benchmark:underline gb:benchmark:focus-visible:outline-2 gb:benchmark:focus-visible:outline-accent">Preview sample PDF</a>
        </div>
    <div class="import-reference-benchmark-actions gb:benchmark:flex gb:benchmark:min-w-0 gb:benchmark:basis-[280px] gb:benchmark:flex-col gb:benchmark:gap-2 gb:benchmark:max-[720px]:basis-auto">
      <button type="button" class="import-btn import-btn-primary {BENCHMARK_PRIMARY}" data-import-benchmarks-action="run-reference" title="Test {snapshot.model} with the sample report" disabled={snapshot.running} onclick={actions.run}>{snapshot.running ? snapshot.initiated && snapshot.progress ? snapshot.progress.indeterminate ? 'Testing current model…' : `Testing current model… ${snapshot.progress.value}%` : 'Model test running…' : `Test current model${snapshot.referenceRuns ? ` again (${snapshot.referenceRuns} saved)` : ''}`}</button>
      <span class="import-reference-current-model {BENCHMARK_LABEL} gb:benchmark:truncate gb:benchmark:font-mono" title={snapshot.model}>Using {snapshot.provider} · {snapshot.model}</span>
      <div class="import-reference-progress {snapshot.progress ? 'gb:benchmark:grid' : 'gb:benchmark:hidden'} gb:benchmark:gap-1" data-import-reference-progress hidden={!snapshot.progress}>
        <div class="import-reference-progress-track {snapshot.progress?.indeterminate ? 'indeterminate' : ''} gb:benchmark:h-2 gb:benchmark:overflow-hidden gb:benchmark:rounded-full gb:benchmark:bg-hover" role="progressbar" aria-label="Model test progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={snapshot.progress?.indeterminate ? undefined : snapshot.progress?.value || 0}>
          <span class="gb:benchmark:block gb:benchmark:h-full gb:benchmark:rounded-full gb:benchmark:bg-success gb:benchmark:motion-reduce:animate-none {snapshot.progress?.indeterminate ? 'gb:benchmark:animate-benchmark-progress' : ''}" data-import-reference-progress-fill style:width="{snapshot.progress?.indeterminate ? 36 : snapshot.progress?.value || 0}%">
        </span>
        </div>
        <span class="{BENCHMARK_LABEL} gb:benchmark:font-mono" data-import-reference-progress-copy>{snapshot.progress ? `${snapshot.progress.label} · ${snapshot.progress.indeterminate ? 'working' : `${snapshot.progress.value}%`} · ${snapshot.progress.elapsed}s` : 'Preparing model test…'}</span>
      </div>
    </div>
  </section>
  <div class="import-benchmarks-toolbar gb:benchmark:static gb:benchmark:mb-3 gb:benchmark:flex gb:benchmark:items-center gb:benchmark:justify-between gb:benchmark:gap-3 gb:benchmark:border-b gb:benchmark:border-line gb:benchmark:py-3 gb:benchmark:max-[720px]:flex-col gb:benchmark:max-[720px]:items-start">
    <div class="gb:benchmark:min-w-0">
        <strong class={BENCHMARK_VALUE}>Compare model tests</strong>
        <span class={BENCHMARK_LABEL} data-import-benchmark-selection-copy>{snapshot.selectionCopy}</span>
        </div>
    <div class="import-benchmarks-toolbar-actions gb:benchmark:flex gb:benchmark:shrink-0 gb:benchmark:flex-wrap gb:benchmark:gap-2">
      <button type="button" class="import-btn import-btn-secondary {BENCHMARK_SECONDARY}" data-import-benchmarks-action="select-latest" disabled={!snapshot.canSelectLatest || snapshot.deleting} onclick={actions.latest}>Latest matching pair</button>
      <button type="button" class="import-btn import-btn-secondary {BENCHMARK_SECONDARY}" data-import-benchmarks-action="clear-selection" disabled={!snapshot.canClear || snapshot.deleting} onclick={actions.clear}>Clear</button>
      <button type="button" class="import-btn import-benchmark-delete-selected {BENCHMARK_DANGER}" data-import-benchmarks-action="delete-selected" disabled={!snapshot.canDelete || snapshot.deleting} onclick={() => actions.remove()}>Delete selected</button>
    </div>
  </div>
  <section class="import-benchmark-comparison gb:benchmark:mb-4 gb:benchmark:overflow-hidden gb:benchmark:rounded-control gb:benchmark:border gb:benchmark:border-line gb:benchmark:bg-surface" data-import-benchmark-comparison aria-live="polite" hidden={!snapshot.comparison}>
    {#if snapshot.comparison}
      <div class="import-benchmark-comparison-head gb:benchmark:border-b gb:benchmark:border-line gb:benchmark:p-3">
        <strong class={BENCHMARK_VALUE}>{snapshot.comparison.gold ? 'Accuracy against the answer key' : 'Compare model tests'}</strong>
        <span class={BENCHMARK_LABEL}>{snapshot.comparison.gold ? 'The answer key is always 100%. Speed is shown only for models that actually ran.' : 'The first column is the baseline. Each column shows the provider, model, and difference.'}</span>
        </div>
      <section class="import-benchmark-difference-review gb:benchmark:border-b gb:benchmark:border-line gb:benchmark:p-3" data-import-benchmark-difference-review hidden={!snapshot.review} bind:this={reviewPanel}>{#if snapshot.review}{@render differences(snapshot.review,true)}{/if}
        </section>
      <div class="import-benchmark-comparison-scroll gb:benchmark:max-h-[min(54vh,520px)] gb:benchmark:overflow-auto gb:benchmark:overscroll-contain gb:benchmark:[scrollbar-gutter:stable]">
        <table class="import-benchmark-comparison-table gb:benchmark:w-full gb:benchmark:min-w-[650px] gb:benchmark:table-fixed gb:benchmark:border-collapse">
          <thead>
        <tr>
        <th scope="col" class="{BENCHMARK_CELL} gb:benchmark:sticky gb:benchmark:top-0 gb:benchmark:z-[3] gb:benchmark:w-[175px] gb:benchmark:bg-secondary-surface gb:benchmark:text-xs">Metric</th>
        {#each snapshot.comparison.headers as header (header.id)}<th scope="col" data-benchmark-run-header={header.id} class="{BENCHMARK_CELL} gb:benchmark:sticky gb:benchmark:top-0 gb:benchmark:z-[3] gb:benchmark:bg-secondary-surface">
        <span class="import-benchmark-run-label {BENCHMARK_LABEL}">{header.label}</span>
        <span class="import-benchmark-run-provider {BENCHMARK_LABEL} gb:benchmark:font-semibold" data-benchmark-provider={header.id}>{header.provider}</span><strong class="{BENCHMARK_VALUE} gb:benchmark:truncate" title="{header.provider} · {header.model}" data-benchmark-model={header.id}>{header.model}</strong>
        <small class="{BENCHMARK_LABEL} gb:benchmark:truncate" title={header.fileName}>{header.fileName}</small>{#if header.differenceCount > 0}<button type="button" class="import-benchmark-header-review {BENCHMARK_SECONDARY} gb:benchmark:mt-2" data-import-benchmark-review={header.id} aria-expanded={snapshot.reviewId === header.id} onclick={() => actions.review(header.id)}>Review {differenceLabel(header.differenceCount)}</button>{:else if header.unavailable}<span class="import-benchmark-header-review-unavailable {BENCHMARK_LABEL}">Rerun to inspect differences</span>{/if}
        </th>{/each}
        </tr>
        </thead>
          <tbody>
        {#each snapshot.comparison.rows as row (row.key)}{#if row.groupStart}<tr class="import-benchmark-metric-group">
        <th colspan={snapshot.comparison.headers.length + 1} class="{BENCHMARK_CELL} gb:benchmark:bg-hover gb:benchmark:text-xs gb:benchmark:font-semibold">{row.group}</th>
        </tr>{/if}
        <tr>
        <th scope="row" class="{BENCHMARK_CELL} gb:benchmark:w-[175px]">
        <strong class={BENCHMARK_VALUE}>{row.label}</strong>
        <small class={BENCHMARK_LABEL}>{row.hint}</small>
        </th>
        {#each row.cells as cell (cell.id)}<td data-benchmark-metric={row.key} data-benchmark-run-id={cell.id} class={BENCHMARK_CELL}>
        <strong class={BENCHMARK_VALUE}>{cell.text}</strong>
        <span class="import-benchmark-diff {cell.tone} {BENCHMARK_TONES[cell.tone]} gb:benchmark:mt-1 gb:benchmark:inline-block gb:benchmark:rounded-full gb:benchmark:px-2 gb:benchmark:py-1 gb:benchmark:font-mono gb:benchmark:text-[11px]">{cell.difference}</span>
        </td>{/each}
        </tr>
        {/each}
        </tbody>
        </table>
      </div>
    {/if}
  </section>
  <div class="import-benchmarks-section-label gb:benchmark:mb-2 gb:benchmark:flex gb:benchmark:flex-wrap gb:benchmark:justify-between gb:benchmark:gap-2">
        <strong class={BENCHMARK_VALUE}>Answer key</strong>
        <span class={BENCHMARK_LABEL}>Built in · always 100% · not a model test</span>
        </div>
  <div class="import-benchmarks-list import-benchmarks-gold-list gb:benchmark:grid gb:benchmark:gap-3">
        {#each snapshot.gold as item (item.id)}{@render card(item)}{/each}
        </div>
  <div class="import-benchmarks-section-label import-benchmarks-model-runs-label gb:benchmark:mb-2 gb:benchmark:mt-4 gb:benchmark:flex gb:benchmark:justify-between gb:benchmark:gap-2">
        <strong class={BENCHMARK_VALUE}>Successful model tests</strong>
        <span class={BENCHMARK_LABEL}>{snapshot.successful.length} ready to compare</span>
        </div>
  <div class="import-benchmarks-list gb:benchmark:grid gb:benchmark:gap-3">
        {#each snapshot.successful as item (item.id)}{@render card(item)}{:else}<div class="import-benchmarks-empty {BENCHMARK_LABEL}">No model tests yet. Choose a model above and run the sample report.</div>{/each}
        </div>
  {#if snapshot.diagnostics.length}<details class="import-benchmark-diagnostics gb:benchmark:mt-4 gb:benchmark:rounded-control gb:benchmark:border gb:benchmark:border-line gb:benchmark:bg-surface gb:benchmark:px-4 gb:benchmark:pb-4">
        <summary class="gb:benchmark:min-h-11 gb:benchmark:cursor-pointer gb:benchmark:py-3 gb:benchmark:text-xs gb:benchmark:text-secondary gb:benchmark:focus-visible:outline-2 gb:benchmark:focus-visible:outline-accent">
        <span>Tests that didn’t finish</span><strong class="gb:benchmark:ml-2 gb:benchmark:font-mono">{snapshot.diagnostics.length}</strong>
        </summary>
        <p class={BENCHMARK_LABEL}>These are kept for troubleshooting and are not included in comparisons.</p>
        <div class="import-benchmarks-list gb:benchmark:grid gb:benchmark:gap-3">
        {#each snapshot.diagnostics as item (item.id)}{@render card(item)}{/each}
        </div>
        </details>{/if}
{/snippet}

{#if mode === 'dialog'}
  <div class="modal import-benchmarks-modal gb:benchmark:m-0 gb:benchmark:flex gb:benchmark:w-[min(96vw,1120px)] gb:benchmark:max-w-[1120px] gb:benchmark:max-h-[90dvh] gb:benchmark:flex-col gb:benchmark:overflow-hidden gb:benchmark:rounded-xl gb:benchmark:border gb:benchmark:border-line gb:benchmark:bg-secondary-surface gb:benchmark:p-0 gb:benchmark:text-ink gb:benchmark:font-body gb:benchmark:max-[720px]:w-[calc(100vw-24px)] gb:benchmark:max-[720px]:max-h-[calc(100dvh-24px)]" data-import-benchmarks-view role="dialog" aria-modal="true" aria-labelledby="import-benchmarks-title">
    <div class="gb-modal-head gb:benchmark:flex gb:benchmark:shrink-0 gb:benchmark:items-center gb:benchmark:justify-between gb:benchmark:gap-3 gb:benchmark:border-b gb:benchmark:border-line gb:benchmark:bg-dialog-head gb:benchmark:p-6 gb:benchmark:max-[720px]:p-4">
        <div class="gb:benchmark:min-w-0">
        <div class="gb-modal-kicker {BENCHMARK_LABEL}">Import quality &amp; speed</div>
        <h2 class="gb-modal-title gb:benchmark:m-0 gb:benchmark:text-xl gb:benchmark:font-display gb:benchmark:font-bold" id="import-benchmarks-title">Test AI Models</h2>
        </div>
        <button type="button" class="modal-close {BENCHMARK_SECONDARY} gb:benchmark:static gb:benchmark:shrink-0 gb:benchmark:text-xl" data-import-benchmarks-action="close" aria-label="Close model tests" onclick={actions.close}>×</button>
        </div>
    <div class="import-benchmarks-body gb:benchmark:min-h-0 gb:benchmark:overflow-y-auto gb:benchmark:overscroll-contain gb:benchmark:p-6 gb:benchmark:max-[720px]:p-4">{@render body()}</div>
  </div>
{:else}<div data-import-benchmarks-view class="gb:benchmark:min-w-0 gb:benchmark:text-ink gb:benchmark:font-body">{#if mode === 'body'}{@render body()}{:else if snapshot.review}{@render differences(snapshot.review,showDifferenceClose)}{/if}
        </div>{/if}
