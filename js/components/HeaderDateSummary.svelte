<script lang="ts">
  import type {HeaderDateView} from '../header-date-range.js';
  let {view}: {view: HeaderDateView} = $props();
</script><svelte:options preserveWhitespace={true} /><span class="label">Dates:</span> {view.text}