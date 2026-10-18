<script lang="ts">
  import type {WearableNoteView} from '../wearables-entry-presentation.js';
  let {view}: {view: WearableNoteView} = $props();
</script><svelte:options preserveWhitespace={true}/><textarea class="wearable-log-note" id={view.id} rows="2" placeholder="Optional note — e.g. retook because cuff felt loose, different arm, different lab, just after coffee..." aria-label="Optional note"></textarea>