/** Pure Sun presentation values; configuration reads and writes stay in settings-privacy. */
export interface SunModeOptionView {
  mode: string;
  label: string;
  description: string;
  checked: boolean;
}

export interface SunDataSourceView {
  officialHost: boolean;
  options: readonly [SunModeOptionView, SunModeOptionView, SunModeOptionView];
  showSelfhost: boolean;
  url: string;
  bearer: string;
  rounding: boolean | null;
}

/** Keep the original helper's template coercion order after its independent mode read. */
export function projectSunModeOption(
  mode: unknown,
  label: unknown,
  description: unknown,
  checked: boolean,
): SunModeOptionView {
  return {
    mode: `${mode}`,
    label: `${label}`,
    description: `${description}`,
    checked,
  };
}

/** Original escapeAttr performs one String conversion; authored attributes escape the literal. */
export function projectSunCredential(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}
