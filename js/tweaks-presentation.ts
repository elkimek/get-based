/** Pure presentation facts. Theme/accent domain tables and reads remain in settings-tweaks. */
export interface TweaksThemeFacts {
  id: unknown;
  label: unknown;
}

export interface TweaksAccentFacts {
  id: unknown;
  label: unknown;
}

export interface TweaksSwatchFacts {
  color?: unknown;
  gradient?: unknown;
}

export interface TweaksThemeView {
  id: string;
  label: string;
  active: boolean;
}

export interface TweaksAccentView {
  id: string;
  title: string;
  ariaLabel: string;
  color: string;
  gradient: string;
  active: boolean;
}

export interface TweaksPanelView {
  themes: readonly TweaksThemeView[];
  accents: readonly TweaksAccentView[];
  sunset: boolean;
  crt: boolean;
  crtSupported: boolean;
}

/** Match escapeAttr/escapeHTML's original nullish handling and single String conversion. */
function literal(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Preserve ID conversion, label conversion, then the independent strict active-ID read. */
export function projectTweaksTheme(theme: TweaksThemeFacts, currentTheme: unknown): TweaksThemeView {
  const id = literal(theme.id);
  const label = literal(theme.label);
  const active = currentTheme === theme.id;
  return { id, label, active };
}

/** The controller calls accentSwatchSpec first; keep both original label conversions. */
export function projectTweaksAccent(
  accent: TweaksAccentFacts,
  currentAccent: unknown,
  swatch: TweaksSwatchFacts,
): TweaksAccentView {
  const active = currentAccent === accent.id;
  const id = literal(accent.id);
  const title = literal(accent.label);
  const ariaLabel = literal(accent.label);
  const color = literal(swatch.color);
  const gradient = literal(swatch.gradient);
  return { id, title, ariaLabel, color, gradient, active };
}
