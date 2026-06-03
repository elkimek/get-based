# Lab Provider Integration Contract

**Status:** draft contract for Labshop + Unilabs technical discussion.

getbased should not depend on fragile browser automation as the long-term integration. The app should produce a structured, auditable order intent that a lab portal can accept through one of several supported handoff modes: API order draft, signed cart link, portal prefill URL, or a browser/user handoff.

## Goals

- Let a user ask getbased to order or price-check recommended biomarkers.
- Normalize the request into stable getbased marker keys and optional Czech NČLP candidates.
- Compare provider coverage and prices before the user chooses a lab.
- Hand off only after explicit user action.
- Keep final identity confirmation, slot selection, consent, and payment under the user's control unless a provider-supported API legally/contractually handles those steps.

## Non-goals / safety boundary

getbased must not:

- silently book appointments;
- submit payment without explicit confirmation;
- bypass CAPTCHA/reCAPTCHA or anti-abuse flows;
- pretend a preview/cart draft is a confirmed lab order;
- submit personal data to a provider without a visible user action and provider agreement.

## Core data model

```text
User request
  → LabMarkerIntent[]
  → national standard candidates, e.g. NČLP
  → ProviderCoverageMatrix
  → ProviderOrderSelection
  → ProviderHandoffRequest
  → ProviderHandoffResponse
```

## Provider catalogue item

Labs can expose this as JSON, CSV, API, or a periodically exported feed. getbased can ingest any format if the fields map to this shape.

```json
{
  "providerId": "cz.unilabs",
  "providerProductId": "2885",
  "name": "Vitamín B12",
  "description": "Vitamin B12 self-pay blood test",
  "price": {
    "amount": 291,
    "currency": "CZK",
    "includesVat": true
  },
  "markers": [
    {
      "markerKey": "vitamins.vitaminB12",
      "displayName": "Vitamin B12",
      "coverage": "exact",
      "confidence": "provider_confirmed",
      "standards": {
        "nclp": [],
        "loinc": []
      }
    }
  ],
  "specimen": {
    "type": "serum",
    "fastingRequired": false
  },
  "availability": {
    "selfPay": true,
    "regions": ["CZ"],
    "collectionSites": []
  },
  "handoff": {
    "supportedModes": ["cart_api", "signed_cart_url", "portal_prefill_url"],
    "requiresUserSlotSelection": true,
    "requiresUserPayment": true
  }
}
```

## Coverage semantics

Each requested marker/provider cell should be explicit:

```text
exact           provider item directly measures the requested marker
panel_contains  provider panel includes the marker plus other tests
approximate     clinically nearby but not equivalent; must warn user
unavailable     provider confirmed it cannot fulfil this marker
unknown         getbased has no reliable provider mapping yet
```

## Handoff request from getbased to provider

```json
{
  "contractVersion": "2026-06-03.draft1",
  "source": "getbased",
  "country": "CZ",
  "locale": "cs-CZ",
  "returnUrl": "https://getbased.ai/lab-orders/return/{draftId}",
  "draftId": "laborder_abc123",
  "userAction": "prepare_provider_cart",
  "providerId": "cz.labshop",
  "requestedMarkers": [
    {
      "markerKey": "vitamins.vitaminB12",
      "displayName": "Vitamin B12",
      "priority": "core",
      "reason": "Requested by user for lab ordering",
      "standards": {
        "nclp": []
      }
    },
    {
      "markerKey": "vitamins.folate",
      "displayName": "Folate",
      "priority": "core",
      "reason": "Requested by user for lab ordering",
      "standards": {
        "nclp": ["07322"]
      }
    }
  ],
  "selectedProducts": [
    {
      "providerProductId": "20036",
      "name": "Vitaminy B - Basic",
      "coverage": "panel_contains",
      "markerKeys": ["vitamins.vitaminB12", "vitamins.folate"],
      "expectedPrice": {
        "amount": 500,
        "currency": "CZK"
      }
    }
  ],
  "userContext": {
    "preferredCollectionCity": null,
    "preferredLanguage": "cs-CZ"
  }
}
```

## Provider handoff response

```json
{
  "ok": true,
  "providerId": "cz.labshop",
  "providerDraftId": "provider-cart-token-or-id",
  "handoffUrl": "https://provider.example/cart/token/...",
  "expiresAt": "2026-06-03T16:00:00Z",
  "acceptedItems": [
    {
      "providerProductId": "20036",
      "name": "Vitaminy B - Basic",
      "finalPrice": {
        "amount": 500,
        "currency": "CZK"
      }
    }
  ],
  "rejectedItems": [],
  "missingMarkers": [],
  "requiredUserActions": [
    "confirm_identity",
    "choose_collection_site",
    "choose_time_slot",
    "pay_on_provider_portal"
  ],
  "messageForUser": "Cart prepared. Continue on the provider portal to choose collection site and payment."
}
```

## Error / partial response

```json
{
  "ok": false,
  "providerId": "cz.unilabs",
  "errorCode": "UNAVAILABLE_MARKER",
  "messageForUser": "Unilabs cannot currently fulfil one requested marker through this channel.",
  "acceptedItems": [
    { "providerProductId": "2885", "name": "Vitamín B12" }
  ],
  "missingMarkers": [
    {
      "markerKey": "vitamins.holotranscobalamin",
      "displayName": "Active B12",
      "reason": "not_in_self_pay_catalog"
    }
  ],
  "fallbackOptions": [
    "show_split_order_recommendation",
    "request_manual_provider_review"
  ]
}
```

## Recommended provider-side endpoints

Minimum useful API:

```text
GET  /catalog/lab-tests?country=CZ&selfPay=true
POST /cart/drafts
GET  /cart/drafts/{providerDraftId}
```

Nice-to-have API:

```text
POST /coverage/check
POST /price/quote
POST /handoff/signed-url
POST /webhooks/order-status
```

If a lab prefers not to expose an API, signed cart URLs are enough:

```text
POST /handoff/signed-url
→ returns a one-time portal URL with preselected items
```

## Current prototype mappings

```text
Labshop
- 20036 — Vitaminy B - Basic — 500 Kč — B12 + folate panel_contains
- 20037 — Vitaminy B - Complete — 3 900 Kč — B12 + folate panel_contains

Unilabs Online
- 2885 — Vitamín B12 — 291 Kč
- 2886 — Kyselina listová / folát / vitamin B9 — 290 Kč
- 3082 — Homocystein — 571 Kč
- 3543 — Aktivní vitamin B12 — 308 Kč
- blood draw fee — 81 Kč
```

## Product UX contract

When the user asks to order tests, getbased should show:

```text
Requested markers
Coverage + price comparison
Best single-lab option
Best split-order option, if cheaper or more complete
Explicit missing/unknown tests
Provider handoff buttons
Safety boundary: final booking/payment stays user-in-loop
```

This lets Labshop and Unilabs choose the technical path later without forcing getbased to redesign the UX.
