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
      const res = await fetch('data/recommendations.json');
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
//
// SINGLE SOURCE OF TRUTH for region semantics. Used by both the product
// visibility filter (getProductsForSlot) AND the per-region map resolver
// (_pickRegional, used by vendor.homepage / vendor.coupon / product.url
// when those are Record<RegionCode, …> shape).
//
// The chain represents the lookup order from most-specific (the user's
// market) to most-generic (worldwide). Both consumers walk the same chain:
//   - getProductsForSlot: a product matches if any of its regions[] tags
//     appear anywhere in the chain (visibility = "covers this user")
//   - _pickRegional: pick the FIRST chain entry that has a key in the map
//     (specificity = "show me the most-targeted variant available")
//
// Hierarchy: country → continent/region → INTL.
//   CZSK is the multi-country marker for catalogs that serve both CZ + SK
//   together; it expands to the union of the CZ and SK chains.
const REGION_HIERARCHY = {
  CZ:   ['CZ', 'EU', 'INTL'],
  SK:   ['SK', 'EU', 'INTL'],
  DE:   ['DE', 'EU', 'INTL'],
  AT:   ['AT', 'EU', 'INTL'],
  CZSK: ['CZ', 'SK', 'EU', 'INTL'],
  EU:   ['EU', 'INTL'],
  US:   ['US', 'INTL'],
  INTL: ['INTL'],
};

// Returns the lookup chain for a given region — most-specific first.
// Unknown regions get [region, INTL] as a graceful fallback.
export function regionLookupChain(region) {
  if (!region) return ['INTL'];
  return REGION_HIERARCHY[region] || [region, 'INTL'];
}

// Country name / ISO code → granular region. Names are lowercased before
// lookup. Anything not in the table falls through to the heuristic below.
// Granular regions matter because the new region hierarchy chain treats
// CZ and SK as siblings under EU — a Slovak user who falls into "CZSK"
// always gets the CZ URL via the chain walk, never the SK one.
const COUNTRY_TO_REGION = {
  // Czech Republic
  'cz': 'CZ', 'cze': 'CZ', 'czechia': 'CZ', 'czech republic': 'CZ',
  'česko': 'CZ', 'cesko': 'CZ', 'česká republika': 'CZ', 'ceska republika': 'CZ',
  // Slovakia
  'sk': 'SK', 'svk': 'SK', 'slovakia': 'SK',
  'slovensko': 'SK', 'slovenská republika': 'SK', 'slovenska republika': 'SK',
  // German-speaking
  'de': 'DE', 'deu': 'DE', 'germany': 'DE', 'deutschland': 'DE',
  'at': 'AT', 'aut': 'AT', 'austria': 'AT',
  'österreich': 'AT', 'oesterreich': 'AT', 'osterreich': 'AT',
  // United States
  'us': 'US', 'usa': 'US', 'u.s.': 'US',
  'united states': 'US', 'united states of america': 'US',
  // Other EU member states route to EU (no country-specific affiliate yet)
  'fr': 'EU', 'france': 'EU',
  'it': 'EU', 'italy': 'EU', 'italia': 'EU',
  'es': 'EU', 'spain': 'EU', 'españa': 'EU', 'espana': 'EU',
  'nl': 'EU', 'netherlands': 'EU', 'nederland': 'EU',
  'be': 'EU', 'belgium': 'EU',
  'pl': 'EU', 'poland': 'EU', 'polska': 'EU',
  'hu': 'EU', 'hungary': 'EU', 'magyarország': 'EU',
  'pt': 'EU', 'portugal': 'EU',
  'ie': 'EU', 'ireland': 'EU',
  'dk': 'EU', 'denmark': 'EU', 'danmark': 'EU',
  'se': 'EU', 'sweden': 'EU', 'sverige': 'EU',
  'fi': 'EU', 'finland': 'EU', 'suomi': 'EU',
};

export function getUserRegion() {
  const loc = getProfileLocation();
  if (!loc.country) return 'INTL';
  const c = loc.country.toLowerCase().trim();
  if (COUNTRY_TO_REGION[c]) return COUNTRY_TO_REGION[c];
  // Unknown country: graceful default. Anyone outside our explicit list
  // (UK, AU, CA, JP, …) gets INTL — they see worldwide-tagged products
  // and the renderer falls through to the INTL homepage / coupon for any
  // vendor with multi-region keys.
  return 'INTL';
}

