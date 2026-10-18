import {tsStateStyles} from './ts-state-ui-inline-style-map.generated.js';
import { state } from './state.js';
import { LATITUDE_BANDS } from './constants.js';
import { saveImportedDataForProfile } from './data.js';
import { getLatitudeFromLocation, getLocationCache, latitudeToBand, renameProfile, setProfileDob, setProfileLocation, setProfileSex } from './profile.js';
import { logManualMetric, refreshManualSummary } from './wearables-manual.js';
import { getChatProfileSetupOwner } from './chat-profile-setup-component.js';
import { createChatProfileOnboardingController } from './chat-profile-onboarding-controller.js';
import type { ChatProfileFormPort, ChatProfileOrigin } from './chat-profile-onboarding-contract.js';

export function projectChatProfileLatitude(country: string): string {
  if (!country) return '';
  const raw = getLocationCache()?.[(country + '|').toLowerCase()];
  const candidate = typeof raw === 'number' ? raw : raw?.lat ?? raw?.latitude;
  const latitude = candidate == null ? NaN : Number(candidate);
  if (Number.isFinite(latitude)) return `✓ ${Math.abs(Math.round(latitude))}°${latitude >= 0 ? 'N' : 'S'} — ${LATITUDE_BANDS[latitudeToBand(latitude)]}`;
  const band = getLatitudeFromLocation(country, '');
  return band ? `✓ ${band}` : '';
}

/** Public helpers also support external/legacy callers; each configured module keeps its own callbacks. */
export function createChatProfileOnboarding(callbacks: {
  height(profileId: string, height: number, unit: string): Promise<boolean>;
  saved(advance: boolean): void;
}) {
  const controller = createChatProfileOnboardingController({
    rename: renameProfile, dob: setProfileDob, sex: setProfileSex, height: callbacks.height,
    location: (profile, country) => setProfileLocation(profile, country, ''),
    data: (profile, data, baseline) => saveImportedDataForProfile(profile, data, { forceProfileScope: true, baseData: baseline }),
    async weight(profile, date, value, unit) {
      await logManualMetric(profile, 'weight', { date, value, unit });
      await refreshManualSummary(profile);
      return true;
    },
    latitude: projectChatProfileLatitude,
    publishDob: value => { state.profileDob = value; },
    publishSex: value => { state.profileSex = value; },
    saved: callbacks.saved,
    today: () => new Date().toISOString().slice(0, 10),
  });
  function capture(source?: Element): ChatProfileOrigin | null {
    const owner = getChatProfileSetupOwner(source || document.getElementById('chat-onboard-name') || undefined);
    if (owner === undefined || !state.importedData) return null;
    const profileId = state.currentProfile, data = state.importedData;
    const history = state.chatHistory, thread = state.currentThreadId;
    const name = document.getElementById('chat-onboard-name') as HTMLInputElement | null;
    if (!owner && !name) return null;
    let retired = false;
    const input = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    const view: ChatProfileFormPort = owner?.view || {
      readDraft: () => ({ name: name!.value, sex: state.profileSex, dob: input('chat-onboard-dob')?.value || '',
        height: input('chat-onboard-height')?.value || '', heightUnit: input('chat-onboard-height-unit')?.value || 'cm',
        weight: input('chat-onboard-weight')?.value || '', weightUnit: input('chat-onboard-weight-unit')?.value || 'kg', country: input('chat-onboard-country')?.value || '' }),
      setPending() {}, setError() {},
      setSex(sex) { document.querySelectorAll('.chat-onboard-form .welcome-sex-btn').forEach((button, index) => button.classList.toggle('active', sex === (index === 0 ? 'male' : 'female'))); },
      setLatitude(text) { const label = document.getElementById('chat-onboard-lat'); if (label) { label.textContent = text; label.style.color = tsStateStyles.successColor; } },
      setContinueEnabled(enabled) { const button = document.getElementById('chat-onboard-next') as HTMLButtonElement | null; if (button) button.disabled = !enabled; },
      setHeight(value, placeholder) { const field = input('chat-onboard-height') as HTMLInputElement | null; if (field) { field.value = value; field.placeholder = placeholder; } },
    };
    return { profileId, data, view, current() {
      if (profileId !== state.currentProfile || data !== state.importedData || history !== state.chatHistory
        || thread !== state.currentThreadId || (owner ? !owner.current() : !name?.isConnected || document.getElementById('chat-onboard-name') !== name)) retired = true;
      return !retired;
    } };
  }
  return {
    updateNext() { const origin = capture(); if (origin?.current()) origin.view.setContinueEnabled(Boolean(origin.view.readDraft().name.trim() && state.profileSex)); },
    setSex(sex: string | null, source?: Element) { const origin = capture(source); return origin ? controller.setSex(origin, sex) : Promise.resolve(false); },
    saveLocation(source?: Element) { const origin = capture(source); return origin ? controller.saveLocation(origin, origin.view.readDraft().country.trim()) : Promise.resolve(false); },
    saveProfile(advance = false, source?: Element) { const origin = capture(source); return origin ? controller.saveProfile(origin, origin.view.readDraft(), advance) : Promise.resolve(false); },
    heightUnitChanged(source?: Element) {
      const origin = capture(source); if (!origin?.current()) return;
      const draft = origin.view.readDraft(), value = parseFloat(draft.height), inches = draft.heightUnit === 'in';
      origin.view.setHeight(value ? (inches ? value / 2.54 : value * 2.54).toFixed(1) : draft.height, inches ? 'inches' : 'cm');
    },
  };
}
