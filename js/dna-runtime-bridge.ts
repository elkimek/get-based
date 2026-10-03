// Cycle-safe access to DNA module actions and values.
import { configureModuleBridge } from './runtime-callbacks.js';
import type { ModuleBridgeFunction } from './runtime-callbacks.js';

type DnaModule = typeof import('./dna.js');
type DnaBridgeFunctions = { [Name in keyof DnaModule as DnaModule[Name] extends (...args: never[]) => unknown ? Name : never]: DnaModule[Name] } & Pick<typeof import('./dna-evidence.js'),
  'buildSnpAIInterpretationPrompt' | 'dnaStudyReferenceLabel' | 'mtdnaEvidenceIssueUrl' | 'newSnpSuggestionIssueUrl' |
  'resolveSnpEvidenceProfile' | 'snpEvidenceIssueUrl' | 'snpFindingPresentation' | 'snpFindingRank'>;
type DnaBridgeFunction<Name extends string> = Name extends keyof DnaBridgeFunctions
  ? DnaBridgeFunctions[Name] : ModuleBridgeFunction;

const dnaModuleBridge: Record<string, unknown> = Object.create(null);

export function configureDnaModuleBridge(api: Record<string, unknown> = {}) {
  return configureModuleBridge(dnaModuleBridge, api, 'values');
}

export function getDnaModuleFunction<Name extends string>(name: Name) {
  const value = dnaModuleBridge[name];
  return typeof value === 'function' ? value as DnaBridgeFunction<Name> : null;
}

export function getDnaModuleValue(name: string, fallback: unknown = null) {
  return name in dnaModuleBridge ? dnaModuleBridge[name] : fallback;
}
