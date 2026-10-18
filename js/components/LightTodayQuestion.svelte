<svelte:options runes={true}/>
<script lang="ts">
  import { reviewAIClasses as classes } from '../light-review-ai-classes.js';
</script>
<section class={classes('light-ai-question')}>
  <div class={classes('light-ai-kicker')}>Question this AI answers</div>
  <p class={classes('panel-copy')}>What stands out in today’s logged light, and is there a useful next step?</p>
  <div class={classes('light-ai-panel-levels')}>
    <div class={classes('panel-level')}><span class={classes('panel-label')}>Minimum useful data</span><strong class={classes('panel-values')}><span class={classes('panel-label')}>Sun/device sessions</span><span class={classes('panel-label panel-value-following')}>Time of day</span><span class={classes('panel-label panel-value-following')}>Duration</span></strong></div>
    <div class={classes('panel-level')}><span class={classes('panel-label')}>Extended confidence data</span><strong class={classes('panel-values')}><span class={classes('panel-label')}>UV/MED</span><span class={classes('panel-label panel-value-following')}>Lux/CCT/flicker</span><span class={classes('panel-label panel-value-following')}>Sleep room darkness</span><span class={classes('panel-label panel-value-following')}>7-day trends</span></strong></div>
  </div>
</section>
