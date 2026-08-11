// @ts-check
// Stable built-in lipids marker category.

export const LIPIDS_CATEGORY = {
  label: "Lipid Panel", icon: "\uD83E\uDEC0",
  markers: {
    cholesterol: { name: "Total Cholesterol", unit: "mmol/l", refMin: 2.90, refMax: 5.00, desc: "The sum of all cholesterol fractions in blood; a basic cardiovascular risk indicator, though HDL/LDL ratio matters more." },
    triglycerides: { name: "Triglycerides", unit: "mmol/l", refMin: 0.45, refMax: 1.70, desc: "Blood fats from dietary intake and liver production; elevated levels increase cardiovascular and pancreatitis risk." },
    hdl: { name: "HDL Cholesterol", unit: "mmol/l", refMin: 1.00, refMax: 2.10, refMin_f: 1.20, refMax_f: 2.70, desc: "Protective cholesterol that transports fat away from arteries back to the liver; higher levels reduce cardiovascular risk." },
    ldl: { name: "LDL Cholesterol", unit: "mmol/l", refMin: 1.20, refMax: 3.00, desc: "The primary atherogenic cholesterol that deposits in artery walls; the main target for cardiovascular risk reduction." },
    nonHdl: { name: "Non-HDL Cholesterol", unit: "mmol/l", refMin: 0.00, refMax: 3.80, desc: "All atherogenic cholesterol particles combined (LDL + VLDL + remnants); a better cardiovascular predictor than LDL alone." },
    apoAI: { name: "Apo A-I", unit: "g/l", refMin: 1.00, refMax: 1.70, desc: "The main protein of HDL particles; reflects protective cholesterol transport capacity and cardiovascular health." },
    apoB: { name: "Apo B", unit: "g/l", refMin: 0.50, refMax: 1.00, desc: "The protein on each LDL particle; directly counts atherogenic particles, making it a superior cardiovascular risk marker." },
    lpA: { name: "Lp(a)", unit: "nmol/l", refMin: 0, refMax: 125, desc: "Lipoprotein(a), a mostly genetic atherogenic particle. Values above ~125 nmol/L (≈50 mg/dL, assay-dependent) are commonly treated as risk-enhancing." }
  }
};
