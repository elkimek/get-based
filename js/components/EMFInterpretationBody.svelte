<script lang="ts">
  import type {EMFInterpretationBodyView} from '../emf-interpretation-presentation.js';
  import EMFInterpretationStatus from './EMFInterpretationStatus.svelte';
  let {view}: {view: EMFInterpretationBodyView} = $props();
</script><svelte:options preserveWhitespace={true} />{#if view.kind === 'status'}<EMFInterpretationStatus view={view.status} />{:else}{@html view.sanitizedHTML}{/if}