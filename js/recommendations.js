// recommendations.js — Catalog loading, slot matching, HTML rendering for supplement & lifestyle recs

import { escapeHTML } from './utils.js';
import { getProfileLocation } from './profile.js';
import { state } from './state.js';

// ═══════════════════════════════════════════════
// CATALOG CACHE
// ═══════════════════════════════════════════════
let _catalog = undefined; // undefined = not loaded, null = load failed
let _catalogPromise = null; // deduplicates concurrent loads

export async function loadCatalog() {
  if (_catalog !== undefined) return _catalog;
  if (_catalogPromise) return _catalogPromise;
  _catalogPromise = (async () => {
    try {
      const res = await fetch('data/recommendations-czsk.json');
      if (!res.ok) { _catalog = null; return null; }
      _catalog = await res.json();
      return _catalog;
    } catch {
      _catalog = null;
      return null;
    } finally {
      _catalogPromise = null;
    }
  })();
  return _catalogPromise;
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════
export function isProductRecsEnabled() {
  return localStorage.getItem('labcharts-show-product-recs') !== 'false';
}

export function setProductRecsEnabled(on) {
  localStorage.setItem('labcharts-show-product-recs', on ? 'true' : 'false');
}

export function hasSeenDisclosure() {
  return localStorage.getItem('labcharts-rec-disclosure') === 'seen';
}

export function markDisclosureSeen() {
  localStorage.setItem('labcharts-rec-disclosure', 'seen');
}

// ═══════════════════════════════════════════════
// REGION
// ═══════════════════════════════════════════════
const CZSK_COUNTRIES = ['czechia', 'czech republic', 'česko', 'cesko', 'cz', 'slovakia', 'slovensko', 'sk'];

export function getUserRegion() {
  const loc = getProfileLocation();
  if (!loc.country) return 'EU';
  const c = loc.country.toLowerCase().trim();
  if (CZSK_COUNTRIES.includes(c)) return 'CZSK';
  return 'EU';
}

// ═══════════════════════════════════════════════
// PRODUCT FILTERING
// ═══════════════════════════════════════════════
export function getProductsForSlot(catalog, slotKey, region) {
  if (!catalog || !catalog.products) return [];
  const products = catalog.products[slotKey];
  if (!products || !products.length) return [];
  // CZSK users see CZ + SK + EU + INTL products; EU users see EU + INTL
  const regionCodes = region === 'CZSK' ? ['CZ', 'SK', 'EU', 'INTL'] : ['EU', 'INTL'];
  return products.filter(p => p.regions && p.regions.some(r => regionCodes.includes(r)));
}

// ═══════════════════════════════════════════════
// EMF PRODUCT CATALOG — Safe Living Technologies affiliate
// ═══════════════════════════════════════════════
let _emfCatalog = undefined;
let _emfCatalogPromise = null;

export async function loadEMFCatalog() {
  if (_emfCatalog !== undefined) return _emfCatalog;
  if (_emfCatalogPromise) return _emfCatalogPromise;
  _emfCatalogPromise = (async () => {
    try {
      const res = await fetch('data/emf-products.json');
      if (!res.ok) { _emfCatalog = null; return null; }
      _emfCatalog = await res.json();
      return _emfCatalog;
    } catch {
      _emfCatalog = null;
      return null;
    } finally {
      _emfCatalogPromise = null;
    }
  })();
  return _emfCatalogPromise;
}

export function getEMFMeters(catalog, types) {
  if (!catalog?.meters) return [];
  if (!types || !types.length) return catalog.meters;
  const wanted = new Set(types);
  return catalog.meters.filter(m => (m.matchTypes || []).some(t => wanted.has(t)));
}

export function getEMFProductsForMitigations(catalog, tags) {
  if (!catalog?.mitigationProducts) return [];
  const out = [];
  const seen = new Set();
  for (const tag of tags || []) {
    const products = catalog.mitigationProducts[tag];
    if (!products) continue;
    for (const p of products) {
      const key = (p.url || '') + '|' + p.name;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...p, _tag: tag });
    }
  }
  return out;
}

