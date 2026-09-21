/** Persisted therapy history, including older records without IDs or periods. */
export interface SupplementRecord {
  id?: string;
  schemaVersion?: number;
  name: string;
  type?: string;
  dosage?: string;
  note?: string;
  startDate?: string;
  endDate?: string | null;
  periods?: Array<{ start: string; end: string | null; endReason?: string; dose?: SupplementDose; [key: string]: unknown }>;
  schedule?: {
    mode?: string;
    details?: string;
    timesPerDay?: number | null;
    maxPerDay?: number;
    daysOfWeek?: Array<number | string>;
    intervalDays?: number;
    [key: string]: unknown;
  };
  lifecycle?: { state?: string; changedAt?: number; reason?: string; [key: string]: unknown };
  ingredients?: SupplementIngredient[];
  inactiveIngredients?: string[];
  qualityTests?: SupplementQualityTest[];
  qualityEvidenceScope?: string;
  timesPerDay?: number;
  sourceUrl?: string;
  servingSize?: { value?: number; unit?: string };
  currentDose?: SupplementDose;
  importProvenance?: Record<string, unknown>;
  labelWarnings?: string[];
  updatedAt?: number;
  [key: string]: unknown;
}

export interface SupplementDose {
  value?: number;
  unit?: string;
  text?: string;
  [key: string]: unknown;
}
export interface SupplementIngredient {
  name: string;
  amount?: string;
  amountValue?: number;
  amountUnit?: string;
  timesPerDay?: number;
  [key: string]: unknown;
}
export interface SupplementQualityTest {
  category?: string;
  analyte?: string;
  resultText?: string;
  comparator?: string;
  value?: number | null;
  unit?: string;
  basis?: string;
  status?: string;
  includeInAIContext?: boolean;
  [key: string]: unknown;
}

/** New or edited records always carry their explicit schedule and history. */
export type SupplementRecordWithHistory = SupplementRecord &
  Required<Pick<SupplementRecord, 'schedule' | 'lifecycle' | 'periods'>>;
