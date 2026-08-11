// @ts-check
// Stable built-in hematology marker category.

export const HEMATOLOGY_CATEGORY = {
  label: "Hematology (CBC)", icon: "\uD83E\uDDEB",
  markers: {
    wbc: { name: "WBC", unit: "10^9/l", refMin: 4.00, refMax: 10.00, desc: "White blood cell count; the primary measure of immune system activity, elevated in infection and inflammation." },
    rbc: { name: "RBC", unit: "10^12/l", refMin: 4.00, refMax: 5.80, refMin_f: 3.80, refMax_f: 5.20, desc: "Red blood cell count; reflects oxygen-carrying capacity, with low values indicating anemia and high values polycythemia." },
    hemoglobin: { name: "Hemoglobin", unit: "g/l", refMin: 135, refMax: 175, refMin_f: 120, refMax_f: 160, desc: "The oxygen-carrying protein in red blood cells; the definitive marker for diagnosing anemia or polycythemia." },
    hematocrit: { name: "Hematocrit", unit: "%", refMin: 40.0, refMax: 50.0, refMin_f: 35.0, refMax_f: 45.0, desc: "The percentage of blood volume occupied by red blood cells; affected by hydration status, anemia, and altitude." },
    mcv: { name: "MCV", unit: "fl", refMin: 82.0, refMax: 98.0, desc: "Average red blood cell size; helps classify anemia as microcytic (iron deficiency) or macrocytic (B12/folate deficiency)." },
    mch: { name: "MCH", unit: "pg", refMin: 28.0, refMax: 34.0, desc: "Average hemoglobin content per red blood cell; low values suggest iron deficiency, high values suggest B12 deficiency." },
    mchc: { name: "MCHC", unit: "g/l", refMin: 320, refMax: 360, desc: "Average hemoglobin concentration in red blood cells; helps differentiate types of anemia and detect spherocytosis." },
    rdwcv: { name: "RDW-CV", unit: "%", refMin: 10.0, refMax: 15.2, desc: "Variation in red blood cell size; elevated values suggest mixed nutritional deficiencies or early iron deficiency." },
    platelets: { name: "Platelets", unit: "10^9/l", refMin: 150, refMax: 400, desc: "Blood cells essential for clotting; low counts risk bleeding, high counts risk clotting or indicate inflammation." },
    mpv: { name: "MPV", unit: "fl", refMin: 7.8, refMax: 12.8, desc: "Average platelet size; larger platelets are more reactive, and elevated MPV is linked to cardiovascular risk." },
    pdw: { name: "PDW", unit: "fl", refMin: 9.0, refMax: 17.0, desc: "Variation in platelet size; elevated values suggest active platelet production or consumption in clotting disorders." },
    pct: { name: "Plateletcrit", unit: "%", refMin: 0.15, refMax: 0.40, desc: "The percentage of blood volume occupied by platelets; analogous to hematocrit but for platelets, reflecting total platelet mass." }
  }
};
