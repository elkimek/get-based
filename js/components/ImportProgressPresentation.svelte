<script lang="ts">
  import type { ImportProgressView } from '../import-progress-presentation.js';
  import { importProgressClasses as c } from '../import-progress-classes.js';
  let { view }: { view: ImportProgressView } = $props();
</script><svelte:options preserveWhitespace={true} />{#if view.kind === 'batch-counter'}<div
  class={c('batch-progress-counter', 'batch')}>{view.text}</div>{:else}<div
  class={c('import-progress-bar', 'bar')} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={view.pct} aria-label="Import progress"><div
  class={c('import-progress-bar-fill', 'fill')} style={'width:' + view.pct + '%'}></div></div><div
  class={c('import-progress-pct', 'percentage')}>{view.pct}%</div><div
  class={c('import-progress-stage', 'stage')}></div><div
  class={c('import-progress', 'progress')}>{#each view.steps as step}<div
  class={c('progress-step ' + step.state, 'step')}><span
  class={c('step-icon', 'icon')}>{#if step.icon === 'done'}✓{:else if step.icon === 'active'}<span
  class={c('progress-spinner', 'spinner')}></span>{:else}○{/if}</span><span>{step.label}</span></div>{/each}{#if view.fileName !== null}<div
  class={c('import-progress-filename', 'filename')}>{view.fileName}</div>{/if}</div>{/if}