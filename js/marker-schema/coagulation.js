// @ts-check
// Stable built-in coagulation marker category.

export const COAGULATION_CATEGORY = {
  label: "Coagulation", icon: "\uD83E\uDE78",
  markers: {
    homocysteine: { name: "Homocysteine", unit: "\u00b5mol/l", refMin: 5.2, refMax: 15.0, refMin_f: 3.7, refMax_f: 10.4, desc: "An amino acid linked to cardiovascular and neurological risk when elevated; lowered by folate, B6, and B12." },
    pt: { name: "Prothrombin Time (PT)", unit: "s", refMin: 9.4, refMax: 12.5, desc: "Clotting time for the extrinsic and common pathways; reagent-specific values are commonly normalized as INR for warfarin monitoring." },
    inr: { name: "INR", unit: "", refMin: 0.9, refMax: 1.1, desc: "Standardized prothrombin-time ratio; therapeutic targets differ for people taking vitamin K antagonists and should not be judged against the untreated range." },
    aptt: { name: "Activated Partial Thromboplastin Time (aPTT)", unit: "s", refMin: 25, refMax: 37, desc: "Clotting time for the intrinsic and common pathways; reference and treatment ranges depend on reagent, instrument, and anticoagulant context." },
    fibrinogen: { name: "Fibrinogen", unit: "g/l", refMin: 1.8, refMax: 4.0, desc: "Coagulation protein and inflammatory acute-phase marker; contributes to clotting and plasma viscosity context." },
    dDimer: { name: "D-dimer", unit: "mg/l FEU", refMin: 0, refMax: 0.5, desc: "Fibrin breakdown product; elevated values can reflect active clot turnover and need clinical context." }
  }
};
