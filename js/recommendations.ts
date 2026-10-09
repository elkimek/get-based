import { renderHTML as renderTipsSectionHTML } from './components/TipsSection.svelte.html.js';
import { tipsText, type TipsSectionView, type TipsGeneticsView, type TipsTierView, type TipsTierItem } from './tips-presentation.js';
import { renderHTML as renderContextTipsHTML } from './components/ContextCardTips.svelte.html.js';
import { contextTipsSlotKeys, projectContextTips } from './context-card-tips-presentation.js';
import type { GeneticsData } from './dna-runtime.js';
import type { WearableMetricSummary } from './wearables-summary-model.js';
import type { RecommendationCatalog, RecommendationSectionOptions } from './recommendations-runtime.js';

export interface RecommendationDNAHint {
  rsid?: string;
  gene: unknown;
  variant?: unknown;
  genotype: string;
  direction: string;
  text: string;
  ref?: string | undefined;
  evidenceProfile: ReturnType<typeof resolveSnpEvidenceProfile>;
}
type WearableTrendMetric = Pick<Partial<WearableMetricSummary>, 'baseline' | 'baselineP25' | 'baselineP75'> & {
  rolling?: Partial<WearableMetricSummary['rolling']> | null;
};
interface WearableTrendInput { metrics?: Record<string, WearableTrendMetric | null | undefined> | null }
interface EmfAssessmentSnapshot { assessments?: Array<{ date: string }> | null }

// recommendations.js — Catalog loading, DNA hints, section rendering, and recommendation detectors

import { state } from './state.js';
import { findGenotypeInfo, findSnpHint } from './dna-genotype.js';
import { resolveSnpEvidenceProfile, snpFindingPresentation } from './dna-evidence.js';
import {
  closeRecommendationsModal,
  configureRecommendationModuleBridge,
  getRecommendationsSnpTable,
  openRecommendationsEmfAssessment,
  openRecommendationsLocationEditor,
  openRecommendationsPrivacySettings,
  scheduleRecommendationsTask,
  setRecommendationsCatalogCache,
} from './recommendations-runtime.js';
import {
  _addUTMParams,
  _pickRegional,
  _resolveCouponForRegion,
  _resolveHomepageForRegion,
  _resolveProductUrlForRegion,
  _resolveVendorForCoupon,
  getProductRowView,
  getCouponLineView,
  getDisclosureFooterView,
  copyCouponCode,
  getEMFMeters,
  getEMFProductsForMitigations,
  getLightDeviceProduct,
  getProductsForSlot,
  getUserRegion,
  hasSeenDisclosure,
  isProductRecsEnabled,
  markDisclosureSeen,
  recActionAttrs,
  recommendDeviceProductsForChannelDeficit,
  regionLabel,
  regionLookupChain,
  renderChannelDeficitDeviceRecs,
  renderEMFMitigationRecs,
  renderEMFMeterRecs,
  renderLightDeviceAffiliateRow,
  getLightDeviceAffiliateView,
  setProductRecsEnabled,
} from './recommendations-products.js';

export {
  _addUTMParams,
  _pickRegional,
  _resolveCouponForRegion,
  _resolveHomepageForRegion,
  _resolveProductUrlForRegion,
  copyCouponCode,
  getEMFMeters,
  getEMFProductsForMitigations,
  getLightDeviceProduct,
  getProductsForSlot,
  getUserRegion,
  hasSeenDisclosure,
  isProductRecsEnabled,
  markDisclosureSeen,
  markDisclosureSeen as markRecDisclosureSeen,
  recActionAttrs,
  recommendDeviceProductsForChannelDeficit,
  regionLabel,
  regionLookupChain,
  renderChannelDeficitDeviceRecs,
  renderEMFMitigationRecs,
  renderEMFMeterRecs,
  renderLightDeviceAffiliateRow,
  getLightDeviceAffiliateView,
  setProductRecsEnabled,
};

// ═══════════════════════════════════════════════
// CATALOG CACHE
// ═══════════════════════════════════════════════
let _catalog: RecommendationCatalog | null | undefined = undefined; // undefined = not loaded, null = load failed
let _catalogPromise: Promise<RecommendationCatalog | null> | null = null; // deduplicates concurrent loads
let _recommendationDelegatesInstalled = false;

function handleRecommendationSectionGuardClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const guardedSection = target.closest('[data-rec-section-click-guard]');
  if (guardedSection && !target.closest('a,button')) event.stopPropagation();
}

function handleRecommendationActionClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = target.closest('[data-rec-action]') as HTMLElement | null;
  if (!actionEl) return;
  const action = actionEl.dataset.recAction || '';

  if (action === 'copy-coupon') {
    event.preventDefault();
    copyCouponCode(actionEl);
  } else if (action === 'close-modal') {
    event.preventDefault();
    closeRecommendationsModal();
  } else if (action === 'open-emf-assessment') {
    event.preventDefault();
    closeRecommendationsModal();
    scheduleRecommendationsTask(openRecommendationsEmfAssessment, 100);
  } else if (action === 'edit-region') {
    event.preventDefault();
    openRecommendationsLocationEditor();
  } else if (action === 'accept-disclosure') {
    event.preventDefault();
    event.stopPropagation();
    markDisclosureSeen();
    actionEl.closest('.rec-disclosure-banner')?.remove();
    for (const el of document.querySelectorAll('.rec-section-gated')) el.classList.remove('rec-section-gated');
  } else if (action === 'open-privacy-settings') {
    event.preventDefault();
    openRecommendationsPrivacySettings();
  }
}

export function initRecommendationDelegates() {
  if (_recommendationDelegatesInstalled) return;
  document.addEventListener('click', handleRecommendationActionClick, true);
  document.addEventListener('click', handleRecommendationSectionGuardClick);
  _recommendationDelegatesInstalled = true;
}

export async function loadCatalog() {
  if (_catalog !== undefined) {
    setRecommendationsCatalogCache(_catalog);
    return _catalog;
  }
  if (_catalogPromise) return _catalogPromise;
  _catalogPromise = (async () => {
    try {
      const res = await fetch('data/recommendations.json');
      if (!res.ok) {
        _catalog = null;
        setRecommendationsCatalogCache(null);
        return null;
      }
      _catalog = await res.json() as RecommendationCatalog | null;
      setRecommendationsCatalogCache(_catalog);
      return _catalog;
    } catch {
      _catalog = null;
      setRecommendationsCatalogCache(null);
      return null;
    } finally {
      _catalogPromise = null;
    }
  })();
  return _catalogPromise;
}

// ═══════════════════════════════════════════════
// EMF PRODUCT RESOLVERS — read from the unified recommendations catalog
// (data/recommendations.json). The EMF panel and nudges still render
// through their own specialized helpers below — but the source of truth is
// the same catalog used for every other affiliate. emf-products.json is gone.
// ═══════════════════════════════════════════════

// Backward-compat alias: callers historically called loadEMFCatalog before
// the consolidation. Now it just hands back the unified catalog so existing
// call sites keep working without churn.
export async function loadEMFCatalog() {
  return loadCatalog();
}

// ═══════════════════════════════════════════════
// CARD TIPS — lifestyle slots for context cards
// ═══════════════════════════════════════════════
export function getCardSlotKeys(cardKey: string) {
  return contextTipsSlotKeys(_catalog, cardKey);
}

export function renderCardTipsModal(cardKey: string) {
  const view = projectContextTips({
    cardKey, enabled: isProductRecsEnabled(), catalog: _catalog,
    genetics: state.importedData?.genetics as GeneticsData | null | undefined,
    snpTable: getRecommendationsSnpTable(),
    assessments: (state.importedData?.emfAssessment as EmfAssessmentSnapshot | null | undefined)?.assessments,
  });
  return view ? renderContextTipsHTML({ view }) : '';
}

// ═══════════════════════════════════════════════
// DNA HINTS — connect genetics to recommendations
// ═══════════════════════════════════════════════

