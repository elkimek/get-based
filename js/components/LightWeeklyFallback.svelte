<script lang="ts">
  import type { WeeklyFallbackView } from '../light-review-ai-presentation.js';
  import { reviewAIClasses as classes } from '../light-review-ai-classes.js';
  let { view }: { view: WeeklyFallbackView } = $props();
</script>
<div data-light-review-ai class={classes('light-suggestion light-weekly-fallback')}>
  <div class={classes('light-weekly-period')}>Past 7 days</div>
  <p class={classes('light-weekly-summary-text')}>{view.headline}</p>
  <p class={classes('light-weekly-comparison')}>{view.comparison}</p>
  <p class={classes('light-weekly-next-step')}>{view.nextStep}</p>
  {#if view.empty}<button type="button" class={classes('dashboard-action-btn light-weekly-log-cta')} data-light-page-action="quick-log-sun">Log outdoor exposure</button>{/if}
</div>
