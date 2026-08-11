// @ts-check
// Stable built-in coagulation marker category.

export const COAGULATION_CATEGORY = {
  label: "Coagulation", icon: "\uD83E\uDE78",
  markers: {
    homocysteine: { name: "Homocysteine", unit: "\u00b5mol/l", refMin: 5.2, refMax: 15.0, refMin_f: 3.7, refMax_f: 10.4, desc: "An amino acid linked to cardiovascular and neurological risk when elevated; lowered by folate, B6, and B12." },
    fibrinogen: { name: "Fibrinogen", unit: "g/l", refMin: 1.8, refMax: 4.0, desc: "Coagulation protein and inflammatory acute-phase marker; contributes to clotting and plasma viscosity context." },
    dDimer: { name: "D-dimer", unit: "mg/l FEU", refMin: 0, refMax: 0.5, desc: "Fibrin breakdown product; elevated values can reflect active clot turnover and need clinical context." }
  }
};
