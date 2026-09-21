/** Persisted profile context. Unknown extensions must be narrowed by consumers. */
interface ContextExtensions { [key: string]: unknown; note?: string; }
export interface HealthGoal extends ContextExtensions { text: string; severity?: string; }
export interface BiometricValue extends ContextExtensions { date: string; value: number; unit?: string; }
export interface BloodPressureValue extends ContextExtensions { date: string; systolic?: number; diastolic?: number; pulse?: number; }
export interface Biometrics extends ContextExtensions { weight?: BiometricValue[]; pulse?: BiometricValue[]; bp?: BloodPressureValue[]; }
export interface Diagnosis extends ContextExtensions { name: string; severity?: string; status?: string; since?: string; }
export interface FamilyHistory extends ContextExtensions { relative: string; condition: string; onsetAge?: number | string; }
export interface Diagnoses extends ContextExtensions {
  conditions?: Diagnosis[];
  familyHistory?: FamilyHistory[];
  proceduresNote?: string;
  flags?: Record<string, boolean>;
}
export type DietContext = ContextExtensions & Partial<Record<
  'type' | 'pattern' | 'proteinIntake' | 'hydration' | 'alcohol' | 'caffeine' | 'caffeineTiming' |
  'breakfast' | 'breakfastTime' | 'lunch' | 'lunchTime' | 'dinner' | 'dinnerTime' | 'snacks' | 'snacksTime' |
  'bowelFrequency' | 'stoolConsistency' | 'bloating' | 'gas' | 'acidReflux' | 'burping' | 'nausea' |
  'appetite' | 'abdominalPain', string | null>> & { restrictions?: string[]; recentChanges?: string[]; foodSensitivities?: string[]; };
export type ExerciseContext = ContextExtensions & Partial<Record<
  'frequency' | 'intensity' | 'duration' | 'dailyMovement' | 'muscleContext', string | null>> & { types?: string[]; limitations?: string[]; };
export type SleepContext = ContextExtensions & Partial<Record<
  'duration' | 'quality' | 'daytimeSleepiness' | 'apneaStatus' | 'papUse' | 'naps' | 'schedule' | 'roomTemp', string | null>> & { issues?: string[]; environment?: string[]; practices?: string[]; };
export type StressContext = ContextExtensions & Partial<Record<'level' | 'duration' | 'trend', string | null>> & { sources?: string[]; management?: string[]; };
export type LoveLifeContext = ContextExtensions & Partial<Record<
  'status' | 'relationship' | 'satisfaction' | 'libido' | 'libidoChange' | 'frequency' | 'orgasm', string | null>> & { reproductiveGoals?: string[]; concerns?: string[]; };
export type EnvironmentContext = ContextExtensions & Partial<Record<
  'setting' | 'climate' | 'altitude' | 'water' | 'homeLight' | 'building', string | null>> & {
  inhaledExposures?: string[]; occupationalExposures?: string[]; waterConcerns?: string[];
  emf?: string[]; emfMitigation?: string[]; air?: string[]; toxins?: string[];
};
export type LightCircadianContext = ContextExtensions & Partial<Record<
  'amLight' | 'daytime' | 'uvExposure' | 'skinType' | 'screenTime' | 'cold' | 'grounding', string | null>> & {
  evening?: string[]; techEnv?: string[]; mealTiming?: string[]; practices?: string[]; timing?: string | null; latitude?: number | null;
};
