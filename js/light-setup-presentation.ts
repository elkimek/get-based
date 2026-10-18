import type{OnboardingAIView}from'./light-onboarding-ai-presentation.js';
import { SKIN_TYPE } from './constants.js';
import type { SunSetupDefaults, SunSetupCoords } from './sun-defaults-model.js';
import { EYEWEAR_OPTIONS, HOME_LIGHT_OPTIONS, fitzpatrickToSkinTypeIndex, skinTypeToFitzpatrick, ottScoreToLabel, photosensitiveTierOf } from './sun-defaults-model.js';

export interface LightSetupChip {
  readonly kind: 'skin' | 'home' | 'eyewear' | 'ott' | 'skipped' | 'unset';
  readonly icon: string; readonly label: string; readonly value: string; readonly title: string; readonly sub?: string;
  readonly accent?: 'warm' | 'cool' | 'sun' | 'neutral';
  readonly tier?: number;
}
export interface LightSetupView {
  readonly ownerTicket: string;
  readonly defaults: SunSetupDefaults;
  readonly complete: boolean;
  readonly deferredPrompt?: boolean;
  readonly initialFitzpatrick: string | null;
  readonly skinIndex: number;
  readonly filledCount: number;
  readonly selectedPatterns: number;
  readonly location: ReturnType<typeof projectSetupLocation>;
  readonly chips: readonly LightSetupChip[];
  readonly photoWarning: string;
  readonly ai: Readonly<OnboardingAIView> | null;
}
export interface LightSetupPresentationProps {
  readonly surface: 'card' | 'editor' | 'actions' | 'location' | 'modal' | 'skin-label';
  readonly view: LightSetupView;
  readonly includeActions?: boolean;
  readonly skinIndex?: number;
}

