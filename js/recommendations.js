// @ts-check
// recommendations.js — Catalog loading, DNA hints, section rendering, and recommendation detectors

import { escapeHTML } from './utils.js';
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
  _buildCouponLine,
  _buildDisclosureBanner,
  _buildMiniDisclaimer,
  _pickRegional,
  _resolveCouponForRegion,
  _resolveHomepageForRegion,
  _resolveProductUrlForRegion,
  _resolveVendorForCoupon,
  buildDisclosureFooter,
  buildProductRow,
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
  setProductRecsEnabled,
};

// ═══════════════════════════════════════════════
// CATALOG CACHE
// ═══════════════════════════════════════════════
let _catalog = undefined; // undefined = not loaded, null = load failed
let _catalogPromise = null; // deduplicates concurrent loads
let _recommendationDelegatesInstalled = false;

function handleRecommendationSectionGuardClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const guardedSection = target.closest('[data-rec-section-click-guard]');
  if (guardedSection && !target.closest('a,button')) event.stopPropagation();
}

function handleRecommendationActionClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-rec-action]'));
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
      _catalog = await res.json();
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
const CARD_NAMES = {
  sleepRest: 'Sleep & Rest', lightCircadian: 'Light & Circadian',
  environment: 'Environment', exercise: 'Exercise',
  diet: 'Diet & Digestion', stress: 'Stress'
};

export function getCardSlotKeys(cardKey) {
  if (!_catalog || !_catalog.slots) return [];
  const cardName = CARD_NAMES[cardKey];
  if (!cardName) return [];
  return Object.keys(_catalog.slots).filter(k => _catalog.slots[k].card === cardName);
}

const CARD_LABELS = {
  sleepRest: { emoji: '\uD83D\uDE34', label: 'Sleep & Rest' },
  lightCircadian: { emoji: '\u2600\uFE0F', label: 'Light & Circadian' },
  environment: { emoji: '\uD83C\uDF0D', label: 'Environment' },
  exercise: { emoji: '\uD83C\uDFCB\uFE0F', label: 'Exercise' },
  diet: { emoji: '\uD83E\uDD57', label: 'Diet & Digestion' },
  stress: { emoji: '\uD83E\uDDE0', label: 'Stress' }
};

function _buildCardDNASection(cardKey) {
  const genetics = state.importedData?.genetics;
  if (!genetics || !genetics.snps) return '';
  const snpTable = getRecommendationsSnpTable();
  if (!snpTable) return '';
  const hints = [];
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps)) {
    if (genetics.apoe && apoeRsids.has(rsid)) continue;
    const entry = snpTable[rsid];
    if (!entry || !entry.snpHints || !entry.contextCards || !entry.contextCards.includes(cardKey)) continue;
    const g = stored.genotype;
    if (!g) continue;
    const hint = findSnpHint(entry, g);
    if (!hint) continue;
    const info = findGenotypeInfo(entry, g);
    if (info && info.effect === 'none') continue;
    const isAvoid = hint.direction === 'avoid';
    const icon = isAvoid ? '\u26A0' : '\u2192';
    const cls = isAvoid ? ' ctx-tip-avoid' : ' ctx-tip-free';
    const refLink = hint.ref && /^https?:\/\//.test(hint.ref) ? ` <a href="${escapeHTML(hint.ref)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);opacity:0.6">study</a>` : '';
    const profile = resolveSnpEvidenceProfile(entry, info);
    hints.push(`<div class="ctx-tip-item${cls}">${icon} <strong>${escapeHTML(stored.gene)}</strong> ${escapeHTML(g)} \u2014 ${escapeHTML(hint.text)} <span class="rec-dna-evidence">Evidence · ${escapeHTML(profile.evidenceShortLabel)} · ${escapeHTML(profile.relevanceShortLabel)}</span>${refLink}</div>`);
  }
  if (!hints.length) return '';
  return `<div class="ctx-tip-slot"><div class="ctx-tip-slot-label">Your Genetics</div>${hints.join('')}</div>`;
}

