// @ts-check
// Stable built-in urinalysis marker category.

export const URINALYSIS_CATEGORY = {
  label: "Urinalysis", icon: "\uD83E\uDDEA",
  markers: {
    ph: { name: "Urine pH", unit: "", refMin: 5.0, refMax: 7.5, desc: "Acidity of urine; low pH seen in high-protein diets, metabolic acidosis, and uric acid stones; high pH in UTIs and renal tubular acidosis." },
    specificGravity: { name: "Specific Gravity", unit: "", refMin: 1.005, refMax: 1.030, desc: "Concentration of dissolved solutes in urine; reflects hydration status and kidney concentrating ability." },
    albumin: { name: "Albumin (Urine)", unit: "mg/l", refMin: 0, refMax: 20, desc: "Urinary albumin concentration; hydration affects a spot concentration, so the albumin/creatinine ratio is usually more interpretable." },
    creatinine: { name: "Creatinine (Urine)", unit: "mmol/l", refMin: 1.4, refMax: 28.8, desc: "Urinary creatinine concentration used to normalize albumin or protein in random adult samples. A stand-alone value varies heavily with hydration, muscle mass, diet, and collection type." },
    albuminCreatinineRatio: { name: "Urine Albumin/Creatinine Ratio", unit: "mg/mmol", refMin: 0, refMax: 3.0, desc: "Albumin normalized to urine creatinine in a spot sample; persistent elevation supports kidney-damage assessment and should be confirmed as clinically appropriate." },
    totalProtein: { name: "Total Protein (Urine)", unit: "g/l", refMin: 0, refMax: 0.15, desc: "Total urinary protein concentration; interpret with collection type and hydration, or normalize to creatinine in a spot sample." },
    proteinCreatinineRatio: { name: "Urine Protein/Creatinine Ratio", unit: "mg/mmol", refMin: 0, refMax: 20, desc: "Total protein normalized to urine creatinine in a spot sample; approximates daily protein loss without a timed collection." }
  }
};
