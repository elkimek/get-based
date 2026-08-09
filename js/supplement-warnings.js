// @ts-check
// supplement-warnings.js — claim-level mitochondrial evidence for tracked therapies

/** @type {Array<any> | null} */
let _mitoData = null;
/** @type {Promise<Array<any> | null> | null} */
let _mitoDataLoad = null;

function isVerifiedV2Entry(entry) {
  return Boolean(
    entry?.name
    && Array.isArray(entry.aliases)
    && entry.aliases.length
    && Array.isArray(entry.evidence)
    && entry.evidence.length
    && entry.evidence.every(item => (
      item?.id
      && ['adverse', 'mechanism', 'beneficial', 'mixed', 'null'].includes(item?.direction)
      && item?.summary
      && item?.studyType
      && item?.studyLabel
      && item?.model
      && item?.exposure
      && item?.limitations
      && Number.isInteger(Number(item?.pmid))
      && item?.title
    )),
  );
}

export function hasMitoCompoundData() {
  return Array.isArray(_mitoData);
}

export function preloadMitoCompoundData() {
  if (_mitoData) return Promise.resolve(_mitoData);
  if (!_mitoDataLoad) {
    _mitoDataLoad = fetch('data/mito-compounds.json')
      .then(async res => {
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data)) return null;
        const schemaVersion = data.find(entry => entry?._meta)?._meta?.schemaVersion;
        // Never render a stale v1 cache: its entry-level citations were not
        // sufficient to support each displayed claim.
        _mitoData = schemaVersion === 2 ? data.filter(isVerifiedV2Entry) : [];
        return _mitoData;
      })
      .catch(() => null)
      .finally(() => {
        _mitoDataLoad = null;
      });
  }
  return _mitoDataLoad;
}

function normalizeCompoundText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function candidateContainsAlias(candidate, alias) {
  const normalizedCandidate = normalizeCompoundText(candidate);
  const normalizedAlias = normalizeCompoundText(alias);
  if (!normalizedCandidate || !normalizedAlias) return false;
  if (normalizedCandidate === normalizedAlias) return true;
  // Short abbreviations such as NR and UA are exact-only to avoid matching
  // ordinary words or product codes.
  if (normalizedAlias.length < 3) return false;
  return ` ${normalizedCandidate} `.includes(` ${normalizedAlias} `);
}

/**
 * Return every verified compound found in a product/ingredient string.
 * Punctuation-aware token matching works with non-Latin text and avoids the
 * ASCII-only behavior of regular-expression word boundaries.
 */
export function lookupMitoCompounds(name) {
  if (!_mitoData) return [];
  return _mitoData.filter(entry => entry.aliases.some(alias => candidateContainsAlias(name, alias)));
}

/** Backwards-compatible singular lookup for existing callers. */
export function lookupMitoCompound(name) {
  return lookupMitoCompounds(name)[0] || null;
}

export function pubmedUrl(pmid) {
  return `https://pubmed.ncbi.nlm.nih.gov/${Number(pmid)}/`;
}

