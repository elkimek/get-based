<script lang="ts">
 import type {PlacementOptionGroup} from '../marker-placement-view.js';
 let {groups}:{groups:readonly PlacementOptionGroup[]}=$props();
</script><svelte:options preserveWhitespace/>{#each groups as group}<optgroup label={group.label}>
      {#each group.rows as row}<option value={row.value} selected={row.selected}>{row.label}</option>{/each}
    </optgroup>{/each}
