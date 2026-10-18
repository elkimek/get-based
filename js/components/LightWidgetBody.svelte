<script lang="ts">
 import type{LightWidgetContent}from'../light-page-presentation.js';
 import LightPageBody from'./LightPageBody.svelte';
 import LightTodayAI from'./LightTodayAI.svelte';
 import LightUVSafety from'./LightUVSafety.svelte';
 import LightConditionsPresentation from'./LightConditionsPresentation.svelte';
 import LightLocationHint from'./LightLocationHint.svelte';
 import LightSetupPresentation from'./LightSetupPresentation.svelte';
 import LightSessionHistory from'./LightSessionHistory.svelte';
 let{content}:{content:LightWidgetContent}=$props();
</script>
{#if content.kind === 'body'}<LightPageBody {...content.props}/>
{:else if content.kind === 'today-hero'}{#if content.safety}<LightUVSafety view={content.safety}/>{/if}{#if content.ai}<LightTodayAI view={content.ai}/>{/if}
{:else if content.kind === 'conditions'}{#if content.location}<LightLocationHint view={content.location}/>{/if}<LightConditionsPresentation {...content.props}/>
{:else if content.kind === 'setup'}{#if content.props}<LightSetupPresentation {...content.props}/>{/if}
{:else if content.kind === 'history'}<LightSessionHistory {...content.props}/>{/if}
