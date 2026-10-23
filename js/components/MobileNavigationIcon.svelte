<script lang="ts">
  let {kind}: {kind: 'labs' | 'body' | 'nutrition' | 'supplements' | 'light' | 'insight'} = $props();
</script>
<svg class="m-svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if kind === 'body'}
    <path d="M4 12h4l2-6 4 12 2-6h4"></path>
  {:else if kind === 'light'}
    <circle cx="12" cy="12" r="4"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M4.93 4.93l2.12 2.12"></path><path d="M16.95 16.95l2.12 2.12"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><path d="M4.93 19.07l2.12-2.12"></path><path d="M16.95 7.05l2.12-2.12"></path>
  {:else if kind === 'insight'}
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path>
  {:else if kind === 'nutrition'}
    <path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 3c-4 3-5 7-5 10h5M20 3v18"></path>
  {:else if kind === 'supplements'}
    <path d="M9 4a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM7 6l7 7"></path>
  {:else}
    <rect x="4" y="4" width="6" height="6" rx="1.2"></rect><rect x="14" y="4" width="6" height="6" rx="1.2"></rect><rect x="4" y="14" width="6" height="6" rx="1.2"></rect><rect x="14" y="14" width="6" height="6" rx="1.2"></rect>
  {/if}
</svg>
