<script lang="ts">
  import type {LensWidgetChromeView} from '../lens-shell-presentation.js';
  import {lensShellClasses as c, lensShellWidgetClasses} from '../lens-shell-classes.js';
  import type {Snippet} from 'svelte';
  import LensWidgetTools from './LensWidgetTools.svelte';
  let {view, body, hasContent = true}: {view: LensWidgetChromeView; body: Snippet; hasContent?: boolean} = $props();
</script>
{#if view.compact}
  <section data-lens-shell-view class={c('biology-score-lens-row')} data-widget-id={view.id}>{@render body()}</section>
{:else}
  <section data-lens-shell-view class={lensShellWidgetClasses(view.size, !hasContent)} data-widget-id={view.id}>
    <div class={c('dashboard-widget-chrome')}>
      <div class={c('dashboard-widget-heading')}>
        <div class={c('dashboard-widget-title')}>{view.title}</div>
        {#if view.description}<div class={c('dashboard-widget-description')}>{view.description}</div>{/if}
      </div>
      {#if view.tools.move || view.tools.dashboard}<div class={c('dashboard-widget-tools')}><LensWidgetTools view={view.tools}/></div>{/if}
    </div>
    <div class={c('dashboard-widget-body')}>{#if hasContent}{@render body()}{:else}<div class={c('dashboard-widget-empty')}>No data available yet.</div>{/if}</div>
  </section>
{/if}
