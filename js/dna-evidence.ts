import type { GenotypeEntry } from './dna-genotype.js';

interface EvidenceAnnotation { level?: string | null; claimTypes?: unknown; scope?: unknown; reviewedAt?: unknown }
interface RelevanceAnnotation { level?: string | null; context?: unknown }
export interface SnpAnnotation {
  evidence?: EvidenceAnnotation | null | undefined; relevance?: RelevanceAnnotation | null | undefined;
  gene?: unknown; variant?: unknown; genotype?: unknown; note?: unknown;
  effect?: string | null | undefined; valence?: string | null | undefined;
  references?: unknown; category?: unknown; strandNote?: unknown;
  [field: string]: unknown;
}
export interface SnpCatalogEntry extends SnpAnnotation, GenotypeEntry<SnpAnnotation> {
  category?: string | null; markers?: string[] | null; references?: string[] | null;
}
export type SnpCatalog = Record<string, SnpCatalogEntry>;

// dna-evidence.ts — privacy-safe study labels and public catalog feedback links.

import { findGenotypeInfo } from './dna-genotype.js';

let catalog: SnpCatalog | null = null;
let catalogPromise: Promise<SnpCatalog> | null = null;
export function getCachedSnpCatalog() { return catalog; }
export function loadSnpCatalog({ forceFresh = false } = {}) {
  if (forceFresh) { catalog = null; catalogPromise = null; }
  if (catalog) return Promise.resolve(catalog);
  if (!catalogPromise) {
    const pending: Promise<SnpCatalog> = fetch('data/snp-health.json', forceFresh ? { cache: 'no-store' } : undefined)
      .then(response => { if (!response.ok) throw new Error('Genome catalog unavailable'); return response.json(); })
      .then(data => {
        if (!data || !Object.keys(data).some(key => /^rs/.test(key) && data[key]?.genotypes)) throw new Error('Invalid Genome catalog');
        if (catalogPromise === pending) catalog = data;
        return data;
      }).catch(error => { if (catalogPromise === pending) catalogPromise = null; throw error; });
    catalogPromise = pending;
  }
  return catalogPromise;
}

export const SNP_CATEGORY_LABELS = {
  methylation: 'Methylation',
  iron: 'Iron',
  lipids: 'Lipids',
  vitaminD: 'Vitamin D',
  vitaminB12: 'Vitamin B12',
  bilirubin: 'Bilirubin',
  thyroid: 'Thyroid',
  fattyAcids: 'Fatty Acids',
  bloodSugar: 'Blood Sugar',
  sexHormones: 'Sex Hormones',
  alcohol: 'Alcohol',
  caffeine: 'Caffeine',
  bodyComposition: 'Body Composition',
  neurotransmitters: 'Neurotransmitter Metabolism',
  performance: 'Exercise Traits',
  digestion: 'Digestion',
  vitaminA: 'Vitamin A',
  skin: 'Skin & Sun',
  other: 'Other'
};

export function getSnpCategoryLabel(category: unknown) {
  if (!category) return SNP_CATEGORY_LABELS.other;
  return SNP_CATEGORY_LABELS[category as keyof typeof SNP_CATEGORY_LABELS] || String(category);
}

const ISSUE_ENDPOINT = 'https://github.com/elkimek/get-based/issues/new';

// Evidence strength and personal relevance use the same immutable display fields.
function gradedLabel(label: string, shortLabel: string, rank: number, description: string) {
  return Object.freeze({ label, shortLabel, rank, description });
}

export const SNP_EVIDENCE_LEVELS = Object.freeze({
  strong: gradedLabel('Strong / replicated', 'Strong', 0,
    'Replicated human evidence, a large meta-analysis or GWAS, or a well-established functional variant supporting the narrowly stated claim.'),
  supported: gradedLabel('Supported', 'Supported', 1,
    'Credible human or functional evidence supports the claim, with meaningful population, design, or effect-size limitations.'),
  mixed: gradedLabel('Mixed evidence', 'Mixed', 2,
    'Relevant studies disagree, or a functional signal has not produced a consistent human phenotype.'),
  preliminary: gradedLabel('Preliminary', 'Preliminary', 3,
    'The claim relies on a small, single, ancestry-specific, or otherwise limited human study and needs replication.'),
  mechanistic: gradedLabel('Mechanistic only', 'Mechanistic', 4,
    'Laboratory or molecular evidence supports a mechanism, but not a reliable personal health outcome.'),
  unreviewed: gradedLabel('Not graded', 'Not graded', 5,
    'This catalog claim has not yet been assigned a structured evidence grade.'),
});

