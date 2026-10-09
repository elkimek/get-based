<script lang="ts">
  import {reportBuilderClasses as classes} from '../report-builder-classes.js';

  let {available}: {available: boolean} = $props();
</script>

<div class={classes('report-builder-section report-ai-builder')}>
  <div class={classes('report-builder-row-head')}>
    <div>
      <label class={classes('report-builder-check')}>
        <input type="checkbox" id="report-include-ai" checked={available} disabled={!available} aria-describedby="report-ai-disclosure" class={classes('report-choice-input')}>
        <span>Include AI overview</span>
      </label>
      <p class={classes('report-builder-help')}>Add an AI-generated opening overview of recorded highlights, context and your questions. It is informational and may be incomplete or incorrect.</p>
    </div>
  </div>
  <p class={classes('report-builder-help')} id="report-ai-disclosure">
    {#if available}
      Generate AI overview &amp; preview uses your selected AI connection to process the selected report facts and questions. AI can make mistakes; verify the overview before sharing. Any required AI disclosure or destination approval appears before the request. You can turn off the overview to compile this report without a new AI request.
    {:else}
      AI is unavailable or paused. PDF preview works without a new AI overview.
    {/if}
  </p>
  <div class={classes('report-ai-actions')}>
    <button type="button" class={classes('report-mini-btn report-ai-generate-btn')} data-report-action="generate-ai-summary" hidden>Generate overview</button>
    <button type="button" class={classes('report-mini-btn report-ai-clear-btn')} data-report-action="clear-ai-summary" hidden>Remove overview</button>
    <button type="button" class={classes('report-mini-btn')} data-report-action="preview-without-ai" hidden>Preview without AI</button>
  </div>
  <div class={classes('report-ai-status')} data-report-ai-status aria-live="polite">{available ? 'Ready to generate with your preview.' : 'Not included.'}</div>
  <textarea id="report-ai-summary-text" class={classes('report-ai-summary-text')} aria-label="Editable AI-generated overview" hidden></textarea>
</div>
