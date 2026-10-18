<script lang="ts">
  import type { SyncIndicatorView } from '../sync-status-rendering.js';
  let { view }: { view: SyncIndicatorView } = $props();
</script><svelte:options preserveWhitespace={true} /><button class="sync-indicator" id="sync-indicator-btn" data-sync-ui-action="toggle-detail" title={`${view.title}`} aria-label="Sync status"><span class={'sync-dot sync-dot-' + view.state}></span></button>