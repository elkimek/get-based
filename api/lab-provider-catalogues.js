// lab-provider-catalogues.js — optional private/runtime lab catalogue injector.
//
// The public app code consumes normalized provider catalogue rows through
// globalThis.__GETBASED_LAB_PROVIDER_CATALOGUES__. This Vercel function can
// populate that global from a private env payload without baking real provider
// catalogue rows/product IDs/prices into the open-source frontend bundle.

export const config = { runtime: 'edge' };

const GLOBAL_NAME = '__GETBASED_LAB_PROVIDER_CATALOGUES__';
const JSON_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'no-store',
};
const PROVIDER_ID_RE = /^[a-z]{2}\.[a-z0-9_-]+$/;
const MAX_ENV_BYTES = 2_000_000;

function assertPlainObject(value, label = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid lab provider catalogue ${label}: expected object.`);
  }
}

function sanitizeRows(rows, label) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new Error(`Invalid lab provider catalogue ${label}: rows must be an array.`);
  return rows.map((row, index) => {
    assertPlainObject(row, `${label}[${index}]`);
    return { ...row };
  });
}

function sanitizeOffers(offers, label) {
  if (offers == null) return [];
  if (!Array.isArray(offers)) throw new Error(`Invalid lab provider catalogue ${label}: offers must be an array.`);
  return offers.map((offer, index) => {
    assertPlainObject(offer, `${label}[${index}]`);
    return { ...offer };
  });
}

export function normalizeLabProviderCataloguesPayload(input) {
  assertPlainObject(input);
  const out = {};
  for (const [providerId, value] of Object.entries(input)) {
    if (!PROVIDER_ID_RE.test(providerId)) {
      throw new Error(`Invalid lab provider catalogue provider id: ${providerId}`);
    }
    if (Array.isArray(value)) {
      out[providerId] = { catalogueItems: sanitizeRows(value, `${providerId}.catalogueItems`) };
      continue;
    }
    assertPlainObject(value, providerId);
    const catalogueItems = sanitizeRows(value.catalogueItems, `${providerId}.catalogueItems`);
    const supplementalOffers = sanitizeOffers(value.supplementalOffers || value.offers, `${providerId}.supplementalOffers`);
    out[providerId] = {
      ...(catalogueItems.length ? { catalogueItems } : {}),
      ...(supplementalOffers.length ? { supplementalOffers } : {}),
    };
  }
  return out;
}

export function loadLabProviderCataloguesFromEnv(env = process.env) {
  const raw = String(env?.LAB_PROVIDER_CATALOGUES_JSON || '').trim();
  if (!raw) return {};
  if (raw.length > MAX_ENV_BYTES) throw new Error('Invalid lab provider catalogue payload: too large.');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid lab provider catalogue JSON: ${error.message}`);
  }
  return normalizeLabProviderCataloguesPayload(parsed);
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildLabProviderCataloguesScript(payload) {
  const normalized = normalizeLabProviderCataloguesPayload(payload || {});
  return `globalThis.${GLOBAL_NAME} = ${safeScriptJson(normalized)};`;
}

export default async function handler(req) {
  if (req.method && req.method !== 'GET' && req.method !== 'OPTIONS') {
    return new Response('Method not allowed', { status: 405, headers: JSON_HEADERS });
  }
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: JSON_HEADERS });
  try {
    const payload = loadLabProviderCataloguesFromEnv(process.env);
    return new Response(buildLabProviderCataloguesScript(payload), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    return new Response(`/* lab provider catalogue unavailable: ${String(error.message || error).replace(/[^\w .:-]/g, '')} */\nglobalThis.${GLOBAL_NAME} = {};`, {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
