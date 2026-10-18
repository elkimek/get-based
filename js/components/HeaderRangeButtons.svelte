<script lang="ts">
  import type {HeaderRangeView} from '../header-date-range.js';
  let {view}: {view: HeaderRangeView} = $props();
</script><svelte:options preserveWhitespace={true} />{#each view.buttons as button}<button
  class="range-toggle-btn{button.active ? ' active' : ''}"
  type="button"
  data-range={button.mode}
  aria-pressed={button.pressed}
  data-lab-data-action="switch-range-mode"
  data-lab-data-range={button.mode}>{button.label}</button>{/each}