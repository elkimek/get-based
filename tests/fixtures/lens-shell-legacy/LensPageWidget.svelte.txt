<script lang="ts">
  import type {LensWidgetView} from '../lens-shell-presentation.js';
  import LensWidgetFrame from './LensWidgetFrame.svelte';
  let {view}: {view: LensWidgetView} = $props();
</script>
<!-- Existing HTML facade for feature owners still awaiting typed composition. -->
{#snippet body()}{@html view.bodyHTML || ''}{/snippet}
<LensWidgetFrame {view} {body} hasContent={!!view.bodyHTML}/>
