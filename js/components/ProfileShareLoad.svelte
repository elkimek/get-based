<script lang="ts">
  import type {LoadShareView} from '../profile-share-presentation.js';
  let {view}: {view: LoadShareView} = $props();
</script><svelte:options preserveWhitespace={true} />
    <div class="gb-form-body profile-share-body">
      <div class="modal-unit">Enter the password for this shared profile. It will import as a new profile in this browser.</div>
      <form class="profile-share-form" data-profile-share-form="load" data-share-id="{view.id}">
        <label class="profile-share-field">
          <span>Password</span>
          <input id="profile-share-load-password" class="api-key-input" type="password" autocomplete="current-password">
        </label>
        <div id="profile-share-status" class="profile-share-status" hidden></div>
        <div class="gb-form-actions">
          <button type="button" class="import-btn import-btn-secondary" data-profile-share-action="close">Cancel</button>
          <button type="submit" class="import-btn import-btn-primary" data-profile-share-action="load">Load Profile</button>
        </div>
      </form>
    </div>
  <!-- profile-share authored terminator -->