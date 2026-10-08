<script lang="ts">
  import type {Snippet} from 'svelte';
  import {planningClasses as c} from '../biology-planning-classes.js';
  let {kind, children}: {kind: 'checks' | 'coverage'; children: Snippet} = $props();
</script>
<details open data-biology-planning-view id={kind === 'coverage' ? 'biology-score-coverage' : undefined} class={c(`biology-planning-card ${kind === 'coverage' ? 'biology-score-coverage-planner' : 'biology-score-action-summary'}`)}>
  <summary class={c('biology-planning-summary')}>{kind === 'coverage' ? 'Plan additional labs' : 'Suggested next checks'}</summary>{#if kind === 'coverage'}{' '}{/if}{@render children()}
</details>
