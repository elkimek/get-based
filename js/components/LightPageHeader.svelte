<script lang="ts">
 import type{LightPageHeaderView}from'../light-page-presentation.js';
 import{lensShellClasses as c}from'../lens-shell-classes.js';
 let{view}:{view:LightPageHeaderView}=$props();
</script>
<div data-lens-shell-view class={c(`category-header lens-page-header${view.className ? ` ${view.className}` : ''}`)}><h2 class={c('lens-shell-title')}>{view.title}</h2>{#if view.subtitle}<p class={c('lens-shell-subtitle')}>{view.subtitle}</p>{/if}</div>