// ═══════════════════════════════════════════════
// PRODUCT FILTERING
// ═══════════════════════════════════════════════
// A product is visible to a user if any of its regions[] tags appear in
// the user's region lookup chain. So a product tagged ["INTL"] is visible
// to everyone (INTL is in every chain), a product tagged ["EU"] is visible
// to CZ/SK/EU/DE/AT users, and a product tagged ["CZ"] is only visible to
// CZ + CZSK users. Single hierarchy shared with _pickRegional.
export function getProductsForSlot(catalog, slotKey, region) {
  if (!catalog || !catalog.products) return [];
  const products = catalog.products[slotKey];
  if (!products || !products.length) return [];
  const chain = new Set(regionLookupChain(region));
  return products.filter(p => p.regions && p.regions.some(r => chain.has(r)));
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

export function getEMFMeters(catalog, types) {
  const products = catalog?.products?.['_internal.emfMeters'] || [];
  if (!types || !types.length) return products;
  const wanted = new Set(types);
  return products.filter(m => (m.matchTypes || []).some(t => wanted.has(t)));
}

// Mitigation tag (stored on a room) → catalog slot key. Single map keeps the
// per-room chip strings (which match the constants.js EMF_MITIGATIONS list)
// glued to the slot keys we created in the unified catalog.
const _MITIGATION_TAG_TO_SLOT = {
  'shielding paint (Yshield)': 'env.shieldingPaint',
  'shielding fabric / canopy': 'env.shieldingFabric',
  'Stetzerizer filters': 'env.dirtyElectricity',
  'demand switch (Netzfreischalter)': 'env.demandSwitch',
  'shielded cables': 'env.shieldedCables',
  'grounding rod': 'env.grounding',
};

export function getEMFProductsForMitigations(catalog, tags) {
  if (!catalog?.products) return [];
  const out = [];
  const seen = new Set();
  for (const tag of tags || []) {
    const slotKey = _MITIGATION_TAG_TO_SLOT[tag];
    if (!slotKey) continue;
    const products = catalog.products[slotKey];
    if (!products) continue;
    for (const p of products) {
      // Dedup key — name + vendorKey is more stable than the URL since URL
      // can be a per-region map (no canonical string for the key).
      const key = (p.vendorKey || '') + '|' + (p.name || '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...p, _tag: tag });
    }
  }
  return out;
}

// First vendor mentioned in the resolved products determines the coupon
// shown alongside the section. Today every SLT entry shares the same coupon,
// so this is a simple lookup; future affiliates with their own coupons just
// register a vendor block.
function _resolveVendorForCoupon(catalog, products) {
  if (!products?.length || !catalog?.vendors) return null;
  for (const p of products) {
    const key = p.vendorKey || p.vendor;
    if (!key) continue;
    // Try by vendorKey first (canonical), fall back to scanning by name
    const direct = catalog.vendors[key];
    if (direct) return direct;
    for (const v of Object.values(catalog.vendors)) {
      if (v.name === key) return v;
    }
  }
  return null;
}

// Vendors with multi-region affiliate programs store coupon/homepage as
// { CZ: …, SK: …, EN: … } maps instead of a flat value. Resolve to a single
// entry using the catalog's region, decomposing multi-region markers like
// "CZSK" into component codes (CZ, SK), and falling back to a worldwide
// key (EN/INTL/WORLDWIDE) before giving up.
export function _pickRegional(map, catalogRegion) {
  // Arrays trip `typeof === 'object'`. Reject them up front — without this
  // a malformed `coupon: [{code:'X'}]` would silently render via the
  // Object.values fallback, producing wrong attribution.
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
  // Walk the region hierarchy chain (most specific → INTL). Same chain as
  // getProductsForSlot, so vendor-key resolution and product visibility
  // share the same notion of "what region covers this user."
  for (const r of regionLookupChain(catalogRegion)) {
    if (map[r]) return map[r];
  }
  // Decompose multi-region markers not in the chain (e.g. "USCA" → US, CA).
  // Kept for back-compat with arbitrary catalog markers; the standard
  // markers (CZSK etc.) already expand via the hierarchy above.
  if (catalogRegion) {
    for (const part of catalogRegion.match(/[A-Z]{2}/g) || []) {
      if (map[part]) return map[part];
    }
  }
  // Final fallbacks for legacy keys.
  return map.EN || map.WORLDWIDE || Object.values(map)[0] || null;
}

// Discriminator: a Coupon has a `code` field; a per-region map does not.
// Arrays are rejected (an array could contain `code` as an inherited property
// path in some JS hosts; defense-in-depth).
export function _resolveCouponForRegion(coupon, region) {
  if (!coupon || typeof coupon !== 'object' || Array.isArray(coupon)) return null;
  if ('code' in coupon) return coupon;
  return _pickRegional(coupon, region);
}

// Discriminator: a flat homepage is a string; a per-region map is an object.
export function _resolveHomepageForRegion(homepage, region) {
  if (!homepage) return null;
  if (typeof homepage === 'string') return homepage;
  return _pickRegional(homepage, region);
}

// Resolve a product's outbound URL for the active catalog region. Both
// `url` and `affiliateUrl` may be a flat string OR a Record<RegionCode, string>
// when the brand has different storefronts per market (e.g. easylight.sk for
// CZ/SK + mitochondriak.com for INTL). Prefer affiliateUrl over url.
export function _resolveProductUrlForRegion(product, region) {
  if (!product) return null;
  const aff = _resolveOneUrlField(product.affiliateUrl, region);
  if (aff) return aff;
  return _resolveOneUrlField(product.url, region);
}
function _resolveOneUrlField(field, region) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && !Array.isArray(field)) return _pickRegional(field, region);
  return null;
}

