// @ts-check
// Stable built-in calculated ratios marker category.

export const CALCULATED_RATIOS_CATEGORY = {
  label: "Calculated Ratios", icon: "\uD83D\uDCD0", calculated: true,
  markers: {
    tgHdlRatio: { name: "TG/HDL Ratio", unit: "", refMin: 0, refMax: 1.75, desc: "Triglycerides divided by HDL; a strong surrogate marker for insulin resistance and small dense LDL particles." },
    ldlHdlRatio: { name: "LDL/HDL Ratio", unit: "", refMin: 0, refMax: 2.5, refMax_f: 2.0, desc: "Balance of atherogenic to protective cholesterol; a simple predictor of coronary heart disease risk." },
    apoBapoAIRatio: { name: "ApoB/ApoA-I Ratio", unit: "", refMin: 0, refMax: 0.9, refMax_f: 0.8, desc: "Ratio of atherogenic to protective lipoprotein particles; considered the best single lipid marker for cardiovascular risk." },
    cholHdlRatio: { name: "Total Cholesterol/HDL Ratio", unit: "", refMin: 0, refMax: 5.0, desc: "Total cholesterol divided by HDL; a simple cardiovascular risk ratio where lower values are generally better." },
    nlr: { name: "Neutrophil-Lymphocyte Ratio (NLR)", unit: "", refMin: 1.0, refMax: 3.0, desc: "A marker of systemic inflammation and immune stress; elevated in infections, chronic inflammation, and cancer prognosis." },
    plr: { name: "Platelet-Lymphocyte Ratio (PLR)", unit: "", refMin: 50, refMax: 150, desc: "Reflects the balance between thrombotic and immune responses; elevated in inflammation, cardiovascular disease, and cancer." },
    deRitisRatio: { name: "De Ritis Ratio (AST/ALT)", unit: "", refMin: 0.8, refMax: 1.2, desc: "AST divided by ALT; helps distinguish liver damage types \u2014 values above 2 suggest alcoholic liver disease or cirrhosis." },
    copperZincRatio: { name: "Copper/Zinc Ratio", unit: "", refMin: 0.7, refMax: 1.0, desc: "Balance between copper and zinc; elevated ratios indicate oxidative stress, inflammation, or immune dysfunction." },
    ft3ft4Ratio: { name: "Free T3/Free T4 Ratio", unit: "", refMin: 0.262, refMax: 0.346, desc: "Compares active Free T3 with its Free T4 precursor; helps show whether circulating thyroid hormone balance is relatively T3- or T4-dominant and should be read alongside TSH and the individual hormone values." },
    bunCreatRatio: { name: "BUN/Creatinine Ratio", unit: "", refMin: 10, refMax: 20, desc: "Blood urea nitrogen divided by creatinine; helps differentiate pre-renal, renal, and post-renal causes of kidney dysfunction." },
    freeWaterDeficit: { name: "Free Water Deficit", unit: "L", refMin: -1.5, refMax: 1.5, desc: "Estimated water surplus or deficit based on sodium level; positive values indicate dehydration, negative values overhydration." },
    crpHdlRatio: { name: "hs-CRP/HDL Ratio", unit: "", refMin: 0, refMax: 0.94, desc: "High-sensitivity CRP divided by HDL cholesterol; a composite inflammation-lipid marker that captures cardiovascular risk better than either marker alone. Requires hs-CRP specifically." },
    phenoAge: { name: "PhenoAge", unit: "years", refMin: null, refMax: null, hidden: true, desc: "Biological age from 9 biomarkers using the Levine 2018 mortality-calibrated formula." },
    bortzAge: { name: "Bortz Age", unit: "years", refMin: null, refMax: null, hidden: true, desc: "Biological age from 22 biomarkers using the Bortz 2023 aging-acceleration model." },
    biologicalAge: { name: "Biological Age", unit: "years", refMin: null, refMax: null, desc: "Combined biological age from PhenoAge (Levine 2018, 9 markers) and Bortz Age (Bortz 2023, 22 markers). Lower than chronological age suggests healthier aging." }
  }
};
