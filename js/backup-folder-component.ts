// Compatibility hosts share the folder component; normal Settings owns its nested view.
import FolderBackupSettings, { mount, unmount, flushSync } from './components/FolderBackupSettings.svelte.native.js';
import { registerFolderBackupPresentation } from './backup-folder-presentation.js';
import type { FolderBackupSnapshot, ProtectionView } from './settings-protection-contract.js';
const folders = new Map<HTMLElement, ProtectionView<FolderBackupSnapshot>>();
function dispose(): void {
  for (const view of folders.values()) void unmount(view);
  flushSync(); folders.clear();
}
function refresh(snapshot: FolderBackupSnapshot): void {
  for (const [host, view] of folders) if (!host.isConnected) { void unmount(view); folders.delete(host); }
  for (const host of document.querySelectorAll<HTMLElement>('[data-folder-backup-root]')) {
    const view = folders.get(host);
    if (view) flushSync(() => view.refresh(snapshot));
    else folders.set(host, mount(FolderBackupSettings, { target: host, props: { snapshot } }));
  }
  flushSync();
}
registerFolderBackupPresentation({ refresh, dispose });