function _buildCouponLine(catalog) {
  const c = catalog?.vendor?.coupon;
  if (!c?.code) return '';
  const code = escapeHTML(c.code);
  // Click-to-copy: a global helper handles the work. Inline onclick stays
  // tiny and safe to embed in an attribute (no quotes, no arrow funcs).
  return `<div class="rec-coupon">Use code <button type="button" class="rec-coupon-code" onclick="copyCouponCode(this)" data-code="${code}" title="Click to copy">${code}</button> at checkout for ${escapeHTML(c.userDiscount || '10%')} off.</div>`;
}

function copyCouponCode(btn) {
  const code = btn?.dataset?.code;
  if (!code) return;
  const flashCopied = () => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = orig; }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(flashCopied).catch(() => {});
  } else {
    const r = document.createRange();
    r.selectNodeContents(btn);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
}

function _buildEMFProductRow(product) {
  const url = product.url;
  const isValid = url && /^https?:\/\//.test(url);
  const meta = [];
  if (product.vendor) meta.push(escapeHTML(product.vendor));
  if (product.kind) meta.push(escapeHTML(product.kind));
  return `<div class="rec-product rec-emf-product">
    <div class="rec-emf-product-head">
      <strong>${escapeHTML(product.name)}</strong>
      ${meta.length ? `<span class="rec-emf-product-meta">${meta.join(' · ')}</span>` : ''}
    </div>
    ${product.blurb ? `<div class="rec-emf-product-blurb">${escapeHTML(product.blurb)}</div>` : ''}
    ${isValid ? `<a class="rec-product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener sponsored">View on Safe Living Technologies →</a>` : ''}
  </div>`;
}

/**
 * Render the EMF meter recommendation card (empty-state CTA).
 * Returns '' when the toggle is off or the catalog couldn't load.
 */
export function renderEMFMeterRecs(catalog, opts = {}) {
  if (!isProductRecsEnabled() || !catalog) return '';
  const meters = getEMFMeters(catalog, opts.types);
  if (!meters.length) return '';
  const gated = !hasSeenDisclosure() ? ' rec-section-gated' : '';
  const heading = escapeHTML(opts.heading || 'Need a meter? Recommended by getbased');
  const body = meters.map(_buildEMFProductRow).join('');
  return `${_buildDisclosureBanner()}<div class="rec-section rec-emf-section${gated}" onclick="event.stopPropagation()">
    <div class="rec-section-header">${heading}</div>
    <div class="rec-content">
      ${body}
      ${_buildCouponLine(catalog)}
      ${buildDisclosureFooter()}
    </div>
  </div>`;
}

/**
 * Render the EMF mitigation-product recommendation block (post-interpretation CTA).
 * tags = flat array of mitigation strings collected across all rooms.
 */
