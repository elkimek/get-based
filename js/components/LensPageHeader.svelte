<script lang="ts">
  import type {LensHeaderView} from '../lens-shell-presentation.js';
  import {lensShellClasses as c} from '../lens-shell-classes.js';
  let {view}: {view: LensHeaderView} = $props();
</script>
<div data-lens-shell-view class={c(`category-header lens-page-header${view.className ? ` ${view.className}` : ''}`)}>
  <h2 class={c('lens-shell-title')}>{view.title}</h2>
  {#if view.subtitle}<p class={c('lens-shell-subtitle')}>{view.subtitle}</p>{/if}
  {#if view.actionsHTML}<div class={c('dashboard-widget-inline-controls lens-shell-inline-controls')}>{@html view.actionsHTML}</div>{/if}
</div>
