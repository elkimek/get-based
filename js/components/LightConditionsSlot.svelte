<script lang="ts">
  import type { ConditionsSlotView } from '../light-conditions-presentation.js';
  import { conditionsClasses as c } from '../light-conditions-classes.js';
  import LightConditionsContent from './LightConditionsContent.svelte';
  let { slot }: { slot: ConditionsSlotView } = $props();
</script>
<div class={c(`conditions-now conditions-now-${slot.variant}`)} id={slot.id} data-variant={slot.variant} aria-busy={slot.view ? 'false' : 'true'} data-light-conditions-presentation>
  {#if slot.view}<LightConditionsContent view={slot.view}/>
  {:else}<div class={c('conditions-now-loading')}><span class={c('conditions-now-icon')}>☼</span> <span class="conditions-now-text">Loading current conditions…</span></div>{/if}
</div>