export function renderEMFMitigationRecs(catalog, tags, opts = {}) {
  if (!isProductRecsEnabled() || !catalog) return '';
  const products = getEMFProductsForMitigations(catalog, tags);
  if (!products.length) return '';
  const gated = !hasSeenDisclosure() ? ' rec-section-gated' : '';
  const heading = escapeHTML(opts.heading || 'Recommended products for your mitigations');
  const body = products.map(_buildEMFProductRow).join('');
  return `${_buildDisclosureBanner()}<div class="rec-section rec-emf-section${gated}" onclick="event.stopPropagation()">
    <div class="rec-section-header">${heading}</div>
    <div class="rec-content">
      ${body}
      ${_buildCouponLine(catalog)}
      ${buildDisclosureFooter()}
    </div>
  </div>`;
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
  const snpTable = window._snpTableCache;
  if (!snpTable) return '';
  const hints = [];
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps)) {
    if (genetics.apoe && apoeRsids.has(rsid)) continue;
    const entry = snpTable[rsid];
    if (!entry || !entry.snpHints || !entry.contextCards || !entry.contextCards.includes(cardKey)) continue;
    const g = stored.genotype;
    if (!g) continue;
    const rev = g.length === 2 ? g[1] + g[0] : g;
    const sorted = _sortAlleles(g);
    const hint = entry.snpHints[g] || entry.snpHints[rev] || entry.snpHints[sorted];
    if (!hint) continue;
    const info = entry.genotypes?.[g] || entry.genotypes?.[rev] || entry.genotypes?.[sorted];
    if (info && info.effect === 'none') continue;
    const isAvoid = hint.direction === 'avoid';
    const icon = isAvoid ? '\u26A0' : '\u2192';
    const cls = isAvoid ? ' ctx-tip-avoid' : ' ctx-tip-free';
    const refLink = hint.ref && /^https?:\/\//.test(hint.ref) ? ` <a href="${escapeHTML(hint.ref)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);opacity:0.6">study</a>` : '';
    hints.push(`<div class="ctx-tip-item${cls}">${icon} <strong>${escapeHTML(stored.gene)}</strong> ${escapeHTML(g)} \u2014 ${escapeHTML(hint.text)}${refLink}</div>`);
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
      tips += `<div class="ctx-tip-tier"><div class="ctx-tip-tier-label">NATURE <span class="rec-tier-hint">best option</span></div>`;
      tips += slot.freeActions.map(a => `<div class="ctx-tip-item ctx-tip-free">${escapeHTML(a)}</div>`).join('');
      tips += `</div>`;
    }
    if (slot.forms?.length) {
      tips += `<div class="ctx-tip-tier"><div class="ctx-tip-tier-label">TOOLS & SUPPLEMENTS <span class="rec-tier-hint">if needed</span></div>`;
      tips += `<div class="ctx-tip-item ctx-tip-form">${slot.forms.map(f => escapeHTML(f)).join(' · ')}</div>`;
      tips += `</div>`;
    }
    if (tips) items += `<div class="ctx-tip-slot"><div class="ctx-tip-slot-label">${label}</div>${tips}</div>`;
  }
  if (cardKey === 'environment') items += _buildEMFNudge();
  if (!items) return '';
  return `<button class="modal-close" onclick="document.getElementById('modal-overlay').classList.remove('show')">\u00D7</button>
    <div class="ctx-tips-modal-header">${cardInfo.emoji} ${escapeHTML(cardInfo.label)} \u2014 Tips</div>
    <div class="ctx-tips-modal-body">${items}</div>
    <div class="rec-mini-disclaimer" style="margin-top:12px">For informational purposes only. Not medical advice. Consult your healthcare provider before starting any supplement.</div>`;
}

