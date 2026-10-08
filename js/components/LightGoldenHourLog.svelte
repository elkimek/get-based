<script lang="ts">
  import type { GoldenHourLogView } from '../light-tools-presentation.js';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  let { view }: { view: GoldenHourLogView } = $props();
</script>
<LightToolFrame title="Golden hour log" suffix={view.label} closeId="sunrise-close">
  <p class={c('modal-body-hint')}>{#if view.inGolden}Quick log for ambient golden-hour outdoor light. The modeled eye channel uses the logged duration; never look directly at the sun.{:else}It's <strong>{view.currentWindow}</strong> right now. You can still log this as a regular outdoor-light session; the engine will use the actual solar angle.{/if}</p>
  {#if view.subtitle}<p class={c('tool-subtitle')}><span class={c(`tool-note${view.warning ? ' tool-warning' : ''}`)}>{view.subtitle}</span></p>{/if}
  <label class="ctx-label">Duration outside (minutes)
    <input type="number" id="sunrise-duration" class={c('ctx-input tool-control')} min="1" max="120" value="15"/>
  </label>
  <div class={c('modal-actions tool-actions-golden')}>
    <button type="button" class={c('import-btn import-btn-secondary tool-control')} id="sunrise-cancel">Cancel</button>
    <button type="button" class={c('import-btn import-btn-primary tool-control')} id="sunrise-save">Log session</button>
  </div>
</LightToolFrame>
