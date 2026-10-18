<script lang="ts">
  import type { ComparisonTableRow } from '../nutrition-comparison-results-model.js';
  import { comparisonSummary as summary } from '../nutrition-view-classes.js';
  let { rows, detailed = false, count = '', referenceHeading }: { rows: ComparisonTableRow[]; detailed?: boolean; count?: string; referenceHeading: string } = $props();
  const cell = 'gb:nutrition:border-b gb:nutrition:border-line gb:nutrition:px-[9px] gb:nutrition:py-2 gb:nutrition:text-right gb:nutrition:align-middle gb:nutrition:whitespace-nowrap gb:nutrition:group-last:border-b-0';
  const column = `${cell} gb:nutrition:bg-[color-mix(in_srgb,var(--text-muted)_5%,var(--bg-card))] gb:nutrition:text-secondary gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:uppercase gb:nutrition:tracking-[.04em]`;
</script>
<details class="{detailed ? 'nutrition-comparison-detailed' : 'nutrition-comparison-errors'} gb:group gb:nutrition:overflow-hidden gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:text-[11px]">
  <summary class="{summary} gb:nutrition:px-2.5 gb:nutrition:py-[9px] gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_3%,var(--bg-card))] gb:nutrition:group-open:border-b gb:nutrition:group-open:border-line {detailed ? 'gb:nutrition:flex gb:nutrition:justify-between gb:nutrition:gap-2' : ''}">
    {detailed ? 'Detailed nutrition' : `${referenceHeading === 'Baseline' ? 'Baseline' : 'Known-value'} differences (${rows.length})`}
    {#if detailed}<span class="gb:nutrition:text-secondary gb:nutrition:text-[10px] gb:nutrition:font-normal">{count}</span>{/if}
  </summary>
  <!-- The named overflow region must remain keyboard-scrollable on narrow screens. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="nutrition-comparison-error-table-wrap gb:nutrition:overflow-x-auto" role="region" aria-label={detailed ? 'Detailed nutrient comparison table' : 'Comparison differences table'} tabindex="0">
    <table class="gb:nutrition:w-full gb:nutrition:min-w-[420px] gb:nutrition:border-collapse gb:nutrition:table-fixed gb:nutrition:tabular-nums">
      <thead><tr><th scope="col" class="{column} gb:nutrition:w-[24%] gb:nutrition:text-left">{detailed ? 'Nutrient' : 'Metric'}</th><th scope="col" class={column}>Estimate</th><th scope="col" class={column}>{referenceHeading}</th><th scope="col" class={column}>Difference</th></tr></thead>
      <tbody>{#each rows as row}<tr class="gb:group">
        <th scope="row" class="{cell} gb:nutrition:text-left gb:nutrition:text-ink">{row.label}</th>
        <td class="{cell} gb:nutrition:text-secondary">{row.predicted}</td><td class="{cell} gb:nutrition:text-secondary">{row.expected}</td>
        <td class="nutrition-comparison-difference {row.difference.tone} {cell} gb:nutrition:font-bold gb:nutrition:text-ink gb:nutrition:[&.is-close]:text-success-ink gb:nutrition:[&.is-far]:text-warning-ink gb:nutrition:[&.is-missing]:text-secondary gb:nutrition:[&.is-missing]:font-normal gb:nutrition:[&.is-reference]:text-link-ink">{row.difference.label}</td>
      </tr>{/each}</tbody>
    </table>
  </div>
</details>