function _buildCouponLine(catalogOrVendor, region) {
  // Accept either a vendor object directly, or a catalog with legacy .vendor
  // top-level (back-compat with the old emf-products.json shape).
  const rawCoupon = catalogOrVendor?.coupon || catalogOrVendor?.vendor?.coupon;
  const c = _resolveCouponForRegion(rawCoupon, region);
  if (!c?.code) return '';
  const code = escapeHTML(c.code);
  // Click-to-copy: a global helper handles the work. Inline onclick stays
  // tiny and safe to embed in an attribute (no quotes, no arrow funcs).
  // aria-live on the wrapper so the "✓ Copied" flash is announced to SR users.
  return `<div class="rec-coupon" aria-live="polite" aria-atomic="true">Use code <button type="button" class="rec-coupon-code" onclick="copyCouponCode(this)" data-code="${code}" aria-label="Copy coupon code ${code} to clipboard" title="Click to copy">${code}</button> at checkout for ${escapeHTML(c.userDiscount || '10%')} off.</div>`;
}

function copyCouponCode(btn) {
  const code = btn?.dataset?.code;
  if (!code) return;
  // Guard against rapid double-clicks: if the button is still in the
  // "✓ Copied" flash state, skip — the new flash would otherwise stomp the
  // running timer and the button could get stuck on the temporary text.
  if (btn.dataset.flashing === '1') return;
  const flashCopied = (label) => {
    const orig = btn.textContent;
    btn.dataset.flashing = '1';
    btn.textContent = label;
    setTimeout(() => {
      btn.textContent = orig;
      delete btn.dataset.flashing;
    }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => flashCopied('✓ Copied')).catch(() => {
      // Permissions issue — surface honest fallback rather than fake success
      flashCopied('Press Ctrl+C');
    });
  } else {
    // Insecure context (HTTP) or ancient browser — select the text so the
    // user can press Ctrl+C themselves; never fake "Copied".
    const r = document.createRange();
    r.selectNodeContents(btn);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    flashCopied('Press Ctrl+C');
  }
}