export const SNP_RELEVANCE_LEVELS = Object.freeze({
  health_context: gradedLabel('Health / lab context', 'Health context', 0,
    'Interpret alongside biomarkers, symptoms, family history, medications, or professional guidance; genotype alone is not a diagnosis.'),
  contextual: gradedLabel('Context-dependent', 'Context-dependent', 1,
    'Diet, exposure, behavior, ancestry, or environment materially changes the practical meaning.'),
  trait: gradedLabel('Trait only', 'Trait only', 2,
    'Educational phenotype or biochemical context; no health action follows from the genotype alone.'),
  unreviewed: gradedLabel('Relevance not graded', 'Not graded', 3,
    'This catalog claim has not yet been assigned a personal-relevance category.'),
});

/**
 * Resolve entry-level evidence metadata with an optional genotype override.
 * Legacy or fixture entries remain renderable but are explicitly ungraded.
 */
export function resolveSnpEvidenceProfile(entry: SnpAnnotation | null = {}, genotypeInfo: SnpAnnotation | null = {}) {
  const evidence = { ...(entry?.evidence || {}), ...(genotypeInfo?.evidence || {}) };
  const relevance = { ...(entry?.relevance || {}), ...(genotypeInfo?.relevance || {}) };
  const evidenceLevel = Object.hasOwn(SNP_EVIDENCE_LEVELS, evidence.level as string) ? evidence.level as keyof typeof SNP_EVIDENCE_LEVELS : 'unreviewed';
  const relevanceLevel = Object.hasOwn(SNP_RELEVANCE_LEVELS, relevance.level as string) ? relevance.level as keyof typeof SNP_RELEVANCE_LEVELS : 'unreviewed';
  return {
    evidenceLevel,
    evidenceLabel: SNP_EVIDENCE_LEVELS[evidenceLevel].label,
    evidenceShortLabel: SNP_EVIDENCE_LEVELS[evidenceLevel].shortLabel,
    evidenceDescription: SNP_EVIDENCE_LEVELS[evidenceLevel].description,
    evidenceRank: SNP_EVIDENCE_LEVELS[evidenceLevel].rank,
    relevanceLevel,
    relevanceLabel: SNP_RELEVANCE_LEVELS[relevanceLevel].label,
    relevanceShortLabel: SNP_RELEVANCE_LEVELS[relevanceLevel].shortLabel,
    relevanceDescription: SNP_RELEVANCE_LEVELS[relevanceLevel].description,
    relevanceRank: SNP_RELEVANCE_LEVELS[relevanceLevel].rank,
    claimTypes: Array.isArray(evidence.claimTypes) ? evidence.claimTypes.filter(Boolean) : [],
    scope: String(evidence.scope || '').trim(),
    context: String(relevance.context || '').trim(),
    reviewedAt: String(evidence.reviewedAt || '').trim(),
  };
}

export function snpFindingPresentation(effect: string | null | undefined, valence: string | null | undefined) {
  if (valence === 'protective') return { label: 'protective association', shortLabel: 'protective', tone: 'protective', icon: '\uD83D\uDFE2', rank: 1 };
  if (valence === 'informational') return { label: 'informational trait', shortLabel: 'trait', tone: 'trait', icon: '\uD83D\uDD35', rank: 2 };
  if (valence === 'neutral') return { label: 'neutral finding', shortLabel: 'neutral', tone: 'neutral', icon: '\u26AA', rank: 3 };
  if (effect && effect !== 'none') return { label: 'risk association', shortLabel: 'risk', tone: 'risk', icon: '\uD83D\uDD34', rank: 0 };
  if (effect === 'none') return { label: 'reference finding', shortLabel: 'reference', tone: 'reference', icon: '\u26AA', rank: 4 };
  return { label: 'unclassified', shortLabel: 'unclassified', tone: 'unclassified', icon: '\u2753', rank: 5 };
}

export function snpFindingRank(profile: { relevanceRank?: unknown; evidenceRank?: unknown } | null | undefined, presentation: { rank?: unknown } | null | undefined) {
  return (Number(presentation?.rank ?? 5) * 100)
    + (Number(profile?.relevanceRank ?? 3) * 10)
    + Number(profile?.evidenceRank ?? 5);
}

/**
 * Build a focused, editable Chat prompt for one imported SNP. This is created
 * only after an explicit Ask AI action; it is not added to every AI request.
 * The catalog is a grounded baseline, while the model remains free to add
 * clearly distinguished knowledge and inference.
 */
export function buildSnpAIInterpretationPrompt(rsid: unknown, stored: SnpAnnotation | null = {}, entry: SnpCatalogEntry | null = {}) {
  const normalizedRsid = String(rsid || '').trim().toLowerCase();
  const genotype = String(stored?.genotype || '').trim().toUpperCase();
  if (!normalizedRsid || !genotype) return '';

  const genotypeInfo = findGenotypeInfo(entry, genotype) || stored;
  const gene = String(stored?.gene || entry?.gene || normalizedRsid).trim();
  const variant = String(stored?.variant || entry?.variant || '').trim();
  const name = [gene, variant, `(${normalizedRsid})`].filter(Boolean).join(' ');
  const presentation = snpFindingPresentation(genotypeInfo?.effect || stored?.effect, genotypeInfo?.valence || stored?.valence);
  const profile = resolveSnpEvidenceProfile(entry || stored, genotypeInfo || stored);
  const baseline = [
    presentation.label,
    genotypeInfo?.note ? String(genotypeInfo.note).trim() : '',
    `Evidence: ${profile.evidenceLabel}`,
    `Relevance: ${profile.relevanceLabel}`,
    profile.scope ? `Supported claim: ${profile.scope}` : '',
    profile.context ? `Interpretation context: ${profile.context}` : '',
  ].filter(Boolean).join('. ');

  return `Help me interpret my ${name} result in the context of the rest of my available profile. Imported genotype: ${genotype}. Curated app baseline: ${baseline}. You may use broader relevant knowledge beyond this catalog; distinguish established evidence from plausible inference, explain what additional personal data would materially change the interpretation, and do not treat this SNP alone as diagnostic.`;
}

