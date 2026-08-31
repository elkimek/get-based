// @ts-check
// recommendations-products.js - product filtering, affiliate URLs, and product rec renderers

import { getProfileLocation } from './profile.js';
import {
  COUNTRY_TO_REGION,
  regionLabel as formatRegionLabel,
  regionLookupChain as lookupRegionChain,
} from './recommendations-region.js';
import { scheduleRecommendationsTask } from './recommendations-runtime.js';
import { escapeAttr, escapeHTML } from './utils.js';

export function recActionAttrs(action, attrs = {}) {
  return [
    `data-rec-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-rec-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

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

export function regionLookupChain(region) {
  return lookupRegionChain(region);
}

export function getUserRegion() {
  const loc = getProfileLocation();
  if (!loc.country) return 'INTL';
  const c = loc.country.toLowerCase().trim();
  if (COUNTRY_TO_REGION[c]) return COUNTRY_TO_REGION[c];
  // Unknown country: graceful default. Anyone outside our explicit list
  // (UK, AU, CA, JP, ...) gets INTL - they see worldwide-tagged products
  // and the renderer falls through to the INTL homepage / coupon for any
  // vendor with multi-region keys.
  return 'INTL';
}

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

export function regionLabel(region) {
  return formatRegionLabel(region);
}

export function getEMFMeters(catalog, types) {
  const products = catalog?.products?.['_internal.emfMeters'] || [];
  if (!types || !types.length) return products;
  const wanted = new Set(types);
  return products.filter(m => (m.matchTypes || []).some(t => wanted.has(t)));
}

// Mitigation tag (stored on a room) -> catalog slot key. Single map keeps the
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

// Look up a light-therapy device in the catalog by slug. The slug
// matches `device.catalogSlug` (which mirrors the preset id in
// data/light-device-presets.json) and the catalog product's `key` field.
// Falls back to the device's preset id if catalogSlug isn't set on
// older device records - old devices added before this wiring landed
// still resolve correctly without a migration.
export function getLightDeviceProduct(catalog, slug) {
  if (!catalog?.products || !slug) return null;
  const products = catalog.products['_internal.lightDevices'];
  if (!Array.isArray(products) || products.length === 0) return null;
  // Per-region visibility filter - same chain semantics as
  // getProductsForSlot. Devices tagged ["INTL"] visible everywhere;
  // ["CZ"] only to CZ + CZSK users; etc.
  const region = getUserRegion();
  const chain = new Set(regionLookupChain(region));
  return products.find(p =>
    p.key === slug &&
    Array.isArray(p.regions) &&
    p.regions.some(r => chain.has(r))
  ) || null;
}

// Render a small "Source on {vendor}" affiliate row to surface alongside
// a device card on the Light page. Same UTM + sponsored-rel + Umami
// event pattern as the EMF product rows. Returns '' when:
//   - product recs toggle is off
//   - catalog or slug missing
//   - no matching product in catalog
//   - resolved URL fails the trusted-host allowlist
//
// Campaign tag is "light-devices" so the partner-side UTM dashboard can
// attribute device-card traffic separately from the EMF + supplement
// surfaces.
export function renderLightDeviceAffiliateRow(catalog, slug) {
  if (!isProductRecsEnabled() || !catalog || !slug) return '';
  const product = getLightDeviceProduct(catalog, slug);
  if (!product) return '';
  const region = getUserRegion();
  const rawUrl = _resolveProductUrlForRegion(product, region) || product.url;
  if (!_isTrustedAffiliateUrl(rawUrl, catalog)) return '';
  const productName = escapeHTML(product.name || slug);
  const vendorName = escapeHTML(product.vendor || product.brand || 'vendor');
  const slug_ = _eventSlug(product.key || product.name || slug);
  const evtName = `light-device-rec-${slug_}`.slice(0, 50).replace(/-+$/, '');
  const url = _addUTMParams(rawUrl, `light-device-${slug_}`, 'light-devices');
  return `<a class="rec-product-link rec-light-device-link" href="${escapeHTML(url)}" target="_blank" rel="noopener sponsored" data-umami-event="${escapeHTML(evtName)}" aria-label="View ${productName} on ${vendorName}, opens in new tab">View on ${vendorName} →</a>`;
}

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
      // Dedup key - name + vendorKey is more stable than the URL since URL
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
export function _resolveVendorForCoupon(catalog, products) {
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
// { CZ: ..., SK: ..., EN: ... } maps instead of a flat value. Resolve to a
// single entry using the catalog's region, decomposing multi-region markers
// like "CZSK" into component codes (CZ, SK), and falling back to a worldwide
// key (EN/INTL/WORLDWIDE) before giving up.
export function _pickRegional(map, catalogRegion) {
  // Arrays trip `typeof === 'object'`. Reject them up front - without this
  // a malformed `coupon: [{code:'X'}]` would silently render via the
  // Object.values fallback, producing wrong attribution.
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
  // Walk the region hierarchy chain (most specific -> INTL). Same chain as
  // getProductsForSlot, so vendor-key resolution and product visibility
  // share the same notion of "what region covers this user."
  for (const r of regionLookupChain(catalogRegion)) {
    if (map[r]) return map[r];
  }
  // Decompose multi-region markers not in the chain (e.g. "USCA" -> US, CA).
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

export function _buildCouponLine(catalogOrVendor, region) {
  // Accept either a vendor object directly, or a catalog with legacy .vendor
  // top-level (back-compat with the old emf-products.json shape).
  const rawCoupon = catalogOrVendor?.coupon || catalogOrVendor?.vendor?.coupon;
  const c = _resolveCouponForRegion(rawCoupon, region);
  if (!c?.code) return '';
  const code = escapeHTML(c.code);
  // aria-live on the wrapper so the "✓ Copied" flash is announced to SR users.
  return `<div class="rec-coupon" aria-live="polite" aria-atomic="true">Use code <button type="button" class="rec-coupon-code" ${recActionAttrs('copy-coupon')} data-code="${escapeAttr(c.code)}" aria-label="Copy coupon code ${code} to clipboard" title="Click to copy">${code}</button> at checkout for ${escapeHTML(c.userDiscount || '10%')} off.</div>`;
}

export function copyCouponCode(btn) {
  const code = btn?.dataset?.code;
  if (!code) return;
  // Guard against rapid double-clicks: if the button is still in the
  // "✓ Copied" flash state, skip - the new flash would otherwise stomp the
  // running timer and the button could get stuck on the temporary text.
  if (btn.dataset.flashing === '1') return;
  const flashCopied = (label) => {
    const orig = btn.textContent;
    btn.dataset.flashing = '1';
    btn.textContent = label;
    scheduleRecommendationsTask(() => {
      btn.textContent = orig;
      delete btn.dataset.flashing;
    }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => flashCopied('✓ Copied')).catch(() => {
      // Permissions issue - surface honest fallback rather than fake success
      flashCopied('Press Ctrl+C');
    });
  } else {
    // Insecure context (HTTP) or ancient browser - select the text so the
    // user can press Ctrl+C themselves; never fake "Copied".
    const r = document.createRange();
    r.selectNodeContents(btn);
    const s = getSelection();
    if (s) {
      s.removeAllRanges();
      s.addRange(r);
    }
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

function _isTrustedAffiliateUrl(url, catalog) {
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
  // which product converted. Opt-out via Settings -> Privacy gate already
  // suppresses Umami load; this attribute becomes a no-op there.
  const slug = _eventSlug(product.key || product._tag || product.name);
  // Cap at 50 chars - Umami's API rejects longer names with HTTP 400.
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
  const heading = escapeHTML(opts.heading || 'Meter options to explore');
  const eventPrefix = opts.eventPrefix || 'meter-rec';
  const body = meters.map(m => _buildEMFProductRow(m, eventPrefix, getUserRegion(), catalog)).join('');
  const vendor = _resolveVendorForCoupon(catalog, meters);
  return `${_buildDisclosureBanner()}<div class="rec-section rec-emf-section${gated}" data-rec-section-click-guard>
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
  const heading = escapeHTML(opts.heading || 'Product ideas related to this assessment');
  const eventPrefix = opts.eventPrefix || 'mitigation-rec';
  const body = products.map(p => _buildEMFProductRow(p, eventPrefix, getUserRegion(), catalog)).join('');
  const vendor = _resolveVendorForCoupon(catalog, products);
  return `${_buildDisclosureBanner()}<div class="rec-section rec-emf-section${gated}" data-rec-section-click-guard>
    <div class="rec-section-header">${heading}</div>
    <div class="rec-content">
      ${body}
      ${_buildCouponLine(vendor, getUserRegion())}
      ${buildDisclosureFooter()}
    </div>
  </div>`;
}

export function buildProductRow(product, region, slotKey) {
  const parts = [];
  if (product.brand) parts.push(`<strong>${escapeHTML(product.brand)}</strong>`);
  if (product.name) parts.push(escapeHTML(product.name));
  const meta = [];
  if (product.dosage) meta.push(escapeHTML(product.dosage));
  if (product.priceCZK) meta.push(`~${escapeHTML(String(product.priceCZK))} CZK`);
  else if (product.priceEUR) meta.push(`~€${escapeHTML(String(product.priceEUR))}`);
  // Resolve region-aware URL: handles per-region maps for vendors with
  // different storefronts per market (easylight.sk for CZ/SK +
  // mitochondriak.com for INTL). Falls back to flat string.
  const rawUrl = _resolveProductUrlForRegion(product, region);
  const isValid = rawUrl && typeof rawUrl === 'string' && /^https?:\/\//.test(rawUrl);
  // Stamp UTM params for partner-dashboard attribution. Campaign = the slot
  // category prefix (vitamins, env, sleep...) so each surface buckets cleanly
  // even across vendors. utm_content = "<slot>-<product>" for per-row
  // attribution. Idempotent: re-renders don't accumulate duplicate keys.
  const campaign = slotKey ? slotKey.split('.')[0] : 'rec';
  const productSlug = _eventSlug(product.key || `${product.brand || ''}-${product.name || ''}`);
  const utmContent = slotKey ? `${slotKey.replace('.', '-')}-${productSlug}` : productSlug;
  const url = isValid ? _addUTMParams(rawUrl, utmContent, campaign) : rawUrl;
  // Umami event mirrors utm_content so the partner-side report (UTM) and
  // our internal click count (Umami) share the same surface label.
  // Prefix `rec-` separates these from the existing `emf-*` events.
  // Cap at 50 chars - Umami's API rejects longer names with HTTP 400.
  const evtName = `rec-${campaign}-${productSlug}`.slice(0, 50).replace(/-+$/, '');
  // aria-label gives screen-reader users the brand + name + new-tab hint
  // (matches the EMF row's a11y treatment).
  const ariaTarget = escapeHTML([product.brand, product.name].filter(Boolean).join(' '));
  return `<div class="rec-product">
    <span class="rec-product-info">${parts.join(' · ')}${meta.length ? ' · ' + meta.join(' · ') : ''}</span>
    ${isValid ? `<a class="rec-product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener sponsored" data-umami-event="${escapeHTML(evtName)}" aria-label="View ${ariaTarget}, opens in new tab">View →</a>` : ''}
  </div>`;
}

export function buildDisclosureFooter() {
  const r = getUserRegion();
  const label = regionLabel(r);
  // Link points to wherever the user can change their country. Click handler
  // delegates through the runtime adapter so this module stays decoupled.
  const editLink = `<a href="#" class="rec-region-edit" ${recActionAttrs('edit-region')} aria-label="Change country for product tips">change</a>`;
  return `<div class="rec-disclosure">Affiliate links are marked. Brands cannot pay for placement. <span class="rec-region-tag">Showing for ${escapeHTML(label)} · ${editLink}</span></div>`;
}

export function _buildMiniDisclaimer() {
  return `<div class="rec-mini-disclaimer">General information only — not individualized medical advice or a care plan. Do not start, stop, or change medication or supplements based only on these tips. Discuss relevant options with a qualified healthcare professional.</div>`;
}

export function _buildDisclosureBanner() {
  if (hasSeenDisclosure()) return '';
  return `<div class="rec-disclosure-banner">
    General information only. These tips are not instructions, individualized medical advice, or a care plan, and are not intended to diagnose, treat, or prevent disease. Do not start, stop, or change medication or supplements based only on these tips. Discuss relevant options with a qualified healthcare professional, especially if pregnant, nursing, or taking medications. Intended for adults. Affiliate links are marked — brands cannot pay for placement.
    <button class="rec-disclosure-btn" ${recActionAttrs('accept-disclosure')}>Got it</button>
  </div>`;
}

// Match a sun-context channel deficit to catalog devices that can fill it.
// `channelKey` is one of the 8 channels (vitamin_d, circadian, nir_solar,
// no_cv, pomc, violet_eye, pbm_red, pbm_nir). `presets` is the parsed
// data/light-device-presets.json registry - its `presets[].channels` array
// is the join key. Returns deduplicated catalog products (region-filtered)
// that target the channel via `_internal.lightDevices`.
//
// Used by the Light & Sun page to surface a CTA when deficit detection
// fires for a channel a device can address (especially pbm_red / pbm_nir,
// where solar exposure can't realistically fill the gap).
export function recommendDeviceProductsForChannelDeficit(catalog, channelKey, presets) {
  if (!catalog?.products || !channelKey || !presets) return [];
  const presetList = Array.isArray(presets) ? presets : (presets.presets || []);
  if (!presetList.length) return [];
  const slugs = new Set();
  for (const p of presetList) {
    if (!p?.catalogSlug) continue;
    if (Array.isArray(p.channels) && p.channels.includes(channelKey)) {
      slugs.add(p.catalogSlug);
    }
  }
  if (!slugs.size) return [];
  const products = catalog.products['_internal.lightDevices'];
  if (!Array.isArray(products) || !products.length) return [];
  const region = getUserRegion();
  const chain = new Set(regionLookupChain(region));
  const seen = new Set();
  const out = [];
  for (const product of products) {
    if (!slugs.has(product.key)) continue;
    if (!Array.isArray(product.regions) || !product.regions.some(r => chain.has(r))) continue;
    if (seen.has(product.key)) continue;
    seen.add(product.key);
    out.push(product);
  }
  return out;
}

// Render a "Fill this channel" CTA card listing devices that target the
// deficient channel. Returns '' when product recs are off, no presets/
// catalog match, or no trusted URL resolves. The `humanLabel` is shown in
// the card title (e.g. "Red 660 nm" rather than "pbm_red").
export function renderChannelDeficitDeviceRecs(catalog, channelKey, presets, opts = {}) {
  if (!isProductRecsEnabled()) return '';
  const products = recommendDeviceProductsForChannelDeficit(catalog, channelKey, presets);
  if (!products.length) return '';
  const region = getUserRegion();
  const humanLabel = escapeHTML(opts.label || channelKey);
  // Cap at 3 to keep the card compact - the catalog is curated, not a
  // marketplace. If the user wants more they can browse Light devices.
  const rows = [];
  for (const product of products.slice(0, 3)) {
    const rawUrl = _resolveProductUrlForRegion(product, region) || product.url;
    if (!_isTrustedAffiliateUrl(rawUrl, catalog)) continue;
    const slug_ = _eventSlug(product.key || product.name || '');
    const evtName = `light-deficit-rec-${slug_}`.slice(0, 50).replace(/-+$/, '');
    const url = _addUTMParams(rawUrl, `light-deficit-${slug_}`, 'light-devices');
    const name = escapeHTML(product.name || product.key);
    const vendor = escapeHTML(product.vendor || product.brand || 'vendor');
    const blurb = product.blurb ? escapeHTML(product.blurb) : '';
    rows.push(`<a class="rec-product-link rec-light-deficit-link" href="${escapeHTML(url)}" target="_blank" rel="noopener sponsored" data-umami-event="${escapeHTML(evtName)}" aria-label="View ${name} on ${vendor}, opens in new tab"><strong>${name}</strong>${blurb ? ` — ${blurb}` : ''} <span class="rec-vendor">View on ${vendor} →</span></a>`);
  }
  if (!rows.length) return '';
  return `<div class="rec-channel-deficit" role="region" aria-label="${humanLabel} channel device options">
    <div class="rec-channel-deficit-head">Device options related to the ${humanLabel} channel</div>
    <div class="rec-channel-deficit-list">${rows.join('')}</div>
    <div class="rec-channel-deficit-foot">Affiliate links · <a href="#" ${recActionAttrs('open-privacy-settings')}>turn off</a></div>
  </div>`;
}
