<script lang="ts">
 import type{LightPagePresentationProps}from'../light-page-presentation.js';
 import LightPageBody from'./LightPageBody.svelte';
 import LightPageHeader from'./LightPageHeader.svelte';
 import LightPageWidgets from'./LightPageWidgets.svelte';
 let props:LightPagePresentationProps=$props();
</script>
{#if props.kind === 'page'}<div class="light-page gb:light-page:w-full gb:light-page:max-w-none gb:light-page:grid gb:light-page:grid-cols-[minmax(0,1fr)] gb:light-page:gap-4 gb:light-page:min-w-0 gb:light-page:[&>*]:min-w-0 gb:light-page:[&>*]:max-w-full gb:light-page:[&>.category-header]:mb-0 gb:light-page:max-[720px]:pb-[88px]" data-light-page-presentation><LightPageHeader view={props.view.header}/><LightPageWidgets view={props.view.grid}/></div>
{:else}<LightPageBody {...props}/>{/if}
