<script lang="ts">
  import type {SupplementQualityOverviewRow} from '../supplement-editor-presentation.js';
  let {rows}:{rows:readonly SupplementQualityOverviewRow[]}=$props();
</script><svelte:options preserveWhitespace/>{#if
  rows.length}<section
  class="supp-quality-overview"><div
  class="supp-form-section-title">Current contaminant overview</div><div
  class="supp-form-help">Source-reported, often lot-specific laboratory data. Totals are shown only after the user confirms the report matches their bottle lot and the result is a compatible mass-per-serving/unit value with a personal daily frequency. No safety threshold or regulatory conclusion is applied.</div><div
  class="supp-quality-overview-scroll"><table><thead><tr><th>Analyte</th><th>Reported by product</th><th>Combined daily amount</th></tr></thead><tbody>{#each
  rows as group}<tr><th>{group.analyte}</th><td>{#each
  group.reported as report}<div><strong>{report.product}</strong>: {report.result}</div>{/each}</td><td>{group.total}</td></tr>{/each}</tbody></table></div></section>{/if}