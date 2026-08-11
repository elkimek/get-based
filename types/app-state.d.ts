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

export interface ProfileData {
  entries: Array<Record<string, any>>;
  notes: any[];
  supplements: any[];
  healthGoals: any[];
  diagnoses: any;
  diet: any;
  exercise: any;
  sleepRest: any;
  lightCircadian: any;
  stress: any;
  loveLife: any;
  environment: any;
  interpretiveLens: string;
  contextNotes: string;
  menstrualCycle: any;
  emfAssessment: any;
  genetics: any;
  customMarkers: Record<string, CustomMarkerDefinition>;
  markerNotes: Record<string, any>;
  markerValueNotes: Record<string, any>;
  biologyScoreAI: Record<string, any>;
  contextSourceSettings: Record<string, boolean>;
  changeHistory: any[];
  importSnapshots: any[];
  biometrics?: Record<string, any> | null;
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
  diagnoses: Record<string, any> | null;
  diet: Record<string, any> | null;
  exercise: Record<string, any> | null;
  sleepRest: Record<string, any> | null;
  lightCircadian: Record<string, any> | null;
  stress: Record<string, any> | null;
  loveLife: Record<string, any> | null;
  environment: Record<string, any> | null;
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
  profiles: any[] | null;
  profileSex: string | null;
  profileDob: string | null;
  chatHistory: any[];
  chatThreads: any[];
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
