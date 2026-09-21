import type { HealthGoal, Biometrics, Diagnoses, DietContext, ExerciseContext, SleepContext, StressContext, LoveLifeContext, EnvironmentContext, LightCircadianContext } from './profile-context-data.js';
import type { ChatMessage, ChatThread } from './chat-data.js';
import type { NutritionMeal } from './nutrition-data.js';
import type { LabEntry } from './lab-data.js';
import type { SupplementRecord } from './supplement-data.js';

export interface CustomMarkerDefinition {
  markerId?: string;
  name?: string;
  unit?: string;
  refMin?: number | null;
  refMax?: number | null;
  categoryLabel?: string;
  icon?: string;
  group?: string | null;
  [key: string]: any;
}

export interface MarkerPlacement {
  categoryKey: string;
  [key: string]: any;
}

export interface ProfileNote {
  date: string;
  text: string;
  id?: string;
  updatedAt?: string | number;
  [key: string]: unknown;
}

export interface ProfileData {
  entries: LabEntry[];
  notes: ProfileNote[];
  supplements: SupplementRecord[];
  healthGoals: HealthGoal[];
  diagnoses: Diagnoses | string | null;
  diet: DietContext | string | null;
  exercise: ExerciseContext | string | null;
  sleepRest: SleepContext | string | null;
  lightCircadian: LightCircadianContext | null;
  stress: StressContext | null;
  loveLife: LoveLifeContext | null;
  environment: EnvironmentContext | null;
  interpretiveLens: string;
  contextNotes: string;
  menstrualCycle: any;
  emfAssessment: any;
  genetics: any;
  customMarkers: Record<string, CustomMarkerDefinition>;
  markerPlacements: Record<string, MarkerPlacement>;
  markerNotes: Record<string, string>;
  markerValueNotes: Record<string, string>;
  biologyScoreAI: Record<string, any>;
  contextSourceSettings: Record<string, boolean>;
  nutritionContextDays?: 7 | 30 | 90;
  nutritionTargets?: Record<string, any> | null;
  nutritionMeals?: NutritionMeal[] | null;
  changeHistory: any[];
  importSnapshots: any[];
  biometrics?: Biometrics | null;
  manualMetricTombstones?: Record<string, number>;
  manualValues?: Record<string, any>;
  sunSessions?: any[];
  deviceSessions?: any[];
  lightDevices?: any[];
  lightEnvironment?: Record<string, any> | null;
  lightMeasurements?: any[];
  lightAudits?: any[];
  sunCorrelations?: Record<string, any> | null;
  lifelightProfile?: Record<string, any> | null;
  sunDefaults?: Record<string, any> | null;
  [key: string]: any;
}

export interface NormalizedProfileData extends ProfileData {
  diagnoses: Diagnoses | null;
  diet: DietContext | null;
  exercise: ExerciseContext | null;
  sleepRest: SleepContext | null;
  lightCircadian: LightCircadianContext | null;
  stress: StressContext | null;
  loveLife: LoveLifeContext | null;
  environment: EnvironmentContext | null;
  menstrualCycle: Record<string, any> | null;
  emfAssessment: Record<string, any> | null;
  genetics: Record<string, any> | null;
}

export interface AppState {
  chartInstances: Record<string, any>;
  markerRegistry: Record<string, any>;
  importedData: NormalizedProfileData;
  unitSystem: string;
  showAltUnits: boolean;
  selectedCorrelationMarkers: string[];
  currentProfile: string;
  nutritionSummary: Record<string, any> | null;
  profiles: any[] | null;
  profileSex: string | null;
  profileDob: string | null;
  chatHistory: ChatMessage[];
  chatThreads: ChatThread[];
  currentThreadId: string | null;
  currentChatPersonality: string;
  dateRangeFilter: string;
  rangeMode: string;
  suppOverlayMode: string;
  noteOverlayMode: string;
  phaseOverlayMode: string;
  compareDate1: string | null;
  compareDate2: string | null;
  [key: string]: any;
}
