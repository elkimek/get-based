import {renderHTML as greetingHTML} from './components/DashboardGreeting.svelte.html.js';
import {renderHTML as welcomeHTML} from './components/DashboardWelcome.svelte.html.js';
import {renderHTML as onboardingHTML} from './components/DashboardOnboarding.svelte.html.js';

export interface DashboardGreetingView {readonly title: string; readonly name: string; readonly subtitle: string}
export interface DashboardWelcomeSecondaryView {readonly mode: 'secondary'; readonly paused: boolean}
export interface DashboardWelcomePrimaryView {
  readonly mode: 'primary'; readonly title: string; readonly copy: string;
  readonly secondary: DashboardWelcomeSecondaryView;
}
export interface DashboardOnboardingBannerView {
  readonly mode: 'banner'; readonly maleClass: string; readonly femaleClass: string; readonly dob: string;
}
export interface DashboardOnboardingReminderView {readonly mode: 'reminder'}
export type DashboardOnboardingView = DashboardOnboardingBannerView | DashboardOnboardingReminderView;
export interface DashboardWelcomeHeroView {
  readonly mode: 'welcome'; readonly className: string;
  readonly primary: DashboardWelcomePrimaryView;
  readonly reminder: DashboardOnboardingReminderView | null;
  readonly prerendered?: boolean;
}
export type DashboardWelcomeView = Readonly<{mode: 'loading' | 'empty'}>
  | DashboardWelcomeSecondaryView | DashboardWelcomePrimaryView | DashboardWelcomeHeroView;

// Match native escapeHTML's early null handling and String coercion.
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
export function projectDashboardGreetingView(input: {
  title: () => unknown; name: () => unknown; parts: () => readonly unknown[];
}): DashboardGreetingView {
  const title = text(input.title());
  const name = text(input.name());
  const subtitle = input.parts().map(text).join(' · ');
  return {title, name, subtitle};
}
export function projectDashboardWelcomeView(input: {
  readonly ready: boolean; readonly paused: boolean;
  readonly reminder: DashboardOnboardingReminderView | null;
}): DashboardWelcomeHeroView {
  return {
    mode: 'welcome',
    className: input.ready && !input.paused ? 'welcome-hero welcome-hero-ready' : 'welcome-hero welcome-hero-noai',
    primary: {
      mode: 'primary', title: input.paused ? 'Resume guided chat' : 'Start with guided chat',
      copy: input.paused
        ? 'Chat will walk you through re-enabling AI before you add files, connect sources, or explore optional tips.'
        : input.ready
          ? 'Chat will ask for context only when it helps, then route you to labs, DNA, wearables, light, or first-test planning.'
          : 'Chat starts with the basics, then guides AI setup only when it is needed for import or optional tips.',
      secondary: {mode: 'secondary', paused: input.paused},
    },
    reminder: input.reminder,
  };
}
export function projectDashboardOnboardingBannerView(input: {
  male: () => string; female: () => string; dob: () => unknown;
}): DashboardOnboardingBannerView {
  const maleClass = input.male();
  const femaleClass = input.female();
  const dob = `${input.dob()}`;
  return {mode: 'banner', maleClass, femaleClass, dob};
}
export function renderDashboardGreetingHTML(view: DashboardGreetingView): string {
  return greetingHTML({view});
}
export function renderDashboardWelcomeFragment(view: DashboardWelcomeView): string {
  return welcomeHTML({view});
}
export function renderDashboardOnboardingHTML(view: DashboardOnboardingView): string {
  return onboardingHTML({view});
}
/** The same genuine owner supplies early static paint and the default runtime welcome. */
export function renderDashboardStartupWelcome(): string {
  return welcomeHTML({view: {...projectDashboardWelcomeView({ready: false, paused: false, reminder: null}), prerendered: true}});
}
