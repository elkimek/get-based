// Folder services publish display-only state without importing a UI framework.
import type { FolderBackupSnapshot } from './settings-protection-contract.js';
interface FolderPresentation { refresh(snapshot: FolderBackupSnapshot): void; dispose(): void }
const views = new Set<FolderPresentation>();
export function registerFolderBackupPresentation(view: FolderPresentation): void { views.add(view); }
export function refreshFolderBackupPresentation(snapshot: FolderBackupSnapshot): void { for (const view of views) view.refresh(snapshot); }
export function disposeFolderBackupPresentation(): void { for (const view of views) view.dispose(); }
