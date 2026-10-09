<script lang="ts">
  import type {LensGridView} from '../lens-shell-presentation.js';
  import {lensShellClasses as c} from '../lens-shell-classes.js';
  import LensPageWidget from './LensPageWidget.svelte';
  let {view}: {view: LensGridView} = $props();
</script>
<div data-lens-shell-view class={c('dashboard-widgets lens-page-widgets')} data-lens-route={view.route} data-lens-order-key={view.orderKey}>
  {#each view.widgets as widget}<LensPageWidget view={widget}/>{/each}
</div>