// Affiliate links are scoped to known vendor domains so a corrupted
// catalog (sync, SW poisoning, profile import) can't render attacker-
// controlled URLs. The allowlist combines a small static fallback with
// the hostnames of every vendor.homepage in the loaded catalog (so
// adding a new vendor in the catalog automatically extends the list).
// Prefix-only matching would let an attacker construct
//   https://attacker.com?safelivingtechnologies.com=...
// so the check is hostname equality + trailing-dot-segment match.
const _STATIC_AFFILIATE_ALLOWLIST = [
  'safelivingtechnologies.com',
];
function _vendorHomepageHosts(catalog) {
  const hosts = new Set();
  const vendors = catalog?.vendors || {};
  for (const v of Object.values(vendors)) {
    const hp = v?.homepage;
    if (!hp) continue;
    const urls = typeof hp === 'string' ? [hp] : (typeof hp === 'object' ? Object.values(hp) : []);
    for (const u of urls) {
      try { hosts.add(new URL(u).hostname.toLowerCase()); } catch {}
    }
  }
  return hosts;
}
function _isTrustedAffiliateUrl(url, catalog = _catalog) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (_STATIC_AFFILIATE_ALLOWLIST.some(d => host === d || host.endsWith('.' + d))) return true;
    // Catalog-derived: the maintainer's vendor entries authorize their own
    // domains. New vendors don't need a code change.
    for (const allowed of _vendorHomepageHosts(catalog)) {
      if (host === allowed || host.endsWith('.' + allowed)) return true;
    }
    // Allow hostnames that appear in any product.url within the catalog
    // (brand-vs-reseller case: vendor=mit but products link to easylight.sk).
    const products = catalog?.products || {};
    for (const slot of Object.values(products)) {
      for (const p of slot) {
        const candidates = [];
        const u = p?.url;
        const a = p?.affiliateUrl;
        if (typeof u === 'string') candidates.push(u);
        else if (u && typeof u === 'object') candidates.push(...Object.values(u));
        if (typeof a === 'string') candidates.push(a);
        else if (a && typeof a === 'object') candidates.push(...Object.values(a));
        for (const c of candidates) {
          try {
            if (new URL(c).hostname.toLowerCase() === host) return true;
          } catch {}
        }
      }
    }
    return false;
  } catch { return false; }
}

// Sluggify a product key/name into a stable analytics event suffix.
// Strict character filter prevents broken HTML attrs and keeps Umami event
// names tidy. ASCII-only, lowercase, dash-separated.
function _eventSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Append UTM params so the affiliate dashboard can attribute traffic by
// surface (which CTA the user clicked) without colliding with the existing
// partner-code params. Idempotent: re-tagging an already-tagged URL
// overwrites our keys instead of duplicating them.
//
// `campaign` defaults to "emf" for back-compat with the original EMF-only
// caller; non-EMF surfaces (supplements, lifestyle, marker recs) pass their
// own bucket so SLT-side and Mitochondriak-side dashboards can attribute
// per-surface traffic without bucketing everything under "emf".
export function _addUTMParams(url, content, campaign = 'emf') {
  if (!url) return url;
  let u;
  try { u = new URL(url); } catch { return url; }
  u.searchParams.set('utm_source', 'getbased');
  u.searchParams.set('utm_medium', 'affiliate');
  u.searchParams.set('utm_campaign', campaign);
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}

