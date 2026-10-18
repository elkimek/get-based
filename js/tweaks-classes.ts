/** Exact Tweaks-owned receiver suffixes; shared native classes and states remain. */
const utilities = {
  "overlay": [
    "gb:tweaks-overlay:tweaks-overlay-block",
    "gb:tweaks-overlay-show:tweaks-overlay-show-block",
    "gb:tweaks-phone-overlay-show:tweaks-phone-overlay-show-block",
    "gb:tweaks-phone-overlay:tweaks-phone-overlay-block",
  ].join(' '),
  "panel": [
    "gb:tweaks-panel:tweaks-panel-block",
    "gb:tweaks-phone-panel:tweaks-phone-panel-block",
  ].join(' '),
  "head": [
    "gb:tweaks-head:tweaks-head-block",
  ].join(' '),
  "close": [
    "gb:tweaks-close:tweaks-close-block",
  ].join(' '),
  "body": [
    "gb:tweaks-body:tweaks-body-block",
    "gb:tweaks-phone-body:tweaks-phone-body-block",
  ].join(' '),
  "section": [
    "gb:tweaks-section:tweaks-section-block",
    "gb:tweaks-section-first:tweaks-section-first-block",
    "gb:tweaks-section-last:tweaks-section-last-block",
  ].join(' '),
  "section-title": [
    "gb:tweaks-section-title:tweaks-section-title-block",
  ].join(' '),
  "theme-grid": [
    "gb:tweaks-theme-grid:tweaks-theme-grid-block",
  ].join(' '),
  "theme-button": [
    "gb:tweaks-theme-button:tweaks-theme-button-block",
    "gb:tweaks-theme-button-hover:tweaks-theme-button-hover-block",
    "gb:tweaks-theme-button-active:tweaks-theme-button-active-block",
  ].join(' '),
  "action-button": [
    "gb:tweaks-action-button:tweaks-action-button-block",
    "gb:tweaks-action-button-hover:tweaks-action-button-hover-block",
  ].join(' '),
  "accent-button": [
    "gb:tweaks-accent-button-active:tweaks-accent-button-active-block",
    "gb:tweaks-accent-button:tweaks-accent-button-block",
  ].join(' '),
  "accent-row": [
    "gb:tweaks-accent-row:tweaks-accent-row-block",
    "gb:tweaks-sunset-accent-row:tweaks-sunset-accent-row-block",
  ].join(' '),
  "option-row": [
    "gb:tweaks-option-row:tweaks-option-row-block",
    "gb:tweaks-option-hidden:tweaks-option-hidden-block",
    "gb:tweaks-option-following:tweaks-option-following-block",
  ].join(' '),
  "option-copy": [
    "gb:tweaks-option-copy:tweaks-option-copy-block",
  ].join(' '),
  "option-title": [
    "gb:tweaks-option-title:tweaks-option-title-block",
  ].join(' '),
  "option-description": [
    "gb:tweaks-option-description:tweaks-option-description-block",
  ].join(' '),
  "accent-swatch": [
    "gb:tweaks-accent-swatch:tweaks-accent-swatch-block",
  ].join(' '),
  "action-grid": [
    "gb:tweaks-action-grid:tweaks-action-grid-block",
    "gb:tweaks-narrow-action-grid:tweaks-narrow-action-grid-block",
  ].join(' '),
  "theme-swatch": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
  ].join(' '),
  "theme-swatch-dark": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
    "gb:tweaks-theme-swatch-dark:tweaks-theme-swatch-dark-block",
  ].join(' '),
  "theme-swatch-light": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
    "gb:tweaks-theme-swatch-light:tweaks-theme-swatch-light-block",
  ].join(' '),
  "theme-swatch-cyberterm": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
    "gb:tweaks-theme-swatch-cyberterm:tweaks-theme-swatch-cyberterm-block",
  ].join(' '),
  "theme-swatch-glass": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
    "gb:tweaks-theme-swatch-glass:tweaks-theme-swatch-glass-block",
  ].join(' '),
  "theme-swatch-synth-sunrise": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
    "gb:tweaks-theme-swatch-synth-sunrise:tweaks-theme-swatch-synth-sunrise-block",
  ].join(' '),
  "theme-swatch-neuromancer": [
    "gb:tweaks-theme-swatch:tweaks-theme-swatch-block",
    "gb:tweaks-theme-swatch-neuromancer:tweaks-theme-swatch-neuromancer-block",
  ].join(' '),
} as const;
export type TweaksReceiver = keyof typeof utilities;

/** Keep every native token in its original order before the scoped utility suffix. */
export function tweaksClasses(nativeNames: string, receiver: TweaksReceiver): string {
  return nativeNames ? `${nativeNames} ${utilities[receiver]}` : utilities[receiver];
}

/** Known world swatches use their base+world recipe; unknown literal IDs keep only the base. */
export function tweaksThemeSwatchClasses(nativeNames: string, themeId: string): string {
  const world = `theme-swatch-${themeId}`;
  const receiver: TweaksReceiver = Object.hasOwn(utilities, world) ? world as TweaksReceiver : 'theme-swatch';
  return tweaksClasses(nativeNames, receiver);
}
