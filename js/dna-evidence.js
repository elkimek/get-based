// @ts-check
// dna-evidence.js — privacy-safe study labels and public catalog feedback links.

import { findGenotypeInfo } from './dna-genotype.js';

const ISSUE_ENDPOINT = 'https://github.com/elkimek/get-based/issues/new';

export const SNP_EVIDENCE_LEVELS = Object.freeze({
  strong: Object.freeze({
    label: 'Strong / replicated',
    shortLabel: 'Strong',
    rank: 0,
    description: 'Replicated human evidence, a large meta-analysis or GWAS, or a well-established functional variant supporting the narrowly stated claim.',
  }),
  supported: Object.freeze({
    label: 'Supported',
    shortLabel: 'Supported',
    rank: 1,
    description: 'Credible human or functional evidence supports the claim, with meaningful population, design, or effect-size limitations.',
  }),
  mixed: Object.freeze({
    label: 'Mixed evidence',
    shortLabel: 'Mixed',
    rank: 2,
    description: 'Relevant studies disagree, or a functional signal has not produced a consistent human phenotype.',
  }),
  preliminary: Object.freeze({
    label: 'Preliminary',
    shortLabel: 'Preliminary',
    rank: 3,
    description: 'The claim relies on a small, single, ancestry-specific, or otherwise limited human study and needs replication.',
  }),
  mechanistic: Object.freeze({
    label: 'Mechanistic only',
    shortLabel: 'Mechanistic',
    rank: 4,
    description: 'Laboratory or molecular evidence supports a mechanism, but not a reliable personal health outcome.',
  }),
  unreviewed: Object.freeze({
    label: 'Not graded',
    shortLabel: 'Not graded',
    rank: 5,
    description: 'This catalog claim has not yet been assigned a structured evidence grade.',
  }),
});

export const SNP_RELEVANCE_LEVELS = Object.freeze({
  health_context: Object.freeze({
    label: 'Health / lab context',
    shortLabel: 'Health context',
    rank: 0,
    description: 'Interpret alongside biomarkers, symptoms, family history, medications, or professional guidance; genotype alone is not a diagnosis.',
  }),
  contextual: Object.freeze({
    label: 'Context-dependent',
    shortLabel: 'Context-dependent',
    rank: 1,
    description: 'Diet, exposure, behavior, ancestry, or environment materially changes the practical meaning.',
  }),
  trait: Object.freeze({
    label: 'Trait only',
    shortLabel: 'Trait only',
    rank: 2,
    description: 'Educational phenotype or biochemical context; no health action follows from the genotype alone.',
  }),
  unreviewed: Object.freeze({
    label: 'Relevance not graded',
    shortLabel: 'Not graded',
    rank: 3,
    description: 'This catalog claim has not yet been assigned a personal-relevance category.',
  }),
});

/**
 * Resolve entry-level evidence metadata with an optional genotype override.
 * Legacy or fixture entries remain renderable but are explicitly ungraded.
 * @param {any} entry
 * @param {any} genotypeInfo
 */
export function resolveSnpEvidenceProfile(entry = {}, genotypeInfo = {}) {
  const evidence = { ...(entry?.evidence || {}), ...(genotypeInfo?.evidence || {}) };
  const relevance = { ...(entry?.relevance || {}), ...(genotypeInfo?.relevance || {}) };
  const evidenceLevel = Object.hasOwn(SNP_EVIDENCE_LEVELS, evidence.level) ? evidence.level : 'unreviewed';
  const relevanceLevel = Object.hasOwn(SNP_RELEVANCE_LEVELS, relevance.level) ? relevance.level : 'unreviewed';
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

/** @param {string} effect @param {string} valence */
export function snpFindingPresentation(effect, valence) {
  if (valence === 'protective') return { label: 'protective association', shortLabel: 'protective', tone: 'protective', icon: '\uD83D\uDFE2', rank: 1 };
  if (valence === 'informational') return { label: 'informational trait', shortLabel: 'trait', tone: 'trait', icon: '\uD83D\uDD35', rank: 2 };
  if (valence === 'neutral') return { label: 'neutral finding', shortLabel: 'neutral', tone: 'neutral', icon: '\u26AA', rank: 3 };
  if (effect && effect !== 'none') return { label: 'risk association', shortLabel: 'risk', tone: 'risk', icon: '\uD83D\uDD34', rank: 0 };
  if (effect === 'none') return { label: 'reference finding', shortLabel: 'reference', tone: 'reference', icon: '\u26AA', rank: 4 };
  return { label: 'unclassified', shortLabel: 'unclassified', tone: 'unclassified', icon: '\u2753', rank: 5 };
}

/** @param {any} profile @param {any} presentation */
export function snpFindingRank(profile, presentation) {
  return (Number(presentation?.rank ?? 5) * 100)
    + (Number(profile?.relevanceRank ?? 3) * 10)
    + Number(profile?.evidenceRank ?? 5);
}

/**
 * Build a focused, editable Chat prompt for one imported SNP. This is created
 * only after an explicit Ask AI action; it is not added to every AI request.
 * The catalog is a grounded baseline, while the model remains free to add
 * clearly distinguished knowledge and inference.
 * @param {string} rsid
 * @param {any} stored
 * @param {any} entry
 */
export function buildSnpAIInterpretationPrompt(rsid, stored = {}, entry = {}) {
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

/** @param {string} reference */
export function dnaStudyReferenceLabel(reference) {
  const value = String(reference || '').trim();
  const pmid = value.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1];
  if (pmid) return `PubMed · PMID ${pmid}`;
  const pmc = value.match(/\/articles\/(PMC\d+)/i)?.[1];
  if (pmc) return `PubMed Central · ${pmc.toUpperCase()}`;
  const doi = value.match(/(?:doi\.org\/|^doi:\s*)(10\.\d{4,9}\/.+)/i)?.[1];
  if (doi) return `DOI · ${doi.replace(/\/$/, '')}`;
  return 'Published study';
}

function issueUrl(title, body, label) {
  const url = new URL(ISSUE_ENDPOINT);
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  url.searchParams.set('labels', label);
  return url.toString();
}

/**
 * Build a correction link from public catalog annotations only. The user's
 * genotype, source file, profile, labs, and notes are intentionally excluded.
 * @param {string} rsid
 * @param {any} entry
 */
export function snpEvidenceIssueUrl(rsid, entry = {}) {
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
  return issueUrl(`[Genome evidence] ${normalizedRsid}: study or annotation correction`, body, 'genome-evidence');
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
  return issueUrl('[Genome catalog] Suggest a SNP', body, 'genome-evidence');
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
  return issueUrl('[mtDNA evidence] Study or framework correction', body, 'genome-evidence');
}
