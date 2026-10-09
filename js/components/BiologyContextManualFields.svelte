<script lang="ts">
  import type {BiologyContextField} from '../biology-context-presentation.js';
  import {biologyContextClasses as c} from '../biology-context-classes.js';
  let {fields}: {fields: BiologyContextField[]} = $props();
</script>
<div class={c('biology-score-context-fields')} role="group" aria-label="Manual score context">
  {#each fields as field}
    <label class={c('biology-context-field')}><input
      type="checkbox"
      class={c('biology-context-control')}
      data-biology-context-flag={field.id}
      checked={field.checked}
    />{field.label}</label>
  {/each}
</div>
