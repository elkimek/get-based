<script lang="ts">
  import type {SupplementEditorRow} from '../supplement-editor-presentation.js';
  import SupplementExpanded from './SupplementExpanded.svelte';
  let {row}:{row:SupplementEditorRow}=$props();
</script><svelte:options preserveWhitespace/>{#if
  row.groupLabel !== null}<div
  class="supp-list-group-title">{row.groupLabel}</div>{/if}<div
  class={'supp-list-item' + (row.active ? ' supp-list-item-active' : '')} data-idx={row.index} role="button" tabindex="0" aria-label={'Edit ' + row.ariaName}
  data-supp-action="toggle-accordion" data-supp-index={row.index}><span
  class="supp-list-icon">{row.icon}</span><div
  class="supp-list-info"><div
  class="supp-list-name">{row.name} <span
  class={row.statusClass}>{row.statusText}</span>{#if
  row.dosage !== null} <span
  class="supp-list-meta">{row.dosage}</span>{/if}</div><div
  class="supp-list-meta">{row.dateRange}{#if
  row.source} · <a href={row.source.url} target="_blank" rel="noopener noreferrer"
  class="supp-list-source">{row.source.host} ↗</a>{/if}</div>{#if
  row.dose !== null}<div
  class="supp-list-dose">Recorded dose: {row.dose}</div>{/if}{#if
  row.ingredients.length}<div
  class="supp-list-ingredients">{#each
  row.ingredients as ingredient}<span
  class="supp-ing-pill">{ingredient.name}{ingredient.amount}{ingredient.times}{ingredient.total}</span>{/each}</div>{/if}{#if
  row.qualityText !== null}<div
  class="supp-list-quality">{row.qualityText}</div>{/if}{#if
  row.note !== null}<div
  class="supp-list-note">{row.note}</div>{/if}</div></div>{#if
  row.expanded}<SupplementExpanded view={row.expanded}/>{/if}