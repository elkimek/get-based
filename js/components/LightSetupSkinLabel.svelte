<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  import { SKIN_TYPE } from '../constants.js';
  import { FITZPATRICK_DESCRIPTOR } from '../sun-defaults-model.js';
  let { skinIndex }: { skinIndex: number } = $props();
</script>

{#if skinIndex >= 0 && skinIndex < SKIN_TYPE.length}{SKIN_TYPE[skinIndex]}<span class={setupClasses("ctx-skin-label-detail")} id="setup-skin-label-detail">{FITZPATRICK_DESCRIPTOR[skinIndex]}</span>{:else}Tap a face or drag the slider{/if}
