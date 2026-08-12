// @ts-check
// Stable built-in electrolytes marker category.

export const ELECTROLYTES_CATEGORY = {
  label: "Electrolytes & Minerals", icon: "\u2696\uFE0F",
  markers: {
    sodium: { name: "Sodium", unit: "mmol/l", refMin: 136, refMax: 145, desc: "The main extracellular electrolyte controlling fluid balance and blood pressure; abnormal levels affect nerve and muscle function." },
    potassium: { name: "Potassium", unit: "mmol/l", refMin: 3.5, refMax: 5.1, desc: "A critical intracellular electrolyte regulating heart rhythm and muscle contraction; abnormal levels can be life-threatening." },
    chloride: { name: "Chloride", unit: "mmol/l", refMin: 97, refMax: 108, desc: "An electrolyte that maintains fluid balance and acid-base status; usually changes in parallel with sodium." },
    calciumTotal: { name: "Calcium Total", unit: "mmol/l", refMin: 2.15, refMax: 2.50, desc: "Essential for bone strength, nerve signaling, and muscle contraction; regulated by parathyroid hormone and vitamin D." },
    calciumIonized: { name: "Calcium Ionized", unit: "mmol/l", refMin: 1.16, refMax: 1.32, desc: "Biologically active calcium fraction; useful when albumin, acid-base status, or critical illness makes total calcium harder to interpret." },
    phosphorus: { name: "Phosphorus", unit: "mmol/l", refMin: 0.81, refMax: 1.45, desc: "Works with calcium for bone mineralization and energy metabolism; imbalances affect bone health and kidney function." },
    magnesium: { name: "Magnesium (serum)", unit: "mmol/l", refMin: 0.66, refMax: 1.07, desc: "A cofactor in 300+ enzymatic reactions including energy production and nerve function; deficiency is common and underdiagnosed." },
    magnesiumRBC: { name: "Magnesium RBC", unit: "mmol/l", refMin: 1.44, refMax: 2.60, desc: "Intracellular magnesium level; a more accurate measure of true magnesium status than serum, which reflects only 1% of body stores." },
    copper: { name: "Copper", unit: "\u00b5mol/l", refMin: 11.6, refMax: 20.6, desc: "A trace mineral essential for iron metabolism, connective tissue, and antioxidant defense; excess is toxic to the liver." },
    zinc: { name: "Zinc", unit: "\u00b5mol/l", refMin: 9.8, refMax: 18.0, desc: "A trace mineral important for immune function, wound healing, and endocrine biology. When fasting status and collection time are known, sex-aware WHO/IZiNCG population adequacy cutoffs are shown as guidance; they are not an individual diagnosis or a supplement target." },
    selenium: { name: "Selenium", unit: "\u00b5mol/l", refMin: 0.89, refMax: 1.65, desc: "Trace element incorporated into antioxidant and thyroid-related enzymes. The optional optimal band begins at the serum/plasma concentration considered sufficient for selenoprotein synthesis; its upper edge is the laboratory bound, not a supplement target. Recent intake, inflammation, and laboratory method still matter." }
  }
};
