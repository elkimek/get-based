// Only non-secret status crosses the presentation boundary.
export type PassphraseKind = 'unlock' | 'enable' | 'change' | 'erase' | 'encryption-nudge' | 'backup-nudge';
export interface PassphraseState {
    kind: PassphraseKind;
    pending: boolean;
    credentialsLocked: boolean;
    error: string;
    primaryLabel: string;
}
export type PassphraseSubmission = {
    kind: 'unlock';
    passphrase: string;
} | {
    kind: 'enable';
    passphrase: string;
    confirmation: string;
} | {
    kind: 'change';
    oldPassphrase: string;
    newPassphrase: string;
    confirmation: string;
} | {
    kind: 'erase' | 'encryption-nudge' | 'backup-nudge';
};
export interface PassphraseActions {
    submit(values: PassphraseSubmission): void;
    secondary(): void;
    forgot(): void;
}
export interface PassphraseView {
    update(state: PassphraseState): void;
    clearUnlock(): void;
    clearSecrets(): void;
    focusFirst(): void;
}
export interface PassphraseOwner {
    isCurrent(): boolean;
    update(patch: Partial<Omit<PassphraseState, 'kind'>>): void;
    clearUnlock(): void;
    focusFirst(): void;
    close(): void;
}