export function renderCardTipsModal(cardKey) {
  if (!isProductRecsEnabled() || !_catalog || !_catalog.slots) return '';
  const slotKeys = getCardSlotKeys(cardKey);
  if (!slotKeys.length) return '';
  const cardInfo = CARD_LABELS[cardKey] || { emoji: '', label: cardKey };
  let items = _buildCardDNASection(cardKey);
  for (const sk of slotKeys) {
    const slot = _catalog.slots[sk];
    if (!slot) continue;
    const label = escapeHTML(slot.label || sk.split('.').pop());
    let tips = '';
    if (slot.freeActions?.length) {
      tips += `<div class="ctx-tip-tier"><div class="ctx-tip-tier-label">LIFESTYLE IDEAS <span class="rec-tier-hint">general information</span></div>`;
      tips += slot.freeActions.map(a => `<div class="ctx-tip-item ctx-tip-free">${escapeHTML(a)}</div>`).join('');
      tips += `</div>`;
    }
    if (slot.forms?.length) {
      tips += `<div class="ctx-tip-tier"><div class="ctx-tip-tier-label">TOOLS & SUPPLEMENTS <span class="rec-tier-hint">options to review</span></div>`;
      tips += `<div class="ctx-tip-item ctx-tip-form">${slot.forms.map(f => escapeHTML(f)).join(' · ')}</div>`;
      tips += `</div>`;
    }
    if (tips) items += `<div class="ctx-tip-slot"><div class="ctx-tip-slot-label">${label}</div>${tips}</div>`;
  }
  if (cardKey === 'environment') items += _buildEMFNudge();
  if (!items) return '';
  return `<button type="button" class="modal-close" ${recActionAttrs('close-modal')} aria-label="Close">\u00D7</button>
    <div class="ctx-tips-modal-header">${cardInfo.emoji} ${escapeHTML(cardInfo.label)} \u2014 Tips</div>
    <div class="ctx-tips-modal-body">${items}</div>
    <div class="rec-mini-disclaimer" style="margin-top:12px">General information only — not individualized medical advice or a care plan. Do not start, stop, or change medication or supplements based only on these tips. Discuss relevant options with a qualified healthcare professional.</div>`;
}

