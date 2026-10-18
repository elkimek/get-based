<script lang="ts">
  import ClientListIcon from './ClientListIcon.svelte';
  import type {ClientListMenuButtonView} from '../client-list-presentation.js';
  let {view}: {view: ClientListMenuButtonView} = $props();
</script><svelte:options preserveWhitespace={true} /><button type="button" class="cl-menu-item{view.danger ? ' cl-menu-danger' : ''}" data-cl-action={view.action} data-cl-profile-id={view.profileId}><ClientListIcon name={view.icon} /><span>{view.label}</span></button>