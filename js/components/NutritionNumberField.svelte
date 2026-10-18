<script lang="ts">
  import type { TargetField } from '../nutrition-entry-model.js';
  import { field, input, readableCopy as copy } from '../nutrition-view-classes.js';
  let { definition, value = $bindable(), disabled = false, hidden = false }: {
    definition: TargetField; value?: number | undefined; disabled?: boolean; hidden?: boolean;
  } = $props();
</script>
<label class={hidden ? 'gb:nutrition:hidden' : field} {hidden}
  id={definition.id.startsWith('protein-') ? `nutrition-target-${definition.id}-wrap` : undefined}>
  <span>{definition.label} <small class={copy}>{definition.unit}</small></span>
  <input id={`nutrition-target-${definition.id}`} type="number" class={input}
    min={definition.min} max={definition.max} step={definition.step}
    bind:value required {disabled}/>
</label>
