<script lang="ts">
  import ProfileShareBody from './ProfileShareBody.svelte';
  import type {ShellShareView} from '../profile-share-presentation.js';
  let {view}: {view: ShellShareView} = $props();
</script><svelte:options preserveWhitespace={true} /><div class="modal-overlay" id="profile-share-overlay">
      <div class="modal gb-form-modal profile-share-modal" role="dialog" aria-modal="true" aria-label="{view.titleAttribute}">
        <div class="gb-modal-head">
          <div>
            <div class="gb-modal-kicker">{view.kicker}</div>
            <div class="gb-modal-title">{view.title}</div>
          </div>
          <button type="button" class="modal-close" aria-label="Close" data-profile-share-action="close">&times;</button>
        </div>
        <ProfileShareBody body={view.body} />
      </div>
    </div><!-- profile-share authored terminator -->