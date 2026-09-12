# Fitbit — brand assets

## Status
**FALLBACK.** This checkout bundles only `mark-mono.svg`, a neutral dot-grid placeholder. The application uses that asset; the PNG files described below are not bundled.

The following historical source notes describe the official pack, not files currently shipped by the application.

## Files

| File | Purpose | Variant |
|---|---|---|
| `sign-in-light.png` | Connect button on dark backgrounds | v1 — white "fitbit" wordmark on dark green, teal "WORKS WITH" panel |
| `sign-in-dark.png` | Connect button on light backgrounds | v2 — black "fitbit" wordmark on white, teal "WORKS WITH" panel |
| `symbol-light.png` | Card heading mark, dark theme | white symbol-only |
| `symbol-dark.png` | Card heading mark, light theme | black symbol-only |
| `mark-mono.svg` | Generic fallback (currentColor) | placeholder dot-grid, used when official asset can't render |

## Source
- Pack: https://dev.fitbit.com/static/FitbitLogosAndGuidelines.zip (public download, no auth, ~19 MB)
- Guidelines PDF (in pack): `2022_Fitbit_API_Brand_Guidelines_8_5_22.pdf`

## Permitted use (per the 2022 API Brand Guidelines, page 4)
> "The Works With Fitbit badge is used to identify apps or products that work with a Fitbit product or the Fitbit API."

Our integration matches this exactly — we read user data from the Fitbit API after the user OAuths in.

## Constraints (per the same PDF)
- "White badges should not be placed on a white background" — handled by serving `sign-in-dark.png` only on light theme.
- Use "Connect" not "Sync" in surrounding copy.
- Use full product names ("Fitbit Sense", "Fitbit Charge") not just "a Fitbit". We say "Fitbit" generically only when referring to the platform.
- Don't use Fitbit logos in app icons, company branding, or marketing implying Fitbit affiliation.
- Spell as **Fitbit** (one capital, lowercase rest) — never "FitBit".

## Brand colour (also documented in pack)
- Fitbit teal: `#00B0B9` — used in our card-heading fallback only when the badge can't render (e.g. via the registry's `brandColor`).

## Version
2022 pack — current as of 2026-04-23. Re-pull from the URL above periodically to catch refreshes.
