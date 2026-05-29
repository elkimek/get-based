// brand-assets.js — Wearable vendor brand asset registry.
//
// Maps adapterId → { mode, brandColor?, mono, full?, signInLight?, signInDark? }
// Render code (vendorIcon in wearables-settings-panel.js) reads from here.
//
// mode:
//   'fallback'  — render the monochrome glyph in our generic accent pill.
//                 Default for vendors without an official kit yet.
//   'official'  — vendor's brand kit is in place; the Connect button uses
//                 either the vendor-supplied sign-in graphic (preferred) or
//                 our pill frame painted in their brand colour.
//
// Adding a vendor:
//   1. Drop SVGs under brands/<vendor>/
//   2. Append a row below with `mode: 'fallback'` (and a placeholder mono)
//   3. Phase 2b: pull the official kit, fill in `brandColor`, `signInLight`,
//      `signInDark`, flip `mode` to 'official'
//
// See brands/README.md for the directory contract and brands/<vendor>/LICENSE.md
// for what each vendor permits.

const BASE = '/brands';

// Brand colours are documented in each vendor's public brand resources page
// and are fair use — colour codes themselves are not trademarked. Using them
// gives each Connect button a distinct visual identity ahead of official
// wordmark/logo assets landing.
//
// `mode: 'branded'` activates the brand-coloured pill render path (vendor
// colour + mono mark + 'Connect' label). `mode: 'official'` is reserved for
// when the vendor's "Sign in with X" graphic is dropped in. `mode: 'fallback'`
// renders our generic accent gradient — used when no brand colour applies
// (Oura uses monochrome by guideline; Apple Health stays neutral by policy).
// Each adapter has THREE visual surfaces:
//
//   iconLight / iconDark — small left-side mark in the integrations row.
//                          Renders as <img> with native colours preserved.
//                          Theme-aware (Light variant on dark theme + vice
//                          versa) so the wordmark/symbol always reads.
//   signInLight / signInDark — large Connect button asset (used elsewhere
//                          like the landing site / branded pill render).
//   mono                — last-resort silhouette via CSS mask, used only
//                          when no themed icon is registered.
export const BRAND_ASSETS = {
  oura: {
    // Fixed-fill variants — <img> tags don't propagate currentColor from
    // CSS, so the source `wordmark.svg` (currentColor) renders invisible
    // on dark theme. Use explicit white/black variants instead.
    mode: 'official',
    mono:        `${BASE}/oura/mark-mono.svg`,
    iconLight:   `${BASE}/oura/wordmark-on-dark.svg`,
    iconDark:    `${BASE}/oura/wordmark-on-light.svg`,
    signInLight: `${BASE}/oura/wordmark-on-dark.svg`,
    signInDark:  `${BASE}/oura/wordmark-on-light.svg`,
  },
  withings: {
    mode: 'official',
    mono:        `${BASE}/withings/mark-mono.svg`,
    iconLight:   `${BASE}/withings/wordmark-on-dark.svg`,
    iconDark:    `${BASE}/withings/wordmark-on-light.svg`,
    brandColor:  '#00B0EA',
    signInLight: `${BASE}/withings/wordmark-on-dark.svg`,
    signInDark:  `${BASE}/withings/wordmark-on-light.svg`,
  },
  ultrahuman: {
    mode: 'official',
    mono:        `${BASE}/ultrahuman/mark-mono.svg`,
    iconLight:   `${BASE}/ultrahuman/wordmark-on-dark.svg`,
    iconDark:    `${BASE}/ultrahuman/wordmark-on-light.svg`,
    brandColor:  '#FE6700',
    signInLight: `${BASE}/ultrahuman/wordmark-on-dark.svg`,
    signInDark:  `${BASE}/ultrahuman/wordmark-on-light.svg`,
  },
  whoop: {
    mode: 'official',
    mono:        `${BASE}/whoop/mark-mono.svg`,
    // WHOOP's logo is a circular symbol mark — works at small icon size.
    iconLight:   `${BASE}/whoop/wordmark-on-dark.svg`,
    iconDark:    `${BASE}/whoop/wordmark-on-light.svg`,
    brandColor:  '#DD1244',
    signInLight: `${BASE}/whoop/wordmark-on-dark.svg`,
    signInDark:  `${BASE}/whoop/wordmark-on-light.svg`,
  },
  fitbit: {
    // Fitbit ships an official "Symbol" mark separate from the wordmark
    // — perfect for the small left-side icon. Sign-in asset stays the
    // full "Works With Fitbit" badge for contexts that show it.
    mode: 'official',
    mono:        `${BASE}/fitbit/mark-mono.svg`,
    iconLight:   `${BASE}/fitbit/symbol-light.png`,
    iconDark:    `${BASE}/fitbit/symbol-dark.png`,
    signInLight: `${BASE}/fitbit/sign-in-light.png`,
    signInDark:  `${BASE}/fitbit/sign-in-dark.png`,
    selfBackground: true,
  },
  polar: {
    // GATED to fallback until we file the written-consent ticket Polar's
    // AccessLink agreement requires for third-party logo use. Render uses
    // the generic accent-pill + monochrome glyph; no Polar trademark on
    // screen until consent lands. Wordmark assets stay in brands/polar/
    // for the moment we flip back to mode: 'official'.
    // See brands/polar/LICENSE.md (Action item).
    mode: 'fallback',
    mono: `${BASE}/polar/mark-mono.svg`,
    // brandColor: '#E50019',  // re-enable post-consent
  },
  apple_health: {
    // Apple Health stays neutral by policy — no Apple heart, generic file
    // glyph only. See brands/apple-health/LICENSE.md.
    mode: 'fallback',
    mono: `${BASE}/apple-health/mark-mono.svg`,
  },
};

export function brandAsset(adapterId) {
  return BRAND_ASSETS[adapterId] || null;
}

// Vendor mark for in-app use. Strategy:
//   1. If `iconLight`/`iconDark` is set (the vendor's actual logo file with
//      its native brand colours preserved), render as a plain <img> —
//      colours show through. Width is auto so wordmark proportions work.
//   2. Otherwise fall back to mono mask (form-factor placeholder glyph) so
//      the silhouette inherits parent text colour. Used for vendors where
//      we don't have a small-format brand logo yet.
export function brandMarkMono(adapterId, { size = 18 } = {}) {
  const a = brandAsset(adapterId);
  if (!a) return '';
  // Theme-aware logo asset — preferred when registered.
  const theme = document.documentElement?.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const themedIcon = theme === 'dark' ? a.iconLight : a.iconDark;
  if (themedIcon) {
    return `<img class="wearable-vendor-icon-img" src="${themedIcon}" alt="" height="${size}" loading="lazy" />`;
  }
  if (a.mono) {
    return `<span class="wearable-vendor-mark" style="--mark-url:url('${a.mono}');--mark-size:${size}px"></span>`;
  }
  return '';
}

// Whether this vendor has an official sign-in graphic for the given theme.
// Used to pick between an official-asset render and our generic pill.
export function brandHasSignIn(adapterId, theme = 'dark') {
  const a = brandAsset(adapterId);
  if (!a || a.mode !== 'official') return false;
  return theme === 'dark' ? !!a.signInLight : !!a.signInDark;
}

export function brandSignInUrl(adapterId, theme = 'dark') {
  const a = brandAsset(adapterId);
  if (!a) return null;
  return theme === 'dark' ? a.signInLight : a.signInDark;
}

export function brandColor(adapterId) {
  return brandAsset(adapterId)?.brandColor || null;
}
