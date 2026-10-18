<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import type {SupplementPeriodView, SupplementDoseSummaryView} from '../supplement-form-presentation.js';
  type Props = {kind: 'period'; view: SupplementPeriodView}
    | {kind: 'doseSummary'; view: SupplementDoseSummaryView};
  let props: Props = $props();
</script><svelte:options preserveWhitespace />{#if props.kind === 'period'}<div class="supp-period-row" data-idx={props.view.index} data-original-index={props.view.originalIndex}>
    <input type="date" class="supp-period-start" aria-label="Period start" required value={props.view.start}>
    <span class="supp-period-arrow">&rarr;</span>
    <input type="date" class="supp-period-end" aria-label="Period end" value={props.view.end} placeholder="ongoing">
    <input type="text" class="supp-period-dose" aria-label="Dose or strength during period" placeholder="Dose / strength" value={props.view.dose}>
    <button type="button" class="supp-ingredient-add" data-supp-action={props.view.useDoseAction.name} data-supp-index={props.view.useDoseAction.index}>Use ingredient totals</button>
    {#if props.view.doseSummary !== null}<small class="supp-period-dose-summary">{props.view.doseSummary.text}</small>{/if}
    <button class="supp-period-remove" data-supp-action={props.view.removeAction.name} data-supp-index={props.view.removeAction.index} aria-label="Remove period" title="Remove period" style={props.view.removeStyle ? componentStaticStyles.hidden : undefined}>&times;</button>
  </div>{:else if props.kind === 'doseSummary'}<small class="supp-period-dose-summary">{props.view.text}</small>{/if}
