// Shared capability status for dashboard prompts and the setup picker.
import { getFolderBackupState } from './backup.js';
import { getEncryptionEnabled } from './crypto.js';
import { isSyncEnabled } from './sync.js';
export interface DataProtectionStatus { encryption: boolean; sync: boolean; backup: boolean; backupSupported: boolean }
export function getDataProtectionStatus(): DataProtectionStatus {
  let backup = false, backupSupported = true;
  try {
    const status = getFolderBackupState();
    backupSupported = !!status?.supported; backup = !!status?.folderName;
  } catch { /* An uninitialised backup retains the existing setup prompt. */ }
  return { encryption: !!getEncryptionEnabled(), sync: !!isSyncEnabled(), backup, backupSupported };
}
