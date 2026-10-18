<script lang="ts">
 import type{LensContentGrid}from'../lens-page-shell.js';
 import type{LightWidgetContent}from'../light-page-presentation.js';
 import{lensShellClasses as c}from'../lens-shell-classes.js';
 import LensWidgetFrame from'./LensWidgetFrame.svelte';
 import LightWidgetBody from'./LightWidgetBody.svelte';
 let{view}:{view:LensContentGrid<LightWidgetContent>}=$props();
</script>
<div data-lens-shell-view class={c('dashboard-widgets lens-page-widgets')} data-lens-route={view.route} data-lens-order-key={view.orderKey}>
 {#each view.widgets as widget}<LensWidgetFrame view={widget.view} hasContent={widget.content.kind !== 'setup'||!!widget.content.props}>{#snippet body()}<LightWidgetBody content={widget.content}/>{/snippet}</LensWidgetFrame>{/each}
</div>
