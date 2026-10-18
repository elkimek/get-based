<script lang="ts">
 import type {LensWidgetView} from '../lens-shell-presentation.js';
 import {lensWidgetHasContent} from '../lens-widget-content.js';
 import LensWidgetFrame from './LensWidgetFrame.svelte';
 import LensWidgetBody from './LensWidgetBody.svelte';
 let {view}:{view:LensWidgetView}=$props();
</script>
{#snippet body()}{#if view.content}{#if view.compact}<LensWidgetBody content={view.content} tools={view.tools}/>{:else}<LensWidgetBody content={view.content}/>{/if}{/if}{/snippet}
<LensWidgetFrame {view} {body} hasContent={lensWidgetHasContent(view.content)}/>
