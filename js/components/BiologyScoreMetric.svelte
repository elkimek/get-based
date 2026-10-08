<script lang="ts">
  import type {BiologyScoreMetricView} from '../biology-card-presentation.js';
  import {biologyCardClasses as c} from '../biology-card-classes.js';
  let {view}: {view: BiologyScoreMetricView} = $props();
</script>
<span data-biology-card-view class={c(`biology-score-dial${view.value === 0 ? ' biology-score-dial-zero' : ''}${view.historical ? ' biology-score-dial-historical' : ''}`)} style:--score-value={view.value ?? 0} style:--score-color={view.color}><span class={c('biology-score-dial-number')}>{view.value ?? '—'}<small class={c('biology-dial-unit')}>{view.value == null ? 'No score yet' : '/100'}</small></span></span>