// Quiet, contextual EMF assessment nudge for the Environment card.
// Single one-line link when no EMF assessment yet, or latest is older
// than 120d. Empty otherwise so we don't nag users keeping up.
function _buildEMFNudge() {
  const assessments = state.importedData?.emfAssessment?.assessments || [];
  if (!assessments.length) {
    return `<div class="ctx-tip-emf-nudge"><span aria-hidden="true">💡</span> Want to measure your home's EMF environment? <a href="#" ${recActionAttrs('open-emf-assessment')} data-umami-event="emf-nudge-env-tips-noassessment">Open the EMF assessment →</a></div>`;
  }
  const latest = assessments.reduce((a, b) => (a.date > b.date ? a : b));
  const ageDays = (Date.now() - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
  // 120 days ≈ 4 months — long enough that a re-check is genuinely useful (sources
  // shift: new neighbor, new appliance, new cell tower), short enough that demo
  // profiles with semi-fresh assessments still surface the "stale" path.
  if (ageDays > 120) {
    const months = Math.round(ageDays / 30);
    const span = months >= 12 ? 'over a year' : `${months} ${months === 1 ? 'month' : 'months'}`;
    return `<div class="ctx-tip-emf-nudge"><span aria-hidden="true">💡</span> Your last EMF check was ${span} ago. <a href="#" ${recActionAttrs('open-emf-assessment')} data-umami-event="emf-nudge-env-tips-stale">Re-check the room →</a></div>`;
  }
  return '';
}

// ═══════════════════════════════════════════════
// DNA HINTS — connect genetics to recommendations
// ═══════════════════════════════════════════════

export function buildDNAHints(slotKey) {
  const genetics = state.importedData?.genetics;
  if (!genetics || !genetics.snps) return [];
  const snpTable = getRecommendationsSnpTable();
  if (!snpTable) return [];

  const hints = [];

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
function _renderRecSection(slotKey, opts = {}) {
  const slot = _catalog?.slots?.[slotKey];
  const hasInlineSNPs = opts.inlineSNPs?.length > 0;
  if (!slot && !hasInlineSNPs) return '';

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
  const otherProducts = products.filter(p => !knownTypes.includes(p.type)).slice(0, maxProducts);

  let inner = '';

  // DNA hints — prepend before tiers
  let dnaHints = buildDNAHints(slotKey);
  // Inline SNPs (from detail modal) — raw genotype info alongside actionable hints
  const inlineSNPs = opts.inlineSNPs || [];
  // Deduplicate: when the same rsid produces both a raw finding (inlineSNPs)
  // and an actionable hint (dnaHints), the modal previously rendered two
  // rows for the same SNP citing the same study. Keep the inline finding
  // (richer — note + SNPedia link) and drop the redundant hint.
  if (inlineSNPs.length > 0 && dnaHints.length > 0) {
    const inlineRsids = new Set(inlineSNPs.map(s => s.rsid).filter(Boolean));
    dnaHints = dnaHints.filter(h => !h.rsid || !inlineRsids.has(h.rsid));
  }
  if (dnaHints.length > 0 || inlineSNPs.length > 0) {
    inner += `<div class="rec-dna-hints">`;
    inner += `<div class="rec-section-label">\uD83E\uDDEC YOUR GENETICS</div>`;
    // Show raw SNP genotypes with effect levels
    for (const s of inlineSNPs) {
      const presentation = s.presentation || snpFindingPresentation(s.effect, s.valence);
      const profile = s.evidenceProfile || resolveSnpEvidenceProfile(s, s);
      const icon = presentation.icon;
      const refLink = s.references?.[0] && /^https?:/.test(s.references[0]) ? ` <a href="${escapeHTML(s.references[0])}" target="_blank" rel="noopener" class="rec-dna-ref">study</a>` : '';
      const moreLink = s.rsid ? ` <a href="https://www.snpedia.com/index.php/${s.rsid.charAt(0).toUpperCase() + s.rsid.slice(1)}" target="_blank" rel="noopener" class="rec-dna-ref">SNPedia</a>` : '';
      inner += `<div class="rec-dna-row">${icon} <strong>${escapeHTML(s.gene)} ${escapeHTML(s.variant)}</strong>: ${escapeHTML(s.genotype)} \u2014 ${escapeHTML(s.note)} <span class="rec-dna-evidence">Evidence · ${escapeHTML(profile.evidenceShortLabel)} · ${escapeHTML(profile.relevanceShortLabel)}</span>${refLink}${moreLink}</div>`;
    }
    // Actionable hints from snpHints
    for (const h of dnaHints) {
      const isAvoid = h.direction === 'avoid';
      const icon = isAvoid ? '\u26A0' : '\u2192';
      const cls = isAvoid ? ' rec-dna-avoid' : '';
      const refLink = h.ref && /^https?:\/\//.test(h.ref) ? ` <a href="${escapeHTML(h.ref)}" target="_blank" rel="noopener" class="rec-dna-ref">study</a>` : '';
      const profile = h.evidenceProfile || resolveSnpEvidenceProfile();
      inner += `<div class="rec-dna-row${cls}">${icon} ${escapeHTML(h.text)} <span class="rec-dna-evidence">Evidence · ${escapeHTML(profile.evidenceShortLabel)} · ${escapeHTML(profile.relevanceShortLabel)}</span>${refLink}</div>`;
    }
    inner += `</div>`;
  }

  // Tier 1: lifestyle ideas (full width, listed)
  if (slot?.freeActions?.length) {
    inner += `<div class="rec-section-label">LIFESTYLE IDEAS <span class="rec-tier-hint">general information</span></div>`;
    for (const action of slot.freeActions) {
      inner += `<div class="rec-item-free">${escapeHTML(action)}</div>`;
    }
  }

  // Tier 2: food examples — inline
  if (foodProducts.length) {
    inner += `<div class="rec-section-label">FOOD EXAMPLES <span class="rec-tier-hint">options to review</span></div>`;
    for (const fp of foodProducts) inner += buildProductRow(fp, region, slotKey);
  } else if (slot?.foodForms?.length) {
    inner += `<div class="rec-section-label">FOOD EXAMPLES <span class="rec-tier-hint">options to review</span></div>`;
    inner += `<div class="rec-item-food">${slot.foodForms.map(f => escapeHTML(f)).join(' · ')}</div>`;
  }

  // Tier 3: Tools
  if (toolProducts.length) {
    inner += `<div class="rec-section-label">TOOLS <span class="rec-tier-hint">product options</span></div>`;
    for (const tp of toolProducts) inner += buildProductRow(tp, region, slotKey);
  } else if (slot?.productForms?.length) {
    inner += `<div class="rec-section-label">TOOLS <span class="rec-tier-hint">product options</span></div>`;
    inner += `<div class="rec-item-form">${slot.productForms.map(t => escapeHTML(t)).join(' · ')}</div>`;
  }

  // Tier 4: supplements — inline
  if (suppProducts.length) {
    inner += `<div class="rec-section-label">SUPPLEMENTS <span class="rec-tier-hint">review safety first</span></div>`;
    for (const sp of suppProducts) inner += buildProductRow(sp, region, slotKey);
  } else if (slot?.forms?.length) {
    inner += `<div class="rec-section-label">SUPPLEMENTS <span class="rec-tier-hint">review safety first</span></div>`;
    const formRefs = slot.formRefs || {};
    inner += `<div class="rec-item-form">${slot.forms.map(f => {
      const ref = formRefs[f];
      const studyLink = ref && /^https?:\/\//.test(ref) ? ` <a href="${escapeHTML(ref)}" target="_blank" rel="noopener" class="rec-ref-link">(study)</a>` : '';
      return escapeHTML(f) + studyLink;
    }).join(', ')}</div>`;
  }

  if (drugProducts.length) {
    inner += `<div class="rec-section-label">PHARMACEUTICALS</div>`;
    for (const dp of drugProducts) inner += buildProductRow(dp, region, slotKey);
    inner += `<div class="rec-drug-warning">Pharmaceutical-grade compounds may require medical supervision and can interact with medications. Consult your physician before use.</div>`;
  }

  if (otherProducts.length) {
    inner += `<div class="rec-section-label">OTHER</div>`;
    for (const op of otherProducts) inner += buildProductRow(op, region, slotKey);
  }

  if (!inner) return '';
  const hasProducts = products.length > 0;
  const gated = !hasSeenDisclosure() ? ' rec-section-gated' : '';
  const issueTitle = encodeURIComponent(`[Rec] ${slot?.label || slotKey}: better study / correction`);
  const issueBody = encodeURIComponent(`**Slot:** \`${slotKey}\`\n**Current forms:** ${(slot?.forms || []).join(', ')}\n\n**What's wrong or what's better:**\n\n`);
  const suggestLink = `<div class="rec-suggest"><a href="https://github.com/elkimek/get-based/issues/new?title=${issueTitle}&body=${issueBody}&labels=recommendations" target="_blank" rel="noopener">Suggest a better study</a></div>`;
  const statusNote = isNormal ? `<div class="rec-in-range-note">Your value is in range. These tips are general information only.</div>` : '';
  // Coupon line: render when any rendered product references a vendor with a
  // resolvable coupon for the current region. Visible to supplement/lifestyle
  // recs the same way EMF gets it — every vendor that ships a coupon should
  // surface it where their products surface.
  const vendor = _resolveVendorForCoupon(_catalog, products);
  const couponLine = vendor && hasProducts ? _buildCouponLine(vendor, region) : '';
  return `${_buildDisclosureBanner()}<div class="rec-section${gated}" data-rec-section-click-guard>
    <div class="rec-section-header">${escapeHTML(label)}</div>
    <div class="rec-content">${statusNote}${inner}${couponLine}${suggestLink}${buildDisclosureFooter()}${_buildMiniDisclaimer()}</div>
  </div>`;
}

// Sync version — uses cached catalog, returns '' if not loaded yet
export function renderRecommendationSectionSync(slotKey, opts = {}) {
  if (!isProductRecsEnabled()) return '';
  return _renderRecSection(slotKey, opts);
}

// Async version — ensures catalog is loaded first
export async function renderRecommendationSection(slotKey, opts = {}) {
  if (!isProductRecsEnabled()) return '';
  await loadCatalog();
  return _renderRecSection(slotKey, opts);
}

// ═══════════════════════════════════════════════
// KEYWORD SCANNER — detect supplement slots from AI text
// ═══════════════════════════════════════════════

// Extra keywords beyond what the catalog label provides (keyed by label fragment)
const EXTRA_TERMS = {
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

export function detectSupplementSlots(text) {
  if (!text || !_catalog || !_catalog.slots) return [];
  const lower = text.toLowerCase();
  const found = [];

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
  const genetics = state.importedData?.genetics;
  const snpTable = genetics?.snps ? getRecommendationsSnpTable() : null;
  if (genetics?.snps && snpTable) {
    for (const [rsid, stored] of Object.entries(genetics.snps)) {
      const entry = snpTable[rsid];
      if (!entry || !entry.snpHints) continue;
      const g = stored.genotype;
      if (!g) continue;
      const hint = findSnpHint(entry, g);
      if (!hint) continue;
      const geneRe = new RegExp('\\b' + stored.gene.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
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
export function detectMitigationsInText(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
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
export function detectEMFRelevance(text) {
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
export function detectWearableTrendSlots(summary) {
  if (!summary?.metrics) return [];
  const out = [];
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
  const seen = new Set();
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
  detectSupplementSlots,
  loadCatalog,
  buildDNAHints,
  getCardSlotKeys,
  renderCardTipsModal,
  detectEMFRelevance,
  renderLightDeviceAffiliateRow,
});
