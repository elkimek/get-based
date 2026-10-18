# Vendor brand assets

This directory contains the wearable marks and connection artwork used by
getbased. The [brand manual](BRAND.md) defines the product name, wordmark,
colors and writing conventions.

## Registry and files

[`js/brand-assets.ts`](../js/brand-assets.ts) is the application registry. Each
adapter selects its bundled monochrome fallback, optional themed icon and
connection artwork, rendering mode and optional brand color. Asset filenames
are explicit registry values; a vendor directory does not need every variant.

Keep each vendor's source and usage information in its `LICENSE.md`. The
current registry uses official artwork for Oura, Withings, Ultrahuman and WHOOP,
and fallback marks for Fitbit, Google Health, Polar and Apple Health. Bundled
artwork does not by itself authorize changing a fallback to an official mark;
consult the corresponding usage record first.

## Rendering contract

- `iconLight` and `signInLight` are artwork for dark backgrounds; `iconDark` and
  `signInDark` are artwork for light backgrounds. Preserve the artwork's native
  proportions and registered colors.
- `mono` supplies a monochrome mask when no themed icon is registered.
- `mode: 'fallback'` uses the generic connection treatment; `branded` selects a
  vendor-colored treatment; `official` enables registered connection artwork.
- Adding a vendor starts with a bundled fallback and its usage record. Update
  the registry only when the corresponding assets and permissions are available.

Apple Health intentionally uses a generic file glyph; Google Health uses a
neutral pulse/cross glyph. See their [Apple Health](apple-health/LICENSE.md) and
[Google Health](google-health/LICENSE.md) usage records.

## Website synchronization

The sibling landing site can use the same directory layout. Synchronize the
reviewed assets and usage records together, then check its consumers against
the registry. Application assets must remain bundled so installed offline
sessions do not depend on vendor-hosted artwork.
