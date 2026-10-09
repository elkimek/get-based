<script lang="ts">
  import type {BiologySummaryStatus} from '../biology-summary-presentation.js';
  import {biologySummaryClasses as c} from '../biology-summary-classes.js';
  let {statuses}: {statuses: BiologySummaryStatus[]} = $props();
</script>
<div class={c('biology-score-meta')}>{#each statuses as status}
  <span class={c(`biology-score-status biology-score-status-${status.kind} biology-score-status-${status.tone}`)}><span class={c('biology-summary-status-label')}>{status.label}</span><strong class={c('biology-summary-status-value')}>{status.value}</strong></span>
{/each}</div>
