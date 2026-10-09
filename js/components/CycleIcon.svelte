<script lang="ts">
  let {name}: {name: 'x' | 'droplet' | 'trash' | 'plus' | 'calendar' | 'edit' | 'help' | 'info' | 'warning'} = $props();
</script>
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  {#if name === 'x'}<path d="M18 6 6 18M6 6l12 12"></path>
  {:else if name === 'droplet'}<path d="M12 2.5 6.9 9.1a8 8 0 1 0 10.2 0L12 2.5Z"></path>
  {:else if name === 'trash'}<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path>
  {:else if name === 'calendar'}<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>
  {:else if name === 'edit'}<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path>
  {:else if name === 'help'}<circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 1 1 4.9 2.3c-.9.6-1.5 1.1-1.5 2.2"></path><path d="M12 17h.01"></path>
  {:else if name === 'info'}<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
  {:else if name === 'warning'}<path d="m12 3 10 18H2L12 3Z"></path><path d="M12 9v5M12 17h.01"></path>
  {:else}<path d="M12 5v14M5 12h14"></path>{/if}
</svg>
