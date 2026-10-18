<svelte:options runes={true}/>
<script lang="ts">
  import {cycleSharedClasses} from '../cycle-shared-classes.js';
</script>
<button type="button" class={cycleSharedClasses('cycle-icon-btn')} data-cycle-import-view data-cycle-import-action="pick-file" title="Import cycle data" aria-label="Import cycle data"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path></svg></button>
<input type="file" class="cycle-import-file-input" data-cycle-import-action="select-file" accept=".csv,.json,.cluedata,.xml,.zip,text/csv,application/json,application/xml,text/xml,application/zip" hidden aria-label="Choose a cycle export">
