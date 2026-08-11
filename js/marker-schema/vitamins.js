// @ts-check
// Stable built-in vitamins marker category.

export const VITAMINS_CATEGORY = {
  label: "Vitamins", icon: "\u2600\uFE0F",
  markers: {
    vitaminD: { name: "Vitamin D Total", unit: "nmol/l", refMin: 75.0, refMax: 250.0, desc: "Sum of D2 and D3 forms; essential for calcium absorption, bone health, immune function, and mood regulation." },
    vitaminD3: { name: "Vitamin D3", unit: "nmol/l", refMin: 50.0, refMax: 175.0, desc: "The form of vitamin D produced by sun exposure and supplements; the most bioactive and clinically relevant form." },
    calcitriol: { name: "Calcitriol (1,25-(OH)\u2082D)", unit: "pmol/l", refMin: 36.5, refMax: 216.2, desc: "The active hormonal form of vitamin D produced by the kidneys; regulates calcium absorption and bone metabolism. Ordered for kidney disease or calcium disorders." },
    vitaminA: { name: "Vitamin A", unit: "\u00b5mol/l", refMin: 1.05, refMax: 2.80, desc: "A fat-soluble vitamin essential for vision, immune defense, and cell growth; both deficiency and excess are harmful." },
    vitaminB12: { name: "Vitamin B12", unit: "pmol/l", refMin: 145, refMax: 569, desc: "Total circulating B12; useful screening marker but can look normal when active B12 delivery or functional markers are strained." },
    activeB12: { name: "Active B12 (holotranscobalamin)", unit: "pmol/l", refMin: 35, refMax: null, desc: "Holotranscobalamin, the biologically available B12 fraction delivered to cells; often more actionable than total B12 for methylation and neurologic context." },
    methylmalonicAcid: { name: "Methylmalonic Acid", unit: "nmol/l", refMin: null, refMax: 350, desc: "Functional B12 marker; elevated values suggest impaired B12-dependent metabolism, especially when total B12 looks acceptable." },
    folate: { name: "Folate", unit: "nmol/l", refMin: 7.0, refMax: 45.3, desc: "B-vitamin critical for DNA synthesis and methylation; deficiency causes macrocytic anemia and elevated homocysteine. Key in pregnancy for neural tube prevention." }
  }
};
