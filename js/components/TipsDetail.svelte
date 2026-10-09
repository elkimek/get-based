<script lang="ts">
  import type {TipsDetailProps} from '../tips-presentation.js';
  import TipsSection from './TipsSection.svelte';
  let {label, state, section}: TipsDetailProps = $props();
</script>
<button type="button" class="modal-close" aria-label="Close" data-recommendation-detail-action="close">×</button>
<h3>{label}</h3>
{#if state === 'loading'}<div class="dashboard-widget-empty">Loading options...</div>
{:else if state === 'error'}<div class="dashboard-widget-empty">Could not load tip details.</div>
{:else if section}<TipsSection view={section}/>
{:else}<div class="dashboard-widget-empty">No tip details are available for this topic.</div>{/if}