function _buildEMFProductRow(product, eventPrefix, region, catalog) {
  // Resolve region-aware URL: prefer affiliateUrl, fall back to url. Either
  // may be a Record<RegionCode, string> for products with per-market shops.
  const rawUrl = _resolveProductUrlForRegion(product, region) || product.url;
  const isValid = _isTrustedAffiliateUrl(rawUrl, catalog);
  const meta = [];
  if (product.vendor) meta.push(escapeHTML(product.vendor));
  if (product.kind) meta.push(escapeHTML(product.kind));
  const productName = escapeHTML(product.name);
  // Vendor name for link copy + aria-label. Falls back to brand or "vendor"
  // so we never hardcode a single vendor's name into a generic builder.
  const vendorName = escapeHTML(product.vendor || product.brand || 'vendor');
  // Analytics: a per-click event lets the maintainer see which surface and
  // which product converted. Opt-out via Settings → Privacy gate already
  // suppresses Umami load; this attribute becomes a no-op there.
  const slug = _eventSlug(product.key || product._tag || product.name);
  // Cap at 50 chars — Umami's API rejects longer names with HTTP 400.
  const evtName = (eventPrefix ? `emf-${eventPrefix}-${slug}` : `emf-rec-${slug}`).slice(0, 50).replace(/-+$/, '');
  // Mirror the Umami event in utm_content so the partner-side report
  // (UTM) and our internal click count (Umami) share the same surface label.
  const utmContent = eventPrefix ? `${eventPrefix}-${slug}` : `emf-rec-${slug}`;
  const url = isValid ? _addUTMParams(rawUrl, utmContent) : rawUrl;
  return `<div class="rec-product rec-emf-product">
    <div class="rec-emf-product-head">
      <strong>${productName}</strong>
      ${meta.length ? `<span class="rec-emf-product-meta">${meta.join(' · ')}</span>` : ''}
    </div>
    ${product.blurb ? `<div class="rec-emf-product-blurb">${escapeHTML(product.blurb)}</div>` : ''}
    ${isValid ? `<a class="rec-product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener sponsored" data-umami-event="${escapeHTML(evtName)}" aria-label="View ${productName} on ${vendorName}, opens in new tab">View on ${vendorName} →</a>` : ''}
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
  const eventPrefix = opts.eventPrefix || 'meter-rec';
  const body = meters.map(m => _buildEMFProductRow(m, eventPrefix, getUserRegion(), catalog)).join('');
  const vendor = _resolveVendorForCoupon(catalog, meters);
  return `${_buildDisclosureBanner()}<div class="rec-section rec-emf-section${gated}" onclick="if(!event.target.closest('a,button'))event.stopPropagation()">
    <div class="rec-section-header">${heading}</div>
    <div class="rec-content">
      ${body}
      ${_buildCouponLine(vendor, getUserRegion())}
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
  const eventPrefix = opts.eventPrefix || 'mitigation-rec';
  const body = products.map(p => _buildEMFProductRow(p, eventPrefix, getUserRegion(), catalog)).join('');
  const vendor = _resolveVendorForCoupon(catalog, products);
  return `${_buildDisclosureBanner()}<div class="rec-section rec-emf-section${gated}" onclick="if(!event.target.closest('a,button'))event.stopPropagation()">
    <div class="rec-section-header">${heading}</div>
    <div class="rec-content">
      ${body}
      ${_buildCouponLine(vendor, getUserRegion())}
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
    return `<div class="ctx-tip-emf-nudge"><span aria-hidden="true">💡</span> Want to measure your home's EMF environment? <a href="#" onclick="${openHandler}" data-umami-event="emf-nudge-env-tips-noassessment">Open the EMF assessment →</a></div>`;
  }
  const latest = assessments.reduce((a, b) => (a.date > b.date ? a : b));
  const ageDays = (Date.now() - new Date(latest.date + 'T00:00:00').getTime()) / 86400000;
  // 120 days ≈ 4 months — long enough that a re-check is genuinely useful (sources
  // shift: new neighbor, new appliance, new cell tower), short enough that demo
  // profiles with semi-fresh assessments still surface the "stale" path.
  if (ageDays > 120) {
    const months = Math.round(ageDays / 30);
    const span = months >= 12 ? 'over a year' : `${months} ${months === 1 ? 'month' : 'months'}`;
    return `<div class="ctx-tip-emf-nudge"><span aria-hidden="true">💡</span> Your last EMF check was ${span} ago. <a href="#" onclick="${openHandler}" data-umami-event="emf-nudge-env-tips-stale">Re-check the room →</a></div>`;
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
      rsid, gene: stored.gene, variant: stored.variant, genotype: g,
      direction: hint.direction, text: hint.text, ref: hint.ref
    });
  }

  return hints;
}

// ═══════════════════════════════════════════════
// HTML RENDERING
// ═══════════════════════════════════════════════
function buildProductRow(product, region, slotKey) {
  const parts = [];
  if (product.brand) parts.push(`<strong>${escapeHTML(product.brand)}</strong>`);
  if (product.name) parts.push(escapeHTML(product.name));
  const meta = [];
  if (product.dosage) meta.push(escapeHTML(product.dosage));
  if (product.priceCZK) meta.push(`~${escapeHTML(String(product.priceCZK))} CZK`);
  else if (product.priceEUR) meta.push(`~\u20AC${escapeHTML(String(product.priceEUR))}`);
  // Resolve region-aware URL: handles per-region maps for vendors with
  // different storefronts per market (easylight.sk for CZ/SK +
  // mitochondriak.com for INTL). Falls back to flat string.
  const rawUrl = _resolveProductUrlForRegion(product, region);
  const isValid = rawUrl && typeof rawUrl === 'string' && /^https?:\/\//.test(rawUrl);
  // Stamp UTM params for partner-dashboard attribution. Campaign = the slot
  // category prefix (vitamins, env, sleep…) so each surface buckets cleanly
  // even across vendors. utm_content = "<slot>-<product>" for per-row
  // attribution. Idempotent: re-renders don't accumulate duplicate keys.
  const campaign = slotKey ? slotKey.split('.')[0] : 'rec';
  const productSlug = _eventSlug(product.key || `${product.brand || ''}-${product.name || ''}`);
  const utmContent = slotKey ? `${slotKey.replace('.', '-')}-${productSlug}` : productSlug;
  const url = isValid ? _addUTMParams(rawUrl, utmContent, campaign) : rawUrl;
  // Umami event mirrors utm_content so the partner-side report (UTM) and
  // our internal click count (Umami) share the same surface label.
  // Prefix `rec-` separates these from the existing `emf-*` events.
  // Cap at 50 chars — Umami's API rejects longer names with HTTP 400.
  const evtName = `rec-${campaign}-${productSlug}`.slice(0, 50).replace(/-+$/, '');
  // aria-label gives screen-reader users the brand + name + new-tab hint
  // (matches the EMF row's a11y treatment).
  const ariaTarget = escapeHTML([product.brand, product.name].filter(Boolean).join(' '));
  return `<div class="rec-product">
    <span class="rec-product-info">${parts.join(' \u00b7 ')}${meta.length ? ' \u00b7 ' + meta.join(' \u00b7 ') : ''}</span>
    ${isValid ? `<a class="rec-product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener sponsored" data-umami-event="${escapeHTML(evtName)}" aria-label="View ${ariaTarget}, opens in new tab">View \u2192</a>` : ''}
  </div>`;
}

