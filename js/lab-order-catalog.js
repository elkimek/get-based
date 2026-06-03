// lab-order-catalog.js — curated Labshop product mapping for the chat order preview.
// Stage-1 only: explicit, allowlisted product IDs. No free-form checkout.

export const LABSHOP_PROVIDER = 'labshop';

export const LABSHOP_PRODUCTS = {
  '20036': {
    id: '20036',
    provider: LABSHOP_PROVIDER,
    name: 'Vitaminy B - Basic',
    priceCzk: 500,
    url: 'https://www.labshop.cz/vitaminy-b-basic',
    markers: ['vitamin B12', 'folate', 'vitamin B6', 'vitamin B1', 'vitamin B2'],
    note: 'Verified live: product 20036 can be added to Labshop cart; guest checkout still needs reCAPTCHA handoff.',
  },
};

export const LAB_ORDER_INTENT_EXAMPLES = [
  'Order B12 and folate from Labshop',
  'Prepare Labshop cart for methylation markers',
  'Make me an order for vitamins B basic',
];

const KEYWORD_PRODUCT_MAP = [
  { terms: ['b12', 'cobalamin', 'folate', 'folic', 'methylation', 'homocysteine', 'vitamin b', 'vitaminy b'], productIds: ['20036'] },
];

export function getLabshopProduct(productId) {
  return LABSHOP_PRODUCTS[String(productId)] || null;
}

export function mapTextToLabshopProducts(text) {
  const normalized = String(text || '').toLowerCase();
  const ids = new Set();
  const matchedTerms = [];
  for (const row of KEYWORD_PRODUCT_MAP) {
    for (const term of row.terms) {
      if (normalized.includes(term)) {
        row.productIds.forEach(id => ids.add(id));
        matchedTerms.push(term);
      }
    }
  }
  return {
    products: [...ids].map(id => LABSHOP_PRODUCTS[id]).filter(Boolean),
    matchedTerms,
  };
}
