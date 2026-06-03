# Lab Ordering: NČLP-first Provider Architecture

**Status:** design note for the Labshop ordering preview branch.

## Why NČLP belongs at the bottom

For Czech labs, getbased should not start from vendor product names. The stable clinical layer is NČLP — Národní číselník laboratorních položek. NČLP defines laboratory items by code and by core semantics:

- component, e.g. `Homocystein`, `Folát`, `Holotranskobalamin`
- system/material, e.g. serum (`S`), plasma (`P`), blood (`B`), urine (`U`)
- quantity type, e.g. substance concentration
- unit, e.g. `µmol/l`, `nmol/l`, `pmol/l`
- procedure/method, often `*` or concrete methods such as `IA`, `HPLC`, `CMIA`
- validity / gestion domain

This makes NČLP the correct interchange layer between:

```text
getbased marker keys
  ↔ national lab item semantics
  ↔ provider catalogue/products
  ↔ order/cart adapter
```

Vendor product IDs are provider-specific fulfilment details. NČLP codes are the Czech lab-order vocabulary.

## Verified NČLP source

Public catalogue:

```text
https://www.nclp.cz/
https://www.nclp.cz/nclp
```

The SPA exposes JSON endpoints. Verified endpoints:

```text
GET https://www.nclp.cz/api/v1/nationallaboratoryitems/items?showOnlyValid=true&pageSize=5&pageNumber=0
GET https://www.nclp.cz/api/v1/nationallaboratoryitems/search?query=fol%C3%A1t
GET https://www.nclp.cz/api/v1/nationallaboratoryitems/gestions?showOnlyValid=true
```

Observed item-list shape:

```json
{
  "items": [
    {
      "id": "uuid",
      "code": "07322",
      "name": "Folát (B; látková konc. [nmol/l] *)",
      "label": "07322 - Folát (B; látková konc. [nmol/l] *)",
      "componentName": "Folát",
      "system": "Krev",
      "unit": "nmol/l",
      "procedure": "* - Blíže nespecifikovaná procedura"
    }
  ],
  "pageNumber": 0,
  "pageSize": 5,
  "totalRecords": 21593
}
```

Observed search shape:

```json
{
  "items": [
    {
      "code": "02073",
      "name": "Homocystein (P; látková konc. [µmol/l] *)",
      "component": { "symbol": "HOMOCYS", "name": "Homocystein" },
      "system": { "code": "P", "name": "Plazma" },
      "unit": { "name": "µmol/l" },
      "procedure": { "code": "*" }
    }
  ],
  "totalCount": 56
}
```

## Example NČLP mappings for methylation-ish labs

These are not final product mappings, only canonical Czech lab item candidates.

### Homocysteine

Preferred general candidates:

```text
02073 | Homocystein (P; látková konc. [µmol/l] *)
02079 | Homocystein (S; látková konc. [µmol/l] *)
19615 | Homocystein (P; látková konc. [µmol/l] IA)
19616 | Homocystein (S; látková konc. [µmol/l] IA)
```

### Folate

Candidate examples:

```text
07322 | Folát (B; látková konc. [nmol/l] *)
19584 | Folát (B; látková konc. [nmol/l] IA)
03710 | Folát (P; hmot. konc. [µg/l] *)
06971 | Folát (ICT(erytrocyty); látková konc. [µmol/l] *)
```

### B12 / active B12

NČLP search for `vitamin b12` currently surfaces holotranscobalamin first. Candidate examples:

```text
15188 | Holotranskobalamin (P; látková konc. [pmol/l] *)
15190 | Holotranskobalamin (S; látková konc. [pmol/l] *)
18767 | Holotranskobalamin (P; látková konc. [pmol/l] CMIA)
17344 | Holotranskobalamin (S; látková konc. [pmol/l] CMIA)
```

Important: getbased should distinguish plain total B12 vs active B12/holotranscobalamin instead of treating every `B12` query as the same marker.

## Labshop findings

Manual checks of Labshop and older lab reports did not find NČLP IDs printed on reports. Treat NČLP as a national/internal/interoperability standard, not as something users will usually see on PDFs.

The generated Printing Press CLI/openapi, the live helper, Labshop homepage product-card markup, and Labshop JS bundles currently expose Labshop provider product IDs, not NČLP IDs. Scans found only:

```text
/api/antiforgery/token
https://www.labshop.cz/kosik/pridat-do-kosiku
product-card data-model.IdProduct
```

No public Labshop NČLP endpoint or visible NČLP field has been found yet.

Verified Labshop product examples:

```text
20036 | Vitaminy B - Basic    | 500 Kč
20037 | Vitaminy B - Complete | 3 900 Kč
```

The live helper verifies server-side session cart creation:

```text
POST /kosik/pridat-do-kosiku { idProduct: "20036" }
```

But it does not prove browser handoff, because Labshop cart state is ASP.NET/session-cookie based.

## Relationship to `MARKER_SCHEMA`

Do **not** put every country/provider code directly inside `MARKER_SCHEMA`.

`MARKER_SCHEMA` should remain the app's canonical biomarker ontology: display name, category, default unit, ranges, description, and getbased's stable internal key (`category.marker`). That is the semantic anchor used by imports, charts, trends, interpretation, and chat.

External coding systems should live in a separate crosswalk layer keyed by getbased marker key:

```text
MARKER_SCHEMA
  biochemistry.glucose
  vitamins.b12
  inflammation.crp

LAB_MARKER_CROSSWALK
  vitamins.b12:
    aliases: [...]
    externalIds:
      loinc: [...]
      nclp: [...]
      snomed: [...]
    countryDefaults:
      CZ: { preferredStandard: 'NCLP', preferredSpecimen: ['S', 'P'] }
      US: { preferredStandard: 'LOINC' }
```

