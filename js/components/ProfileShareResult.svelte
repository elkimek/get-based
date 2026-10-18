<script lang="ts">
  import ProfileShareActive from './ProfileShareActive.svelte';
  import type {ResultShareView} from '../profile-share-presentation.js';
  let {view}: {view: ResultShareView} = $props();
</script><svelte:options preserveWhitespace={true} />
    <div class="gb-form-body profile-share-body">
      <div class="profile-share-intro">
        <div class="profile-share-intro-title">Link ready for <b>{view.profileName}</b></div>
        <div class="profile-share-intro-copy">Copy both values, but send them through separate channels.</div>
      </div>
      <div class="profile-share-result-list">
        <label class="profile-share-field">
          <span>Link</span>
          <div class="profile-share-input-row">
            <input id="profile-share-link" class="api-key-input" type="text" value="{view.shareUrl}" readonly>
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="copy" data-copy-target="profile-share-link" data-copy-label="Link copied" title="Copy link" aria-label="Copy link"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          </div>
        </label>
        <label class="profile-share-field">
          <span>Password</span>
          <div class="profile-share-input-row">
            <input id="profile-share-result-password" class="api-key-input" type="text" value="{view.password}" readonly>
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="copy" data-copy-target="profile-share-result-password" data-copy-label="Password copied" title="Copy password" aria-label="Copy password"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          </div>
        </label>
      </div>
      <div class="profile-share-note">Expires {view.expiry}. Recipients import this as a new profile.</div>
      <ProfileShareActive view={view.active} />
      <div id="profile-share-status" class="profile-share-status" hidden></div>
      <div class="gb-form-actions">
        <button type="button" class="import-btn import-btn-primary" data-profile-share-action="close">Done</button>
      </div>
    </div>
  <!-- profile-share authored terminator -->