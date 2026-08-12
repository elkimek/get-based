// @ts-check
// Stable built-in diabetes marker category.

export const DIABETES_CATEGORY = {
  label: "Glucose & Insulin Metabolism", icon: "\uD83C\uDF6C",
  markers: {
    hba1c: { name: "HbA1c", unit: "mmol/mol", refMin: 20.0, refMax: 42.0, desc: "Glycated hemoglobin reflecting average blood sugar over 2\u20133 months; the gold standard for long-term glucose control." },
    insulin: { name: "Fasting Insulin", unit: "mU/l", refMin: 2.6, refMax: 24.9, desc: "Fasting insulin interpreted with glucose and HOMA-IR; elevated values can be an early sign of insulin resistance." },
    cPeptide: { name: "C-peptide", unit: "\u00b5g/l", refMin: 0.8, refMax: 3.1, desc: "Byproduct of endogenous insulin production; helps distinguish pancreatic insulin output from injected insulin exposure." },
    fructosamine: { name: "Fructosamine", unit: "\u00b5mol/l", refMin: 205, refMax: 285, desc: "Shorter-term glycation marker reflecting roughly 2–3 weeks of glucose exposure; useful when HbA1c is unreliable." },
    homaIR: { name: "HOMA-IR (calc)", unit: "", refMin: 0, refMax: 2.5, desc: "Calculated index of insulin resistance from fasting glucose and insulin; higher values indicate greater resistance." }
  }
};
