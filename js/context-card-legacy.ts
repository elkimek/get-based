import type { Diagnoses, DietContext, ExerciseContext, SleepContext } from '../types/profile-context-data.js';

export function legacyContextNote(card: 'diagnoses', value: string): Diagnoses | null;
export function legacyContextNote(card: 'diet', value: string): DietContext | null;
export function legacyContextNote(card: 'exercise', value: string): ExerciseContext | null;
export function legacyContextNote(card: 'sleepRest', value: string): SleepContext | null;
export function legacyContextNote(card: string, value: string): Diagnoses | DietContext | ExerciseContext | SleepContext | null;
export function legacyContextNote(card: string, value: string): Diagnoses | DietContext | ExerciseContext | SleepContext | null {
  const note = value.trim();
  if (!note) return null;
  if (card === 'diagnoses') return { conditions: [], note, familyHistory: [] };
  if (card === 'diet') return { type: null, restrictions: [], pattern: null, note };
  if (card === 'exercise') return { frequency: null, types: [], intensity: null, dailyMovement: null, note };
  if (card === 'sleepRest') return { duration: null, quality: null, schedule: null, issues: [], note };
  throw new Error('This context card needs review in its editor first.');
}
/** Normalize only a known legacy card in memory; its raw snapshot still guards storage. */
export function contextValueForRead(card: string, value: unknown): unknown {
  return typeof value === 'string' && ['diagnoses', 'diet', 'exercise', 'sleepRest'].includes(card) ? legacyContextNote(card, value) : value;
}
