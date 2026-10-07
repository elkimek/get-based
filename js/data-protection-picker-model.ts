import type { DataProtectionStatus } from './data-protection-status.js';
export type ProtectionAction = 'encryption' | 'sync' | 'backup';
export interface ProtectionCard { key: ProtectionAction; icon: string; title: string; description: string; configured: boolean }
export function protectionCards(status: DataProtectionStatus): ProtectionCard[] {
  const cards: ProtectionCard[] = [
    { key: 'encryption', icon: '🔒', title: 'Encryption', description: 'Encrypt your data at rest with a passphrase. Browser extensions and anyone with disk access cannot read it without the passphrase.', configured: status.encryption },
    { key: 'sync', icon: '📡', title: 'Cross-device Sync', description: 'End-to-end encrypted sync to your other devices. A 24-word mnemonic is your only key; the relay sees ciphertext.', configured: status.sync },
  ];
  if (status.backupSupported) cards.push({ key: 'backup', icon: '💾', title: 'Auto-backup', description: 'Save daily snapshots to a local folder (Proton Drive, Dropbox, NAS, USB drive). Survives browser crashes and reinstalls.', configured: status.backup });
  return cards;
}
