// @ts-check
// Stable built-in proteins marker category.

export const PROTEINS_CATEGORY = {
  label: "Proteins & Inflammation", icon: "\uD83D\uDEE1\uFE0F",
  markers: {
    hsCRP: { name: "hs-CRP", unit: "mg/l", refMin: 0.00, refMax: 3.00, desc: "High-sensitivity C-reactive protein; a key marker of systemic inflammation and independent predictor of cardiovascular events." },
    crp: { name: "CRP", unit: "mg/l", refMin: 0.00, refMax: 5.00, desc: "C-reactive protein; produced by the liver in response to inflammation. Standard assay with lower sensitivity than hs-CRP. Elevated in infections, autoimmune conditions, and tissue injury." },
    totalProtein: { name: "Total Protein", unit: "g/l", refMin: 64.0, refMax: 83.0, desc: "Sum of albumin and globulins in blood; reflects nutritional status, liver function, and immune system activity." },
    albumin: { name: "Albumin", unit: "g/l", refMin: 35.0, refMax: 52.0, desc: "The most abundant blood protein made by the liver; low levels indicate malnutrition, liver disease, or chronic inflammation." },
    ceruloplasmin: { name: "Ceruloplasmin", unit: "g/l", refMin: 0.15, refMax: 0.30, desc: "A copper-carrying protein produced by the liver; low levels suggest Wilson disease, high levels indicate inflammation." },
    neurofilamentLight: { name: "Neurofilament Light", unit: "pg/ml", refMin: null, refMax: 12, desc: "Axonal injury marker; interpretation is age- and assay-dependent and belongs in clinical neurologic context." }
  }
};
