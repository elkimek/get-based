import { renderHTML as renderTipsProductHTML } from './components/TipsProduct.svelte.html.js';
import { renderHTML as renderTipsCouponHTML } from './components/TipsCoupon.svelte.html.js';
import { renderHTML as renderTipsDisclosureHTML } from './components/TipsDisclosure.svelte.html.js';
import { renderHTML as renderTipsBannerHTML } from './components/TipsBanner.svelte.html.js';
import { renderHTML as renderTipsDisclaimerHTML } from './components/TipsDisclaimer.svelte.html.js';
import { renderHTML as renderTipsSectionHTML } from './components/TipsSection.svelte.html.js';
import { tipsText, type TipsProductView, type TipsEMFProductView, type TipsCouponView, type TipsDisclosureView, type TipsSectionView } from './tips-presentation.js';
import { renderHTML as renderDeviceOptions } from './components/LightDeviceRecommendations.svelte.html.js';
import { projectDeviceRecommendations, type ResolvedDeviceOption } from './light-device-recommendations-presentation.js';
import { renderHTML as renderDeviceAffiliate } from './components/LightDeviceAffiliate.svelte.html.js';
import type { LightDeviceAffiliateView } from './light-device-library-presentation.js';
import type { LightDeviceRecord } from './light-devices-store.js';

// Catalog scalar fields remain raw; the original renderers escape/coerce them.
export interface RecommendationProduct extends Record<string, unknown> {
  regions?: string[] | null; matchTypes?: string[] | null;
  key?: unknown; name?: unknown; brand?: unknown; vendor?: unknown; vendorKey?: unknown;
  kind?: unknown; blurb?: unknown; dosage?: unknown; priceCZK?: unknown; priceEUR?: unknown;
  url?: unknown; affiliateUrl?: unknown; _tag?: unknown;
}
export interface RecommendationVendor extends Record<string, unknown> {
  name?: unknown; coupon?: unknown; homepage?: unknown;
  vendor?: { coupon?: unknown } | null;
}
export interface ProductCatalog extends RecommendationVendor {
  products?: Record<string, RecommendationProduct[]> | null;
  vendors?: Record<string, RecommendationVendor> | null;
}
type CatalogInput = ProductCatalog | null | undefined;
type ProductCoupon = Record<string, unknown>;
type Region = string | null | undefined;
type DeviceProductPreset = Pick<LightDeviceRecord, 'catalogSlug' | 'channels'>;
type DeviceProductPresets = Array<DeviceProductPreset | null | undefined>
  | { presets?: Array<DeviceProductPreset | null | undefined> | null } | null | undefined;
interface ProductSectionOptions { types?: string[] | null; heading?: unknown; eventPrefix?: string }

// recommendations-products.js - product filtering, affiliate URLs, and product rec renderers

import { getProfileLocation } from './profile.js';
import {
  COUNTRY_TO_REGION,
  regionLabel as formatRegionLabel,
  regionLookupChain as lookupRegionChain,
} from './recommendations-region.js';
import { scheduleRecommendationsTask } from './recommendations-runtime.js';
import { actionAttributes } from './action-attributes.js';

export function recActionAttrs(action: string, attrs: Parameters<typeof actionAttributes>[2] = {}) {
  return actionAttributes("rec", action, attrs);
}

export function isProductRecsEnabled() {
  return localStorage.getItem('labcharts-show-product-recs') !== 'false';
}

export function setProductRecsEnabled(on: unknown) {
  localStorage.setItem('labcharts-show-product-recs', on ? 'true' : 'false');
}

export function hasSeenDisclosure() {
  return localStorage.getItem('labcharts-rec-disclosure') === 'seen';
}

export function markDisclosureSeen() {
  localStorage.setItem('labcharts-rec-disclosure', 'seen');
}