// Human-readable label for the active region. Shown in the rec-disclosure
// footer so users know which market's products + URLs they're seeing,
// since the recs are silently filtered by their profile country.
const REGION_LABELS = {
  CZ: 'Czech Republic', SK: 'Slovakia', DE: 'Germany', AT: 'Austria',
  US: 'United States', EU: 'European Union', INTL: 'worldwide',
  CZSK: 'Czech Republic + Slovakia',
};
export function regionLabel(region) {
  // Unknown ISO codes (UK, AU, BG…) fall back to "worldwide" — better than
  // showing a raw 2-letter code that looks like a bug to users.
  return REGION_LABELS[region] || 'worldwide';
}

function buildDisclosureFooter() {
  const r = getUserRegion();
  const label = regionLabel(r);
  // Link points to wherever the user can change their country. Click handler
  // delegates to the host app via a global (window.openProfileLocationEditor)
  // so this module stays decoupled. Falls back to '#' if no host is wired.
  const editLink = `<a href="#" class="rec-region-edit" onclick="event.preventDefault();(window.openProfileLocationEditor||(()=>{}))()" aria-label="Change country for product recommendations">change</a>`;
  return `<div class="rec-disclosure">Affiliate links are marked. Brands cannot pay for placement. <span class="rec-region-tag">Showing for ${escapeHTML(label)} · ${editLink}</span></div>`;
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
    for (const fp of foodProducts) inner += buildProductRow(fp, region, slotKey);
  } else if (slot?.foodForms?.length) {
    inner += `<div class="rec-section-label">WHOLE FOOD <span class="rec-tier-hint">from nature</span></div>`;
    inner += `<div class="rec-item-food">${slot.foodForms.map(f => escapeHTML(f)).join(' · ')}</div>`;
  }

  // Tier 3: Tools
  if (toolProducts.length) {
    inner += `<div class="rec-section-label">TOOLS <span class="rec-tier-hint">supports nature</span></div>`;
    for (const tp of toolProducts) inner += buildProductRow(tp, region, slotKey);
  } else if (slot?.productForms?.length) {
    inner += `<div class="rec-section-label">TOOLS <span class="rec-tier-hint">supports nature</span></div>`;
    inner += `<div class="rec-item-form">${slot.productForms.map(t => escapeHTML(t)).join(' · ')}</div>`;
  }

  // Tier 4: Supplements — inline
  if (suppProducts.length) {
    inner += `<div class="rec-section-label">SUPPLEMENTS <span class="rec-tier-hint">last resort</span></div>`;
    for (const sp of suppProducts) inner += buildProductRow(sp, region, slotKey);
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
  const statusNote = isNormal ? `<div class="rec-in-range-note">Your value is in range. These tips are for general reference.</div>` : '';
  // Coupon line: render when any rendered product references a vendor with a
  // resolvable coupon for the current region. Visible to supplement/lifestyle
  // recs the same way EMF gets it — every vendor that ships a coupon should
  // surface it where their products surface.
  const vendor = _resolveVendorForCoupon(_catalog, products);
  const couponLine = vendor && hasProducts ? _buildCouponLine(vendor, region) : '';
  return `${_buildDisclosureBanner()}<div class="rec-section${gated}" onclick="if(!event.target.closest('a,button'))event.stopPropagation()">
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
