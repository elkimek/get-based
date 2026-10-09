<script lang="ts">
  import type {LensWidgetView} from '../lens-shell-presentation.js';
  import {lensShellClasses as c, lensShellWidgetClasses} from '../lens-shell-classes.js';
  import LensWidgetTools from './LensWidgetTools.svelte';
  let {view}: {view: LensWidgetView} = $props();
</script>
{#if view.compact}
  <section data-lens-shell-view class={c('biology-score-lens-row')} data-widget-id={view.id}>{@html view.bodyHTML || ''}</section>
{:else}
  <section data-lens-shell-view class={lensShellWidgetClasses(view.size, !view.bodyHTML)} data-widget-id={view.id}>
    <div class={c('dashboard-widget-chrome')}>
      <div class={c('dashboard-widget-heading')}>
        <div class={c('dashboard-widget-title')}>{view.title}</div>
        {#if view.description}<div class={c('dashboard-widget-description')}>{view.description}</div>{/if}
      </div>
      {#if view.tools.move || view.tools.dashboard}<div class={c('dashboard-widget-tools')}><LensWidgetTools view={view.tools}/></div>{/if}
    </div>
    <div class={c('dashboard-widget-body')}>{#if view.bodyHTML}{@html view.bodyHTML}{:else}<div class={c('dashboard-widget-empty')}>No data available yet.</div>{/if}</div>
  </section>
{/if}
