<script lang="ts">
  import SupplementOption from './SupplementOption.svelte';
  import type {SupplementQualityView, SupplementCategoryOptionView} from '../supplement-form-presentation.js';
  type Props = {kind: 'quality'; view: SupplementQualityView}
    | {kind: 'categoryOption'; view: SupplementCategoryOptionView};
  let props: Props = $props();
</script><svelte:options preserveWhitespace />{#if props.kind === 'quality'}<div class="supp-quality-row" data-idx={props.view.index} data-original-index={props.view.originalIndex} data-import-index={props.view.importIndex}>
    <select class="supp-quality-category" aria-label="Laboratory result category">{#each props.view.categories as option}<SupplementOption view={option}/>{/each}</select>
    <input type="text" class="supp-quality-analyte" aria-label="Tested analyte" placeholder="Analyte" value={props.view.analyte}>
    <input type="text" class="supp-quality-result" aria-label="Reported laboratory result" placeholder="ND, &lt; 0.01, 98…" value={props.view.result}>
    <input type="text" class="supp-quality-unit" aria-label="Laboratory result unit" placeholder="mg" value={props.view.unit}>
    <input type="text" class="supp-quality-basis" aria-label="Laboratory result basis" placeholder="per capsule, mg/kg…" value={props.view.basis}>
    <!-- svelte-ignore a11y_label_has_associated_control (legacy SSR form labels; individual controls retain their accessible names) --><label class="supp-quality-ai-toggle" title="Include this result in AI health context"><input type="checkbox" class="supp-quality-ai-context" checked={props.view.aiChecked}><span>AI</span></label>
    <button type="button" class="supp-ing-remove" data-supp-action={props.view.removeAction.name} data-supp-index={props.view.removeAction.index} title="Remove laboratory result">&times;</button>
  </div>{:else if props.kind === 'categoryOption'}<option value={props.view.value} selected={props.view.selected}>{props.view.label}</option>{/if}
