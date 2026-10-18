<script lang="ts">
 import type {SupplementTimelineProps,SupplementHeader} from '../supplement-dashboard-presentation.js';
 import SupplementTimelineRow from './SupplementTimelineRow.svelte';
 import SupplementMitoEvidence from './SupplementMitoEvidence.svelte';
 let props:SupplementTimelineProps=$props();
</script><svelte:options preserveWhitespace/>{#snippet header(view:SupplementHeader)}<div class="supp-timeline-header">
      <div><span class="context-section-title">Current supplements & medications</span>{#if view.history!==null}<span class="supp-history-count">{view.history}</span>{/if}</div>
      <button class="supp-add-btn" data-supp-action="open-editor">Manage</button>
    </div>{/snippet}{#if props.kind==='header'}{@render header(props.view)}{:else}<div class="supp-timeline-section">
    {@render header(props.view.header)}<div class="supp-timeline">{#if props.view.kind==='empty'}<div class="supp-empty">{props.view.emptyText}</div>{:else}<div class="supp-timeline-axis"><span>{props.view.axis[0]}</span><span>{props.view.axis[1]}</span><span>{props.view.axis[2]}</span></div>{#each props.view.rows as row}<SupplementTimelineRow view={row}/>{/each}{/if}</div>{#if props.view.kind==='active'&&props.view.evidence}<SupplementMitoEvidence view={props.view.evidence}/>{/if}</div>{/if}