export function buildDNAHints(slotKey: string) {
  const genetics = state.importedData?.genetics as GeneticsData | null | undefined;
  if (!genetics || !genetics.snps) return [];
  const snpTable = getRecommendationsSnpTable();
  if (!snpTable) return [];

  const hints: RecommendationDNAHint[] = [];

  // APOE haplotype — special handling
  if (genetics.apoe && slotKey === 'lipids.ldl') {
    const hap = genetics.apoe;
    if (hap.includes('\u03B54')) {
      const apoeEntry = snpTable.rs429358 || snpTable.rs7412 || {};
      const evidenceProfile = resolveSnpEvidenceProfile(apoeEntry);
      hints.push({
        gene: 'APOE', variant: hap, genotype: hap, direction: 'form',
        text: `Your APOE ${hap} is health context, not a genotype-specific diet prescription. Use measured LDL, ApoB, and personal or family context to evaluate your response to dietary changes.`,
        ref: 'https://pubmed.ncbi.nlm.nih.gov/8346443/',
        evidenceProfile,
      });
    }
  }

  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps)) {
    if (genetics.apoe && apoeRsids.has(rsid)) continue;
    const entry = snpTable[rsid];
    if (!entry || !entry.snpHints) continue;

    const g = stored.genotype;
    if (!g) continue;
    const hint = findSnpHint(entry, g);
    if (!hint || hint.slotKey !== slotKey) continue;

    // Skip if genotype effect is "none"
    const info = findGenotypeInfo(entry, g);
    if (info && info.effect === 'none') continue;

    hints.push({
      rsid, gene: stored.gene, variant: stored.variant, genotype: g,
      direction: hint.direction, text: hint.text, ref: hint.ref,
      evidenceProfile: resolveSnpEvidenceProfile(entry, info),
    });
  }

  return hints;
}

