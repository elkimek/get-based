export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  forceShow?: boolean;
}
// Current release kept separate so the historical archive remains bounded.
export const CURRENT_RELEASE = { version: '1.24.0', date: '2026-10-18', title: 'A stronger foundation', items: [
  '<b>Rebuilt for the future.</b> The interface now uses Svelte, SvelteKit and Tailwind CSS, making getbased easier to maintain and improve.',
  '<b>Your familiar app, preserved.</b> Existing profiles, health data, preferences and workflows carry forward.',
  '<b>More consistent across screens.</b> Refined spacing, text, buttons and layouts improve readability and usability on desktop and mobile.',
  '<b>Smarter loading and reliable offline use.</b> Features load when needed, with improvements to startup, offline caching and app updates.',
  '<b>Better checks before release.</b> Expanded browser, accessibility and performance checks help catch problems as getbased evolves.',
] } satisfies ChangelogEntry;
