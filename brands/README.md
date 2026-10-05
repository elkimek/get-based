# Vendor brand assets

Single source of truth for wearable-vendor logos / marks / Connect-button assets. Used by the app (`js/brand-assets.js` registry) and the landing site.

The getbased name, wordmark, colors, and writing conventions are defined in the [brand manual](BRAND.md).

## Per-vendor structure

```
brands/<vendor>/
  mark-mono.svg     # 18x18, currentColor — fallback used everywhere by default
  mark.svg          # full-colour brand mark (Phase 2b — pending official kit)
  sign-in-light.svg # official Sign-in-with button, dark backgrounds
  sign-in-dark.svg  # official Sign-in-with button, light backgrounds
  LICENSE.md        # status, source URL, vendor's brand-usage rules
```

## Status (2026-04-23)

| Vendor | mark-mono | mark | sign-in | Status |
|---|---|---|---|---|
| Oura | ✅ placeholder | ❌ | ❌ | Pull from cloud.ouraring.com/v2 |
| Withings | ✅ placeholder | ❌ | ❌ | Pull from developer.withings.com |
| Ultrahuman | ✅ placeholder | ❌ | ❌ | Request from partner email |
| WHOOP | ✅ placeholder | ❌ | ❌ | Pull from dev.whoop.com |
| Fitbit | ✅ placeholder | ❌ | ❌ | Pull from dev.fitbit.com |
| Polar | ✅ placeholder | ❌ | ❌ | Pull from polar.com/brand-resources |
| Apple Health | ✅ generic file glyph | N/A by design | N/A by design | Locked — see LICENSE.md |

## Render policy (`js/brand-assets.js`)

The registry maps `adapterId → { mode, mono, full?, signInLight?, signInDark? }`. Render code picks:

- `mode: 'official'` + theme-matched `sign-in-*.svg` → drop in unmodified
- `mode: 'official'` + `mark.svg` → render in our standard pill button frame, vendor brand colour
- `mode: 'fallback'` (default) → render `mark-mono.svg` in the accent-gradient pill

Adding a new vendor: append a registry entry with `mode: 'fallback'`, drop a `mark-mono.svg`, ship. Phase 2b for that vendor is just swapping in the official files and flipping `mode: 'official'`.

## Sync to website repo

```
rsync -av --delete brands/ ../get-based-site/brands/
```

The landing site reads from the same directory layout — no per-asset re-export.

## Apple Health is intentionally generic
`brands/apple-health/LICENSE.md` explains why we never use Apple's heart icon. Don't "fix" this.
