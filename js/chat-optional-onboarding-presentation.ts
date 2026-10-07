import type { ProfileData } from '../types/app-state.js';
import type { GeneticsData } from './dna-runtime.js';
import type { ChatOnboardingProgress } from './chat-onboarding-presentation.js';
import { projectOnboardingProgress } from './chat-onboarding-presentation.js';
import { getCurrentSupplements } from './supplement-medication-domain.js';
import { snpFindingPresentation } from './dna-evidence.js';

export type OptionalTaskAction = 'open-cycle-editor' | 'start-file-import' | 'open-supplements-editor'
  | 'import-dna' | 'import-mtdna' | 'open-wearables-settings';
export interface OptionalTask {
  id: string; icon: string; title: string; summary: string; complete: boolean;
  actions: { action: OptionalTaskAction; label: string; secondary?: boolean }[];
}
export interface GeneticsImportConfirmation { count: number; source: string; apoe: string; findings: string[] }
export interface ChatOptionalSetupView {
  personalityLabel: string; connected: boolean; progress: ChatOnboardingProgress;
  tasks: OptionalTask[]; hasSnps: boolean; confirmation: GeneticsImportConfirmation | null;
}
export function projectGeneticsImportConfirmation(genetics: GeneticsData | null | undefined, source: string): GeneticsImportConfirmation {
  const entries = Object.entries(genetics?.snps || {});
  const counts: Record<string, number> = {};
  for (const [rsid, snp] of entries) {
    if (genetics?.apoe && (rsid === 'rs429358' || rsid === 'rs7412')) continue;
    const tone = snpFindingPresentation(snp.effect, snp.valence).tone;
    counts[tone] = (counts[tone] || 0) + 1;
  }
  const labels: [number, string, string, string][] = [
    [counts.risk || 0, '🔴', 'risk association', 'risk associations'],
    [counts.protective || 0, '🟢', 'protective association', 'protective associations'],
    [counts.trait || 0, '🔵', 'informational trait', 'informational traits'],
    [(counts.neutral || 0) + (counts.reference || 0), '⚪', 'reference / neutral finding', 'reference / neutral findings'],
    [counts.unclassified || 0, '❓', 'unclassified finding', 'unclassified findings'],
  ];
  return { count: entries.length, source, apoe: genetics?.apoe || '', findings: labels
    .filter(([count]) => count > 0).map(([count, icon, singular, plural]) => `${icon} ${count} ${count === 1 ? singular : plural}`) };
}
export function projectChatOptionalSetup(data: ProfileData, sex: string | null, connected: boolean,
  personalityLabel: string, confirmation: GeneticsImportConfirmation | null = null): ChatOptionalSetupView {
  const cycle = data.menstrualCycle;
  const hasCycle = Boolean(cycle?.periods?.length || cycle?.cycleLength || cycle?.cycleStatus);
  const supplements = data.supplements || [];
  const current = getCurrentSupplements(supplements);
  const supplementSummary = current.length
    ? current.slice(0, 2).map(item => `${item!.name}${item!.dosage ? ` ${item!.dosage}` : ''}`).join(', ')
      + (current.length > 2 ? ` +${current.length - 2}` : '')
      + (supplements.length > current.length ? ` · ${supplements.length - current.length} in history` : '')
    : supplements.length ? `No current items · ${supplements.length} in history` : 'Add medications or supplements that can shift labs.';
  const genetics = data.genetics as GeneticsData | null | undefined;
  const count = Object.keys(genetics?.snps || {}).length, hasSnps = count > 0, hasMtdna = Boolean(genetics?.mtdna);
  const geneticsSummary = [hasSnps ? `${count} SNPs` : '', hasMtdna ? `mtDNA ${genetics?.mtdna?.haplogroup || ''}`.trim() : '']
    .filter(Boolean).join(' · ') || 'Import nuclear DNA (SNPs) or mitochondrial DNA (mtDNA) raw data.';
  const tasks: OptionalTask[] = [];
  if (sex === 'female') tasks.push({ id: 'cycle', icon: '◐', title: 'Cycle context', complete: hasCycle,
    summary: hasCycle ? 'Cycle tracking is already set.' : 'Helps interpret hormones, iron, and inflammation.',
    actions: [{ action: 'open-cycle-editor', label: hasCycle ? 'Edit' : 'Set up' }, { action: 'start-file-import', label: 'Import', secondary: true }] });
  tasks.push({ id: 'supplements', icon: 'Rx', title: 'Supplements & meds', summary: supplementSummary, complete: supplements.length > 0,
    actions: [{ action: 'open-supplements-editor', label: supplements.length ? 'Edit' : 'Add' }] });
  // Keep initial uploads before re-import actions, matching the established funnel.
  const dnaActions: OptionalTask['actions'] = [];
  if (!hasSnps) dnaActions.push({ action: 'import-dna', label: 'Import DNA file' });
  if (!hasMtdna) dnaActions.push({ action: 'import-mtdna', label: 'Import mtDNA' });
  if (hasSnps) dnaActions.push({ action: 'import-dna', label: 'Re-import DNA', secondary: true });
  if (hasMtdna) dnaActions.push({ action: 'import-mtdna', label: 'Re-import mtDNA', secondary: true });
  tasks.push({ id: 'genetics', icon: 'DNA', title: 'Genetics', summary: geneticsSummary, complete: hasSnps || hasMtdna, actions: dnaActions });
  const connections = data.wearableConnections as Record<string, { accessToken?: unknown; connectedSince?: unknown } | null> | undefined;
  if (!Object.values(connections || {}).some(connection => connection?.accessToken || connection?.connectedSince)) {
    tasks.push({ id: 'wearables', icon: 'HRV', title: 'Wearables', complete: false,
      summary: 'Optional HRV, sleep, recovery, and body composition trends.', actions: [{ action: 'open-wearables-settings', label: 'Connect' }] });
  }
  return { personalityLabel, connected, progress: projectOnboardingProgress(3, connected), tasks, hasSnps, confirmation };
}