// ═══════════════════════════════════════════════
// HTML RENDERING
// ═══════════════════════════════════════════════
// Sync core — builds HTML from cached catalog, no promises
function getRecommendationSectionViewCore(slotKey: string, opts: RecommendationSectionOptions = {}): TipsSectionView | null {
  const slot = _catalog?.slots?.[slotKey];
  const hasInlineSNPs = opts.inlineSNPs?.length! > 0;
  if (!slot && !hasInlineSNPs) return null;

  const label = opts.label || 'What can help';
  const maxProducts = opts.maxProducts || 3;
  const region = getUserRegion();
  const products = slot ? getProductsForSlot(_catalog, slotKey, region) : [];

  const isNormal = opts.markerStatus === 'normal';
  const knownTypes = ['food', 'supplement', 'product', 'drug'];
  const foodProducts = products.filter(p => p.type === 'food').slice(0, maxProducts);
  const toolProducts = products.filter(p => p.type === 'product').slice(0, maxProducts);
  const suppProducts = products.filter(p => p.type === 'supplement').slice(0, maxProducts);
  const drugProducts = products.filter(p => p.type === 'drug').slice(0, maxProducts);
  const otherProducts = products.filter(p => !knownTypes.includes(p.type as string)).slice(0, maxProducts);

  const genetics: TipsGeneticsView[] = [];
  const tiers: TipsTierView[] = [];
  let dnaHints = buildDNAHints(slotKey);
  const inlineSNPs = opts.inlineSNPs || [];
  if (inlineSNPs.length > 0 && dnaHints.length > 0) {
    const inlineRsids = new Set(inlineSNPs.map(s => s.rsid).filter(Boolean));
    dnaHints = dnaHints.filter(h => !h.rsid || !inlineRsids.has(h.rsid));
  }
  if (dnaHints.length > 0 || inlineSNPs.length > 0) {
    for (const s of inlineSNPs) {
      const presentation = s.presentation || snpFindingPresentation(s.effect, s.valence);
      const profile = s.evidenceProfile || resolveSnpEvidenceProfile(s, s);
      const icon = presentation.icon;
      const refLink = s.references?.[0] && /^https?:/.test(s.references[0]) ? s.references[0] : null;
      const moreLink = s.rsid ? `https://www.snpedia.com/index.php/${s.rsid.charAt(0).toUpperCase() + s.rsid.slice(1)}` : null;
      genetics.push({kind: 'finding', icon: tipsText(icon), gene: tipsText(s.gene), variant: tipsText(s.variant),
        genotype: tipsText(s.genotype), note: tipsText(s.note), evidence: tipsText(profile.evidenceShortLabel),
        relevance: tipsText(profile.relevanceShortLabel), study: refLink, snpedia: moreLink});
    }
    for (const h of dnaHints) {
      const isAvoid = h.direction === 'avoid';
      const icon = isAvoid ? '\u26A0' : '\u2192';
      const refLink = h.ref && /^https?:\/\//.test(h.ref) ? h.ref : null;
      const profile = h.evidenceProfile || resolveSnpEvidenceProfile();
      genetics.push({kind: 'hint', icon, avoid: isAvoid, text: tipsText(h.text),
        evidence: tipsText(profile.evidenceShortLabel), relevance: tipsText(profile.relevanceShortLabel), study: refLink});
    }
  }

  if (slot?.freeActions?.length) {
    const items: TipsTierItem[] = [];
    for (const action of slot.freeActions) items.push({kind: 'free', text: tipsText(action)});
    tiers.push({label: 'LIFESTYLE IDEAS', hint: 'general information', items});
  }
  if (foodProducts.length) {
    tiers.push({label: 'FOOD EXAMPLES', hint: 'options to review',
      items: foodProducts.map(fp => ({kind: 'product', product: getProductRowView(fp, region, slotKey)}))});
  } else if (slot?.foodForms?.length) {
    tiers.push({label: 'FOOD EXAMPLES', hint: 'options to review',
      items: [{kind: 'food', text: slot.foodForms.map(tipsText).join(' · ')}]});
  }
  if (toolProducts.length) {
    tiers.push({label: 'TOOLS', hint: 'product options',
      items: toolProducts.map(tp => ({kind: 'product', product: getProductRowView(tp, region, slotKey)}))});
  } else if (slot?.productForms?.length) {
    tiers.push({label: 'TOOLS', hint: 'product options',
      items: [{kind: 'form', text: slot.productForms.map(tipsText).join(' · ')}]});
  }
  if (suppProducts.length) {
    tiers.push({label: 'SUPPLEMENTS', hint: 'review safety first',
      items: suppProducts.map(sp => ({kind: 'product', product: getProductRowView(sp, region, slotKey)}))});
  } else if (slot?.forms?.length) {
    const formRefs = slot.formRefs || {};
    const forms = slot.forms.map(f => {
      const ref = formRefs[f];
      const studyLink = ref && /^https?:\/\//.test(ref) ? ref : null;
      return {text: tipsText(f), href: studyLink};
    });
    tiers.push({label: 'SUPPLEMENTS', hint: 'review safety first', items: [{kind: 'forms', forms}]});
  }
  if (drugProducts.length) {
    const items: TipsTierItem[] = drugProducts.map(dp => ({kind: 'product', product: getProductRowView(dp, region, slotKey)}));
    items.push({kind: 'drug-warning'});
    tiers.push({label: 'PHARMACEUTICALS', hint: null, items});
  }
  if (otherProducts.length) {
    tiers.push({label: 'OTHER', hint: null,
      items: otherProducts.map(op => ({kind: 'product', product: getProductRowView(op, region, slotKey)}))});
  }

  if (!genetics.length && !tiers.length) return null;
  const hasProducts = products.length > 0;
  const gated = !hasSeenDisclosure();
  const issueTitle = encodeURIComponent(`[Rec] ${slot?.label || slotKey}: better study / correction`);
  const issueBody = encodeURIComponent(`**Slot:** \`${slotKey}\`\n**Current forms:** ${(slot?.forms || []).join(', ')}\n\n**What's wrong or what's better:**\n\n`);
  const suggestionHref = `https://github.com/elkimek/get-based/issues/new?title=${issueTitle}&body=${issueBody}&labels=enhancement`;
  const vendor = _resolveVendorForCoupon(_catalog, products);
  const coupon = vendor && hasProducts ? getCouponLineView(vendor, region) : null;
  const banner = !hasSeenDisclosure();
  const header = tipsText(label);
  const footer = getDisclosureFooterView();
  return {variant: 'standard', header, gated, banner, normalNote: isNormal, genetics, tiers, products: [],
    coupon, suggestionHref, footer, disclaimer: true};
}

function _renderRecSection(slotKey: string, opts: RecommendationSectionOptions = {}) {
  const view = getRecommendationSectionViewCore(slotKey, opts);
  return view ? renderTipsSectionHTML({view}) : '';
}

export function getRecommendationSectionViewSync(slotKey: string, opts: RecommendationSectionOptions = {}): TipsSectionView | null {
  if (!isProductRecsEnabled()) return null;
  return getRecommendationSectionViewCore(slotKey, opts);
}

export async function getRecommendationSectionView(slotKey: string, opts: RecommendationSectionOptions = {}): Promise<TipsSectionView | null> {
  if (!isProductRecsEnabled()) return null;
  await loadCatalog();
  return getRecommendationSectionViewCore(slotKey, opts);
}