// Quiet, contextual EMF assessment nudge for the Environment card.
// Single one-line link when no EMF assessment yet, or latest is older
// than 180d. Empty otherwise so we don't nag users keeping up.
function _buildEMFNudge() {
  const assessments = state.importedData?.emfAssessment?.assessments || [];
  const openHandler = `event.preventDefault();document.getElementById('modal-overlay').classList.remove('show');setTimeout(()=>window.openEMFAssessmentEditor(),100);`;
  if (!assessments.length) {
    return `<div class="ctx-tip-emf-nudge">💡 Want to actually measure what your home is putting out? <a href="#" onclick="${openHandler}">Open the EMF assessment →</a></div>`;
  }
  const latest = assessments.reduce((a, b) => (a.date > b.date ? a : b));
  const ageDays = (Date.now() - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
  // 120 days ≈ 4 months — long enough that a re-check is genuinely useful (sources
  // shift: new neighbor, new appliance, new cell tower), short enough that demo
  // profiles with semi-fresh assessments still surface the "stale" path.
  if (ageDays > 120) {
    const months = Math.round(ageDays / 30);
    return `<div class="ctx-tip-emf-nudge">💡 Your last EMF check was ${months} months ago. <a href="#" onclick="${openHandler}">Re-check the room →</a></div>`;
  }
  return '';
}

// ═══════════════════════════════════════════════
// DNA HINTS — connect genetics to recommendations
// ═══════════════════════════════════════════════

function _sortAlleles(g) { return g?.length === 2 ? g.split('').sort().join('') : g; }

export function buildDNAHints(slotKey) {
  const genetics = state.importedData?.genetics;
  if (!genetics || !genetics.snps) return [];
  const snpTable = window._snpTableCache;
  if (!snpTable) return [];

  const hints = [];

  // APOE haplotype — special handling
  if (genetics.apoe && slotKey === 'lipids.ldl') {
    const hap = genetics.apoe;
    if (hap.includes('\u03B54')) {
      hints.push({
        gene: 'APOE', variant: hap, genotype: hap, direction: 'form',
        text: hap === '\u03B54/\u03B54'
          ? 'Your APOE \u03B54/\u03B54 suggests strict saturated fat management and LDL particle monitoring \u2014 dietary fat significantly impacts your LDL'
          : `Your APOE ${hap} suggests moderating saturated fat and monitoring LDL response \u2014 dietary fat has amplified impact on your LDL`,
        ref: 'https://pubmed.ncbi.nlm.nih.gov/8346443/'
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
    const rev = g.length === 2 ? g[1] + g[0] : g;
    const sorted = _sortAlleles(g);
    const hint = entry.snpHints[g] || entry.snpHints[rev] || entry.snpHints[sorted];
    if (!hint || hint.slotKey !== slotKey) continue;

    // Skip if genotype effect is "none"
    const info = entry.genotypes?.[g] || entry.genotypes?.[rev] || entry.genotypes?.[sorted];
    if (info && info.effect === 'none') continue;

    hints.push({
      gene: stored.gene, variant: stored.variant, genotype: g,
      direction: hint.direction, text: hint.text, ref: hint.ref
    });
  }

  return hints;
}

// ═══════════════════════════════════════════════
// HTML RENDERING
// ═══════════════════════════════════════════════
function buildProductRow(product) {
  const parts = [];
  if (product.brand) parts.push(`<strong>${escapeHTML(product.brand)}</strong>`);
  if (product.name) parts.push(escapeHTML(product.name));
  const meta = [];
  if (product.dosage) meta.push(escapeHTML(product.dosage));
  if (product.priceCZK) meta.push(`~${escapeHTML(String(product.priceCZK))} CZK`);
  else if (product.priceEUR) meta.push(`~\u20AC${escapeHTML(String(product.priceEUR))}`);
  const url = product.affiliateUrl || product.url;
  const isValid = url && /^https?:\/\//.test(url);
  return `<div class="rec-product">
    <span class="rec-product-info">${parts.join(' \u00b7 ')}${meta.length ? ' \u00b7 ' + meta.join(' \u00b7 ') : ''}</span>
    ${isValid ? `<a class="rec-product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">View \u2192</a>` : ''}
  </div>`;
}

function buildDisclosureFooter() {
  return `<div class="rec-disclosure">Affiliate links are marked. Brands cannot pay for placement.</div>`;
}

function _buildMiniDisclaimer() {
  return `<div class="rec-mini-disclaimer">For informational purposes only. Not medical advice. Consult your healthcare provider before starting any supplement.</div>`;
}

function _buildDisclosureBanner() {
  if (hasSeenDisclosure()) return '';
  return `<div class="rec-disclosure-banner">
    For informational purposes only. This is not a medical device and does not diagnose, treat, or prevent disease. Consult your healthcare provider before starting any supplement, especially if pregnant, nursing, or taking medications. Intended for adults. Affiliate links are marked \u2014 brands cannot pay for placement.
    <button class="rec-disclosure-btn" onclick="event.stopPropagation();markRecDisclosureSeen();this.closest('.rec-disclosure-banner').remove();for(const el of document.querySelectorAll('.rec-section-gated'))el.classList.remove('rec-section-gated')">Got it</button>
  </div>`;
}

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
  const dnaHints = buildDNAHints(slotKey);
  // Inline SNPs (from detail modal) — raw genotype info alongside actionable hints
  const inlineSNPs = opts.inlineSNPs || [];
  if (dnaHints.length > 0 || inlineSNPs.length > 0) {
    inner += `<div class="rec-dna-hints">`;
    inner += `<div class="rec-section-label">\uD83E\uDDEC YOUR GENETICS</div>`;
    // Show raw SNP genotypes with effect levels
    for (const s of inlineSNPs) {
      const icon = s.effect === 'significant' ? '\uD83D\uDD34' : s.effect === 'moderate' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';
      const refLink = s.references?.[0] && /^https?:/.test(s.references[0]) ? ` <a href="${escapeHTML(s.references[0])}" target="_blank" rel="noopener" class="rec-dna-ref">study</a>` : '';
      const moreLink = s.rsid ? ` <a href="https://www.snpedia.com/index.php/${s.rsid.charAt(0).toUpperCase() + s.rsid.slice(1)}" target="_blank" rel="noopener" class="rec-dna-ref">SNPedia</a>` : '';
      inner += `<div class="rec-dna-row">${icon} <strong>${escapeHTML(s.gene)} ${escapeHTML(s.variant)}</strong>: ${escapeHTML(s.genotype)} \u2014 ${escapeHTML(s.note)}${refLink}${moreLink}</div>`;
    }
    // Actionable hints from snpHints
    for (const h of dnaHints) {
      const isAvoid = h.direction === 'avoid';
      const icon = isAvoid ? '\u26A0' : '\u2192';
      const cls = isAvoid ? ' rec-dna-avoid' : '';
      const refLink = h.ref && /^https?:\/\//.test(h.ref) ? ` <a href="${escapeHTML(h.ref)}" target="_blank" rel="noopener" class="rec-dna-ref">study</a>` : '';
      inner += `<div class="rec-dna-row${cls}">${icon} ${escapeHTML(h.text)}${refLink}</div>`;
    }
    inner += `</div>`;
  }

  // Tier 1: Nature — free, best option (full width, listed)
  if (slot?.freeActions?.length) {
    inner += `<div class="rec-section-label">NATURE <span class="rec-tier-hint">best option</span></div>`;
    for (const action of slot.freeActions) {
      inner += `<div class="rec-item-free">${escapeHTML(action)}</div>`;
    }
  }

  // Tier 2: Whole food — inline
  if (foodProducts.length) {
    inner += `<div class="rec-section-label">WHOLE FOOD <span class="rec-tier-hint">from nature</span></div>`;
    for (const fp of foodProducts) inner += buildProductRow(fp);
  } else if (slot?.foodForms?.length) {
    inner += `<div class="rec-section-label">WHOLE FOOD <span class="rec-tier-hint">from nature</span></div>`;
    inner += `<div class="rec-item-food">${slot.foodForms.map(f => escapeHTML(f)).join(' · ')}</div>`;
  }

  // Tier 3: Tools
  if (toolProducts.length) {
    inner += `<div class="rec-section-label">TOOLS <span class="rec-tier-hint">supports nature</span></div>`;
    for (const tp of toolProducts) inner += buildProductRow(tp);
  } else if (slot?.productForms?.length) {
    inner += `<div class="rec-section-label">TOOLS <span class="rec-tier-hint">supports nature</span></div>`;
    inner += `<div class="rec-item-form">${slot.productForms.map(t => escapeHTML(t)).join(' · ')}</div>`;
  }

  // Tier 4: Supplements — inline
  if (suppProducts.length) {
    inner += `<div class="rec-section-label">SUPPLEMENTS <span class="rec-tier-hint">last resort</span></div>`;
    for (const sp of suppProducts) inner += buildProductRow(sp);
  } else if (slot?.forms?.length) {
    inner += `<div class="rec-section-label">SUPPLEMENTS <span class="rec-tier-hint">last resort</span></div>`;
    const formRefs = slot.formRefs || {};
    inner += `<div class="rec-item-form">${slot.forms.map(f => {
      const ref = formRefs[f];
      const studyLink = ref && /^https?:\/\//.test(ref) ? ` <a href="${escapeHTML(ref)}" target="_blank" rel="noopener" class="rec-ref-link">(study)</a>` : '';
      return escapeHTML(f) + studyLink;
    }).join(', ')}</div>`;
  }

  if (drugProducts.length) {
    inner += `<div class="rec-section-label">PHARMACEUTICALS</div>`;
    for (const dp of drugProducts) inner += buildProductRow(dp);
    inner += `<div class="rec-drug-warning">Pharmaceutical-grade compounds may require medical supervision and can interact with medications. Consult your physician before use.</div>`;
  }

  if (otherProducts.length) {
    inner += `<div class="rec-section-label">OTHER</div>`;
    for (const op of otherProducts) inner += buildProductRow(op);
  }

  if (!inner) return '';
  const hasProducts = products.length > 0;
  const gated = !hasSeenDisclosure() ? ' rec-section-gated' : '';
  const issueTitle = encodeURIComponent(`[Rec] ${slot?.label || slotKey}: better study / correction`);
  const issueBody = encodeURIComponent(`**Slot:** \`${slotKey}\`\n**Current forms:** ${(slot?.forms || []).join(', ')}\n\n**What's wrong or what's better:**\n\n`);
  const suggestLink = `<div class="rec-suggest"><a href="https://github.com/elkimek/get-based/issues/new?title=${issueTitle}&body=${issueBody}&labels=recommendations" target="_blank" rel="noopener">Suggest a better study</a></div>`;
  const statusNote = isNormal ? `<div class="rec-in-range-note">Your value is in range. These tips are for general reference.</div>` : '';
  return `${_buildDisclosureBanner()}<div class="rec-section${gated}" onclick="event.stopPropagation()">
    <div class="rec-section-header">${escapeHTML(label)}</div>
    <div class="rec-content">${statusNote}${inner}${suggestLink}${hasProducts ? buildDisclosureFooter() : ''}${_buildMiniDisclaimer()}</div>
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
  if (genetics?.snps && window._snpTableCache) {
    const snpTable = window._snpTableCache;
    for (const [rsid, stored] of Object.entries(genetics.snps)) {
      const entry = snpTable[rsid];
      if (!entry || !entry.snpHints) continue;
      const g = stored.genotype;
      if (!g) continue;
      const rev = g.length === 2 ? g[1] + g[0] : g;
      const hint = entry.snpHints[g] || entry.snpHints[rev] || entry.snpHints[_sortAlleles(g)];
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
const _EMF_TERMS = [
  /\bemf\b/i, /\brf\b/i, /\b5g\b/i,
  /electromagnetic/i, /baubiologie/i, /building biology/i,
  /dirty electric/i, /cell tower/i, /smart meter/i,
  /\bwifi\b.*(?:bedroom|sleep|night)/i,
  /(?:bedroom|sleep|night).*\bwifi\b/i,
  /microwave radiation/i, /\brf radiation\b/i,
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
// WINDOW EXPORTS
// ═══════════════════════════════════════════════
Object.assign(window, {
  isProductRecsEnabled,
  setProductRecsEnabled,
  markRecDisclosureSeen: markDisclosureSeen,
  renderRecommendationSection,
  renderRecommendationSectionSync,
  detectSupplementSlots,
  loadCatalog,
  buildDNAHints,
  getCardSlotKeys,
  renderCardTipsModal,
  loadEMFCatalog,
  getEMFMeters,
  getEMFProductsForMitigations,
  renderEMFMeterRecs,
  renderEMFMitigationRecs,
  detectEMFRelevance,
  detectMitigationsInText,
  copyCouponCode,
});
