// Exact disclosure-safe setup reads, frozen effects and locked reviewed Apply.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { state } from './state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { sunSetupPublic, parseSunSetupSnapshot } from './sun-setup-proposals.js';
import type { SunSetupSnapshot, SunSetupPlan } from './sun-setup-proposals.js';
import { applySunSetupPatch, retainSunSetupHistory } from './sun-setup-mutations.js';
import { commitSunSetupWrite } from './sun-setup-store.js';
export const SUN_SETUP_FIELDS = ['sunDefaults', 'lightCircadian', 'sunSessions'] as const;
const conflict = (): never => { throw Object.assign(new Error('The setup or session source changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
const insight = () => isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
async function snapshot(data: ProfileData): Promise<SunSetupSnapshot> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(SUN_SETUP_FIELDS.map(key => data[key] ?? null)))), hash = await crypto.subtle.digest('SHA-256', bytes);
  return { version: 1, record: sunSetupPublic(data, insight()), insightEnabled: insight(), revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function compute(data: ProfileData, proposal: AgentDataProposal): { next: ProfileData; plan: SunSetupPlan } {
  const patch = parseAgentDataPatch(proposal.patch), safety = 'fitzpatrick' in patch || 'photosensitiveMeds' in patch;
  if ('fitzpatrick' in patch && !insight()) throw new Error('Enable Insight cards to review the mirrored skin-type change.');
  if (data.sunSessions != null && !Array.isArray(data.sunSessions)) throw new Error('Review older Sun session data in its editor.');
  if (safety && data.sunSessions?.some(session => !session || typeof session !== 'object' || !session.endedAt)) throw new Error('Stop the active Sun session before changing its safety defaults.');
  const next = structuredClone(data); applySunSetupPatch(next, patch);
  if (profileDataValuesEqual(sunSetupPublic(data, insight()), sunSetupPublic(next, insight()))) throw new Error('These setup values are already recorded.');
  retainSunSetupHistory(next, data, proposal.recordedAt);
  return { next, plan: { after: sunSetupPublic(next, insight()), effects: { mirrorsSkin: 'fitzpatrick' in patch, mirroredSkinType: 'fitzpatrick' in patch ? next.lightCircadian?.skinType ?? null : null,
    safetyDefaultsChanged: safety, analysisCleared: !!data.sunDefaults?.aiAnalysis, historyRetained: true } } };
}
export async function readCurrentSunSetup(profile: string) { return snapshot(await readAgentProfileRecords(profile)); }
export async function prepareReviewedSunSetup(profile: string, proposal: AgentDataProposal) {
  const expected = parseSunSetupSnapshot(proposal), data = await readAgentProfileRecords(profile);
  if (!profileDataValuesEqual(expected, await snapshot(data))) conflict();
  proposal.baseline = JSON.stringify({ ...expected, plan: compute(data, proposal).plan });
}
export async function commitReviewedSunSetup(profile: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const expected = parseSunSetupSnapshot(proposal), { plan: _plan, ...read } = expected, data = await readAgentProfileRecords(profile);
  if (!authorized() || expected.insightEnabled !== insight()) conflict();
  if (!profileDataValuesEqual(read, await snapshot(data))) conflict();
  const { next, plan } = compute(data, proposal); if (!profileDataValuesEqual(plan, expected.plan)) conflict();
  const origin = state.importedData;
  if (!SUN_SETUP_FIELDS.every(key => profileDataValuesEqual(origin[key] ?? null, data[key] ?? null))) conflict();
  const canCommit = () => authorized() && state.importedData === origin && expected.insightEnabled === insight();
  const fields = plan.effects.mirrorsSkin ? ['sunDefaults', 'lightCircadian'] as const : ['sunDefaults'] as const;
  const result = await commitSunSetupWrite(profile, origin, data, structuredClone(origin), next, SUN_SETUP_FIELDS, fields, canCommit);
  if (!result.saved) { if (result.conflict || !canCommit()) conflict(); throw new Error('Could not save Light setup. Try Apply again.'); }
  return 'Light setup updated.';
}
