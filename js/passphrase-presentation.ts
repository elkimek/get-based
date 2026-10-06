import type { PassphraseKind, PassphraseState } from './passphrase-contract.js';
export const PASSPHRASE_RULES = [
    { id: 'length', label: 'At least 8 characters' }, { id: 'lower', label: 'At least 1 lowercase letter' },
    { id: 'upper', label: 'At least 1 uppercase letter' }, { id: 'special', label: 'At least 1 special character' },
] as const;
export function passphraseChecks(value: string): readonly boolean[] {
    return [value.length >= 8, /[a-z]/.test(value), /[A-Z]/.test(value), /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(value)];
}
export function validatePassphrase(value: string): string {
    const index = passphraseChecks(value).findIndex(check => !check);
    return index < 0 ? '' : PASSPHRASE_RULES[index]!.label;
}
export const PASSPHRASE_LABELS: Record<PassphraseKind, {
    title: string;
    label: string;
    primary: string;
    secondary: string;
    errorId?: string;
}> = {
    unlock: { title: 'Unlock getbased', label: 'Enter passphrase', primary: 'Unlock', secondary: '', errorId: 'passphrase-error' },
    enable: { title: 'Enable Encryption', label: 'Set encryption passphrase', primary: 'Enable Encryption', secondary: 'Cancel', errorId: 'passphrase-set-error' },
    change: { title: 'Change Passphrase', label: 'Change passphrase', primary: 'Change Passphrase', secondary: 'Cancel', errorId: 'passphrase-change-error' },
    erase: { title: 'Erase All Data?', label: 'Erase all data', primary: 'Erase Everything', secondary: 'Go Back', errorId: 'passphrase-erase-error' },
    'encryption-nudge': { title: 'Protect Your Data', label: 'Enable encryption', primary: 'Enable Encryption', secondary: 'Not Now' },
    'backup-nudge': { title: 'Back Up Your Data', label: 'Backup reminder', primary: 'Download Now', secondary: 'Not Now' },
};
export function initialPassphraseState(kind: PassphraseKind): PassphraseState {
    return { kind, pending: false, credentialsLocked: false, error: '', primaryLabel: PASSPHRASE_LABELS[kind].primary };
}
