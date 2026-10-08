<script lang="ts">
  import type {BiologyQuestionView} from '../biology-ai-presentation.js';
  import {biologyAIClasses as classes} from '../biology-ai-classes.js';
  let {view}: {view: BiologyQuestionView} = $props();
</script>
<section class={classes('biology-score-question')} data-biology-ai-view>
  <p class={classes('biology-question-copy')}>{view.question}</p>
  <div class={classes('biology-score-panel-levels')} role="group" aria-label="Labs used for this score">
    {#each [{label: 'Core markers', items: view.core}, {label: 'Additional context', items: view.additional}] as group}
      <div class={classes('biology-question-group')}><span class={classes('biology-question-label')}>{group.label}</span><strong class={classes('biology-question-items')}>{#each group.items as item}<span class={classes('biology-question-item')}>{item}</span>{/each}</strong></div>{' '}
    {/each}
  </div>
</section>
