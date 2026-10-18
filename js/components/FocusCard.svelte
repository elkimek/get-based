<script lang="ts">
  import type {FocusCardView} from '../focus-card-presentation.js';
  import FocusCardBody from './FocusCardBody.svelte';
  let {view}: {view: FocusCardView} = $props();
</script><svelte:options preserveWhitespace /><div class="focus-card" id="focus-card">
    <div class="focus-card-icon">🔬</div>
    <div class="focus-card-body" id="focus-card-body"><FocusCardBody view={view.body}/></div>
    <button class="focus-card-refresh" data-focus-card-action="refresh" aria-label="Regenerate insight" title="Regenerate insight">↻</button>
  </div>
