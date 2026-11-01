import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { sha256 } from '../vendor/sha256.js';
import { state } from './state.js';
import { getLensConfig, commitLensConfig, refreshLensConfigControls } from './lens.js';
import { LENS_CONFIG_STORAGE_KEY, knowledgeSettingsConflict, readCommittedLensConfigRaw } from './lens-config-store.js';
import { displayKnowledgeSettings, projectKnowledgeSettings } from './knowledge-settings-proposals.js';
import type { KnowledgeSettingsSnapshot } from './knowledge-settings-proposals.js';
const digest = (raw: string | null) => [...sha256(new TextEncoder().encode(JSON.stringify(raw)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export async function readKnowledgeSettings(): Promise<KnowledgeSettingsSnapshot> {
  await readCommittedLensConfigRaw();
  const raw = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
  if (raw !== null && raw.length > 128 * 1024) throw new Error('The saved Knowledge Base settings exceed the bounded review size. Review them in the native settings.');
  if (raw !== null) {
    try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); }
    catch { throw new Error('Review the saved Knowledge Base settings. No data was changed.'); }
  }
  const record = displayKnowledgeSettings(getLensConfig());
  if (localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== raw) throw knowledgeSettingsConflict();
  return { version: 1, scope: 'browser', revision: digest(raw), record };
}
export function hasKnowledgeSettingsDraft(): boolean {
  if (typeof document === 'undefined') return false;
  return ['lens-topk-input', 'lens-enabled-toggle', 'lens-multi-query-checkbox', 'lens-name-input', 'lens-url-input', 'lens-test-probe-input', 'lens-key-input'].some(id => {
    const control = document.getElementById(id); if (!(control instanceof HTMLInputElement)) return false;
    const overlay = control.closest('#kb-modal-overlay'); if (overlay && !overlay.classList.contains('show')) return false;
    return control.type === 'checkbox' ? control.checked !== control.defaultChecked : control.value !== control.defaultValue;
  });
}
export async function commitReviewedKnowledgeSettings(proposal: AgentDataProposal, authorized: () => boolean): Promise<string> {
  const { after } = projectKnowledgeSettings(proposal);
  const profile = state.currentProfile, root = state.importedData, raw = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
  const current = () => authorized() && state.currentProfile === profile && state.importedData === root && !hasKnowledgeSettingsDraft();
  if (!current() || JSON.stringify(await readKnowledgeSettings()) !== proposal.baseline) throw knowledgeSettingsConflict();
  const keys = parseAgentDataPatch(proposal.patch), patch = {
    ...(Object.hasOwn(keys, 'enabled') ? { enabled: after.enabled } : {}),
    ...(Object.hasOwn(keys, 'topK') ? { topK: after.topK } : {}),
    ...(Object.hasOwn(keys, 'multiQuery') ? { multiQuery: after.multiQuery } : {}),
  };
  try { await commitLensConfig(patch, { expectedRaw: raw, canCommit: current }); }
  catch (error) { if ((error as { noChangeApplied?: boolean })?.noChangeApplied || error instanceof Error && 'requiresReview' in error && error.requiresReview === true) throw error; throw new Error('Could not save the Knowledge Base preferences. Retry this approval.'); }
  try { if (state.currentProfile === profile && state.importedData === root) refreshLensConfigControls(); } catch { /* The browser-wide preference write already committed. */ }
  return 'Knowledge Base preferences updated for this browser (all profiles).';
}
