import type { ProfileData } from '../types/app-state.js';
import type { ChatOnboardingProgress } from './chat-onboarding-presentation.js';
export interface ChatProfileDraft {
  name: string; sex: string | null; dob: string; height: string; heightUnit: string;
  weight: string; weightUnit: string; country: string;
}
export interface ChatProfileSetupView extends ChatProfileDraft {
  personalityLabel: string; progress: ChatOnboardingProgress; today: string; latitude: string;
}
export interface ChatProfileFormPort {
  readDraft(): ChatProfileDraft;
  setPending(pending: boolean): void;
  setError(error: string): void;
  setSex(sex: string | null): void;
  setLatitude(text: string): void;
  setContinueEnabled(enabled: boolean): void;
  setHeight(value: string, placeholder: string): void;
}
export interface ChatProfileOrigin {
  profileId: string; data: ProfileData; view: ChatProfileFormPort;
  current(): boolean;
}
export interface ChatProfileSavePorts {
  rename(profile: string, name: string): Promise<boolean>;
  dob(profile: string, dob: string): Promise<boolean>;
  sex(profile: string, sex: string | null): Promise<boolean>;
  height(profile: string, height: number, unit: string): Promise<boolean>;
  location(profile: string, country: string): Promise<boolean>;
  data(profile: string, data: ProfileData, baseline: ProfileData): Promise<boolean>;
  weight(profile: string, date: string, value: number, unit: string): Promise<boolean>;
  latitude(country: string): string;
  publishDob(dob: string): void;
  publishSex(sex: string | null): void;
  saved(advance: boolean): void;
  today(): string;
}
