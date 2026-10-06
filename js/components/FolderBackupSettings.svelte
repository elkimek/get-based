<script lang="ts">
  import type { FolderBackupSnapshot } from '../settings-protection-contract.js';
  import { PROTECTION_PRIMARY, PROTECTION_SECONDARY, PROTECTION_ACTIONS, PROTECTION_DESCRIPTION, FOLDER_STATUS } from '../settings-protection-classes.js';
  let { snapshot }: { snapshot: FolderBackupSnapshot } = $props();
  export function refresh(next: FolderBackupSnapshot): void { snapshot = next; }
</script>
{#if snapshot.supported}
  <div data-folder-backup-view class="backup-folder-section gb:protection:mt-4 gb:protection:pt-3.5 gb:protection:border-t gb:protection:border-line">
    <div class="backup-folder-desc {PROTECTION_DESCRIPTION} gb:protection:mb-2.5">Sync backups to a local folder (Proton Drive, Dropbox, NAS, etc.)</div>
    {#if !snapshot.folderName}
      <button type="button" class={PROTECTION_SECONDARY} data-backup-action="pick-folder">Set backup folder</button>
    {:else if snapshot.permissionLost}
      <div role="status" class="{FOLDER_STATUS} backup-folder-status-warn gb:protection:border-warning gb:protection:bg-[rgba(234,179,8,0.06)]">Folder: {snapshot.folderName} — access lost</div>
      <div class={PROTECTION_ACTIONS}>
        <button type="button" class={PROTECTION_PRIMARY} data-backup-action="reauthorize-folder">Restore access</button>
        <button type="button" class={PROTECTION_SECONDARY} data-backup-action="remove-folder">Remove</button>
      </div>
    {:else}
      <div role="status" class="{FOLDER_STATUS} backup-folder-status-ok gb:protection:border-success gb:protection:bg-[rgba(34,197,94,0.06)]">Folder: {snapshot.folderName}</div>
      <div class="backup-folder-meta {PROTECTION_DESCRIPTION} gb:protection:mb-2">Last folder backup: {snapshot.lastBackupLabel}</div>
      <div class={PROTECTION_ACTIONS}>
        <button type="button" class={PROTECTION_SECONDARY} data-backup-action="pick-folder">Change folder</button>
        <button type="button" class={PROTECTION_SECONDARY} data-backup-action="remove-folder">Remove</button>
      </div>
    {/if}
  </div>
{/if}
