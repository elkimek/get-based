<script lang="ts">
  import Targets from './NutritionTargets.svelte';
  import Fluid from './NutritionFluidLog.svelte';
  import type { NutritionEntryView, NutritionEntryActions, NutritionEntryExports } from '../nutrition-entry-model.js';
  let { view, actions = { current: () => true, saveTargets: async () => false, saveFluid: async () => false, notify: () => {} } }: {
    view: NutritionEntryView; actions?: NutritionEntryActions;
  } = $props();
  let child = $state<NutritionEntryExports>();
  let root: HTMLDivElement;
  function guard(event: Event) {
    if (event.target instanceof Node && root?.contains(event.target) && !actions.current()) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }
  export function save(closeOnSave?: boolean) { return child?.save(closeOnSave) ?? Promise.resolve(false); }
  export function update() { child?.update(); }
</script>
<svelte:document onclickcapture={guard} oninputcapture={guard} onchangecapture={guard}/>
<div bind:this={root} data-nutrition-entry-view={view.kind} data-nutrition-view
  class="gb:nutrition:[@media(pointer:coarse)]:[&_button]:min-h-[45px] gb:nutrition:[@media(pointer:coarse)]:[&_button]:min-w-[45px] gb:nutrition:min-w-0 gb:nutrition:text-ink gb:nutrition:[overflow-wrap:anywhere]">
  {#if view.kind === 'targets'}<Targets bind:this={child} {view} {actions}/>
  {:else}<Fluid bind:this={child} {view} {actions}/>{/if}
</div>