Why separate:

- `MARKER_SCHEMA` is small, stable, loaded everywhere, and should not become a giant international terminology database.
- One getbased marker can map to multiple external items depending on specimen, method, unit, and country.
- One external item can map imperfectly to a getbased concept (`panel_contains`, `active B12` vs `total B12`, serum vs RBC folate).
- Provider catalogues change more often than marker semantics.
- Future standards like LOINC, NČLP, SNOMED/UCUM, or country-specific catalogues can be added without touching the core schema.

Small optional pointer in `MARKER_SCHEMA` is okay, but only as metadata, not as the full mapping:

```js
b12: {
  name: 'Vitamin B12',
  unit: 'pmol/l',
  externalKey: 'vitamins.b12' // optional if marker key itself is not enough
}
```

The heavy mapping belongs in dedicated files:

```text
js/lab-standards/
  marker-crosswalk.js        // getbased marker ↔ standards
  nclp-client.js             // NČLP API/cache/normalization
  nclp-resolver.js           // getbased marker/intents → NČLP candidates
  loinc-crosswalk.js         // future
  standards-types.js
```

This gives getbased a three-layer ontology:

```text
1. getbased internal marker key — stable product ontology
2. external standard IDs — NČLP/LOINC/etc. semantic interoperability
3. provider offers/products — Labshop/Unilabs/Quest/etc. fulfilment
```

## Proposed bottom-to-top model

### 1. `LabMarkerIntent`

What the user/chat wants clinically.

```ts
interface LabMarkerIntent {
  markerKey?: string;              // getbased key, e.g. vitamins.b12
  displayName: string;             // "Homocysteine"
  reason: string;                  // why suggested
  priority: 'core' | 'optional' | 'nice_to_have';
  preferredSystem?: 'serum' | 'plasma' | 'blood' | 'urine';
}
```

### 2. `NationalLabItemCandidate`

NČLP-resolved Czech semantics.

```ts
interface NationalLabItemCandidate {
  country: 'CZ';
  standard: 'NCLP';
  code: string;                    // "02073"
  uuid: string;
  name: string;
  component: { symbol?: string; name: string };
  system: { code?: string; name: string };
  unit?: string;
  procedure?: { code?: string; name?: string };
  score: number;
  warnings?: string[];
}
```

### 3. `ProviderOffer`

A provider-specific purchasable offering.

```ts
interface ProviderOffer {
  providerId: string;              // "cz.labshop"
  providerProductId: string;       // "20036"
  name: string;
  priceCzk?: number;
  supportedNclpCodes: string[];
  coverage: 'exact' | 'panel_contains' | 'approximate' | 'unknown';
  unavailableMarkers?: string[];
}
```

### 4. `LabOrderDraft`

The user-confirmable draft shown in chat.

```ts
interface LabOrderDraft {
  id: string;
  country: string;
  providerId?: string;
  status: 'draft' | 'provider_selection' | 'ready_to_cart' | 'cart_created';
  requestedMarkers: LabMarkerIntent[];
  nationalItems: NationalLabItemCandidate[];
  offers: ProviderOffer[];
  safetyBoundary: string;
}
```

## Conversation workflow

```text
User: can you suggest what I should test?
  ↓
chat generates clinical marker suggestions from profile/labs/goals
  ↓
getbased converts suggestions into LabMarkerIntent[]
  ↓
if country = CZ, resolve candidate NČLP items
  ↓
chat shows: marker, why, NČLP item ambiguity if any
  ↓
User: can you order these?
  ↓
getbased lists available providers by location/country
  ↓
User chooses Labshop / Unilabs / other
  ↓
provider adapter maps NČLP items to provider offers/products
  ↓
chat shows explicit order draft and missing/ambiguous items
  ↓
user confirms
  ↓
provider fulfilment adapter builds cart or launches browser-side cart fill
  ↓
user finishes checkout/payment/reCAPTCHA
```

## Provider registry shape

```ts
interface LabProviderAdapter {
  id: string;
  country: string;
  name: string;
  regions?: string[];
  capabilities: {
    catalogSearch: boolean;
    nclpMapping: boolean;
    serverCartCreate: boolean;
    browserCartHandoff: boolean;
    checkoutAutomation: boolean;
    requiresCaptchaAtCheckout: boolean;
  };
  findOffers(items: NationalLabItemCandidate[]): Promise<ProviderOffer[]>;
  createCart?(draft: LabOrderDraft): Promise<CartResult>;
}
```

Initial Czech registry:

```text
cz.labshop
  catalogSearch: true
  nclpMapping: unknown/partial
  serverCartCreate: true
  browserCartHandoff: false currently
  requiresCaptchaAtCheckout: true

cz.unilabs
  reconnaissanceNeeded: true
  catalogSearch: unknown
  nclpMapping: unknown
  serverCartCreate/order-form: needs testing
  note: preferred real second provider; Spadia intentionally excluded because it is the same service/company family as Labshop with a different frontend
```

## Build sequence

1. Add NČLP client and tests using the public JSON endpoint.
2. Add NČLP resolver for getbased marker intents.
3. Add provider registry with country/location filtering.
4. Convert current Labshop demo from hardcoded product mapping into `cz.labshop` provider adapter.
5. Add explicit provider-selection step in chat.
6. Keep cart fulfilment behind user confirmation.
7. Investigate browser-side Labshop handoff separately from NČLP/provider architecture.

## Safety rules

- Chat may suggest and explain markers.
- Chat may ask whether the user wants to order.
- No provider adapter may submit payment/final order without explicit user action.
- Ambiguous NČLP matches must be surfaced, not silently guessed.
- Provider panel products must distinguish exact marker coverage from approximate panel coverage.
