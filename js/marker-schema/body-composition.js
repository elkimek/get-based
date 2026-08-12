// @ts-check
// Stable built-in body composition marker category.

export const BODY_COMPOSITION_CATEGORY = {
  label: "Body Composition", icon: "\uD83C\uDFCB\uFE0F", group: "DEXA",
  markers: {
    bodyFatPct: { name: "Body Fat", unit: "%", refMin: 6, refMax: 24, refMin_f: 16, refMax_f: 30, desc: "Percentage of total body mass composed of fat tissue; measured by DEXA for accurate compartmental analysis." },
    leanMass: { name: "Lean Mass", unit: "kg", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Total body mass minus fat tissue; includes muscle, bone, organs, and water. No universal static interval exists because height, body size, age, and sex are integral to interpretation; track change and normalized indices." },
    fatMass: { name: "Fat Mass", unit: "kg", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Total adipose tissue mass. No universal static interval exists because height, body size, age, and sex are integral to interpretation; percentage and distribution measures are more comparable." },
    bmiDexa: { name: "BMI (DEXA)", unit: "kg/m\u00b2", refMin: 18.5, refMax: 24.9, desc: "Body mass index from DEXA-measured weight and height; the standard WHO classification for weight status." },
    androidFatPct: { name: "Android Fat", unit: "%", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Fat percentage in the abdominal region. Scanner definitions and age/sex norms vary, so no universal static interval is used; interpret with total fat and the android-to-gynoid ratio." },
    gynoidFatPct: { name: "Gynoid Fat", unit: "%", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Fat percentage in the hip and thigh region. Scanner definitions and age/sex norms vary, so no universal static interval is used; interpret with total fat and the android-to-gynoid ratio." },
    agRatio: { name: "A/G Fat Ratio", unit: "", refMin: 0, refMax: 1.0, desc: "Android-to-gynoid fat ratio; values above 1.0 indicate central fat predominance and increased cardiometabolic risk." },
    visceralFatArea: { name: "Visceral Fat Area", unit: "cm\u00b2", refMin: 0, refMax: 100, desc: "Estimated cross-sectional area of intra-abdominal fat surrounding organs; a key predictor of metabolic syndrome and type 2 diabetes." }
  }
};
