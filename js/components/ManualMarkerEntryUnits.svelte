<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import type {ManualEntryUnitsView} from '../manual-marker-entry-presentation.js';
  let {view}: {view: ManualEntryUnitsView} = $props();
</script><svelte:options preserveWhitespace={true} />{#if view.multiple}<select id="me-unit" class="me-unit-select" aria-label="Input unit">
         {#each view.rows as row}<option value="{row.value}" selected={row.selected}>{row.label}</option>{/each}
       </select>{:else}<span style={componentStaticStyles.optionalLabel}>({view.unit})</span>{/if}