// Sync version — uses cached catalog, returns '' if not loaded yet
export function renderRecommendationSectionSync(slotKey: string, opts: RecommendationSectionOptions = {}) {
  if (!isProductRecsEnabled()) return '';
  return _renderRecSection(slotKey, opts);
}

// Async version — ensures catalog is loaded first
export async function renderRecommendationSection(slotKey: string, opts: RecommendationSectionOptions = {}) {
  if (!isProductRecsEnabled()) return '';
  await loadCatalog();
  return _renderRecSection(slotKey, opts);
}

// ═══════════════════════════════════════════════
// KEYWORD SCANNER — detect supplement slots from AI text
// ═══════════════════════════════════════════════

// Extra keywords beyond what the catalog label provides (keyed by label fragment)
const EXTRA_TERMS: Readonly<Record<string, Array<string | RegExp>>> = {
  'vitamin d': ['vitd', 'd3', 'cholecalciferol', '25-oh'],
  'vitamin b12': ['b12', 'cobalamin', 'methylcobalamin'],
  'vitamin a': ['retinol', 'retinyl'],
  'vitamin k': ['mk-7', 'menaquinone'],
  'magnesium': ['mag glycinate', 'mag citrate'],
  'iron': ['ferritin', 'ferrous', 'iron bisglycinate'],
  'omega-3': ['omega 3', 'fish oil', /\bepa\b/, /\bdha\b/],
  'selenium': ['selenomethionine'],
  'zinc': ['zinc picolinate', 'zinc carnosine'],
  'nac': ['n-acetyl cysteine'],
  'glutathione': [/\bggt\b/],
  'homocysteine': ['methylation', 'b12 + folate'],
  'berberine': ['dihydroberberine'],
  'ashwagandha': ['ksm-66'],
  'testosterone': ['tongkat ali'],
  'insulin': ['blood sugar', 'glucose spike'],
  'inflammation': ['hs-crp', 'hsCRP'],
  'liver support': [/\balt\b/, 'alanine aminotransferase', 'fatty liver', /\bnafld\b/, /\bmasld\b/],
  'recovery': [/\bldh\b/, 'lactate dehydrogenase', 'muscle damage', 'muscle recovery'],
  'bilirubin': ['gilbert', 'jaundice', 'unconjugated bilirubin', 'conjugation'],
  'kidney': ['creatinine', /\bgfr\b/, /\begfr\b/, 'renal function', 'nephron'],
  'hydration': [/\bbun\b/, 'blood urea nitrogen', /\burea\b/],
  'hba1c': ['glycated hemoglobin', 'a1c', 'long-term glucose', 'glucose control'],
  'hemoglobin': ['anemia', 'iron deficiency', 'erythropoiesis', 'heme iron'],
  'free testosterone': [/\bshbg\b/, 'bioavailable testosterone', 'free testo'],
  'free t4': ['thyroxine', /\bft4\b/, 'thyroid hormone'],
  'albumin': ['hypoalbuminemia', 'protein status'],
  'total protein': ['protein status', 'protein intake'],
  'cholesterol': ['total cholesterol', 'ldl particle', 'statin'],
  'progesterone': ['luteal phase', 'pregnenolone steal', 'corpus luteum'],
  'wbc': ['white blood cell', 'leukocyte', 'immune function', 'neutrophil'],
  'sodium': ['hyponatremia', 'electrolyte balance', 'aldosterone'],
  'calcium': ['hypocalcemia', 'parathyroid', 'bone density', 'osteopor'],
  'alp': ['alkaline phosphatase', 'bone turnover'],
  'creatine kinase': [/\bck\b/, 'muscle damage', 'rhabdomyolysis', 'overtraining'],
  'rbc': ['red blood cell', 'erythropoiesis', 'red cell count'],
  'hematocrit': ['hemoconcentration', 'polycythemia', /\bhct\b/],
  'platelet': ['thrombocyt', 'platelet count', 'clotting'],
  'serum iron': ['iron absorption', 'hepcidin', 'transferrin sat'],
  'apob': ['apolipoprotein b', 'particle count', 'atherogenic'],
  'lh': ['luteinizing hormone', 'gonadotropin', /\blh\b/],
  'fsh': ['follicle stimulating', /\bfsh\b/, 'perimenopause', 'ovarian reserve'],
  'prolactin': ['hyperprolactinemia', 'dopamine', 'pituitary', 'galactorrhea'],
};