export function regionLookupChain(region: Region) {
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
export function getProductsForSlot(catalog: CatalogInput, slotKey: string, region: Region) {
  if (!catalog || !catalog.products) return [];
  const products = catalog.products[slotKey];
  if (!products || !products.length) return [];
  const chain = new Set(regionLookupChain(region));
  return products.filter(p => p.regions && p.regions.some(r => chain.has(r)));
}

export function regionLabel(region: Region) {
  return formatRegionLabel(region as string);
}

export function getEMFMeters(catalog: CatalogInput, types?: string[] | null) {
  const products = catalog?.products?.['_internal.emfMeters'] || [];
  if (!types || !types.length) return products;
  const wanted = new Set(types);
  return products.filter(m => (m.matchTypes || []).some(t => wanted.has(t)));
}

// Mitigation tag (stored on a room) -> catalog slot key. Single map keeps the
// per-room chip strings (which match the constants.js EMF_MITIGATIONS list)
// glued to the slot keys we created in the unified catalog.
const _MITIGATION_TAG_TO_SLOT: Record<string, string> = {
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
export function getLightDeviceProduct(catalog: CatalogInput, slug: unknown) {
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
export function getLightDeviceAffiliateView(catalog: CatalogInput, slug: unknown): LightDeviceAffiliateView | null {
  if (!isProductRecsEnabled() || !catalog || !slug) return null;
  const product = getLightDeviceProduct(catalog, slug);
  if (!product) return null;
  const region = getUserRegion();
  const rawUrl = _resolveProductUrlForRegion(product, region) || product.url;
  if (!_isTrustedAffiliateUrl(rawUrl, catalog)) return null;
  const productName = String(product.name || slug);
  const vendorName = String(product.vendor || product.brand || 'vendor');
  const slug_ = _eventSlug(product.key || product.name || slug);
  const evtName = `light-device-rec-${slug_}`.slice(0, 50).replace(/-+$/, '');
  const url = _addUTMParams(rawUrl, `light-device-${slug_}`, 'light-devices');
  return { href: url == null ? '' : String(url), event: evtName,
    label: `View ${productName} on ${vendorName}, opens in new tab`, vendor: vendorName };
}
export function renderLightDeviceAffiliateRow(catalog: CatalogInput, slug: unknown) {
  const view = getLightDeviceAffiliateView(catalog, slug);
  return view ? renderDeviceAffiliate({ view }) : '';
}

export function getEMFProductsForMitigations(catalog: CatalogInput, tags: string[] | null | undefined) {
  if (!catalog?.products) return [];
  const out: RecommendationProduct[] = [];
  const seen = new Set<unknown>();
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
export function _resolveVendorForCoupon(catalog: CatalogInput, products: RecommendationProduct[] | null | undefined) {
  if (!products?.length || !catalog?.vendors) return null;
  for (const p of products) {
    const key = p.vendorKey || p.vendor;
    if (!key) continue;
    // Try by vendorKey first (canonical), fall back to scanning by name
    const direct = catalog.vendors[key as string];
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
export function _pickRegional<T>(map: Record<string, T> | null | undefined, catalogRegion: Region): T | null {
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
export function _resolveCouponForRegion(coupon: unknown, region: Region) {
  if (!coupon || typeof coupon !== 'object' || Array.isArray(coupon)) return null;
  if ('code' in coupon) return coupon as ProductCoupon;
  return _pickRegional(coupon as Record<string, ProductCoupon>, region);
}

// Discriminator: a flat homepage is a string; a per-region map is an object.
export function _resolveHomepageForRegion(homepage: unknown, region: Region) {
  if (!homepage) return null;
  if (typeof homepage === 'string') return homepage;
  return _pickRegional(homepage as Record<string, unknown>, region);
}

// Resolve a product's outbound URL for the active catalog region. Both
// `url` and `affiliateUrl` may be a flat string OR a Record<RegionCode, string>
// when the brand has different storefronts per market (e.g. easylight.sk for
// CZ/SK + mitochondriak.com for INTL). Prefer affiliateUrl over url.
export function _resolveProductUrlForRegion(product: RecommendationProduct | null | undefined, region: Region) {
  if (!product) return null;
  const aff = _resolveOneUrlField(product.affiliateUrl, region);
  if (aff) return aff;
  return _resolveOneUrlField(product.url, region);
}

function _resolveOneUrlField(field: unknown, region: Region) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && !Array.isArray(field)) return _pickRegional(field as Record<string, unknown>, region);
  return null;
}

export function getCouponLineView(catalogOrVendor: RecommendationVendor | null | undefined, region: Region): TipsCouponView | null {
  // Accept either a vendor object directly, or a catalog with legacy .vendor
  // top-level (back-compat with the old emf-products.json shape).
  const rawCoupon = catalogOrVendor?.coupon || catalogOrVendor?.vendor?.coupon;
  const c = _resolveCouponForRegion(rawCoupon, region);
  if (!c?.code) return null;
  return {code: tipsText(c.code), discount: tipsText(c.userDiscount || '10%')};
}

export function _buildCouponLine(catalogOrVendor: RecommendationVendor | null | undefined, region: Region) {
  const view = getCouponLineView(catalogOrVendor, region);
  return view ? renderTipsCouponHTML({view}) : '';
}

export function copyCouponCode(btn: HTMLElement | null | undefined) {
  const code = btn?.dataset?.code;
  if (!code) return;
  // Guard against rapid double-clicks: if the button is still in the
  // "✓ Copied" flash state, skip - the new flash would otherwise stomp the
  // running timer and the button could get stuck on the temporary text.
  if (btn.dataset.flashing === '1') return;
  const flashCopied = (label: string) => {
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

function _vendorHomepageHosts(catalog: CatalogInput) {
  const hosts = new Set<string>();
  const vendors = catalog?.vendors || {};
  for (const v of Object.values(vendors)) {
    const hp = v?.homepage;
    if (!hp) continue;
    const urls = typeof hp === 'string' ? [hp] : (typeof hp === 'object' ? Object.values(hp) : []);
    for (const u of urls) {
      try { hosts.add(new URL(u as string).hostname.toLowerCase()); } catch {}
    }
  }
  return hosts;
}

function _isTrustedAffiliateUrl(url: unknown, catalog: CatalogInput) {
  if (!url || !/^https?:\/\//i.test(url as string)) return false;
  try {
    const host = new URL(url as string).hostname.toLowerCase();
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
        const candidates: unknown[] = [];
        const u = p?.url;
        const a = p?.affiliateUrl;
        if (typeof u === 'string') candidates.push(u);
        else if (u && typeof u === 'object') candidates.push(...Object.values(u));
        if (typeof a === 'string') candidates.push(a);
        else if (a && typeof a === 'object') candidates.push(...Object.values(a));
        for (const c of candidates) {
          try {
            if (new URL(c as string).hostname.toLowerCase() === host) return true;
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
function _eventSlug(s: unknown) {
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
export function _addUTMParams<T>(url: T, content: unknown, campaign = 'emf') {
  if (!url) return url;
  let u;
  try { u = new URL(url as string); } catch { return url; }
  u.searchParams.set('utm_source', 'getbased');
  u.searchParams.set('utm_medium', 'affiliate');
  u.searchParams.set('utm_campaign', campaign);
  if (content) u.searchParams.set('utm_content', content as string);
  return u.toString();
}

export function getEMFProductRowView(product: RecommendationProduct, eventPrefix: string | null | undefined, region: Region, catalog: CatalogInput): TipsEMFProductView {
  const rawUrl = _resolveProductUrlForRegion(product, region) || product.url;
  const isValid = _isTrustedAffiliateUrl(rawUrl, catalog);
  const meta: string[] = [];
  if (product.vendor) meta.push(tipsText(product.vendor));
  if (product.kind) meta.push(tipsText(product.kind));
  const productName = tipsText(product.name);
  const vendorName = tipsText(product.vendor || product.brand || 'vendor');
  const slug = _eventSlug(product.key || product._tag || product.name);
  const evtName = (eventPrefix ? `emf-${eventPrefix}-${slug}` : `emf-rec-${slug}`).slice(0, 50).replace(/-+$/, '');
  const utmContent = eventPrefix ? `${eventPrefix}-${slug}` : `emf-rec-${slug}`;
  const url = isValid ? _addUTMParams(rawUrl, utmContent) : rawUrl;
  return {name: productName, vendor: vendorName, meta,
    blurb: product.blurb ? tipsText(product.blurb) : null,
    link: isValid ? {href: tipsText(url), event: evtName, label: `View ${productName} on ${vendorName}, opens in new tab`} : null};
}

/**
 * Render the EMF meter recommendation card (empty-state CTA).
 * Returns '' when the toggle is off or the catalog couldn't load.
 */
export function getEMFMeterSectionView(catalog: CatalogInput, opts: ProductSectionOptions = {}): TipsSectionView | null {
  if (!isProductRecsEnabled() || !catalog) return null;
  const meters = getEMFMeters(catalog, opts.types);
  if (!meters.length) return null;
  const gated = !hasSeenDisclosure();
  const heading = tipsText(opts.heading || 'Meter options to explore');
  const eventPrefix = opts.eventPrefix || 'meter-rec';
  const products = meters.map(m => getEMFProductRowView(m, eventPrefix, getUserRegion(), catalog));
  const vendor = _resolveVendorForCoupon(catalog, meters);
  const banner = !hasSeenDisclosure();
  const coupon = getCouponLineView(vendor, getUserRegion());
  const footer = getDisclosureFooterView();
  return {variant: 'emf', header: heading, gated, banner, normalNote: false, genetics: [], tiers: [], products,
    coupon, suggestionHref: null, footer, disclaimer: false};
}

export function renderEMFMeterRecs(catalog: CatalogInput, opts: ProductSectionOptions = {}) {
  const view = getEMFMeterSectionView(catalog, opts);
  return view ? renderTipsSectionHTML({view}) : '';
}

/**
 * Render the EMF mitigation-product recommendation block (post-interpretation CTA).
 * tags = flat array of mitigation strings collected across all rooms.
 */
export function getEMFMitigationSectionView(catalog: CatalogInput, tags: string[] | null | undefined, opts: ProductSectionOptions = {}): TipsSectionView | null {
  if (!isProductRecsEnabled() || !catalog) return null;
  const products = getEMFProductsForMitigations(catalog, tags);
  if (!products.length) return null;
  const gated = !hasSeenDisclosure();
  const heading = tipsText(opts.heading || 'Product ideas related to this assessment');
  const eventPrefix = opts.eventPrefix || 'mitigation-rec';
  const body = products.map(p => getEMFProductRowView(p, eventPrefix, getUserRegion(), catalog));
  const vendor = _resolveVendorForCoupon(catalog, products);
  const banner = !hasSeenDisclosure();
  const coupon = getCouponLineView(vendor, getUserRegion());
  const footer = getDisclosureFooterView();
  return {variant: 'emf', header: heading, gated, banner, normalNote: false, genetics: [], tiers: [], products: body,
    coupon, suggestionHref: null, footer, disclaimer: false};
}

export function renderEMFMitigationRecs(catalog: CatalogInput, tags: string[] | null | undefined, opts: ProductSectionOptions = {}) {
  const view = getEMFMitigationSectionView(catalog, tags, opts);
  return view ? renderTipsSectionHTML({view}) : '';
}

export function getProductRowView(product: RecommendationProduct, region: Region, slotKey?: string | null): TipsProductView {
  const brand = product.brand ? tipsText(product.brand) : null;
  const name = product.name ? tipsText(product.name) : null;
  const meta: string[] = [];
  if (product.dosage) meta.push(tipsText(product.dosage));
  if (product.priceCZK) meta.push(`~${String(product.priceCZK)} CZK`);
  else if (product.priceEUR) meta.push(`~€${String(product.priceEUR)}`);
  const rawUrl = _resolveProductUrlForRegion(product, region);
  const isValid = rawUrl && typeof rawUrl === 'string' && /^https?:\/\//.test(rawUrl);
  const campaign = slotKey ? slotKey.split('.')[0] : 'rec';
  const productSlug = _eventSlug(product.key || `${product.brand || ''}-${product.name || ''}`);
  const utmContent = slotKey ? `${slotKey.replace('.', '-')}-${productSlug}` : productSlug;
  const url = isValid ? _addUTMParams(rawUrl, utmContent, campaign!) : rawUrl;
  const evtName = `rec-${campaign}-${productSlug}`.slice(0, 50).replace(/-+$/, '');
  const ariaTarget = [product.brand, product.name].filter(Boolean).join(' ');
  return {brand, name, meta, link: isValid ? {href: tipsText(url), event: evtName, label: `View ${ariaTarget}, opens in new tab`} : null};
}

export function buildProductRow(product: RecommendationProduct, region: Region, slotKey?: string | null) {
  return renderTipsProductHTML({view: getProductRowView(product, region, slotKey)});
}

export function getDisclosureFooterView(): TipsDisclosureView {
  const r = getUserRegion();
  const label = regionLabel(r);
  return {region: tipsText(label)};
}

export function buildDisclosureFooter() {
  return renderTipsDisclosureHTML({view: getDisclosureFooterView()});
}

export function _buildMiniDisclaimer() {
  return renderTipsDisclaimerHTML({});
}

export function _buildDisclosureBanner() {
  if (hasSeenDisclosure()) return '';
  return renderTipsBannerHTML({});
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
export function recommendDeviceProductsForChannelDeficit(catalog: CatalogInput, channelKey: string | null | undefined, presets: DeviceProductPresets) {
  if (!catalog?.products || !channelKey || !presets) return [];
  const presetList = Array.isArray(presets) ? presets : (presets.presets || []);
  if (!presetList.length) return [];
  const slugs = new Set<unknown>();
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
  const seen = new Set<unknown>();
  const out: RecommendationProduct[] = [];
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
export function renderChannelDeficitDeviceRecs(catalog: CatalogInput, channelKey: string | null | undefined, presets: DeviceProductPresets, opts: { label?: unknown } = {}) {
  if (!isProductRecsEnabled()) return '';
  const products = recommendDeviceProductsForChannelDeficit(catalog, channelKey, presets);
  if (!products.length) return '';
  const region = getUserRegion();
  const humanLabel = opts.label || channelKey;
  // Cap at 3 to keep the card compact - the catalog is curated, not a
  // marketplace. If the user wants more they can browse Light devices.
  const rows: ResolvedDeviceOption[] = [];
  for (const product of products.slice(0, 3)) {
    const rawUrl = _resolveProductUrlForRegion(product, region) || product.url;
    if (!_isTrustedAffiliateUrl(rawUrl, catalog)) continue;
    const slug_ = _eventSlug(product.key || product.name || '');
    const evtName = `light-deficit-rec-${slug_}`.slice(0, 50).replace(/-+$/, '');
    const url = _addUTMParams(rawUrl, `light-deficit-${slug_}`, 'light-devices');
    rows.push({ href: url == null ? '' : String(url), event: evtName,
      name: product.name || product.key, vendor: product.vendor || product.brand || 'vendor',
      blurb: product.blurb || '' });
  }
  const view = projectDeviceRecommendations(humanLabel, rows);
  return view ? renderDeviceOptions({ view }) : '';
}
