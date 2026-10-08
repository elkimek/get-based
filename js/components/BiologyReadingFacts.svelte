<script lang="ts">
  import type {BiologyReadingFact} from '../biology-reading-presentation.js';
  import {readingClasses as c} from '../biology-reading-classes.js';
  let {facts}: {facts: BiologyReadingFact[]} = $props();
</script>
<dl data-biology-reading-view class={c('biology-reading-facts')}>{#each facts as fact}<div class={c('biology-reading-fact')}><dt class={c('biology-reading-fact-label')}>{fact.label}</dt><dd class={c('biology-reading-fact-value')}>{fact.value}</dd></div>{/each}</dl>
