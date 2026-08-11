// @ts-check
// Stable built-in body composition marker category.

export const BODY_COMPOSITION_CATEGORY = {
  label: "Body Composition", icon: "\uD83C\uDFCB\uFE0F", group: "DEXA",
  markers: {
    bodyFatPct: { name: "Body Fat", unit: "%", refMin: 6, refMax: 24, refMin_f: 16, refMax_f: 30, desc: "Percentage of total body mass composed of fat tissue; measured by DEXA for accurate compartmental analysis." },
    leanMass: { name: "Lean Mass", unit: "kg", refMin: null, refMax: null, desc: "Total body mass minus fat tissue; includes muscle, bone, organs, and water. Tracked over time to monitor muscle gain or loss." },
    fatMass: { name: "Fat Mass", unit: "kg", refMin: null, refMax: null, desc: "Total adipose tissue mass; more informative than BMI for assessing metabolic risk and body composition changes." },
    bmiDexa: { name: "BMI (DEXA)", unit: "kg/m\u00b2", refMin: 18.5, refMax: 24.9, desc: "Body mass index from DEXA-measured weight and height; the standard WHO classification for weight status." },
    androidFatPct: { name: "Android Fat", unit: "%", refMin: null, refMax: null, desc: "Fat percentage in the abdominal region (waist); android fat distribution is associated with higher cardiovascular and metabolic risk." },
    gynoidFatPct: { name: "Gynoid Fat", unit: "%", refMin: null, refMax: null, desc: "Fat percentage in the hip and thigh region; gynoid distribution is associated with lower cardiovascular risk." },
    agRatio: { name: "A/G Fat Ratio", unit: "", refMin: 0, refMax: 1.0, desc: "Android-to-gynoid fat ratio; values above 1.0 indicate central fat predominance and increased cardiometabolic risk." },
    visceralFatArea: { name: "Visceral Fat Area", unit: "cm\u00b2", refMin: 0, refMax: 100, desc: "Estimated cross-sectional area of intra-abdominal fat surrounding organs; a key predictor of metabolic syndrome and type 2 diabetes." }
  }
};
