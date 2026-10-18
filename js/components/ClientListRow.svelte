<script lang="ts">
  import ClientListIcon from './ClientListIcon.svelte';
  import type {ClientListRowView} from '../client-list-presentation.js';
  let {view}: {view: ClientListRowView} = $props();
</script><svelte:options preserveWhitespace={true} /><div class="cl-row{view.active ? ' cl-row-active' : ''}" data-id="{view.id}" data-cl-action="select-profile" data-cl-profile-id={view.selectId} data-cl-key-action="select-profile" role="button" tabindex="0">
    {#if view.avatar.kind === 'image'}<img class="cl-avatar cl-avatar-img" src={view.avatar.source} alt="">{:else}<span class="cl-avatar" style={'background:' + view.avatar.color}>{view.avatar.initial}</span>{/if}
    <div class="cl-row-info">
      <div class="cl-row-top">
        <span class="cl-row-name">{view.name}</span>
        {#each view.tags as tag}<span class="cl-row-tag">{tag}</span>{/each}{#if view.flagged}<span class="cl-badge cl-badge-flagged" title="Flagged">flagged</span>{/if}{#if view.pinned}<span class="cl-badge cl-badge-pinned" title="Pinned">pinned</span>{/if}
      </div>
      <div class="cl-row-bottom">
        <span class="cl-row-time">{view.time}</span>{#if view.note}<span class="cl-row-sep">&middot;</span><span class="cl-row-note">{view.note}</span>{/if}
      </div>
    </div>
    <div class="cl-row-actions">
      <button type="button" class="cl-row-edit cl-icon-btn" data-cl-action="edit-profile" data-cl-profile-id={view.editId} title="Edit" aria-label="Edit {view.label}"><ClientListIcon name="edit" /></button>
      <button type="button" class="cl-row-menu-btn cl-icon-btn" data-cl-action="toggle-menu" data-cl-profile-id={view.menuId} title="More" aria-label="More actions for {view.label}"><ClientListIcon name="more" /></button>
    </div>
  </div>