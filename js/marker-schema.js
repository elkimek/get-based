// @ts-check
// marker-schema.js — Stable built-in biomarker catalog.

// ═══════════════════════════════════════════════
// MARKER SCHEMA (no personal data — just biomarker definitions)
// ═══════════════════════════════════════════════
export const MARKER_SCHEMA = {
  biochemistry: {
    label: "Biochemistry", icon: "\u{1F9EA}",
    markers: {
      glucose: { name: "Glucose", unit: "mmol/l", refMin: 4.11, refMax: 5.60, desc: "Measures blood sugar level; the primary marker for diagnosing and monitoring diabetes and metabolic health." },
      urea: { name: "Urea (BUN)", unit: "mmol/l", refMin: 2.8, refMax: 8.3, desc: "A waste product of protein metabolism filtered by the kidneys; elevated levels suggest impaired kidney function or dehydration." },
      creatinine: { name: "Creatinine", unit: "\u00b5mol/l", refMin: 62, refMax: 106, refMin_f: 44, refMax_f: 80, desc: "A muscle metabolism byproduct cleared by the kidneys; used to estimate kidney filtration rate and detect renal dysfunction." },
      egfr: { name: "eGFR (CKD-EPI)", unit: "ml/s/1.73m\u00b2", refMin: 1.00, refMax: 2.30, desc: "Estimates how well the kidneys filter waste from blood; the standard measure for staging chronic kidney disease." },
      uricAcid: { name: "Uric Acid", unit: "\u00b5mol/l", refMin: 202, refMax: 417, refMin_f: 143, refMax_f: 339, desc: "End product of purine metabolism; high levels cause gout and are linked to kidney stones and cardiovascular risk." },
      bilirubinTotal: { name: "Bilirubin Total", unit: "\u00b5mol/l", refMin: 3.0, refMax: 24.0, desc: "A yellow pigment from red blood cell breakdown processed by the liver; elevated levels indicate liver disease or hemolysis." },
      ast: { name: "AST", unit: "\u00b5kat/l", refMin: 0.17, refMax: 0.85, desc: "A liver and muscle enzyme released during cell damage; elevated in liver disease, heart attack, or muscle injury." },
      alt: { name: "ALT", unit: "\u00b5kat/l", refMin: 0.17, refMax: 0.83, desc: "A liver-specific enzyme; the most sensitive marker for liver cell damage from hepatitis, fatty liver, or toxins." },
      alp: { name: "ALP", unit: "\u00b5kat/l", refMin: 0.67, refMax: 2.15, desc: "An enzyme found in liver and bone; elevated levels suggest bile duct obstruction, bone disorders, or liver disease." },
      ggt: { name: "GGT", unit: "\u00b5kat/l", refMin: 0.17, refMax: 1.19, desc: "A liver enzyme sensitive to alcohol and bile duct damage; often the earliest marker of liver stress." },
      ldh: { name: "LDH", unit: "\u00b5kat/l", refMin: 2.25, refMax: 3.75, desc: "A general tissue damage marker found in most organs; elevated in hemolysis, liver disease, heart attack, or cancer." },
      creatineKinase: { name: "Creatine Kinase", unit: "\u00b5kat/l", refMin: 0.65, refMax: 5.14, refMin_f: 0.42, refMax_f: 3.08, desc: "An enzyme released from damaged muscle tissue; elevated after intense exercise, muscle injury, or in myopathy." },
      lactate: { name: "Lactate", unit: "mmol/l", refMin: 0.5, refMax: 2.2, desc: "Blood lactate reflects glycolytic energy pressure and tissue oxygen balance; sampling conditions matter strongly." },
      pyruvate: { name: "Pyruvate", unit: "\u00b5mol/l", refMin: 30, refMax: 100, desc: "Pyruvate is a glycolysis/TCA-cycle junction marker; useful with lactate for advanced energy metabolism context." },
      cystatinC: { name: "Cystatin C", unit: "mg/l", refMin: 0.61, refMax: 0.95, desc: "A protein filtered by the kidneys; a more accurate kidney function marker than creatinine, unaffected by muscle mass." },
      gfrCystatin: { name: "GFR Cystatin", unit: "ml/s", refMin: 1.80, refMax: 2.63, desc: "Kidney filtration rate estimated from cystatin C; provides a muscle-mass-independent assessment of renal function." }
    }
  },
  hormones: {
    label: "Hormones", icon: "\uD83E\uDDEC",
    markers: {
      testosterone: { name: "Testosterone", unit: "nmol/l", refMin: 8.64, refMax: 29.00, refMin_f: 0.29, refMax_f: 1.67, desc: "The primary male sex hormone; critical for muscle mass, bone density, libido, and mood in both sexes." },
      freeTestosterone: { name: "Free Testosterone", unit: "pmol/l", refMin: 30.70, refMax: 161.70, refMin_f: 0.30, refMax_f: 10.40, desc: "The unbound, biologically active fraction of testosterone; a better indicator of androgen status than total testosterone." },
      freeTestosteronePercentage: { name: "Free Testosterone %", unit: "%", refMin: 1.53, refMax: 2.88, desc: "The proportion of total testosterone that is entirely unbound in blood; an excellent metric for monitoring true androgen availability." },
      shbg: { name: "SHBG", unit: "nmol/l", refMin: 14.5, refMax: 54.1, refMin_f: 26.1, refMax_f: 110.0, desc: "A protein that binds sex hormones and regulates their availability; high levels reduce free testosterone." },
      dheaS: { name: "DHEA-S", unit: "\u00b5mol/l", refMin: 2.41, refMax: 11.60, refMin_f: 1.77, refMax_f: 9.22, desc: "An adrenal hormone precursor to testosterone and estrogen; declines with age and reflects adrenal function." },
      fai: { name: "Free Androgen Index", unit: "%", refMin: 34.0, refMax: 106.0, refMin_f: 0.5, refMax_f: 6.9, desc: "Ratio of total testosterone to SHBG; estimates bioavailable androgen activity, useful for detecting hormonal imbalances." },
      estradiol: { name: "Estradiol", unit: "pmol/l", refMin: 41.4, refMax: 159.0, refMin_f: 45.4, refMax_f: 854.0, desc: "The primary estrogen hormone; essential for bone health, cardiovascular protection, and reproductive function." },
      progesterone: { name: "Progesterone", unit: "nmol/l", refMin: 0.159, refMax: 0.474, refMin_f: 0.181, refMax_f: 27.0, desc: "A hormone supporting pregnancy and menstrual cycle regulation; also has neuroprotective and calming effects." },
      pth: { name: "Parathyroid Hormone (PTH)", unit: "pmol/l", refMin: 1.6, refMax: 6.9, desc: "Regulates calcium and phosphorus balance; interpret alongside calcium, vitamin D, and kidney function because reference ranges vary by assay and laboratory." },
      calcitonin: { name: "Calcitonin", unit: "ng/l", refMin: 1.0, refMax: 11.8, refMin_f: 1.0, refMax_f: 4.6, desc: "A thyroid hormone that lowers blood calcium; used as a tumor marker for medullary thyroid carcinoma." },
      dht: { name: "DHT", unit: "nmol/l", refMin: 0.86, refMax: 3.40, refMin_f: 0.12, refMax_f: 0.86, desc: "A potent androgen converted from testosterone; drives male-pattern hair loss and prostate growth." },
      igf1: { name: "IGF-1", unit: "\u00b5g/l", refMin: 96.4, refMax: 227.8, desc: "A growth-factor hormone mediating the effects of growth hormone; reflects GH status and influences tissue repair." },
      insulin: { name: "Insulin", unit: "mU/l", refMin: 2.6, refMax: 24.9, desc: "The hormone regulating blood sugar uptake into cells; elevated fasting levels indicate insulin resistance." },
      cortisol: { name: "Cortisol", unit: "nmol/l", refMin: 140, refMax: 620, desc: "Primary glucocorticoid stress hormone; interpretation depends strongly on collection time and rhythm." },
      androstenedione: { name: "Androstenedione", unit: "nmol/l", refMin: 1.4, refMax: 7.4, refMin_f: 1.0, refMax_f: 11.5, desc: "Androgen precursor made by adrenals and gonads; useful for androgen-excess and steroid-pathway context." },
      lh: { name: "LH", unit: "U/l", refMin: 1.7, refMax: 8.6, refMin_f: 2.4, refMax_f: 12.6, desc: "Luteinizing hormone; triggers ovulation in women and stimulates testosterone production in men. Surges mid-cycle." },
      fsh: { name: "FSH", unit: "U/l", refMin: 1.5, refMax: 12.4, refMin_f: 3.5, refMax_f: 12.5, desc: "Follicle-stimulating hormone; drives egg maturation in women and sperm production in men. Rises in menopause." },
      prolactin: { name: "Prolactin", unit: "\u00b5g/l", refMin: 4.0, refMax: 15.2, refMin_f: 4.8, refMax_f: 23.3, desc: "Stimulates milk production; elevated levels can suppress ovulation and indicate pituitary issues." },
      bioactiveTestosterone: { name: "Bioactive Testosterone", unit: "nmol/l", refMin: 4.37, refMax: 14.3, refMin_f: 0.05, refMax_f: 0.60, desc: "The sum of free and weakly albumin-bound testosterone; ready to be utilized by tissues, making it a powerful indicator of bioavailable androgen status." },
      bioactiveTestosteronePercentage: { name: "Bioactive Testosterone %", unit: "%", refMin: 35.0, refMax: 66.3, desc: "The proportion of total testosterone that is biologically active; helps evaluate hormonal availability when SHBG is abnormal." },
      hCG: { name: "hCG (Chorionic Gonadotropin)", unit: "U/l", refMin: 0.0, refMax: 2.5, desc: "Human chorionic gonadotropin; a hormone produced during pregnancy and also utilized as a highly specific biomarker for certain reproductive conditions." }
    }
  },
  electrolytes: {
    label: "Electrolytes & Minerals", icon: "\u2696\uFE0F",
    markers: {
      sodium: { name: "Sodium", unit: "mmol/l", refMin: 136, refMax: 145, desc: "The main extracellular electrolyte controlling fluid balance and blood pressure; abnormal levels affect nerve and muscle function." },
      potassium: { name: "Potassium", unit: "mmol/l", refMin: 3.5, refMax: 5.1, desc: "A critical intracellular electrolyte regulating heart rhythm and muscle contraction; abnormal levels can be life-threatening." },
      chloride: { name: "Chloride", unit: "mmol/l", refMin: 97, refMax: 108, desc: "An electrolyte that maintains fluid balance and acid-base status; usually changes in parallel with sodium." },
      calciumTotal: { name: "Calcium Total", unit: "mmol/l", refMin: 2.15, refMax: 2.50, desc: "Essential for bone strength, nerve signaling, and muscle contraction; regulated by parathyroid hormone and vitamin D." },
      phosphorus: { name: "Phosphorus", unit: "mmol/l", refMin: 0.81, refMax: 1.45, desc: "Works with calcium for bone mineralization and energy metabolism; imbalances affect bone health and kidney function." },
      magnesium: { name: "Magnesium (serum)", unit: "mmol/l", refMin: 0.66, refMax: 1.07, desc: "A cofactor in 300+ enzymatic reactions including energy production and nerve function; deficiency is common and underdiagnosed." },
      magnesiumRBC: { name: "Magnesium RBC", unit: "mmol/l", refMin: 1.44, refMax: 2.60, desc: "Intracellular magnesium level; a more accurate measure of true magnesium status than serum, which reflects only 1% of body stores." },
      copper: { name: "Copper", unit: "\u00b5mol/l", refMin: 11.6, refMax: 20.6, desc: "A trace mineral essential for iron metabolism, connective tissue, and antioxidant defense; excess is toxic to the liver." },
      zinc: { name: "Zinc", unit: "\u00b5mol/l", refMin: 9.8, refMax: 18.0, desc: "A trace mineral vital for immune function, wound healing, and testosterone production; deficiency impairs taste and immunity." }
    }
  },
  lipids: {
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
  },
  iron: {
    label: "Iron Metabolism", icon: "\uD83D\uDD34",
    markers: {
      iron: { name: "Iron", unit: "\u00b5mol/l", refMin: 5.8, refMax: 34.5, refMin_f: 6.6, refMax_f: 26.0, desc: "Serum iron level reflecting current iron availability; fluctuates with meals and inflammation, best interpreted with ferritin." },
      ferritin: { name: "Ferritin", unit: "\u00b5g/l", refMin: 30, refMax: 400, refMin_f: 13, refMax_f: 150, desc: "The primary iron storage protein; the most reliable marker for total body iron stores, though elevated by inflammation." },
      transferrin: { name: "Transferrin", unit: "g/l", refMin: 2.0, refMax: 3.6, desc: "The iron transport protein in blood; rises when iron stores are low as the body tries to capture more iron." },
      tibc: { name: "TIBC", unit: "\u00b5mol/l", refMin: 22.3, refMax: 61.7, desc: "Total iron-binding capacity of transferrin; high values suggest iron deficiency, low values suggest iron overload." },
      transferrinSat: { name: "Transferrin Sat.", unit: "%", refMin: 16.0, refMax: 45.0, desc: "Percentage of transferrin loaded with iron; low values confirm iron deficiency, high values suggest overload risk." },
      solubleTransferrinReceptor: { name: "Soluble Transferrin Receptor", unit: "mg/l", refMin: 0.76, refMax: 1.76, desc: "Reflects cellular iron demand and erythropoietic activity; useful when ferritin is distorted by inflammation." }
    }
  },
  proteins: {
    label: "Proteins & Inflammation", icon: "\uD83D\uDEE1\uFE0F",
    markers: {
      hsCRP: { name: "hs-CRP", unit: "mg/l", refMin: 0.00, refMax: 3.00, desc: "High-sensitivity C-reactive protein; a key marker of systemic inflammation and independent predictor of cardiovascular events." },
      crp: { name: "CRP", unit: "mg/l", refMin: 0.00, refMax: 5.00, desc: "C-reactive protein; produced by the liver in response to inflammation. Standard assay with lower sensitivity than hs-CRP. Elevated in infections, autoimmune conditions, and tissue injury." },
      totalProtein: { name: "Total Protein", unit: "g/l", refMin: 64.0, refMax: 83.0, desc: "Sum of albumin and globulins in blood; reflects nutritional status, liver function, and immune system activity." },
      albumin: { name: "Albumin", unit: "g/l", refMin: 35.0, refMax: 52.0, desc: "The most abundant blood protein made by the liver; low levels indicate malnutrition, liver disease, or chronic inflammation." },
      ceruloplasmin: { name: "Ceruloplasmin", unit: "g/l", refMin: 0.15, refMax: 0.30, desc: "A copper-carrying protein produced by the liver; low levels suggest Wilson disease, high levels indicate inflammation." },
      neurofilamentLight: { name: "Neurofilament Light", unit: "pg/ml", refMin: null, refMax: 12, desc: "Axonal injury marker; interpretation is age- and assay-dependent and belongs in clinical neurologic context." }
    }
  },
  thyroid: {
    label: "Thyroid", icon: "\uD83E\uDD8B",
    markers: {
      tsh: { name: "TSH", unit: "mU/l", refMin: 0.270, refMax: 4.200, desc: "Thyroid-stimulating hormone from the pituitary; the primary screening test for thyroid dysfunction (hypo- or hyperthyroidism)." },
      ft4: { name: "Free T4", unit: "pmol/l", refMin: 11.9, refMax: 21.6, desc: "The unbound, active form of thyroxine; reflects actual thyroid hormone available to tissues for metabolism regulation." },
      ft3: { name: "Free T3", unit: "pmol/l", refMin: 3.1, refMax: 6.8, desc: "The most metabolically active thyroid hormone; low levels despite normal T4 may indicate poor T4-to-T3 conversion." },
      t4total: { name: "Total T4", unit: "nmol/l", refMin: 66.0, refMax: 181.0, desc: "Total thyroxine including protein-bound fraction; affected by binding protein levels, making free T4 more reliable." },
      t3total: { name: "Total T3", unit: "nmol/l", refMin: 1.30, refMax: 3.10, desc: "Total triiodothyronine including bound fraction; useful for diagnosing hyperthyroidism when free T3 is unavailable." },
      reverseT3: { name: "Reverse T3", unit: "nmol/l", refMin: null, refMax: 0.54, desc: "Inactive T3 isomer that can rise with illness, fasting, or stress; optional context for T4-to-T3 conversion." },
      tpoAb: { name: "TPO antibodies", unit: "kU/l", refMin: 0, refMax: 34, desc: "Thyroid peroxidase antibodies; elevated values support autoimmune thyroiditis context." },
      tgAb: { name: "Thyroglobulin antibodies", unit: "kU/l", refMin: 0, refMax: 115, desc: "Thyroglobulin antibodies; elevated values support autoimmune thyroid context and can interfere with thyroglobulin measurement." }
    }
  },
  vitamins: {
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
  },
  diabetes: {
    label: "Diabetes / Glucose", icon: "\uD83C\uDF6C",
    markers: {
      hba1c: { name: "HbA1c", unit: "mmol/mol", refMin: 20.0, refMax: 42.0, desc: "Glycated hemoglobin reflecting average blood sugar over 2\u20133 months; the gold standard for long-term glucose control." },
      insulin_d: { name: "Insulin", unit: "mU/l", refMin: 2.6, refMax: 24.9, desc: "Fasting insulin level used in the diabetes context; elevated levels are an early sign of insulin resistance." },
      cPeptide: { name: "C-peptide", unit: "\u00b5g/l", refMin: 0.8, refMax: 3.1, desc: "Byproduct of endogenous insulin production; helps distinguish pancreatic insulin output from injected insulin exposure." },
      fructosamine: { name: "Fructosamine", unit: "\u00b5mol/l", refMin: 205, refMax: 285, desc: "Shorter-term glycation marker reflecting roughly 2–3 weeks of glucose exposure; useful when HbA1c is unreliable." },
      homaIR: { name: "HOMA-IR (calc)", unit: "", refMin: 0, refMax: 2.5, desc: "Calculated index of insulin resistance from fasting glucose and insulin; higher values indicate greater resistance." }
    }
  },
  tumorMarkers: {
    label: "Tumor Markers", icon: "\uD83D\uDD2C",
    markers: {
      psa: { name: "PSA", unit: "\u00b5g/l", refMin: 0.003, refMax: 1.400, desc: "Prostate-specific antigen; used to screen for prostate cancer and monitor treatment, though also elevated in benign conditions." },
      afp: { name: "AFP (Alpha-Fetoprotein)", unit: "kU/l", refMin: 0.0, refMax: 7.5, desc: "Alpha-fetoprotein; a plasma protein normally produced by the developing fetus, clinically utilized as a tumor marker and reproductive screening assay." }
    }
  },
  coagulation: {
    label: "Coagulation", icon: "\uD83E\uDE78",
    markers: {
      homocysteine: { name: "Homocysteine", unit: "\u00b5mol/l", refMin: 5.2, refMax: 15.0, refMin_f: 3.7, refMax_f: 10.4, desc: "An amino acid linked to cardiovascular and neurological risk when elevated; lowered by folate, B6, and B12." },
      fibrinogen: { name: "Fibrinogen", unit: "g/l", refMin: 1.8, refMax: 4.0, desc: "Coagulation protein and inflammatory acute-phase marker; contributes to clotting and plasma viscosity context." },
      dDimer: { name: "D-dimer", unit: "mg/l FEU", refMin: 0, refMax: 0.5, desc: "Fibrin breakdown product; elevated values can reflect active clot turnover and need clinical context." }
    }
  },
  hematology: {
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
  },
  differential: {
    label: "WBC Differential", icon: "\uD83E\uDDA0",
    markers: {
      neutrophils: { name: "Neutrophils #", unit: "10^9/l", refMin: 2.0, refMax: 7.0, desc: "The most abundant white blood cells; the first responders to bacterial infection, elevated in acute inflammation." },
      lymphocytes: { name: "Lymphocytes #", unit: "10^9/l", refMin: 0.8, refMax: 4.0, desc: "Immune cells (T-cells, B-cells, NK cells) driving adaptive immunity; elevated in viral infections, low in immunodeficiency." },
      monocytes: { name: "Monocytes #", unit: "10^9/l", refMin: 0.08, refMax: 1.20, desc: "White blood cells that become macrophages in tissues; elevated in chronic infections, autoimmune diseases, and recovery." },
      eosinophils: { name: "Eosinophils #", unit: "10^9/l", refMin: 0.0, refMax: 0.5, desc: "White blood cells that fight parasites and mediate allergic responses; elevated in allergies, asthma, and parasitic infections." },
      basophils: { name: "Basophils #", unit: "10^9/l", refMin: 0.0, refMax: 0.2, desc: "The rarest white blood cells involved in allergic reactions and histamine release; markedly elevated in some blood cancers." },
      neutrophilsPct: { name: "Neutrophils %", unit: "", refMin: 0.45, refMax: 0.70, desc: "Proportion of white blood cells that are neutrophils; shifts in percentage help distinguish bacterial from viral infections." },
      lymphocytesPct: { name: "Lymphocytes %", unit: "", refMin: 0.20, refMax: 0.45, desc: "Proportion of white blood cells that are lymphocytes; relatively elevated in viral infections and lymphoproliferative disorders." },
      monocytesPct: { name: "Monocytes %", unit: "", refMin: 0.02, refMax: 0.12, desc: "Proportion of white blood cells that are monocytes; elevated in chronic inflammation, tuberculosis, and recovery phases." },
      eosinophilsPct: { name: "Eosinophils %", unit: "", refMin: 0.00, refMax: 0.05, desc: "Proportion of white blood cells that are eosinophils; elevated percentages are commonly associated with allergic, asthmatic, and parasitic patterns." },
      basophilsPct: { name: "Basophils %", unit: "", refMin: 0.00, refMax: 0.02, desc: "Proportion of white blood cells that are basophils; small shifts can appear with allergic inflammation or some myeloproliferative patterns." }
    }
  },
  boneMetabolism: {
    label: "Bone Metabolism", icon: "\uD83E\uDDB4",
    markers: {
      osteocalcin: { name: "Osteocalcin", unit: "\u00b5g/l", refMin: 14.0, refMax: 42.0, desc: "A protein secreted by bone-forming cells; reflects bone turnover rate and also influences glucose metabolism." }
    }
  },
  urinalysis: {
    label: "Urinalysis", icon: "\uD83E\uDDEA",
    markers: {
      ph: { name: "Urine pH", unit: "", refMin: 5.0, refMax: 7.5, desc: "Acidity of urine; low pH seen in high-protein diets, metabolic acidosis, and uric acid stones; high pH in UTIs and renal tubular acidosis." },
      specificGravity: { name: "Specific Gravity", unit: "", refMin: 1.005, refMax: 1.030, desc: "Concentration of dissolved solutes in urine; reflects hydration status and kidney concentrating ability." }
    }
  },
  bodyComposition: {
    label: "Body Composition", icon: "\uD83C\uDFCB\uFE0F", group: "DEXA",
    markers: {
      bodyFatPct: { name: "Body Fat", unit: "%", refMin: 6, refMax: 24, refMin_f: 16, refMax_f: 30, desc: "Percentage of total body mass composed of fat tissue; measured by DEXA for accurate compartmental analysis." },
      leanMass: { name: "Lean Mass", unit: "kg", refMin: null, refMax: null, desc: "Total body mass minus fat tissue; includes muscle, bone, organs, and water. Tracked over time to monitor muscle gain or loss." },
      fatMass: { name: "Fat Mass", unit: "kg", refMin: null, refMax: null, desc: "Total adipose tissue mass; more informative than BMI for assessing metabolic risk and body composition changes." },
      bmiDexa: { name: "BMI (DEXA)", unit: "kg/m\u00b2", refMin: 18.5, refMax: 24.9, desc: "Body mass index from DEXA-measured weight and height; the standard WHO classification for weight status." },
      androidFatPct: { name: "Android Fat", unit: "%", refMin: null, refMax: null, desc: "Fat percentage in the abdominal region (waist); android fat distribution is associated with higher cardiovascular and metabolic risk." },
      gynoidFatPct: { name: "Gynoid Fat", unit: "%", refMin: null, refMax: null, desc: "Fat percentage in the hip and thigh region; gynoid distribution is associated with lower cardiovascular risk." },
      agRatio: { name: "A/G Fat Ratio", unit: "", refMin: 0, refMax: 1.0, desc: "Android-to-gynoid fat ratio; values above 1.0 indicate central fat predominance and increased cardiometabolic risk." },
      visceralFatArea: { name: "Visceral Fat Area", unit: "cm\u00b2", refMin: 0, refMax: 100, desc: "Estimated cross-sectional area of intra-abdominal fat surrounding organs; a key predictor of metabolic syndrome and type 2 diabetes." }
    }
  },
  boneDensity: {
    label: "Bone Density", icon: "\uD83D\uDCC9", group: "DEXA",
    markers: {
      bmdSpine: { name: "BMD Spine L1\u2013L4", unit: "g/cm\u00b2", refMin: null, refMax: null, desc: "Bone mineral density of the lumbar spine; the primary DEXA site for monitoring osteoporosis and fracture risk." },
      bmdFemurTotal: { name: "BMD Femur Total", unit: "g/cm\u00b2", refMin: null, refMax: null, desc: "Bone mineral density of the total proximal femur; reflects overall hip bone strength." },
      bmdFemurNeck: { name: "BMD Femur Neck", unit: "g/cm\u00b2", refMin: null, refMax: null, desc: "Bone mineral density of the femoral neck; the most fracture-prone hip region and WHO diagnostic site." },
      tScoreSpine: { name: "T-score Spine", unit: "", refMin: -1.0, refMax: null, desc: "Standard deviations from peak young-adult bone density at the spine; WHO criteria: above \u22121 normal, \u22121 to \u22122.5 osteopenia, below \u22122.5 osteoporosis." },
      tScoreFemurTotal: { name: "T-score Femur Total", unit: "", refMin: -1.0, refMax: null, desc: "Standard deviations from peak young-adult bone density at the total proximal femur; used alongside femoral neck for hip fracture risk assessment." },
      tScoreFemurNeck: { name: "T-score Femur Neck", unit: "", refMin: -1.0, refMax: null, desc: "Standard deviations from peak young-adult bone density at the femoral neck; the WHO-preferred diagnostic site for osteoporosis in postmenopausal women and men over 50." },
      zScoreSpine: { name: "Z-score Spine", unit: "", refMin: -2.0, refMax: null, desc: "Standard deviations from age-matched bone density at the spine; used for premenopausal women and men under 50. Below \u22122.0 indicates low bone density for age." },
      zScoreFemurTotal: { name: "Z-score Femur Total", unit: "", refMin: -2.0, refMax: null, desc: "Standard deviations from age-matched bone density at the total proximal femur; values below \u22122.0 warrant investigation for secondary causes of bone loss." },
      zScoreFemurNeck: { name: "Z-score Femur Neck", unit: "", refMin: -2.0, refMax: null, desc: "Standard deviations from age-matched bone density at the femoral neck; values below \u22122.0 at the WHO diagnostic site require clinical evaluation." }
    }
  },
  calculatedRatios: {
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
  }
};
