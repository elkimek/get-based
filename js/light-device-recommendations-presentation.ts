// Display projection only. Catalog matching, regional URL policy and attribution
// remain owned by recommendations-products.ts before a row reaches this view.
export interface ResolvedDeviceOption {
  href: string; event: string; name: unknown; vendor: unknown; blurb: unknown;
}
export interface DeviceOptionView {
  href: string; event: string; name: string; vendor: string; blurb: string; label: string;
}
export interface DeviceRecommendationsView { label: string; rows: readonly DeviceOptionView[] }
const text = (value: unknown) => value == null ? '' : String(value);
export function projectDeviceRecommendations(label: unknown, options: readonly ResolvedDeviceOption[]): DeviceRecommendationsView | null {
  if (!options.length) return null;
  return { label: text(label), rows: options.map(option => {
    const name = text(option.name), vendor = text(option.vendor);
    return { href: option.href, event: option.event, name, vendor, blurb: text(option.blurb),
      label: `View ${name} on ${vendor}, opens in new tab` };
  }) };
}