export function projectLightSetup(input: {
  defaults: SunSetupDefaults | null;
  savedFitzpatrick: string | null | undefined;
  legacySkin: string | null | undefined;
  complete: boolean;
  coords: SunSetupCoords | null;
  profileLocation: { country?: string | null } | null;
  ai?: Readonly<OnboardingAIView> | null;
  ownerTicket?: string;
}): LightSetupView {
  const defaults = input.defaults || {};
  const initialFitzpatrick = input.savedFitzpatrick || skinTypeToFitzpatrick(input.legacySkin);
  const fitzpatrick = defaults.fitzpatrick || skinTypeToFitzpatrick(input.legacySkin);
  const skinIndex = fitzpatrick ? fitzpatrickToSkinTypeIndex(fitzpatrick) : -1;
  const skinLabel = skinIndex >= 0 ? SKIN_TYPE[skinIndex]! : '—';
  const homeMeta = HOME_LIGHT_OPTIONS.find(option => option.key === defaults.homeLight);
  const eyewearMeta = EYEWEAR_OPTIONS.find(option => option.key === defaults.eyewear);
  const homeIcons: Record<string, string> = {
    'led-cool': '💡', 'led-warm': '💡', 'led-tunable': '💡', fluorescent: '🌫️',
    incandescent: '🔥', halogen: '🔥', candle: '🕯️', mixed: '✨', 'natural-only': '☀️', unknown: '❔',
  };
  const homeAccents: Record<string, NonNullable<LightSetupChip['accent']>> = {
    'led-cool': 'cool', 'led-warm': 'warm', 'led-tunable': 'cool', fluorescent: 'cool',
    incandescent: 'warm', halogen: 'warm', candle: 'warm', 'natural-only': 'sun', mixed: 'neutral', unknown: 'neutral',
  };
  const eyewearIcons: Record<string, string> = { none: '👁', sunglasses: '🕶', 'clear-glasses': '👓', both: '🕶', 'contacts-uv': '👀' };
  const chips: LightSetupChip[] = [
    { kind: 'skin', icon: ['🧑🏻','🧑🏼','🧑🏽','🧑🏾','🧑🏿','🧑🏿'][skinIndex] || '🧑', label: 'Skin type', value: skinLabel, title: 'Fitzpatrick ' + skinLabel + ' — drives MED math + UV tolerance.' },
    { kind: 'home', accent: homeAccents[defaults.homeLight!] || 'neutral', icon: homeIcons[defaults.homeLight!] || '💡', label: 'Home lighting', value: (homeMeta?.label || defaults.homeLight || 'Not set').replace(/\s*\(.*\)/, ''), title: homeMeta?.label || defaults.homeLight || 'Not set' },
    { kind: 'eyewear', icon: eyewearIcons[defaults.eyewear!] || '👁', label: 'Eyewear outside', value: (eyewearMeta?.label || defaults.eyewear || 'Not set').split('—')[0]!.split(/[(,]/)[0]!.trim(), title: eyewearMeta?.label || defaults.eyewear || 'Not set' },
  ];
  if (typeof defaults.ottScore === 'number') {
    const meta = ottScoreToLabel(defaults.ottScore);
    chips.push({ kind: 'ott', tier: meta.tier, icon: '☀', label: 'Light patterns', value: meta.label, sub: `${defaults.ottScore}/10 selected`, title: 'Context patterns selected (0–10). This educational map mixes established circadian factors with exploratory spectrum questions; it is not a clinical score.' });
  } else if (defaults.skipped) {
    chips.push({ kind: 'skipped', icon: '⏭', label: 'Light patterns', value: 'Skipped', sub: 'tap Edit to fill in', title: '' });
  } else {
    chips.push({ kind: 'unset', icon: '·', label: 'Light patterns', value: '—', title: '' });
  }
  const photoWarnings: Record<string, string> = {
    unknown: 'Medication and product sunlight warnings not reviewed',
    mild: 'Possible photosensitivity warning recorded',
    moderate: 'Known photosensitivity warning recorded',
    severe: 'Prior reaction or strict sun warning recorded',
  };
  const selectedPatterns = defaults.ott
    ? Object.values(defaults.ott).filter(Boolean).length
    : typeof defaults.ottScore === 'number' ? defaults.ottScore : 0;
  return {
    defaults, complete: input.complete, initialFitzpatrick, ownerTicket: input.ownerTicket || '',
    skinIndex: initialFitzpatrick ? fitzpatrickToSkinTypeIndex(initialFitzpatrick) : 2,
    filledCount: [!!initialFitzpatrick, !!defaults.homeLight, !!defaults.eyewear].filter(Boolean).length,
    selectedPatterns: Math.max(0, Math.min(10, Number(selectedPatterns) || 0)),
    location: projectSetupLocation(input.coords, input.profileLocation), chips,
    photoWarning: photoWarnings[photosensitiveTierOf(defaults.photosensitiveMeds)] || '',
    ai: input.ai || null,
  };
}

function formatSetupLatitude(latitude: unknown) {
  const numericLatitude = Number(latitude);
  if (!Number.isFinite(numericLatitude)) return '';
  const digits = Math.abs(numericLatitude) >= 10 ? 1 : 2;
  return `${Math.abs(numericLatitude).toFixed(digits)}°${numericLatitude < 0 ? 'S' : 'N'}`;
}

export function projectSetupLocation(coords: SunSetupCoords | null, location: { country?: string | null } | null) {
  const country = (location?.country || '').trim();
  const latitude = coords ? formatSetupLatitude(coords.lat) : '';

  if (coords?.source === 'current-device') {
    return {
      tone: 'precise',
      value: `Current location${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'today only',
      detail: 'Privacy-rounded in this tab and cleared at local midnight; it is not saved to your profile.',
      preciseLabel: 'Refresh current location',
      clearLabel: 'Use home instead',
    };
  }
  if (coords?.source === 'profile-precise') {
    return {
      tone: 'precise',
      value: 'Saved location',
      badge: 'legacy profile',
      detail: 'Existing saved coordinates drive sun-angle and UV-index math. New device locations are temporary.',
      preciseLabel: 'Use current location today',
      clearLabel: '',
    };
  }
  if (coords?.source === 'home-postal') {
    return {
      tone: 'estimate',
      value: `Home postal area${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'home context',
      detail: 'A privacy-rounded home area supports circadian, daylight, and UV estimates without tracking travel.',
      preciseLabel: 'Use current location today',
      clearLabel: '',
    };
  }
  if (coords?.source === 'country-band') {
    return {
      tone: 'estimate',
      value: `Profile estimate${latitude ? ` · ~${latitude}` : ''}`,
      badge: 'profile',
      detail: `${country ? `${country} profile location. ` : ''}Add an optional postal code for home context, or use current location for today's conditions.`,
      preciseLabel: 'Use current location today',
      clearLabel: '',
    };
  }
  return {
    tone: 'missing',
    value: 'No profile location set',
    badge: 'optional',
    detail: 'Set a home country in Profile, or explicitly share a privacy-rounded current location for today.',
    preciseLabel: 'Use current location today',
    clearLabel: '',
  };
}
