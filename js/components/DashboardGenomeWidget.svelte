<script lang="ts">
  import DashboardGenomeRows from './DashboardGenomeRows.svelte';
  import DashboardGenomeLoading from './DashboardGenomeLoading.svelte';
  import type {DashboardGenomeWidgetView} from '../dashboard-genome-rows-presentation.js';
  let {view}: {view: DashboardGenomeWidgetView} = $props();
</script><svelte:options preserveWhitespace />{#if view.kind === 'loading'}<DashboardGenomeLoading count={view.count} plural={view.plural}/>{:else}<DashboardGenomeRows {view}/>{/if}
