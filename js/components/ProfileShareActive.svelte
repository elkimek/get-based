<script lang="ts">
  import type {ActiveShareView} from '../profile-share-presentation.js';
  let {view}: {view: ActiveShareView} = $props();
</script><svelte:options preserveWhitespace={true} />
    <section class="profile-share-active" data-profile-share-active-list data-profile-id="{view.profileId}">
      <div class="profile-share-active-head">
        <span>Active links</span>
        <small>Created on this device</small>
      </div>
      <div class="profile-share-active-list">{#if view.rows.length}{#each view.rows as row}
        <div class="profile-share-active-row" data-profile-share-record="{row.id}">
          <div class="profile-share-active-main">
            <span class="profile-share-active-title">Shared link</span>
            <span class="profile-share-active-meta">Expires {row.expiry}</span>
          </div>
          <div class="profile-share-active-actions">
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="copy" data-copy-value="{row.shareUrl}" data-copy-label="Link copied" title="Copy link" aria-label="Copy active link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button type="button" class="profile-share-stop-btn" data-profile-share-action="delete-link" data-share-id="{row.deleteId}">Stop sharing</button>
          </div>
        </div>{/each}{:else}<div class="profile-share-active-empty">No active links created on this device.</div>{/if}</div>
    </section>
  <!-- profile-share authored terminator -->