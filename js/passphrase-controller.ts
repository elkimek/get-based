// Encryption services own persistence; the dialog receives non-secret status only.
import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import { openPassphraseDialog } from './passphrase-component.js';
import { validatePassphrase } from './passphrase-presentation.js';
import type { PassphraseOwner, PassphraseSubmission } from './passphrase-contract.js';
export interface PassphraseServices {
    changeEncryptionPassphrase: ((oldPassphrase: string, newPassphrase: string) => Promise<void>) | null;
    clearEncryptionSession: (() => void) | null;
    migrateEncryptionStorage: (() => Promise<void>) | null;
    prepareEncryption: ((passphrase: string) => Promise<void>) | null;
    unlockEncryption: ((passphrase: string) => Promise<void>) | null;
    eraseAllLocalAppData: (() => Promise<void>) | null;
    reloadApp(): void;
}
function requireService<T>(service: T | null): T {
    if (!service)
        throw new Error('Encryption service is unavailable');
    return service;
}
export function openUnlockDialog(services: PassphraseServices, onSuccess: () => unknown): void {
    // Going back from the erasure warning must not reset the failed-attempt count.
    const attempts = { failures: 0 };
    const render = () => {
        let busy = false;
        let owner: PassphraseOwner;
        const unlock = async (values: PassphraseSubmission) => {
            if (values.kind !== 'unlock' || busy || !owner.isCurrent())
                return;
            if (!values.passphrase) {
                owner.update({ error: 'Please enter your passphrase' });
                return;
            }
            busy = true;
            owner.update({ pending: true, error: '', primaryLabel: 'Decrypting...' });
            if (attempts.failures >= 3) {
                owner.update({ error: 'Too many attempts. Please wait...' });
                await new Promise(resolve => setTimeout(resolve, 5000));
                if (!owner.isCurrent()) {
                    busy = false;
                    return;
                }
                owner.update({ error: '' });
            }
            try {
                await requireService(services.unlockEncryption)(values.passphrase);
            }
            catch {
                attempts.failures++;
                busy = false;
                owner.clearUnlock();
                owner.update({ pending: false, error: `Wrong passphrase (attempt ${attempts.failures})`, primaryLabel: 'Unlock' });
                owner.focusFirst();
                return;
            }
            if (!owner.isCurrent())
                return;
            owner.close();
            onSuccess();
        };
        owner = openPassphraseDialog('unlock', {
            submit: values => { void unlock(values); },
            secondary: () => { },
            forgot: () => {
                if (!busy && owner.isCurrent())
                    openEraseDialog(services, render);
            },
        });
    };
    render();
}
function openEraseDialog(services: PassphraseServices, back: () => void): void {
    let busy = false;
    let owner: PassphraseOwner;
    const erase = async () => {
        if (busy || !owner.isCurrent())
            return;
        busy = true;
        owner.update({ pending: true, error: '', primaryLabel: 'Erasing…' });
        try {
            const eraseAllLocalAppData = services.eraseAllLocalAppData
                || (await import('./data-wipe.js')).eraseAllLocalAppData;
            await eraseAllLocalAppData();
        }
        catch (error) {
            busy = false;
            const message = `${getErrorMessage(error, 'Could not erase all local data.')} Close other getbased tabs and try again.`;
            owner.update({ pending: false, error: message, primaryLabel: 'Retry Erase' });
            if (!owner.isCurrent())
                showNotification(message, 'error');
            return;
        }
        services.clearEncryptionSession?.();
        owner.close();
        services.reloadApp();
    };
    owner = openPassphraseDialog('erase', {
        submit: () => { void erase(); },
        secondary: () => { if (!busy && owner.isCurrent())
            back(); },
        forgot: () => { },
    });
}
export function openEnableDialog(services: PassphraseServices, onEncryptionChanged: () => void): void {
    let busy = false;
    let migrationStarted = false;
    let owner: PassphraseOwner;
    const enable = async (values: PassphraseSubmission) => {
        if (values.kind !== 'enable' || busy || !owner.isCurrent())
            return;
        const error = migrationStarted ? '' : !values.passphrase ? 'Please enter a passphrase'
            : validatePassphrase(values.passphrase) || (values.passphrase !== values.confirmation ? 'Passphrases do not match' : '');
        if (error) {
            owner.update({ error });
            return;
        }
        busy = true;
        owner.update({ pending: true, error: '', primaryLabel: 'Encrypting...' });
        try {
            // After initialization, retries must use the prepared key even if a storage
            // write failed. Changing credentials here would split the encryption state.
            if (!migrationStarted) {
                await requireService(services.prepareEncryption)(values.passphrase);
                migrationStarted = true;
            }
            await requireService(services.migrateEncryptionStorage)();
            owner.close();
            showNotification('Encryption enabled — keep your passphrase safe', 'success');
            onEncryptionChanged();
        }
        catch (error) {
            busy = false;
            owner.update({
                pending: false, error: 'Encryption failed: ' + getErrorMessage(error),
                credentialsLocked: migrationStarted,
                primaryLabel: migrationStarted ? 'Retry Encryption' : 'Enable Encryption',
            });
        }
    };
    owner = openPassphraseDialog('enable', {
        submit: values => { void enable(values); },
        secondary: () => { if (!busy)
            owner.close(); },
        forgot: () => { },
    });
}
export function openChangeDialog(services: PassphraseServices): void {
    let busy = false;
    let owner: PassphraseOwner;
    const change = async (values: PassphraseSubmission) => {
        if (values.kind !== 'change' || busy || !owner.isCurrent())
            return;
        const error = !values.oldPassphrase ? 'Enter current passphrase' : validatePassphrase(values.newPassphrase)
            || (values.newPassphrase !== values.confirmation ? 'New passphrases do not match' : '');
        if (error) {
            owner.update({ error });
            return;
        }
        busy = true;
        owner.update({ pending: true, error: '', primaryLabel: 'Changing...' });
        try {
            await requireService(services.changeEncryptionPassphrase)(values.oldPassphrase, values.newPassphrase);
            owner.close();
            showNotification('Passphrase changed successfully', 'success');
        }
        catch {
            busy = false;
            owner.update({ pending: false, error: 'Current passphrase is incorrect', primaryLabel: 'Change Passphrase' });
        }
    };
    owner = openPassphraseDialog('change', {
        submit: values => { void change(values); },
        secondary: () => { if (!busy)
            owner.close(); },
        forgot: () => { },
    });
}
