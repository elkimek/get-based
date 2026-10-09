<script lang="ts">
  let {name}: {name: 'x' | 'droplet' | 'trash' | 'plus'} = $props();
</script>
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  {#if name === 'x'}<path d="M18 6 6 18M6 6l12 12"></path>
  {:else if name === 'droplet'}<path d="M12 2.5 6.9 9.1a8 8 0 1 0 10.2 0L12 2.5Z"></path>
  {:else if name === 'trash'}<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path>
  {:else}<path d="M12 5v14M5 12h14"></path>{/if}
</svg>
