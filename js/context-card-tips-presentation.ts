import type { GeneticsData } from './dna-runtime.js';
import type { RecommendationCatalog, RecommendationSnpTable } from './recommendations-runtime.js';
import { findGenotypeInfo, findSnpHint } from './dna-genotype.js';
import { resolveSnpEvidenceProfile } from './dna-evidence.js';

const CARDS: Readonly<Record<string, { label: string; emoji: string }>> = {
  sleepRest: { label: 'Sleep & Rest', emoji: '😴' },
  lightCircadian: { label: 'Light & Circadian', emoji: '☀️' },
  environment: { label: 'Environment', emoji: '🌍' },
  exercise: { label: 'Exercise', emoji: '🏋️' },
  diet: { label: 'Diet & Digestion', emoji: '🥗' },
  stress: { label: 'Stress', emoji: '🧠' },
};
export interface ContextTipGeneticFinding {
  gene: string;
  genotype: string;
  text: string;
  avoid: boolean;
  evidence: string;
  relevance: string;
  study: string | null;
}
export interface ContextTipSection {
  label: string;
  actions: string[];
  forms: string[];
}
export interface ContextTipsView {
  label: string;
  emoji: string;
  genetics: ContextTipGeneticFinding[];
  sections: ContextTipSection[];
  environment: { text: string; action: string; event: string } | null;
}
export interface ContextTipsInput {
  cardKey: string;
  enabled: boolean;
  catalog: RecommendationCatalog | null | undefined;
  genetics?: GeneticsData | null | undefined;
  snpTable?: RecommendationSnpTable | null | undefined;
  assessments?: readonly { date: string }[] | null | undefined;
  now?: number;
}
export function contextTipsSlotKeys(catalog: ContextTipsInput['catalog'], cardKey: string): string[] {
  const card = Object.hasOwn(CARDS, cardKey) ? CARDS[cardKey] : undefined;
  if (!card || !catalog?.slots) return [];
  return Object.keys(catalog.slots).filter(key => catalog.slots[key]?.card === card.label);
}
function geneticFindings(input: ContextTipsInput): ContextTipGeneticFinding[] {
  if (!input.genetics?.snps || !input.snpTable) return [];
  const findings: ContextTipGeneticFinding[] = [];
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(input.genetics.snps)) {
    if (input.genetics.apoe && apoeRsids.has(rsid)) continue;
    const entry = input.snpTable[rsid];
    if (!entry?.snpHints || !entry.contextCards?.includes(input.cardKey) || !stored.genotype) continue;
    const hint = findSnpHint(entry, stored.genotype);
    if (!hint) continue;
    const info = findGenotypeInfo(entry, stored.genotype);
    if (info?.effect === 'none') continue;
    const profile = resolveSnpEvidenceProfile(entry, info);
    findings.push({
      gene: String(stored.gene ?? ''), genotype: stored.genotype, text: hint.text,
      avoid: hint.direction === 'avoid', evidence: profile.evidenceShortLabel,
      relevance: profile.relevanceShortLabel,
      study: hint.ref && /^https?:\/\//.test(hint.ref) ? hint.ref : null,
    });
  }
  return findings;
}
function environmentNudge(assessments: ContextTipsInput['assessments'], now: number): ContextTipsView['environment'] {
  if (!assessments?.length) return {
    text: "Want to measure your home's EMF environment?", action: 'Open the EMF assessment →',
    event: 'emf-nudge-env-tips-noassessment',
  };
  const latest = assessments.reduce((a, b) => a.date > b.date ? a : b);
  const ageDays = (now - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
  if (ageDays <= 120 || !Number.isFinite(ageDays)) return null;
  const months = Math.round(ageDays / 30);
  const age = months >= 12 ? 'over a year' : `${months} ${months === 1 ? 'month' : 'months'}`;
  return { text: `Your last EMF check was ${age} ago.`, action: 'Re-check the room →', event: 'emf-nudge-env-tips-stale' };
}
/** Typed text projection only; authored Svelte owns all escaping and markup. */
export function projectContextTips(input: ContextTipsInput): ContextTipsView | null {
  if (!input.enabled) return null;
  const keys = contextTipsSlotKeys(input.catalog, input.cardKey);
  if (!keys.length) return null;
  const card = CARDS[input.cardKey]!;
  const sections = keys.flatMap(key => {
    const slot = input.catalog!.slots[key]!;
    const actions = slot.freeActions || [], forms = slot.forms || [];
    return actions.length || forms.length ? [{ label: slot.label || key.split('.').pop() || key, actions: [...actions], forms: [...forms] }] : [];
  });
  const genetics = geneticFindings(input);
  const environment = input.cardKey === 'environment' ? environmentNudge(input.assessments, input.now ?? Date.now()) : null;
  return sections.length || genetics.length || environment ? { ...card, sections, genetics, environment } : null;
}