export function dnaStudyReferenceLabel(reference: unknown) {
  const value = String(reference || '').trim();
  const pmid = value.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1];
  if (pmid) return `PubMed · PMID ${pmid}`;
  const pmc = value.match(/\/articles\/(PMC\d+)/i)?.[1];
  if (pmc) return `PubMed Central · ${pmc.toUpperCase()}`;
  const doi = value.match(/(?:doi\.org\/|^doi:\s*)(10\.\d{4,9}\/.+)/i)?.[1];
  if (doi) return `DOI · ${doi.replace(/\/$/, '')}`;
  return 'Published study';
}

function issueUrl(title: string, body: string, label: string) {
  const url = new URL(ISSUE_ENDPOINT);
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  url.searchParams.set('labels', label);
  return url.toString();
}

/**
 * Build a correction link from public catalog annotations only. The user's
 * genotype, source file, profile, labs, and notes are intentionally excluded.
 */
export function snpEvidenceIssueUrl(rsid: unknown, entry: SnpAnnotation | null = {}) {
  const normalizedRsid = String(rsid || 'unknown rsID').trim().toLowerCase();
  const references = Array.isArray(entry?.references) ? entry.references : [];
  const profile = resolveSnpEvidenceProfile(entry);
  const body = [
    '## Catalog entry',
    '',
    `**rsID:** ${normalizedRsid}`,
    `**Gene:** ${String(entry?.gene || 'Not specified')}`,
    `**Variant:** ${String(entry?.variant || 'Not specified')}`,
    `**Category:** ${String(entry?.category || 'Not specified')}`,
    `**Evidence grade:** ${profile.evidenceLabel}`,
    `**Personal relevance:** ${profile.relevanceLabel}`,
    `**Scoped claim:** ${profile.scope || 'Not specified'}`,
    `**Current strand note:** ${String(entry?.strandNote || 'Not specified')}`,
    '**Current references:**',
    ...(references.length ? references.map(reference => `- ${String(reference)}`) : ['- None listed']),
    '',
    '## What seems wrong, incomplete, or misleading?',
    '',
    '',
    '## Suggested correction or primary study',
    '',
    '',
    '## Why should it change the catalog?',
    '',
    '',
    '<!-- This is a public GitHub issue. Do not include your genotype, raw DNA, health data, account details, or other private information. -->',
  ].join('\n');
  return issueUrl(`[Genome evidence] ${normalizedRsid}: study or annotation correction`, body, 'enhancement');
}

export function newSnpSuggestionIssueUrl() {
  const body = [
    '## SNP proposed for the wellness catalog',
    '',
    '**rsID:**',
    '**Gene / variant:**',
    '**Wellness relevance:**',
    '',
    '## Best primary or authoritative evidence',
    '',
    '- PMID / DOI / ClinVar link:',
    '- Study population and model:',
    '- What the study supports:',
    '- Proposed evidence grade: strong / supported / mixed / preliminary / mechanistic only',
    '- Proposed personal relevance: health or lab context / context-dependent / trait only',
    '- Important ancestry or interpretation limits:',
    '',
    '## Suggested genotype wording',
    '',
    '',
    '<!-- This is a public GitHub issue. Propose a catalog SNP, but do not include your own genotype, raw DNA, health data, account details, or other private information. -->',
  ].join('\n');
  return issueUrl('[Genome catalog] Suggest a SNP', body, 'enhancement');
}

export function mtdnaEvidenceIssueUrl() {
  const body = [
    '## mtDNA framework or study area',
    '',
    '**Topic:** haplogroup assignment / Wallace coupling lens / climate matching / study summary / other',
    '',
    '## What seems wrong, incomplete, or misleading?',
    '',
    '',
    '## Suggested correction or primary study',
    '',
    '- PMID / DOI:',
    '- Study population or model:',
    '- What it supports:',
    '- What it does not establish:',
    '',
    '<!-- This is a public GitHub issue. Do not include your haplogroup, mtDNA markers, raw DNA, location, health data, account details, or other private information. -->',
  ].join('\n');
  return issueUrl('[mtDNA evidence] Study or framework correction', body, 'enhancement');
}
