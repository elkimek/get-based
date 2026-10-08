<script lang="ts">
  import type {BiologyCardProps} from '../biology-card-presentation.js';
  import BiologyScoreMetric from './BiologyScoreMetric.svelte';
  import BiologyScoreDetail from './BiologyScoreDetail.svelte';
  let props: BiologyCardProps = $props();
</script>
{#if props.kind === 'metric'}<BiologyScoreMetric view={props.view}/>{:else}<BiologyScoreDetail view={props.view}/>{/if}
