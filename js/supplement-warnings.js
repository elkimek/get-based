// @ts-check
// supplement-warnings.js — Mitochondrial effects warnings for supplements & drugs
//
// The compound database (data/mito-compounds.json) is independently compiled
// by the getbased project from primary published literature. Each entry includes
// a PubMed ID (PMID) linking to the source study. This is NOT derived from
// MitoTox or any third-party database.

// ── Lazy-loaded compound data ──
let _mitoData = null;
let _mitoLoading = false;

async function _loadMitoData() {
  if (_mitoData) return _mitoData;
  if (_mitoLoading) return null;
  _mitoLoading = true;
  try {
    const res = await fetch('data/mito-compounds.json');
    if (!res.ok) return null;
    _mitoData = await res.json();
    return _mitoData;
  } catch { return null; }
  finally { _mitoLoading = false; }
}

// Preload on import (fire-and-forget, silent fail if file missing)
_loadMitoData();

/**
 * Look up a compound in the mito database by name.
 * Returns { name, k, cat, effects: [{ f, a, t }], pmid, more } or null.
 */
export function lookupMitoCompound(name) {
  if (!_mitoData) return null;
  const q = name.toLowerCase().trim();
  if (q.length < 3) return null;
  // Exact keyword match first
  let match = _mitoData.find(e => e.k?.some(k => k === q));
  // Word-boundary match — both query and keyword must be 4+ chars
  if (!match) match = _mitoData.find(e => e.k?.some(k => {
    if (k.length < 4 || q.length < 4) return false;
    const re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return re.test(q);
  }));
  return match || null;
}

/**
 * Build PubMed URL for a specific PMID.
 */
export function pubmedUrl(pmid) {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

/**
 * Build PubMed search URL for more studies.
 */
export function pubmedSearchUrl(searchTerms) {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(searchTerms.replace(/\+/g, ' '))}`;
}

// Actions that indicate mitochondrial harm
const _harmfulActions = new Set([
  'inhibits', 'depletes', 'disrupts', 'uncouples', 'damages',
  'opens', 'induces', 'impairs', 'crosslinks', 'redox cycles',
]);
// Context-dependent actions: harmful only when targeting something bad
const _harmfulTargetsForIncreases = ['ROS', 'apoptosis', 'Lactic acidosis'];
const _harmfulTargetsForDecreases = ['Membrane potential'];

function _isHarmfulEffect(e) {
  if (_harmfulActions.has(e.a)) return true;
  if (e.a === 'increases' && _harmfulTargetsForIncreases.some(t => e.f.includes(t))) return true;
  if (e.a === 'decreases' && _harmfulTargetsForDecreases.some(t => e.f.includes(t))) return true;
  return false;
}

/**
 * Scan supplements array for mitochondrial HARM warnings.
 * Only flags compounds with harmful effects (inhibits, depletes, etc.).
 * Protective supplements (enhances, replenishes, cofactor) are not flagged.
 * Returns array of { type, warning, source, url, searchUrl, match, effects, pmid }
 */
export function scanSupplementsForWarnings(supplements) {
  if (!supplements || supplements.length === 0) return [];
  if (!_mitoData) return [];
  const warnings = [];
  const seen = new Set();

  for (const s of supplements) {
    const hit = lookupMitoCompound(s.name);
    if (!hit || !hit.effects.length) continue;
    if (seen.has(hit.name)) continue;

    const harmfulEffects = hit.effects.filter(e => _isHarmfulEffect(e));
    if (harmfulEffects.length === 0) continue;

    seen.add(hit.name);
    const topEffects = harmfulEffects.slice(0, 3).map(e => {
      const action = e.a || 'affects';
      const target = e.t ? ` (${e.t})` : '';
      return `${action} ${e.f}${target}`;
    }).join('; ');

    warnings.push({
      type: 'mitochondrial',
      warning: `${hit.name}: ${topEffects}`,
      source: 'PubMed',
      url: pubmedUrl(hit.pmid),
      searchUrl: pubmedSearchUrl(hit.more),
      match: s.name,
      effects: harmfulEffects,
      pmid: hit.pmid,
    });
  }

  return warnings;
}

/**
 * Humanize an effect for display: "may increase Complex I activity"
 */
const _verbMap = {
  inhibits: 'may inhibit', depletes: 'may deplete', activates: 'may activate',
  increases: 'may increase', decreases: 'may decrease', enhances: 'may enhance',
  induces: 'may induce', disrupts: 'may disrupt', damages: 'may damage',
  impairs: 'may impair', improves: 'may improve', uncouples: 'may uncouple',
  opens: 'may open', promotes: 'may promote', binds: 'binds',
  crosslinks: 'may crosslink', replenishes: 'replenishes', cofactor: 'is a cofactor for',
  'prevents opening': 'may prevent opening', 'redox cycles': 'may redox-cycle',
  modulates: 'may modulate', stabilizes: 'may stabilize',
};

export function humanizeEffect(effect, { showContext = false } = {}) {
  const action = effect.a || 'affects';
  const verb = _verbMap[action] || `may ${action.replace(/s$/, '')}`;
  const ctx = showContext && effect.t ? ` (${effect.t})` : '';
  return `${verb} ${effect.f}${ctx}`;
}