export function pubmedSearchUrl(searchTerms) {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(String(searchTerms || '').replace(/\+/g, ' '))}`;
}

/**
 * Build a public GitHub correction report from catalog data only. Tracked
 * product names, doses, schedules, notes, and other user data are intentionally
 * excluded from the issue body.
 */
export function mitochondrialEvidenceIssueUrl(item) {
  const compound = String(item?.compound || item?.name || 'Unknown compound').trim();
  const pmid = Number(item?.pmid);
  const sourceUrl = Number.isInteger(pmid) ? pubmedUrl(pmid) : 'PMID unavailable';
  const title = `[Mito evidence] ${compound}: study or claim correction`;
  const body = [
    '## Evidence currently shown',
    '',
    `**Compound:** ${compound}`,
    `**Evidence label:** ${String(item?.studyLabel || 'Not specified')}`,
    `**Evidence scope:** ${String(item?.scopeLabel || 'No additional scope label')}`,
    `**Current summary:** ${String(item?.summary || 'Not specified')}`,
    `**Study model:** ${String(item?.model || 'Not specified')}`,
    `**Exposure context:** ${String(item?.exposure || 'Not specified')}`,
    `**Current limitation:** ${String(item?.limitations || 'Not specified')}`,
    `**Primary study:** ${sourceUrl}${Number.isInteger(pmid) ? ` (PMID ${pmid})` : ''}`,
    '',
    '## What seems wrong or misleading?',
    '',
    '',
    '## Suggested correction or better primary study',
    '',
    '',
    '## Why is it a better fit?',
    '',
    '',
    '<!-- This is a public GitHub issue. Please do not include personal health information, medication doses, account details, or other private data. -->',
  ].join('\n');
  const issueUrl = new URL('https://github.com/elkimek/get-based/issues/new');
  issueUrl.searchParams.set('title', title);
  issueUrl.searchParams.set('body', body);
  issueUrl.searchParams.set('labels', 'mitochondrial-evidence');
  return issueUrl.toString();
}

const studyPriority = {
  human_trial: 0,
  human_observational: 1,
  human_intervention_mechanistic: 2,
  translational_preclinical: 3,
  human_cells: 4,
  animal_in_vivo: 5,
  isolated_tissue: 6,
  isolated_mitochondria: 7,
};

function evidencePriority(item) {
  return studyPriority[item.studyType] ?? 99;
}

function supplementCandidates(supplement) {
  const candidates = [
    { value: supplement?.genericName, field: 'generic name' },
    { value: supplement?.name, field: 'product name' },
    ...(Array.isArray(supplement?.ingredients)
      ? supplement.ingredients.map(ingredient => ({ value: ingredient?.name, field: 'active ingredient' }))
      : []),
  ];
  return candidates.filter(candidate => normalizeCompoundText(candidate.value));
}

/**
 * Scan tracked therapies for verified primary-study mitochondrial evidence.
 * The historical function name is retained for callers, but returned records
 * are evidence matches rather than clinical warnings.
 */
export function scanSupplementsForWarnings(supplements) {
  if (!Array.isArray(supplements) || supplements.length === 0) return [];
  if (!_mitoData) {
    void preloadMitoCompoundData();
    return [];
  }

  /** @type {Map<string, any>} */
  const matches = new Map();
  for (const supplement of supplements) {
    const productName = String(supplement?.name || 'Tracked item').trim();
    for (const candidate of supplementCandidates(supplement)) {
      for (const compound of lookupMitoCompounds(candidate.value)) {
        for (const evidence of compound.evidence) {
          const key = `${compound.name}:${evidence.id}`;
          const existing = matches.get(key);
          if (existing) {
            if (productName && !existing.productNames.includes(productName)) existing.productNames.push(productName);
            if (candidate.value && !existing.matchedTerms.includes(candidate.value)) existing.matchedTerms.push(candidate.value);
            continue;
          }
          matches.set(key, {
            type: 'mitochondrial-evidence',
            compound: compound.name,
            match: compound.name,
            category: compound.category,
            productNames: productName ? [productName] : [],
            matchedTerms: candidate.value ? [candidate.value] : [],
            matchedField: candidate.field,
            ...evidence,
            url: pubmedUrl(evidence.pmid),
            searchUrl: pubmedSearchUrl(`${compound.name} mitochondria`),
          });
        }
      }
    }
  }

  return [...matches.values()].sort((a, b) => (
    evidencePriority(a) - evidencePriority(b)
    || (a.direction === 'adverse' ? -1 : 0) - (b.direction === 'adverse' ? -1 : 0)
    || a.compound.localeCompare(b.compound)
  ));
}

export const scanSupplementsForMitochondrialEvidence = scanSupplementsForWarnings;

/**
 * Group claim-level evidence for display without merging the claims themselves.
 * A compound occupies one top-level row while every study retains its own
 * direction, scope, PMID, exposure, and limitation.
 */
export function groupMitochondrialEvidenceMatches(matches) {
  if (!Array.isArray(matches) || !matches.length) return [];
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const item of matches) {
    const compound = String(item?.compound || '').trim();
    if (!compound) continue;
    let group = groups.get(compound);
    if (!group) {
      group = {
        compound,
        category: item.category,
        productNames: [],
        matchedTerms: [],
        evidence: [],
      };
      groups.set(compound, group);
    }
    for (const productName of item.productNames || []) {
      if (productName && !group.productNames.includes(productName)) group.productNames.push(productName);
    }
    for (const matchedTerm of item.matchedTerms || []) {
      if (matchedTerm && !group.matchedTerms.includes(matchedTerm)) group.matchedTerms.push(matchedTerm);
    }
    if (!group.evidence.some(existing => existing.id === item.id)) group.evidence.push(item);
  }
  return [...groups.values()];
}

export function mitochondrialDirectionLabel(direction, studyType) {
  if (direction === 'null') return 'No effect detected';
  if (direction === 'mixed') return 'Mixed finding';
  if (direction === 'mechanism') return 'Mechanism, not harm';
  if (direction === 'beneficial') return 'Potential benefit';
  if (direction === 'adverse' && ['human_trial', 'human_observational'].includes(studyType)) {
    return 'Human caution signal';
  }
  return 'Adverse lab signal';
}

/**
 * Token-bounded, explicitly caveated context for the AI. Mechanistic evidence
 * is intentionally capped so it cannot crowd out the user's actual regimen.
 */
export function buildMitochondrialEvidenceContext(
  supplements,
  { maxItems = 4, maxEvidence = 6, maxChars = 1800 } = {},
) {
  const matches = scanSupplementsForWarnings(supplements);
  const groups = groupMitochondrialEvidenceMatches(matches);
  if (!groups.length || maxItems <= 0 || maxEvidence <= 0 || maxChars < 300) return '';

  const header = 'Mitochondrial primary-study matches (evidence summaries, not personalized clinical conclusions):\n';
  const guardrail = 'Interpretation constraint: the catalog is deliberately incomplete, so no match is not evidence of no effect. Treat cell, animal, tissue, and isolated-mitochondria findings as mechanistic only. Do not infer benefit or harm at the user\'s dose, and do not advise stopping prescription medication from these matches.\n';
  const selectedGroups = [];
  let selectedEvidenceCount = 0;
  for (const group of groups.slice(0, maxItems)) {
    const available = maxEvidence - selectedEvidenceCount;
    if (available <= 0) break;
    const evidence = group.evidence.slice(0, available);
    if (!evidence.length) break;
    selectedGroups.push({ ...group, evidence });
    selectedEvidenceCount += evidence.length;
  }

  const renderContext = () => {
    const blocks = selectedGroups.map(group => {
      const products = group.productNames.length ? `; tracked as ${group.productNames.join(', ')}` : '';
      if (group.evidence.length === 1) {
        const item = group.evidence[0];
        const scope = item.scopeLabel ? `; scope: ${item.scopeLabel}` : '';
        return `- ${group.compound} [${item.studyLabel}; ${mitochondrialDirectionLabel(item.direction, item.studyType)}${scope}${products}]: ${item.summary} Exposure: ${item.exposure} Limitation: ${item.limitations} PMID ${item.pmid}.\n`;
      }
      const studies = group.evidence.map(item => {
        const scope = item.scopeLabel ? `; scope: ${item.scopeLabel}` : '';
        return `  - [${item.studyLabel}; ${mitochondrialDirectionLabel(item.direction, item.studyType)}${scope}]: ${item.summary} Exposure: ${item.exposure} Limitation: ${item.limitations} PMID ${item.pmid}.\n`;
      }).join('');
      return `- ${group.compound} (${group.evidence.length} scoped studies${products}):\n${studies}`;
    });
    const includedEvidence = selectedGroups.reduce((sum, group) => sum + group.evidence.length, 0);
    const omittedEvidence = matches.length - includedEvidence;
    const omittedGroups = groups.length - selectedGroups.length;
    const omission = omittedEvidence > 0
      ? `- +${omittedEvidence} additional verified evidence record(s) across ${Math.max(omittedGroups, 1)} compound group(s) omitted to bound context.\n`
      : '';
    return `${header}${blocks.join('')}${omission}${guardrail}`;
  };

  while (selectedGroups.length && renderContext().length > maxChars) {
    const lastGroup = selectedGroups[selectedGroups.length - 1];
    lastGroup.evidence.pop();
    if (!lastGroup.evidence.length) selectedGroups.pop();
  }
  return selectedGroups.length ? renderContext() : '';
}

/** Retained for compatibility with any older renderers. */
export function humanizeEffect(effect, { showContext = false } = {}) {
  if (effect?.summary) return effect.summary;
  const action = String(effect?.a || 'affects');
  const target = String(effect?.f || 'mitochondrial function');
  const context = showContext && effect?.t ? ` (${effect.t})` : '';
  return `may ${action.replace(/s$/u, '')} ${target}${context}`;
}
