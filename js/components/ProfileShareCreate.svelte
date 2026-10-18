<script lang="ts">
  import ProfileShareActive from './ProfileShareActive.svelte';
  import type {CreateShareView} from '../profile-share-presentation.js';
  let {view}: {view: CreateShareView} = $props();
</script><svelte:options preserveWhitespace={true} />
    <div class="gb-form-body profile-share-body">
      <div class="profile-share-intro">
        <div class="profile-share-intro-title">Encrypted link for <b>{view.profileName}</b></div>
        <div class="profile-share-intro-copy">The link finds a locked copy of the profile. The password is the only way to unlock it, and it is never added to the link or sent to us.</div>
      </div>
      <form class="profile-share-form" data-profile-share-form="create" data-profile-id="{view.profileId}">
        <label class="profile-share-field">
          <span>Password</span>
          <div class="profile-share-input-row">
            <input id="profile-share-password" class="api-key-input" type="text" value="{view.secret}" autocomplete="off" spellcheck="false">
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="regenerate" title="Generate new password" aria-label="Generate new password"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/></svg></button>
          </div>
        </label>
        <label class="profile-share-field">
          <span>Expires</span>
          <select id="profile-share-expires" class="api-key-input">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <label class="profile-share-consent">
          <input id="profile-share-consent" type="checkbox" required>
          <span>I agree to upload a password-locked copy of this profile for temporary sharing. Anyone with both the link and password can open it, so I will send the password separately.</span>
        </label>
        <div class="profile-share-note">If the password is lost, this shared copy cannot be recovered. On the official hosted app, temporary share copies are not backed up and may also be lost after a service failure; a self-hosted operator may use a different retention policy.</div>
        <div id="profile-share-status" class="profile-share-status" hidden></div>
        <div class="gb-form-actions">
          <button type="button" class="import-btn import-btn-secondary" data-profile-share-action="close">Cancel</button>
          <button type="submit" class="import-btn import-btn-primary" data-profile-share-action="create">Create Link</button>
        </div>
      </form>
      <ProfileShareActive view={view.active} />
    </div>
  <!-- profile-share authored terminator -->