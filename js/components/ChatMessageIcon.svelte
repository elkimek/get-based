<script lang="ts">
  import { MESSAGE_ACTION_ICON } from '../chat-message-actions-classes.js';
  let { name }: { name: 'copy' | 'check' | 'x' | 'refresh' | 'edit' | 'fork' } = $props();
</script>
<svg viewBox="0 0 24 24" aria-hidden="true" class={MESSAGE_ACTION_ICON}>
  {#if name === 'copy'}<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  {:else if name === 'check'}<path d="M20 6 9 17l-5-5"/>
  {:else if name === 'x'}<path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  {:else if name === 'refresh'}<path d="M21 12a9 9 0 0 1-15.6 6.1"/><path d="M3 12A9 9 0 0 1 18.6 5.9"/><path d="M18 2v4h4"/><path d="M6 22v-4H2"/>
  {:else if name === 'edit'}<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  {:else}<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a4 4 0 0 0 4 4h2"/><path d="M18 7v2a4 4 0 0 1-4 4h-2v4"/>{/if}
</svg>
