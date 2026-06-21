// @ts-check
// recommendations-region.js — region hierarchy and labels for recommendation filtering.

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

// Country name / ISO code → granular region. Names are lowercased before
// lookup. Anything not in the table falls through to the caller's default.
// Granular regions matter because the region hierarchy chain treats CZ and
// SK as siblings under EU — a Slovak user who falls into "CZSK" always gets
// the CZ URL via the chain walk, never the SK one.
export const COUNTRY_TO_REGION = {
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

// Returns the lookup chain for a given region — most-specific first.
// Unknown regions get [region, INTL] as a graceful fallback.
export function regionLookupChain(region) {
  if (!region) return ['INTL'];
  return REGION_HIERARCHY[region] || [region, 'INTL'];
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
