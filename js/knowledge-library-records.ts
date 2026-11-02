// Browser ownership and disclosure around exact native library source proofs.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { KnowledgeLibraryIO, KnowledgeLibrarySnapshot } from './knowledge-library-source.js';
import { state } from './state.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { readKnowledgeSettings, hasKnowledgeSettingsDraft } from './knowledge-settings.js';
import { LENS_CONFIG_STORAGE_KEY } from './lens-config-store.js';
import { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
import { getLensConfig, getLensSourceIdentity, commitLensConfig, clearLensCache, hasKnowledgeLibraryDraft, refreshKnowledgeLibraryMetadata, notifyKnowledgeLibraryChange } from './lens.js';
import { openKnowledgeLibraryIO, readKnowledgeLibraryRegistry, readKnowledgeLibrarySource, publicKnowledgeLibrary, librarySourceDigest, librarySourceConflict } from './knowledge-library-source.js';
import { projectKnowledgeLibrary } from './knowledge-library-proposals.js';
import { applyLocalLibraryChange, confirmLocalLibraryChange } from './lens-local-library-session.js';
// In-browser name is a display alias maintained from the active library. It is
// excluded so updating that alias cannot prevent confirmation of our own receipt.
export function knowledgeLibraryConfiguration() {
  return librarySourceDigest(getLensSourceIdentity());
}
export async function withKnowledgeSource<T>(profileId: string, read: (io: KnowledgeLibraryIO, configuration: string) => Promise<T>): Promise<T> {
  const root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => state.currentProfile === profileId && state.importedData === root && getContextDisclosureFingerprint() === disclosure;
  if (!current() || !navigator.storage?.getDirectory || !navigator.locks?.request) throw librarySourceConflict();
  const settings = await readKnowledgeSettings();
  if (!current() || !settings.record.enabled || settings.record.backend !== 'in-browser') throw new Error('Local Knowledge Base disclosure is disabled. Review knowledgeSettings before managing saved libraries.');
  const configuration = knowledgeLibraryConfiguration();
  const result = await navigator.locks.request(LENS_LOCAL_STORAGE_LOCK, async () => {
    if (!current()) throw librarySourceConflict(); return read(await openKnowledgeLibraryIO(), configuration);
  });
  await readKnowledgeSettings();
  if (!current() || configuration !== knowledgeLibraryConfiguration()) throw librarySourceConflict();
  return result;
}
export function listCurrentKnowledgeLibraries(profileId: string) {
  return withKnowledgeSource(profileId, async io => {
    const registry = await readKnowledgeLibraryRegistry(io); return registry ? registry.libraries.map(row => publicKnowledgeLibrary(row, registry.activeId)) : [];
  });
}
export function readCurrentKnowledgeLibrary(profileId: string, libraryId: string, create = false): Promise<KnowledgeLibrarySnapshot | null> {
  return withKnowledgeSource(profileId, async (io, configuration) => {
    const source = await readKnowledgeLibrarySource(io, libraryId, create);
    return !create && !source.snapshot.record ? null : { ...source.snapshot, configuration };
  });
}
export async function prepareReviewedKnowledgeLibrary(profileId: string, proposal: AgentDataProposal) {
  projectKnowledgeLibrary(proposal);
  const current = await readCurrentKnowledgeLibrary(profileId, proposal.recordId, proposal.operation === 'add');
  if (!current || JSON.stringify(current) !== proposal.baseline) throw librarySourceConflict();
}
export async function confirmReviewedKnowledgeLibrary(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  projectKnowledgeLibrary(proposal);
  const root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => authorized() && state.currentProfile === profileId && state.importedData === root && getContextDisclosureFingerprint() === disclosure;
  const authorize = async () => {
    if (!current()) return false; const settings = await readKnowledgeSettings();
    return current() && settings.record.enabled && settings.record.backend === 'in-browser';
  };
  if (!await authorize()) throw librarySourceConflict();
  return confirmLocalLibraryChange(proposal, authorize);
}
export async function commitReviewedKnowledgeLibrary(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const review = projectKnowledgeLibrary(proposal), root = state.importedData, disclosure = getContextDisclosureFingerprint();
  const current = () => authorized() && state.currentProfile === profileId && state.importedData === root && getContextDisclosureFingerprint() === disclosure && !hasKnowledgeSettingsDraft() && !hasKnowledgeLibraryDraft();
  const authorize = async () => {
    if (!current()) return false;
    await readKnowledgeSettings();
    return current() && knowledgeLibraryConfiguration() === review.snapshot.configuration && getLensConfig().enabled && getLensConfig().backend === 'in-browser';
  };
  if (!await authorize()) throw librarySourceConflict();
  // The worker rechecks the exact OPFS source under its storage lock. This
  // callback checks only config/scope/drafts; an OPFS read here would deadlock.
  const applied = await applyLocalLibraryChange(proposal, authorize);
  clearLensCache(); notifyKnowledgeLibraryChange();
  let refreshFailed = false;
  try {
    if (current()) {
      // Keep the display alias in sync with a fresh active identity. Holding
      // storage ownership prevents an older refresh from overwriting a newer
      // active library's alias; the config owner still protects private fields.
      await navigator.locks.request(LENS_LOCAL_STORAGE_LOCK, async () => {
        const registry = await readKnowledgeLibraryRegistry(await openKnowledgeLibraryIO());
        if (!registry || !await authorize()) throw librarySourceConflict();
        const activeName = registry.libraries.find(row => row.id === registry.activeId)!.name;
        if (getLensConfig().name !== activeName) await commitLensConfig({ name: activeName }, { expectedRaw: localStorage.getItem(LENS_CONFIG_STORAGE_KEY), canCommit: () => current() && knowledgeLibraryConfiguration() === review.snapshot.configuration });
      });
      if (current() && !await refreshKnowledgeLibraryMetadata()) refreshFailed = true;
    }
  } catch { refreshFailed = true; }
  return `${applied.alreadyApplied ? 'This library change was already saved.' : 'Library change saved for this browser (all profiles).'}${applied.cleanupPending === true ? ' Some stored files could not be erased; storage cleanup is still needed.' : applied.cleanupPending === null ? ' Physical file cleanup could not be confirmed.' : ''}${refreshFailed ? ' Reopen Knowledge Base to refresh its display.' : ''}`;
}
