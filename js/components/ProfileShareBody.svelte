<script lang="ts">
  import ProfileShareActive from './ProfileShareActive.svelte';
  import ProfileShareCreate from './ProfileShareCreate.svelte';
  import ProfileShareResult from './ProfileShareResult.svelte';
  import ProfileShareLoad from './ProfileShareLoad.svelte';
  import type {ShareBodyView} from '../profile-share-presentation.js';
  let {body}: {body: ShareBodyView} = $props();
</script>
{#if body.kind === 'active'}<ProfileShareActive view={body.view} />
{:else if body.kind === 'create'}<ProfileShareCreate view={body.view} />
{:else if body.kind === 'result'}<ProfileShareResult view={body.view} />
{:else}<ProfileShareLoad view={body.view} />{/if}
