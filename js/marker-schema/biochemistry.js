// @ts-check
// Stable built-in biochemistry marker category.

export const BIOCHEMISTRY_CATEGORY = {
  label: "Biochemistry", icon: "\u{1F9EA}",
  markers: {
    glucose: { name: "Glucose", unit: "mmol/l", refMin: 4.11, refMax: 5.60, desc: "Measures blood sugar level; the primary marker for diagnosing and monitoring diabetes and metabolic health." },
    urea: { name: "Urea (BUN)", unit: "mmol/l", refMin: 2.8, refMax: 8.3, desc: "A waste product of protein metabolism filtered by the kidneys; elevated levels suggest impaired kidney function or dehydration." },
    creatinine: { name: "Creatinine", unit: "\u00b5mol/l", refMin: 62, refMax: 106, refMin_f: 44, refMax_f: 80, desc: "A muscle metabolism byproduct cleared by the kidneys; used to estimate kidney filtration rate and detect renal dysfunction." },
    egfr: { name: "eGFR (CKD-EPI)", unit: "ml/s/1.73m\u00b2", refMin: 1.00, refMax: 2.30, desc: "Estimates how well the kidneys filter waste from blood; the standard measure for staging chronic kidney disease." },
    uricAcid: { name: "Uric Acid", unit: "\u00b5mol/l", refMin: 202, refMax: 417, refMin_f: 143, refMax_f: 339, desc: "End product of purine metabolism; high levels cause gout and are linked to kidney stones and cardiovascular risk." },
    bilirubinTotal: { name: "Bilirubin Total", unit: "\u00b5mol/l", refMin: 3.0, refMax: 24.0, desc: "A yellow pigment from red blood cell breakdown processed by the liver; elevated levels indicate liver disease or hemolysis." },
    bilirubinDirect: { name: "Bilirubin Direct", unit: "\u00b5mol/l", refMin: 0, refMax: 5.1, desc: "Conjugated and delta bilirubin measured directly; interpret with total and indirect bilirubin to assess bile flow and hepatic processing." },
    bilirubinIndirect: { name: "Bilirubin Indirect", unit: "\u00b5mol/l", refMin: 0, refMax: 17.0, desc: "Predominantly unconjugated bilirubin, usually calculated from total minus direct bilirubin; elevations can reflect hemolysis or impaired conjugation." },
    bicarbonate: { name: "Bicarbonate (Total CO\u2082)", unit: "mmol/l", refMin: 22, refMax: 29, desc: "Major blood buffer reported directly or as total carbon dioxide. The optional 22–26 optimal band is a general-population lower-risk association, not an acid-base treatment target; interpret it with electrolytes, kidney and lung context, and the reporting laboratory." },
    ast: { name: "AST", unit: "\u00b5kat/l", refMin: 0.17, refMax: 0.85, desc: "A liver and muscle enzyme released during cell damage; elevated in liver disease, heart attack, or muscle injury." },
    alt: { name: "ALT", unit: "\u00b5kat/l", refMin: 0.17, refMax: 0.83, desc: "A liver-specific enzyme; the most sensitive marker for liver cell damage from hepatitis, fatty liver, or toxins." },
    alp: { name: "ALP", unit: "\u00b5kat/l", refMin: 0.67, refMax: 2.15, desc: "An enzyme found in liver and bone; elevated levels suggest bile duct obstruction, bone disorders, or liver disease." },
    ggt: { name: "GGT", unit: "\u00b5kat/l", refMin: 0.17, refMax: 1.19, desc: "A liver enzyme sensitive to alcohol and bile duct damage; often the earliest marker of liver stress." },
    ldh: { name: "LDH", unit: "\u00b5kat/l", refMin: 2.25, refMax: 3.75, desc: "A general tissue damage marker found in most organs; elevated in hemolysis, liver disease, heart attack, or cancer." },
    creatineKinase: { name: "Creatine Kinase", unit: "\u00b5kat/l", refMin: 0.65, refMax: 5.14, refMin_f: 0.42, refMax_f: 3.08, desc: "An enzyme released from damaged muscle tissue; elevated after intense exercise, muscle injury, or in myopathy." },
    amylase: { name: "Amylase", unit: "\u00b5kat/l", refMin: 0.47, refMax: 1.67, desc: "Digestive enzyme produced mainly by the pancreas and salivary glands; elevations require clinical context and are less pancreas-specific than lipase." },
    lipase: { name: "Lipase", unit: "\u00b5kat/l", refMin: 0.22, refMax: 1.00, desc: "Pancreatic fat-digesting enzyme used when pancreatic inflammation is suspected; laboratory intervals vary by method." },
    osmolality: { name: "Serum Osmolality", unit: "mOsm/kg", refMin: 275, refMax: 295, desc: "Concentration of dissolved particles in serum; supports evaluation of hydration, sodium disorders, and osmolar gaps." },
    lactate: { name: "Lactate", unit: "mmol/l", refMin: 0.5, refMax: 2.2, desc: "Blood lactate reflects glycolytic energy pressure and tissue oxygen balance; sampling conditions matter strongly." },
    pyruvate: { name: "Pyruvate", unit: "\u00b5mol/l", refMin: 30, refMax: 100, desc: "Pyruvate is a glycolysis/TCA-cycle junction marker; useful with lactate for advanced energy metabolism context." },
    cystatinC: { name: "Cystatin C", unit: "mg/l", refMin: 0.61, refMax: 0.95, desc: "A protein filtered by the kidneys; a more accurate kidney function marker than creatinine, unaffected by muscle mass." },
    gfrCystatin: { name: "GFR Cystatin", unit: "ml/s", refMin: 1.80, refMax: 2.63, desc: "Kidney filtration rate estimated from cystatin C; provides a muscle-mass-independent assessment of renal function." }
  }
};
