// @ts-check
// marker-detail-content.js — Biological-age and custom-description content helpers

import { getActiveModelId, getAIProvider } from './api.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { resolveActiveMarkerPath } from './marker-placement.js';
import { trackUsage } from './schema.js';

// Keep these inputs aligned with the PhenoAge and Bortz Age calculations in
// data.js so the detail modal can explain which panel inputs are still missing.
export const BIO_AGE_PHENO_INPUTS = [
  ['proteins', 'albumin', 'Albumin'],
  ['biochemistry', 'creatinine', 'Creatinine'],
  ['biochemistry', 'glucose', 'Glucose'],
  ['proteins', 'hsCRP', 'hs-CRP'],
  ['differential', 'lymphocytesPct', 'Lymphocytes %'],
  ['hematology', 'mcv', 'MCV'],
  ['hematology', 'rdwcv', 'RDW-CV'],
  ['biochemistry', 'alp', 'ALP'],
  ['hematology', 'wbc', 'WBC'],
];

export const BIO_AGE_BORTZ_INPUTS = [
  ['proteins', 'albumin', 'Albumin'],
  ['biochemistry', 'alp', 'ALP'],
  ['biochemistry', 'urea', 'Urea'],
  ['lipids', 'cholesterol', 'Cholesterol'],
  ['biochemistry', 'creatinine', 'Creatinine'],
  ['biochemistry', 'cystatinC', 'Cystatin C'],
  ['diabetes', 'hba1c', 'HbA1c'],
  ['proteins', 'hsCRP', 'hs-CRP'],
  ['biochemistry', 'ggt', 'GGT'],
  ['hematology', 'rbc', 'RBC'],
  ['hematology', 'mcv', 'MCV'],
  ['hematology', 'rdwcv', 'RDW-CV'],
  ['differential', 'monocytes', 'Monocytes'],
  ['differential', 'neutrophils', 'Neutrophils'],
  ['differential', 'lymphocytesPct', 'Lymphocytes %'],
  ['biochemistry', 'alt', 'ALT'],
  ['hormones', 'shbg', 'SHBG'],
  ['vitamins', 'vitaminD', 'Vitamin D'],
  ['biochemistry', 'glucose', 'Glucose'],
  ['hematology', 'mch', 'MCH'],
  ['lipids', 'apoAI', 'ApoA-I'],
];

export function bioAgeReferenceIndex(data, marker, latestPoint) {
  if (latestPoint && Number.isInteger(latestPoint.i)) return latestPoint.i;
  const values = marker?.values || [];
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return i;
  }
  return data.dates?.length ? data.dates.length - 1 : -1;
}

/**
 * @typedef {{
 *   label: string,
 *   present: boolean,
 *   kind: string,
 * }} BioAgeInputStatus
 */

/**
 * @param {any} data
 * @param {number} idx
 * @param {string[][]} inputs
 * @param {BioAgeInputStatus | null} [profileRequirement]
 * @returns {BioAgeInputStatus[]}
 */
export function bioAgeInputStatusAtIndex(data, idx, inputs, profileRequirement = null) {
  const status = inputs.map(([category, key, label]) => ({
    label,
    present: idx >= 0 && resolveActiveMarkerPath(data.categories, category, key)?.marker?.values?.[idx] != null,
    kind: 'marker',
  }));
  if (profileRequirement) status.unshift(profileRequirement);
  return status;
}

export async function fetchCustomMarkerDescription(markerId, markerName, unit) {
  const cacheKey = 'labcharts-marker-desc';
  const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  if (cache[markerId]) return cache[markerId];
  if (!hasAssistantFeatureProvider()) return null;
  try {
    const result = await callAssistantFeatureAI({
      system: 'You are a concise medical reference. Reply with exactly one sentence (max 30 words) explaining what this blood biomarker measures and why it matters clinically. No preamble.',
      messages: [{ role: 'user', content: `${markerName} (${unit})` }],
      maxTokens: 100,
    });
    if (result?.usage && !getAssistantFeatureIdentity().subscription) {
      trackUsage(
        getAIProvider(),
        getActiveModelId(),
        result.usage.inputTokens || 0,
        result.usage.outputTokens || 0,
      );
    }
    const text = (result?.text || '').trim();
    if (text) {
      cache[markerId] = text;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    }
    return text || null;
  } catch {
    return null;
  }
}
