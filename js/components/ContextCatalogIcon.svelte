<script lang="ts">
  import type {ContextCatalogIconName} from '../context-card-catalog-presentation.js';
  let {icon}: {icon: ContextCatalogIconName} = $props();
</script><svelte:options preserveWhitespace /><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">{#if
  icon === 'healthGoals'}<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>{:else if
  icon === 'diagnoses'}<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M9 3.5h6V7H9zM12 10v7M8.5 13.5h7"></path>{:else if
  icon === 'diet'}<path d="M6 3v6a3 3 0 0 0 6 0V3M9 3v18M17 3v18M17 3c2.5 2 3.5 4.5 3.5 8H17"></path>{:else if
  icon === 'exercise'}<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"></path>{:else if
  icon === 'sleepRest'}<path d="M20.5 14.5A8 8 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"></path>{:else if
  icon === 'lightCircadian'}<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>{:else if
  icon === 'stress'}<path d="M9.5 3a3.5 3.5 0 0 0-3 5.3M14.5 3a3.5 3.5 0 0 1 3 5.3M6.5 8.3A4 4 0 0 0 4 12c0 1.7.7 3.2 1.8 4.3M17.5 8.3A4 4 0 0 1 20 12c0 1.7-.7 3.2-1.8 4.3M9 21a2 2 0 0 1-2-2v-2M15 21a2 2 0 0 0 2-2v-2M12 6v15"></path>{:else if
  icon === 'loveLife'}<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"></path>{:else if
  icon === 'environment'}<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>{/if}</svg>
