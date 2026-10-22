export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  forceShow?: boolean;
}
// Current release kept separate so the historical archive remains bounded.
export const CURRENT_RELEASE = { version: '1.25.0', date: '2026-10-22', title: 'Waist measurements and cycle guidance', items: [
  '<b>More body measurements.</b> Log waist and optional hip measurements, see waist-to-hip and waist-to-height ratios, or record abdominal depth (SAD) with a caliper.',
  '<b>Measure in a way that suits you.</b> Choose standing, seated or lying down for waist measurements, with simple guidance and centimetres or inches.',
  '<b>Follow your progress consistently.</b> The app remembers your measurement method and keeps different positions and locations separate in your history.',
  '<b>Use your cycle for timing.</b> See cycle context beside measurements and estimated dates for your first measurement and later comparisons.',
] } satisfies ChangelogEntry;
