<script lang="ts">
  import type {BiologyAIProps} from '../biology-ai-presentation.js';
  import BiologyAIQuestion from './BiologyAIQuestion.svelte';
  import BiologyAISummary from './BiologyAISummary.svelte';
  import BiologyAIAnswer from './BiologyAIAnswer.svelte';
  let props: BiologyAIProps = $props();
</script>
{#if props.kind === 'question'}<BiologyAIQuestion view={props.view}/>{:else if props.kind === 'summary'}<BiologyAISummary view={props.view}/>{:else}<BiologyAIAnswer view={props.view}/>{/if}
