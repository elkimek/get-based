import { getSyncDialogOwner, openSyncDialog } from './sync-dialog-component.js';
import type { SyncDialogOwner, SyncDialogServices } from './sync-dialog-contract.js';
interface SetupSession {
  owner: SyncDialogOwner;
  temporary: boolean;
  originalOwnerId: string | null;
  started: boolean;
  createdOwnerId: string | null;
  cancelled: boolean;
  generation: Promise<void> | null;
}
// Captured services own domain operations; owners receive non-secret status only.
export function createSyncDialogController(services: SyncDialogServices) {
  let setup: SetupSession | null = null;
  let busy = false;
  let cleaning = false;
  function cannotStart(): boolean {
    if (!busy && !cleaning && !getSyncDialogOwner()?.state().pending) return false;
    services.notify('Sync change already in progress…', 'info'); getSyncDialogOwner()?.nudge(); return true;
  }
  function showSetup(): void {
    if (cannotStart()) return;
    if (setup?.started && setup.owner.isCurrent()) { setup.owner.nudge(); return; }
    const owner = openSyncDialog('setup', () => { void cancelSetup(); });
    setup = { owner, temporary: !services.configured(), originalOwnerId: services.ownerId(), started: false, createdOwnerId: null, cancelled: false, generation: null };
  }
  function showRestore(): void {
    if (cannotStart()) return;
    if (setup?.started && setup.owner.isCurrent()) { setup.owner.nudge(); return; }
    setup = null;
    openSyncDialog('restore', closeRestore);
  }
  function newIdentity(): Promise<void> {
    const session = setup;
    if (!session?.owner.isCurrent() || cannotStart()) return Promise.resolve();
    const owner = session.owner; busy = true;
    owner.clearSecrets(); owner.patch({ step: 'new', pending: true, message: 'Generating identity...', tone: 'secondary' });
    owner.focusFirst();
    const task = (async () => {
      try {
        const enabled = await services.enable({ skipPush: false });
        session.started = session.temporary && services.enabled();
        session.createdOwnerId = services.ownerId();
        if (session.cancelled || !owner.isCurrent()) return;
        if (enabled !== true) throw new Error('Sync did not initialize');
        for (let attempt = 0; attempt < 30; attempt++) {
          if (session.cancelled || !owner.isCurrent() || !services.enabled()) return;
          if (services.ownerId() !== session.createdOwnerId) return;
          const phrase = services.mnemonic();
          if (phrase) {
            owner.showGeneratedPhrase(phrase); owner.patch({ pending: false, message: '' }); owner.focusFirst(); return;
          }
          await services.wait(500);
        }
        owner.patch({ pending: false, message: 'Failed to generate mnemonic. Try again.', tone: 'danger' });
      } catch {
        if (!session.createdOwnerId) {
          session.started = session.temporary && services.enabled();
          session.createdOwnerId = services.ownerId();
        }
        owner.patch({ pending: false, message: 'Failed to generate mnemonic. Try again.', tone: 'danger' });
      } finally {
        busy = false;
        if (owner.isCurrent() && owner.state().pending && !session.cancelled) owner.patch({ pending: false, message: 'Sync identity changed. Close this setup and try again.', tone: 'warning' });
        if (!session.cancelled && !owner.state().pending) owner.focusFirst();
      }
    })();
    session.generation = task; return task;
  }
  async function cancelSetup(): Promise<boolean> {
    const session = setup;
    if (!session?.owner.isCurrent()) return false;
    if (session.owner.state().reloading || (busy && session.owner.state().step === 'join')) {
      services.notify('Joining the existing sync identity…', 'info'); session.owner.nudge(); return false;
    }
    cleaning = true; session.cancelled = true; session.owner.close();
    try {
      await session.generation;
      // A late generation reply must not disable a subsequently replaced identity.
      if (session.started && services.enabled() && services.ownerId() === session.createdOwnerId) {
        const disabled = await services.disable();
        if (disabled === false) throw new Error('Sync cleanup was declined');
      }
    } catch {
      services.notify('Sync cleanup failed. Disconnect sync on this device to retry.', 'error');
      return false;
    } finally {
      if (setup === session) setup = null;
      cleaning = false; services.refresh(); services.release();
    }
    return true;
  }
  function done(): void {
    const session = setup;
    if (!session?.owner.isCurrent() || busy || !session.owner.acknowledged()) return;
    session.owner.close(); setup = null; services.release(); services.refresh();
  }
  function joinStep(): void {
    const owner = setup?.owner;
    if (!owner?.isCurrent() || cannotStart()) return;
    owner.clearSecrets(); owner.patch({ step: 'join', message: '', tone: 'secondary' }); owner.validate(); owner.focusFirst();
  }
  function back(): void {
    const owner = setup?.owner;
    if (!owner?.isCurrent() || cannotStart()) return;
    owner.clearSecrets(); owner.patch({ step: 'choices', message: '', tone: 'secondary' }); owner.focusFirst();
  }
  function validate(kind: 'setup' | 'restore'): void {
    const owner = getSyncDialogOwner(kind);
    if (!owner || owner.state().pending) return;
    owner.patch({ message: '', tone: 'secondary' }); owner.validate();
  }
  function closeRestore(): void {
    const owner = getSyncDialogOwner('restore');
    if (!owner) return;
    if (owner.state().pending || busy) { owner.nudge(); return; }
    owner.close();
  }
  async function restoreIdentity(join: boolean): Promise<void> {
    const owner = getSyncDialogOwner(join ? 'setup' : 'restore');
    if (!owner || cannotStart()) return;
    let phrase = owner.readPhrase();
    const words = phrase ? phrase.split(/\s+/) : [];
    if (words.length !== 24) {
      services.notify(`Seed must be exactly 24 words (got ${words.length})`, 'error'); owner.validate(); owner.focusFirst(); return;
    }
    const session = join ? setup : null;
    const originatingOwnerId = session?.originalOwnerId || services.ownerId();
    busy = true; let restored = false;
    owner.patch({ pending: true, message: join ? 'Starting encrypted sync…' : 'Checking the 24-word identity…', tone: 'secondary' });
    try {
      if (join) {
        const enabled = await services.enable({ skipPush: true, persist: false });
        if (session) { session.started = session.temporary && services.enabled(); session.createdOwnerId = services.ownerId(); }
        if (!owner.isCurrent()) return;
        if (enabled !== true) throw new Error('Sync did not initialize');
        // An existing configured owner must remain the same through preflight.
        if (session && !session.temporary && originatingOwnerId && services.ownerId() !== originatingOwnerId) {
          owner.patch({ message: 'Sync identity changed. Retry with the current identity.', tone: 'warning' }); return;
        }
        owner.patch({ message: 'Sync is ready. Checking the 24-word identity…' });
      }
      if (!owner.isCurrent()) return;
      const result = await services.restore(phrase);
      if (!result) {
        owner.patch({ pending: false, message: join ? 'Could not join. Verify all 24 words and try again.' : 'Could not restore. Verify all 24 words and try again.', tone: 'danger' });
        if (!join && !services.enabled()) services.notify('Sync not initialized — enable sync first, then restore', 'error');
        return;
      }
      restored = true;
      owner.clearSecrets(); owner.patch({ reloading: true, pending: true, message: 'Identity accepted. Reloading this device…', tone: 'success' });
    } catch {
      owner.patch({ pending: false, message: join ? 'Could not join. Verify all 24 words and try again.' : 'Could not restore. Verify all 24 words and try again.', tone: 'danger' });
      services.notify(join ? 'Could not join existing sync. Verify the identity and try again.' : 'Could not restore sync identity. Verify the identity and try again.', 'error');
    } finally {
      phrase = ''; busy = false;
      if (!restored) { owner.patch({ pending: false }); owner.focusFirst(); }
    }
  }
  return { showSetup, showRestore, newIdentity, cancelSetup, done, joinStep, back, closeRestore, validate,
    join: () => restoreIdentity(true), restore: () => restoreIdentity(false),
    acknowledge: () => getSyncDialogOwner('setup')?.validate(),
  };
}
