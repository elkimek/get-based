<script lang="ts">
  import { setupClasses } from '../light-setup-classes.js';
  let { id, options, selected }: {
    id: string; options: readonly { key: string; label: string; sub?: string }[]; selected: string | null | undefined;
  } = $props();
</script>

<input type="hidden" {id} value={selected || ''} />
<div class={setupClasses("light-setup-choice-grid")} role="group" aria-label={id.replace(/^setup-/, '').replaceAll('-', ' ')}>
  {#each options as option}
    <button type="button" class={setupClasses(`light-setup-choice${selected === option.key ? ' active' : ''}`)} data-choice-group={id} data-value={option.key} aria-pressed={selected === option.key} data-light-setup-action="select-choice">
      <span class={setupClasses("light-setup-choice-label")}>{option.label}</span>
      {#if option.sub}<span class={setupClasses("light-setup-choice-sub")}>{option.sub}</span>{/if}
    </button>
  {/each}
</div>
