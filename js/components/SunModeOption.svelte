<script lang="ts">
  import type { SunModeOptionView } from '../sun-data-source-presentation.js';
  import { sunDataSourceClasses as c } from '../sun-data-source-classes.js';

  let { view }: { view: SunModeOptionView } = $props();
</script><svelte:options preserveWhitespace={true} /><label class={c.option + ' ' + (view.checked ? c.optionChecked : c.optionUnchecked)}>
    <input type="radio" name="meteo-mode" value={view.mode} checked={view.checked} data-sun-source-action="set-meteo-mode" class={c.radio}>
    <span>
      <span class={c.optionLabel}>{view.label}</span>
      <br><span class={c.optionDescription}>{view.description}</span>
    </span>
  </label>