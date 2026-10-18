<script lang="ts">
  import type {EMFInterpretationStatusView} from '../emf-interpretation-presentation.js';
  let {view}: {view: EMFInterpretationStatusView} = $props();
</script><svelte:options preserveWhitespace={true} /><div class={view.kind === 'error' ? 'emf-interp-error' : 'emf-interp-placeholder'}>{view.text}</div>