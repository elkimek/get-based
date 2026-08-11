// @ts-check
// Stable built-in urinalysis marker category.

export const URINALYSIS_CATEGORY = {
  label: "Urinalysis", icon: "\uD83E\uDDEA",
  markers: {
    ph: { name: "Urine pH", unit: "", refMin: 5.0, refMax: 7.5, desc: "Acidity of urine; low pH seen in high-protein diets, metabolic acidosis, and uric acid stones; high pH in UTIs and renal tubular acidosis." },
    specificGravity: { name: "Specific Gravity", unit: "", refMin: 1.005, refMax: 1.030, desc: "Concentration of dissolved solutes in urine; reflects hydration status and kidney concentrating ability." }
  }
};