export function detectSupplementSlots(text: string | null | undefined) {
  if (!text || !_catalog || !_catalog.slots) return [];
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const [slotKey, slot] of Object.entries(_catalog.slots)) {
    // Skip lifestyle slots (those have a card property)
    if (slot.card) continue;
    const label = (slot.label || '').toLowerCase();
    // Match against slot label
    let matched = label.length > 3 && lower.includes(label);
    // Match against forms
    if (!matched && slot.forms) {
      matched = slot.forms.some(f => f.length > 3 && lower.includes(f.toLowerCase()));
    }
    // Match against extra keywords for this label
    if (!matched) {
      for (const [fragment, terms] of Object.entries(EXTRA_TERMS)) {
        if (label.includes(fragment)) {
          if (terms.some(t => t instanceof RegExp ? t.test(lower) : lower.includes(t))) { matched = true; break; }
        }
      }
    }
    if (matched && !found.includes(slotKey)) found.push(slotKey);
  }

  // Second pass: gene name matching for DNA-aware detection
  const genetics = state.importedData?.genetics as GeneticsData | null | undefined;
  const snpTable = genetics?.snps ? getRecommendationsSnpTable() : null;
  if (genetics?.snps && snpTable) {
    for (const [rsid, stored] of Object.entries(genetics.snps)) {
      const entry = snpTable[rsid];
      if (!entry || !entry.snpHints) continue;
      const g = stored.genotype;
      if (!g) continue;
      const hint = findSnpHint(entry, g);
      if (!hint) continue;
      const geneRe = new RegExp('\\b' + (stored.gene as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (geneRe.test(lower) && !found.includes(hint.slotKey)) {
        // Verify slot exists in catalog
        if (_catalog.slots[hint.slotKey]) found.push(hint.slotKey);
      }
    }
  }

  const hasDNA = !!genetics?.snps;
  return found.slice(0, hasDNA ? 2 : 1);
}

// Detects mitigation tags inside an AI interpretation body. Solves the case
// where the AI's prose says "consider Yshield paint and a Stetzer filter" but
// the user never tagged those mitigations on the room — we still want to surface
// the matching products. Returns an array of canonical mitigation tag strings
// that the EMF catalog can resolve.
const _MITIGATION_TEXT_PATTERNS = [
  { tag: 'shielding paint (Yshield)', re: /\b(?:shielding paint|yshield|y-?shield|conductive paint)\b/i },
  { tag: 'shielding fabric / canopy', re: /\b(?:bed canopy|shielding (?:fabric|canopy)|naturell|swiss shield|daylite)\b/i },
  { tag: 'Stetzerizer filters',       re: /\b(?:stetzer(?:izer)?|greenwave|dirty[- ]electricity filter)\b/i },
  { tag: 'grounding rod',              re: /\b(?:grounding (?:rod|kit)|earth(?:ing)? (?:rod|kit))\b/i },
  { tag: 'shielded cables',            re: /\bshielded (?:power |ethernet )?cable/i },
  { tag: 'demand switch (Netzfreischalter)', re: /\b(?:demand switch|netzfreischalter|kill[- ]switch.*bedroom|bedroom circuit (?:cut|disconnect))\b/i },
];
export function detectMitigationsInText(text: unknown) {
  if (!text || typeof text !== 'string') return [];
  const found: string[] = [];
  for (const { tag, re } of _MITIGATION_TEXT_PATTERNS) {
    if (re.test(text) && !found.includes(tag)) found.push(tag);
  }
  return found;
}

// Detects EMF-relevant context in chat text. Used by the chat panel to decide
// whether to surface a one-time EMF assessment hint. Pure function: returns
// true if the text discusses EMF, RF, dirty electricity, or specific sources
// like cell towers / smart meters / WiFi-as-symptom-cause. Doesn't fire on
// generic "insomnia" or "fatigue" — those are handled by the supplements
// pipeline. Fires only when EMF specifically is on the user's mind.
// Patterns are bounded — no unbounded `.*` to prevent catastrophic backtracking
// on long AI responses. Bare \brf\b and \b5g\b are dropped (matched RF
// ablation, "5g of creatine"); use compound patterns instead.
const _EMF_TERMS = [
  /\bemf\b/i,
  /electromagnetic/i, /baubiologie/i, /building biology/i,
  /dirty electric/i, /cell tower/i, /smart meter/i,
  /\b5g\s+(?:network|tower|band|frequency|signal|radiation|deployment)/i,
  /\brf\s+(?:radiation|exposure|interference|shielding|emission)/i,
  /\bwifi\b\s+\w*\s*(?:radiation|exposure|emission)/i,
  /\bwifi\b[^.!?\n]{0,80}(?:bedroom|sleep|night)/i,
  /(?:bedroom|sleep|night)[^.!?\n]{0,80}\bwifi\b/i,
  /microwave radiation/i,
  /shielding (?:paint|fabric|canopy)/i,
  /yshield/i, /stetzer/i,
];
export function detectEMFRelevance(text: unknown) {
  if (!text || typeof text !== 'string') return false;
  return _EMF_TERMS.some(re => re.test(text));
}

// Wearable-trend-driven suggestion hooks. Pure detector — returns the slot
// keys the catalog should consider, plus a reason string. Callers decide
// whether to surface them. Conservative thresholds: only fire when the
// trend is BOTH against the user's own baseline AND outside the IQR.
//
// Returns [{ slotKey, reason }, ...]. Slot keys must exist in the catalog
// or callers will skip them.
export function detectWearableTrendSlots(summary: WearableTrendInput | null | undefined) {
  if (!summary?.metrics) return [];
  const out: Array<{ slotKey: string; reason: string }> = [];
  const m = summary.metrics;

  // HRV (overnight) ≪ baseline AND below P25 → low recovery / stress signal.
  // Magnesium glycinate is the most-evidenced sleep + autonomic-recovery
  // supplement; map to the catalog's 'magnesium' slot.
  if (m.hrv_rmssd && typeof m.hrv_rmssd.rolling?.d7 === 'number' &&
      typeof m.hrv_rmssd.baselineP25 === 'number' &&
      m.hrv_rmssd.rolling.d7 < m.hrv_rmssd.baselineP25) {
    out.push({
      slotKey: 'magnesium',
      reason: `7-day overnight HRV (${m.hrv_rmssd.rolling.d7} ms) is below your own P25 (${m.hrv_rmssd.baselineP25} ms) — autonomic recovery is suppressed.`,
    });
  }

  // RHR (overnight) ≫ baseline AND above P75 → cardiovascular stress /
  // overtraining / illness coming on.
  if (m.rhr && typeof m.rhr.rolling?.d7 === 'number' &&
      typeof m.rhr.baselineP75 === 'number' &&
      m.rhr.rolling.d7 > m.rhr.baselineP75) {
    out.push({
      slotKey: 'magnesium',
      reason: `7-day resting HR (${m.rhr.rolling.d7} bpm) is above your own P75 (${m.rhr.baselineP75} bpm) — possible overtraining or coming illness.`,
    });
  }

  // Sleep score chronically below 70 → sleep-quality intervention worth
  // considering. Catalog has 'melatonin' for circadian, plus 'magnesium'
  // for muscle relaxation.
  if (m.sleep_score && typeof m.sleep_score.rolling?.d7 === 'number' &&
      m.sleep_score.rolling.d7 < 70 &&
      typeof m.sleep_score.baseline === 'number' &&
      m.sleep_score.rolling.d7 < m.sleep_score.baseline) {
    out.push({
      slotKey: 'melatonin',
      reason: `7-day sleep score (${m.sleep_score.rolling.d7}) is below 70 and below your own baseline (${m.sleep_score.baseline}).`,
    });
  }

  // De-dupe by slotKey, keep first reason.
  const seen = new Set<string>();
  return out.filter(o => {
    if (seen.has(o.slotKey)) return false;
    seen.add(o.slotKey);
    return true;
  });
}

// ═══════════════════════════════════════════════
// CYCLE-SAFE MODULE BRIDGE
// ═══════════════════════════════════════════════
initRecommendationDelegates();

configureRecommendationModuleBridge({
  isProductRecsEnabled,
  renderRecommendationSection,
  renderRecommendationSectionSync,
  getRecommendationSectionView,
  getRecommendationSectionViewSync,
  detectSupplementSlots,
  loadCatalog,
  buildDNAHints,
  getCardSlotKeys,
  renderCardTipsModal,
  detectEMFRelevance,
  renderLightDeviceAffiliateRow,
  getLightDeviceAffiliateView,
});
