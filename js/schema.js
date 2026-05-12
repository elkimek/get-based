// schema.js — Marker definitions, unit conversions, pricing, optimal ranges

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
      cystatinC: { name: "Cystatin C", unit: "mg/l", refMin: 0.61, refMax: 0.95, desc: "A protein filtered by the kidneys; a more accurate kidney function marker than creatinine, unaffected by muscle mass." },
      gfrCystatin: { name: "GFR Cystatin", unit: "ml/s", refMin: 1.80, refMax: 2.63, desc: "Kidney filtration rate estimated from cystatin C; provides a muscle-mass-independent assessment of renal function." }
    }
  },
  hormones: {
    label: "Hormones", icon: "\uD83E\uDDEC",
    markers: {
      testosterone: { name: "Testosterone", unit: "nmol/l", refMin: 8.64, refMax: 29.00, refMin_f: 0.29, refMax_f: 1.67, desc: "The primary male sex hormone; critical for muscle mass, bone density, libido, and mood in both sexes." },
      freeTestosterone: { name: "Free Testosterone", unit: "pmol/l", refMin: 30.70, refMax: 161.70, refMin_f: 0.30, refMax_f: 10.40, desc: "The unbound, biologically active fraction of testosterone; a better indicator of androgen status than total testosterone." },
      shbg: { name: "SHBG", unit: "nmol/l", refMin: 14.5, refMax: 54.1, refMin_f: 26.1, refMax_f: 110.0, desc: "A protein that binds sex hormones and regulates their availability; high levels reduce free testosterone." },
      dheaS: { name: "DHEA-S", unit: "\u00b5mol/l", refMin: 2.41, refMax: 11.60, refMin_f: 1.77, refMax_f: 9.22, desc: "An adrenal hormone precursor to testosterone and estrogen; declines with age and reflects adrenal function." },
      fai: { name: "Free Androgen Index", unit: "%", refMin: 34.0, refMax: 106.0, refMin_f: 0.5, refMax_f: 6.9, desc: "Ratio of total testosterone to SHBG; estimates bioavailable androgen activity, useful for detecting hormonal imbalances." },
      estradiol: { name: "Estradiol", unit: "pmol/l", refMin: 41.4, refMax: 159.0, refMin_f: 45.4, refMax_f: 854.0, desc: "The primary estrogen hormone; essential for bone health, cardiovascular protection, and reproductive function." },
      progesterone: { name: "Progesterone", unit: "nmol/l", refMin: 0.159, refMax: 0.474, refMin_f: 0.181, refMax_f: 27.0, desc: "A hormone supporting pregnancy and menstrual cycle regulation; also has neuroprotective and calming effects." },
      calcitonin: { name: "Calcitonin", unit: "ng/l", refMin: 1.0, refMax: 11.8, refMin_f: 1.0, refMax_f: 4.6, desc: "A thyroid hormone that lowers blood calcium; used as a tumor marker for medullary thyroid carcinoma." },
      dht: { name: "DHT", unit: "nmol/l", refMin: 0.86, refMax: 3.40, refMin_f: 0.12, refMax_f: 0.86, desc: "A potent androgen converted from testosterone; drives male-pattern hair loss and prostate growth." },
      igf1: { name: "IGF-1", unit: "\u00b5g/l", refMin: 96.4, refMax: 227.8, desc: "A growth-factor hormone mediating the effects of growth hormone; reflects GH status and influences tissue repair." },
      insulin: { name: "Insulin", unit: "mU/l", refMin: 2.6, refMax: 24.9, desc: "The hormone regulating blood sugar uptake into cells; elevated fasting levels indicate insulin resistance." },
      lh: { name: "LH", unit: "U/l", refMin: 1.7, refMax: 8.6, refMin_f: 2.4, refMax_f: 12.6, desc: "Luteinizing hormone; triggers ovulation in women and stimulates testosterone production in men. Surges mid-cycle." },
      fsh: { name: "FSH", unit: "U/l", refMin: 1.5, refMax: 12.4, refMin_f: 3.5, refMax_f: 12.5, desc: "Follicle-stimulating hormone; drives egg maturation in women and sperm production in men. Rises in menopause." },
      prolactin: { name: "Prolactin", unit: "\u00b5g/l", refMin: 4.0, refMax: 15.2, refMin_f: 4.8, refMax_f: 23.3, desc: "Stimulates milk production; elevated levels can suppress ovulation and indicate pituitary issues." }
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
      hdl: { name: "HDL Cholesterol", unit: "mmol/l", refMin: 1.00, refMax: 2.10, desc: "Protective cholesterol that transports fat away from arteries back to the liver; higher levels reduce cardiovascular risk." },
      ldl: { name: "LDL Cholesterol", unit: "mmol/l", refMin: 1.20, refMax: 3.00, desc: "The primary atherogenic cholesterol that deposits in artery walls; the main target for cardiovascular risk reduction." },
      nonHdl: { name: "Non-HDL Cholesterol", unit: "mmol/l", refMin: 0.00, refMax: 3.80, desc: "All atherogenic cholesterol particles combined (LDL + VLDL + remnants); a better cardiovascular predictor than LDL alone." },
      cholHdlRatio: { name: "Chol/HDL Ratio", unit: "", refMin: 0.0, refMax: 5.0, desc: "Total cholesterol divided by HDL; a simple cardiovascular risk ratio where lower values indicate better lipid balance." },
      apoAI: { name: "Apo A-I", unit: "g/l", refMin: 1.00, refMax: 1.70, desc: "The main protein of HDL particles; reflects protective cholesterol transport capacity and cardiovascular health." },
      apoB: { name: "Apo B", unit: "g/l", refMin: 0.50, refMax: 1.00, desc: "The protein on each LDL particle; directly counts atherogenic particles, making it a superior cardiovascular risk marker." }
    }
  },
  iron: {
    label: "Iron Metabolism", icon: "\uD83D\uDD34",
    markers: {
      iron: { name: "Iron", unit: "\u00b5mol/l", refMin: 5.8, refMax: 34.5, refMin_f: 6.6, refMax_f: 26.0, desc: "Serum iron level reflecting current iron availability; fluctuates with meals and inflammation, best interpreted with ferritin." },
      ferritin: { name: "Ferritin", unit: "\u00b5g/l", refMin: 30, refMax: 400, refMin_f: 13, refMax_f: 150, desc: "The primary iron storage protein; the most reliable marker for total body iron stores, though elevated by inflammation." },
      transferrin: { name: "Transferrin", unit: "g/l", refMin: 2.0, refMax: 3.6, desc: "The iron transport protein in blood; rises when iron stores are low as the body tries to capture more iron." },
      tibc: { name: "TIBC", unit: "\u00b5mol/l", refMin: 22.3, refMax: 61.7, desc: "Total iron-binding capacity of transferrin; high values suggest iron deficiency, low values suggest iron overload." },
      transferrinSat: { name: "Transferrin Sat.", unit: "%", refMin: 16.0, refMax: 45.0, desc: "Percentage of transferrin loaded with iron; low values confirm iron deficiency, high values suggest overload risk." }
    }
  },
  proteins: {
    label: "Proteins & Inflammation", icon: "\uD83D\uDEE1\uFE0F",
    markers: {
      hsCRP: { name: "hs-CRP", unit: "mg/l", refMin: 0.00, refMax: 3.00, desc: "High-sensitivity C-reactive protein; a key marker of systemic inflammation and independent predictor of cardiovascular events." },
      crp: { name: "CRP", unit: "mg/l", refMin: 0.00, refMax: 5.00, desc: "C-reactive protein; produced by the liver in response to inflammation. Standard assay with lower sensitivity than hs-CRP. Elevated in infections, autoimmune conditions, and tissue injury." },
      totalProtein: { name: "Total Protein", unit: "g/l", refMin: 64.0, refMax: 83.0, desc: "Sum of albumin and globulins in blood; reflects nutritional status, liver function, and immune system activity." },
      albumin: { name: "Albumin", unit: "g/l", refMin: 35.0, refMax: 52.0, desc: "The most abundant blood protein made by the liver; low levels indicate malnutrition, liver disease, or chronic inflammation." },
      ceruloplasmin: { name: "Ceruloplasmin", unit: "g/l", refMin: 0.15, refMax: 0.30, desc: "A copper-carrying protein produced by the liver; low levels suggest Wilson disease, high levels indicate inflammation." }
    }
  },
  thyroid: {
    label: "Thyroid", icon: "\uD83E\uDD8B",
    markers: {
      tsh: { name: "TSH", unit: "mU/l", refMin: 0.270, refMax: 4.200, desc: "Thyroid-stimulating hormone from the pituitary; the primary screening test for thyroid dysfunction (hypo- or hyperthyroidism)." },
      ft4: { name: "Free T4", unit: "pmol/l", refMin: 11.9, refMax: 21.6, desc: "The unbound, active form of thyroxine; reflects actual thyroid hormone available to tissues for metabolism regulation." },
      ft3: { name: "Free T3", unit: "pmol/l", refMin: 3.1, refMax: 6.8, desc: "The most metabolically active thyroid hormone; low levels despite normal T4 may indicate poor T4-to-T3 conversion." },
      t4total: { name: "Total T4", unit: "nmol/l", refMin: 66.0, refMax: 181.0, desc: "Total thyroxine including protein-bound fraction; affected by binding protein levels, making free T4 more reliable." },
      t3total: { name: "Total T3", unit: "nmol/l", refMin: 1.30, refMax: 3.10, desc: "Total triiodothyronine including bound fraction; useful for diagnosing hyperthyroidism when free T3 is unavailable." }
    }
  },
  vitamins: {
    label: "Vitamins", icon: "\u2600\uFE0F",
    markers: {
      vitaminD: { name: "Vitamin D Total", unit: "nmol/l", refMin: 75.0, refMax: 250.0, desc: "Sum of D2 and D3 forms; essential for calcium absorption, bone health, immune function, and mood regulation." },
      vitaminD3: { name: "Vitamin D3", unit: "nmol/l", refMin: 50.0, refMax: 175.0, desc: "The form of vitamin D produced by sun exposure and supplements; the most bioactive and clinically relevant form." },
      calcitriol: { name: "Calcitriol (1,25-(OH)\u2082D)", unit: "pmol/l", refMin: 36.5, refMax: 216.2, desc: "The active hormonal form of vitamin D produced by the kidneys; regulates calcium absorption and bone metabolism. Ordered for kidney disease or calcium disorders." },
      vitaminA: { name: "Vitamin A", unit: "\u00b5mol/l", refMin: 1.05, refMax: 2.80, desc: "A fat-soluble vitamin essential for vision, immune defense, and cell growth; both deficiency and excess are harmful." },
      vitaminB12: { name: "Vitamin B12", unit: "pmol/l", refMin: 145, refMax: 569, desc: "Essential for DNA synthesis, red blood cell formation, and neurological function; deficiency causes macrocytic anemia and neuropathy." },
      folate: { name: "Folate", unit: "nmol/l", refMin: 7.0, refMax: 45.3, desc: "B-vitamin critical for DNA synthesis and methylation; deficiency causes macrocytic anemia and elevated homocysteine. Key in pregnancy for neural tube prevention." }
    }
  },
  diabetes: {
    label: "Diabetes / Glucose", icon: "\uD83C\uDF6C",
    markers: {
      hba1c: { name: "HbA1c", unit: "mmol/mol", refMin: 20.0, refMax: 42.0, desc: "Glycated hemoglobin reflecting average blood sugar over 2\u20133 months; the gold standard for long-term glucose control." },
      insulin_d: { name: "Insulin", unit: "mU/l", refMin: 2.6, refMax: 24.9, desc: "Fasting insulin level used in the diabetes context; elevated levels are an early sign of insulin resistance." },
      homaIR: { name: "HOMA-IR (calc)", unit: "", refMin: 0, refMax: 2.5, desc: "Calculated index of insulin resistance from fasting glucose and insulin; higher values indicate greater resistance." }
    }
  },
  tumorMarkers: {
    label: "Tumor Markers", icon: "\uD83D\uDD2C",
    markers: {
      psa: { name: "PSA", unit: "\u00b5g/l", refMin: 0.003, refMax: 1.400, desc: "Prostate-specific antigen; used to screen for prostate cancer and monitor treatment, though also elevated in benign conditions." }
    }
  },
  coagulation: {
    label: "Coagulation", icon: "\uD83E\uDE78",
    markers: {
      homocysteine: { name: "Homocysteine", unit: "\u00b5mol/l", refMin: 5.2, refMax: 15.0, refMin_f: 3.7, refMax_f: 10.4, desc: "An amino acid linked to cardiovascular and neurological risk when elevated; lowered by folate, B6, and B12." }
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
      monocytesPct: { name: "Monocytes %", unit: "", refMin: 0.02, refMax: 0.12, desc: "Proportion of white blood cells that are monocytes; elevated in chronic inflammation, tuberculosis, and recovery phases." }
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
      nlr: { name: "Neutrophil-Lymphocyte Ratio (NLR)", unit: "", refMin: 1.0, refMax: 3.0, desc: "A marker of systemic inflammation and immune stress; elevated in infections, chronic inflammation, and cancer prognosis." },
      plr: { name: "Platelet-Lymphocyte Ratio (PLR)", unit: "", refMin: 50, refMax: 150, desc: "Reflects the balance between thrombotic and immune responses; elevated in inflammation, cardiovascular disease, and cancer." },
      deRitisRatio: { name: "De Ritis Ratio (AST/ALT)", unit: "", refMin: 0.8, refMax: 1.2, desc: "AST divided by ALT; helps distinguish liver damage types \u2014 values above 2 suggest alcoholic liver disease or cirrhosis." },
      copperZincRatio: { name: "Copper/Zinc Ratio", unit: "", refMin: 0.7, refMax: 1.0, desc: "Balance between copper and zinc; elevated ratios indicate oxidative stress, inflammation, or immune dysfunction." },
      bunCreatRatio: { name: "BUN/Creatinine Ratio", unit: "", refMin: 10, refMax: 20, desc: "Blood urea nitrogen divided by creatinine; helps differentiate pre-renal, renal, and post-renal causes of kidney dysfunction." },
      freeWaterDeficit: { name: "Free Water Deficit", unit: "L", refMin: -1.5, refMax: 1.5, desc: "Estimated water surplus or deficit based on sodium level; positive values indicate dehydration, negative values overhydration." },
      crpHdlRatio: { name: "hs-CRP/HDL Ratio", unit: "", refMin: 0, refMax: 0.94, desc: "High-sensitivity CRP divided by HDL cholesterol; a composite inflammation-lipid marker that captures cardiovascular risk better than either marker alone. Requires hs-CRP specifically." },
      phenoAge: { name: "PhenoAge", unit: "years", refMin: null, refMax: null, hidden: true, desc: "Biological age from 9 biomarkers using the Levine 2018 mortality-calibrated formula." },
      bortzAge: { name: "Bortz Age", unit: "years", refMin: null, refMax: null, hidden: true, desc: "Biological age from 22 biomarkers using the Bortz 2023 aging-acceleration model." },
      biologicalAge: { name: "Biological Age", unit: "years", refMin: null, refMax: null, desc: "Combined biological age from PhenoAge (Levine 2018, 9 markers) and Bortz Age (Bortz 2023, 22 markers). Lower than chronological age suggests healthier aging." }
    }
  }
};

// ═══════════════════════════════════════════════
// UNIT CONVERSIONS (EU SI → US conventional)
// ═══════════════════════════════════════════════
export const UNIT_CONVERSIONS = {
  'biochemistry.glucose': { factor: 18.018, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.urea': { factor: 2.801, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.creatinine': { factor: 0.01131, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.uricAcid': { factor: 0.01681, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.bilirubinTotal': { factor: 0.05848, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.ast': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.alt': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.alp': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.ggt': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.ldh': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.creatineKinase': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.egfr': { factor: 60, usUnit: 'mL/min/1.73m²', type: 'multiply' },
  'biochemistry.gfrCystatin': { factor: 60, usUnit: 'mL/min', type: 'multiply' },
  'biochemistry.cystatinC': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'proteins.hsCRP': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'proteins.crp': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'hormones.testosterone': { factor: 28.818, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.freeTestosterone': { factor: 0.2885, usUnit: 'pg/ml', type: 'multiply' },
  'hormones.estradiol': { factor: 0.2724, usUnit: 'pg/ml', type: 'multiply' },
  'hormones.progesterone': { factor: 0.3145, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.dheaS': { factor: 36.87, usUnit: '\u00b5g/dl', type: 'multiply' },
  'hormones.dht': { factor: 28.818, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.igf1': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.prolactin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.calcitonin': { factor: 1, usUnit: 'pg/ml', type: 'multiply' },
  'lipids.cholesterol': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.triglycerides': { factor: 88.57, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.hdl': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.ldl': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.nonHdl': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'iron.iron': { factor: 5.585, usUnit: '\u00b5g/dl', type: 'multiply' },
  'iron.ferritin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'iron.transferrin': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'iron.tibc': { factor: 5.585, usUnit: '\u00b5g/dl', type: 'multiply' },
  'vitamins.vitaminD': { factor: 0.4006, usUnit: 'ng/ml', type: 'multiply' },
  'vitamins.vitaminD3': { factor: 0.4006, usUnit: 'ng/ml', type: 'multiply' },
  'vitamins.calcitriol': { factor: 0.4006, usUnit: 'pg/ml', type: 'multiply' },
  'vitamins.vitaminA': { factor: 28.65, usUnit: '\u00b5g/dl', type: 'multiply' },
  'vitamins.vitaminB12': { factor: 1.355, usUnit: 'pg/ml', type: 'multiply' },
  'vitamins.folate': { factor: 0.4413, usUnit: 'ng/ml', type: 'multiply' },
  'hematology.hemoglobin': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  // hematocrit: stored as % natively (was fraction before v1.6.1, migrated in profile.js)
  'hematology.mchc': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'differential.neutrophilsPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'differential.lymphocytesPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'differential.monocytesPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'boneMetabolism.osteocalcin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'tumorMarkers.psa': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'electrolytes.calciumTotal': { factor: 4.008, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.phosphorus': { factor: 3.097, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.magnesium': { factor: 2.431, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.magnesiumRBC': { factor: 2.431, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.copper': { factor: 6.355, usUnit: '\u00b5g/dl', type: 'multiply' },
  'electrolytes.zinc': { factor: 6.54, usUnit: '\u00b5g/dl', type: 'multiply' },
  'proteins.totalProtein': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'proteins.albumin': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'proteins.ceruloplasmin': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.apoB': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.apoAI': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'thyroid.ft4': { factor: 0.07769, usUnit: 'ng/dl', type: 'multiply' },
  'thyroid.ft3': { factor: 0.6513, usUnit: 'pg/dl', type: 'multiply' },
  'thyroid.t4total': { factor: 0.07769, usUnit: '\u00b5g/dl', type: 'multiply' },
  'thyroid.t3total': { factor: 0.6513, usUnit: 'ng/dl', type: 'multiply' },
  'diabetes.hba1c': { type: 'hba1c' },
  'calculatedRatios.tgHdlRatio': { factor: 2.29, usUnit: '', type: 'multiply' },
  'bodyComposition.leanMass': { factor: 2.20462, usUnit: 'lbs', type: 'multiply' },
  'bodyComposition.fatMass': { factor: 2.20462, usUnit: 'lbs', type: 'multiply' },
  // ── Label-only US conventions (factor: 1) ─────────────────────────────────
  // These markers have *identical numerical values* in EU SI and US conventional
  // units — only the printed label on a US lab report differs. We still expose
  // them so a US user reading e.g. a Quest panel can match "5 µIU/mL" to the
  // app's "5 mU/L" without second-guessing. NOT included: truly universal labels
  // (homocysteine µmol/L, MCV fL, hematocrit %) or labels that match exactly
  // (SHBG nmol/L).
  'hormones.insulin':         { factor: 1, usUnit: 'µIU/mL',  type: 'multiply' },
  'diabetes.insulin_d':       { factor: 1, usUnit: 'µIU/mL',  type: 'multiply' },
  'thyroid.tsh':              { factor: 1, usUnit: 'µIU/mL',  type: 'multiply' },
  'hormones.lh':              { factor: 1, usUnit: 'mIU/mL',       type: 'multiply' },
  'hormones.fsh':             { factor: 1, usUnit: 'mIU/mL',       type: 'multiply' },
  'electrolytes.sodium':      { factor: 1, usUnit: 'mEq/L',        type: 'multiply' },
  'electrolytes.potassium':   { factor: 1, usUnit: 'mEq/L',        type: 'multiply' },
  'electrolytes.chloride':    { factor: 1, usUnit: 'mEq/L',        type: 'multiply' },
  'hematology.wbc':           { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'hematology.rbc':           { factor: 1, usUnit: 'M/µL',    type: 'multiply' },
  'hematology.platelets':     { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.neutrophils': { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.lymphocytes': { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.monocytes':   { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.eosinophils': { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.basophils':   { factor: 1, usUnit: 'K/µL',    type: 'multiply' }
};

// Returns the converted {value, unit} in the *other* unit system for dual-display,
// or null when no conversion exists. `displayValue` is what the user currently sees
// (state.unitSystem-dependent); `isUSMode` is the current display mode flag.
export function getAlternateUnit(dotKey, displayValue, isUSMode) {
  const conv = UNIT_CONVERSIONS[dotKey];
  if (!conv || displayValue == null || !Number.isFinite(displayValue)) return null;
  const dot = dotKey.indexOf('.');
  if (dot < 0) return null;
  const cat = dotKey.slice(0, dot), mkr = dotKey.slice(dot + 1);
  const siUnit = MARKER_SCHEMA[cat]?.markers?.[mkr]?.unit;
  if (!siUnit) return null;
  if (isUSMode) {
    if (conv.type === 'multiply') {
      return { value: parseFloat((displayValue / conv.factor).toPrecision(4)), unit: siUnit };
    }
    if (conv.type === 'hba1c') {
      return { value: parseFloat(((displayValue - 2.15) * 10.929).toFixed(1)), unit: 'mmol/mol' };
    }
  } else {
    if (conv.type === 'multiply') {
      return { value: parseFloat((displayValue * conv.factor).toPrecision(4)), unit: conv.usUnit };
    }
    if (conv.type === 'hba1c') {
      return { value: parseFloat(((displayValue / 10.929) + 2.15).toFixed(1)), unit: '%' };
    }
  }
  return null;
}

// Convert a value the user typed in `inputUnit` to canonical SI for storage.
// Used by manual-entry's per-field unit picker.
export function convertUserInputToSI(dotKey, value, inputUnit) {
  const conv = UNIT_CONVERSIONS[dotKey];
  if (!conv || !Number.isFinite(value)) return value;
  const dot = dotKey.indexOf('.');
  if (dot < 0) return value;
  const cat = dotKey.slice(0, dot), mkr = dotKey.slice(dot + 1);
  const siUnit = MARKER_SCHEMA[cat]?.markers?.[mkr]?.unit;
  if (inputUnit === siUnit) return value;
  if (conv.type === 'multiply') return parseFloat((value / conv.factor).toPrecision(6));
  if (conv.type === 'hba1c') return parseFloat(((value - 2.15) * 10.929).toFixed(1));
  return value;
}

// ═══════════════════════════════════════════════
// CORRELATION PRESETS
// ═══════════════════════════════════════════════
export const CORRELATION_PRESETS = [
  { label: "Testosterone vs SHBG", markers: ["hormones.testosterone", "hormones.shbg"] },
  { label: "LDL vs hs-CRP", markers: ["lipids.ldl", "proteins.hsCRP"] },
  { label: "HbA1c vs Insulin vs HOMA-IR", markers: ["diabetes.hba1c", "diabetes.insulin_d", "diabetes.homaIR"] },
  { label: "Liver Enzymes", markers: ["biochemistry.ast", "biochemistry.alt", "biochemistry.alp", "biochemistry.ggt"] },
  { label: "Iron Panel", markers: ["iron.iron", "iron.ferritin", "iron.transferrin"] },
  { label: "Lipid Panel", markers: ["lipids.cholesterol", "lipids.hdl", "lipids.ldl", "lipids.triglycerides"] },
  { label: "Vitamin D vs Calcium", markers: ["vitamins.vitaminD", "electrolytes.calciumTotal"] },
  { label: "TSH vs T3 vs T4", markers: ["thyroid.tsh", "thyroid.ft3", "thyroid.ft4"] },
  { label: "LH vs FSH vs Estradiol", markers: ["hormones.lh", "hormones.fsh", "hormones.estradiol"] }
];
export const CHIP_COLORS = ['#4f8cff','#34d399','#f87171','#fbbf24','#a78bfa','#f472b6','#38bdf8','#fb923c'];

// SPECIALTY_MARKER_DEFS — re-exported from adapters.js (single source of truth)
// Used by migrateProfileData() in profile.js and buildMarkerReference() in pdf-import.js
export { ADAPTER_MARKERS as SPECIALTY_MARKER_DEFS } from './adapters.js';

// NOTE: The marker data that was previously inline here (194 entries for OAT + Fatty Acids)
// now lives in js/adapters.js as part of the parser adapter registry.

// ── Model pricing ($/M tokens) ──
export const MODEL_PRICING = {
  venice: {
    'claude-opus-4-6':      { input: 6.00,  output: 30.00 },
    'claude-opus-4-5':      { input: 6.00,  output: 30.00 },
    'claude-sonnet-4-6':    { input: 3.60,  output: 18.00 },
    'claude-sonnet-4-5':    { input: 3.75,  output: 18.75 },
    'openai-gpt-54':        { input: 3.13,  output: 18.80 },
    'openai-gpt-52':        { input: 2.19,  output: 17.50 },
    'gemini-3-pro':         { input: 2.50,  output: 15.00 },
    'gemini-3-1-pro':       { input: 2.50,  output: 15.00 },
    'grok-4-20':            { input: 2.50,  output: 7.50  },
    'hermes-3-llama-3.1-405b': { input: 1.10, output: 3.00 },
    'glm-5':                { input: 1.00,  output: 3.20  },
    'qwen3-coder':          { input: 0.75,  output: 3.00  },
    'kimi-k2':              { input: 0.56,  output: 3.50  },
    'llama-3.3-70b':        { input: 0.70,  output: 2.80  },
    'gemini-3-flash':       { input: 0.70,  output: 3.75  },
    'glm-4':                { input: 0.55,  output: 2.65  },
    'minimax':              { input: 0.35,  output: 1.50  },
    'deepseek-v3':          { input: 0.33,  output: 0.48  },
    'qwen3-next':           { input: 0.35,  output: 1.90  },
    'grok-code':            { input: 0.25,  output: 1.87  },
    'grok-41-fast':         { input: 0.25,  output: 0.63  },
    'qwen3-vl':             { input: 0.25,  output: 1.50  },
    'venice-uncensored':    { input: 0.20,  output: 0.90  },
    'qwen3-235b':           { input: 0.15,  output: 0.75  },
    'llama-3.2':            { input: 0.15,  output: 0.60  },
    'google-gemma':         { input: 0.12,  output: 0.20  },
    'qwen3-5-9b':           { input: 0.05,  output: 0.15  },
    'openai-gpt-oss':       { input: 0.07,  output: 0.30  },
    '_default':             { input: 0.50,  output: 2.00, approx: true },
  },
  openrouter: {
    '_default':  { input: 1.00,  output: 3.00, approx: true },
  },
  ppq: {
    '_default':  { input: 1.00,  output: 3.00, approx: true },
  },
  routstr: {
    '_default':  { input: 1.00,  output: 5.00, approx: true },
  },
  custom: {},
};
export function getModelPricing(provider, modelId) {
  // OpenRouter/Routstr: check dynamic API-sourced pricing first
  if ((provider === 'openrouter' || provider === 'routstr' || provider === 'ppq' || provider === 'venice') && modelId) {
    const cacheKey = provider === 'ppq' ? 'labcharts-ppq-pricing' : provider === 'venice' ? 'labcharts-venice-pricing' : provider === 'routstr' ? 'labcharts-routstr-pricing' : 'labcharts-openrouter-pricing';
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    if (cached[modelId]) return cached[modelId];
  }
  if (!MODEL_PRICING[provider]) return { input: 0, output: 0 };
  const table = MODEL_PRICING[provider];
  const stripped = (modelId || '').replace(/-\d{8}$/, '');
  if (table[stripped]) return table[stripped];
  const prefix = Object.keys(table).filter(k => k !== '_default' && stripped.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (prefix) return table[prefix];
  const fallback = table['_default'] || { input: 0, output: 0 };
  return { ...fallback, approx: true };
}
export function calculateCost(provider, modelId, inputTokens, outputTokens) {
  if (provider === 'custom') return -1;
  const p = getModelPricing(provider, modelId);
  return (p.input * (inputTokens || 0) + p.output * (outputTokens || 0)) / 1_000_000;
}
export function formatCost(usd) {
  if (usd < 0) return 'N/A';
  if (usd === 0) return 'Free';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 0.01) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(3);
}

// ── AI Usage Tracking ──────────────────────────────
const _emptyUsage = () => ({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, requestCount: 0 });

export function trackUsage(provider, modelId, inputTokens, outputTokens) {
  try {
    const cost = calculateCost(provider, modelId, inputTokens || 0, outputTokens || 0);
    const inp = inputTokens || 0, out = outputTokens || 0;
    if (inp === 0 && out === 0) return;

    // Per-profile
    const pid = window._getActiveProfileId ? window._getActiveProfileId() : 'default';
    const pKey = `labcharts-${pid}-usage`;
    const pu = JSON.parse(localStorage.getItem(pKey) || 'null') || _emptyUsage();
    pu.totalCost += cost; pu.totalInputTokens += inp; pu.totalOutputTokens += out; pu.requestCount++;
    localStorage.setItem(pKey, JSON.stringify(pu));

    // Global
    const gu = JSON.parse(localStorage.getItem('labcharts-global-usage') || 'null') || _emptyUsage();
    gu.totalCost += cost; gu.totalInputTokens += inp; gu.totalOutputTokens += out; gu.requestCount++;
    localStorage.setItem('labcharts-global-usage', JSON.stringify(gu));
  } catch(e) { /* usage tracking is non-critical — never break chat/import */ }
}

export function getProfileUsage(profileId) {
  return JSON.parse(localStorage.getItem(`labcharts-${profileId || 'default'}-usage`) || 'null') || _emptyUsage();
}

export function getGlobalUsage() {
  return JSON.parse(localStorage.getItem('labcharts-global-usage') || 'null') || _emptyUsage();
}

export function resetProfileUsage(profileId) {
  localStorage.removeItem(`labcharts-${profileId || 'default'}-usage`);
}

// Optimal ranges — evidence-based "ideal" bands from mortality meta-analyses,
// longevity research (Attia, Patrick, Levine), and functional medicine (Weatherby/OptimalDX).
// Sources: CKD Prognosis Consortium, ASH/Blood 2015, Harris & von Schacky 2004,
// Lancet non-HDL pooled analysis, PMC8844108 (IGF-1), PMC10324141 (sodium),
// PMC10866328 (thyroid/CVD), PMC11078084 (albumin), Gilbert syndrome studies.
export const OPTIMAL_RANGES = {
  // Biochemistry
  'biochemistry.glucose': { optimalMin: 4.0, optimalMax: 5.0 },
  'biochemistry.urea': { optimalMin: 4.6, optimalMax: 6.4 },
  'biochemistry.creatinine': { optimalMin: 75, optimalMax: 97, optimalMin_f: 57, optimalMax_f: 80 },
  'biochemistry.egfr': { optimalMin: 1.50, optimalMax: 2.30 },
  'biochemistry.bilirubinTotal': { optimalMin: 8.0, optimalMax: 17.0 },
  'biochemistry.ast': { optimalMin: 0.17, optimalMax: 0.58 },
  'biochemistry.alt': { optimalMin: 0.17, optimalMax: 0.42 },
  'biochemistry.ggt': { optimalMin: 0.17, optimalMax: 0.42 },
  'biochemistry.ldh': { optimalMin: 2.25, optimalMax: 3.00 },
  'biochemistry.uricAcid': { optimalMin: 200, optimalMax: 350 },
  'biochemistry.cystatinC': { optimalMin: 0.61, optimalMax: 0.82 },
  // Hormones
  'hormones.insulin': { optimalMin: 2.6, optimalMax: 10.0 },
  'hormones.testosterone': { optimalMin: 15.0, optimalMax: 25.0, optimalMin_f: 0.5, optimalMax_f: 1.2 },
  'hormones.freeTestosterone': { optimalMin: 70, optimalMax: 130, optimalMin_f: 2.0, optimalMax_f: 7.0 },
  'hormones.shbg': { optimalMin: 20.0, optimalMax: 40.0 },
  'hormones.dheaS': { optimalMin: 4.0, optimalMax: 9.0 },
  'hormones.estradiol': { optimalMin: 70, optimalMax: 130 },
  'hormones.igf1': { optimalMin: 120, optimalMax: 160 },
  // Electrolytes & Minerals
  'electrolytes.sodium': { optimalMin: 139, optimalMax: 142 },
  'electrolytes.potassium': { optimalMin: 4.0, optimalMax: 4.5 },
  'electrolytes.calciumTotal': { optimalMin: 2.20, optimalMax: 2.40 },
  'electrolytes.magnesium': { optimalMin: 0.85, optimalMax: 0.95 },
  // Iron
  'iron.iron': { optimalMin: 12.0, optimalMax: 25.0 },
  'iron.ferritin': { optimalMin: 40, optimalMax: 200 },
  'iron.transferrinSat': { optimalMin: 25.0, optimalMax: 35.0 },
  // Lipids
  'lipids.cholesterol': { optimalMin: 3.9, optimalMax: 5.2 },
  'lipids.triglycerides': { optimalMin: 0.45, optimalMax: 1.00 },
  'lipids.hdl': { optimalMin: 1.50, optimalMax: 2.10 },
  'lipids.ldl': { optimalMin: 1.20, optimalMax: 2.60 },
  'lipids.nonHdl': { optimalMin: 1.80, optimalMax: 2.60 },
  'lipids.apoB': { optimalMin: 0.40, optimalMax: 0.70 },
  'lipids.apoAI': { optimalMin: 1.40, optimalMax: 1.70 },
  // Proteins & Inflammation
  'proteins.hsCRP': { optimalMin: 0.00, optimalMax: 0.50 },
  'proteins.totalProtein': { optimalMin: 69.0, optimalMax: 74.0 },
  'proteins.albumin': { optimalMin: 42.0, optimalMax: 50.0 },
  'proteins.ceruloplasmin': { optimalMin: 0.20, optimalMax: 0.30 },
  // Thyroid
  'thyroid.tsh': { optimalMin: 1.0, optimalMax: 2.5 },
  'thyroid.ft3': { optimalMin: 4.6, optimalMax: 6.0 },
  'thyroid.ft4': { optimalMin: 14.0, optimalMax: 17.0 },
  // Vitamins
  'vitamins.vitaminD': { optimalMin: 100.0, optimalMax: 200.0 },
  'vitamins.calcitriol': { optimalMin: 60.0, optimalMax: 160.0 },
  'vitamins.vitaminA': { optimalMin: 1.40, optimalMax: 2.10 },
  'vitamins.vitaminB12': { optimalMin: 300, optimalMax: 500 },
  'vitamins.folate': { optimalMin: 14.0, optimalMax: 36.0 },
  // Diabetes
  'diabetes.hba1c': { optimalMin: 20.0, optimalMax: 36.0 },
  'diabetes.insulin_d': { optimalMin: 2.6, optimalMax: 10.0 },
  'diabetes.homaIR': { optimalMin: 0, optimalMax: 1.5 },
  // Hematology
  'hematology.wbc': { optimalMin: 5.0, optimalMax: 7.0 },
  'hematology.rbc': { optimalMin: 4.4, optimalMax: 5.0, optimalMin_f: 4.0, optimalMax_f: 4.5 },
  'hematology.hemoglobin': { optimalMin: 140, optimalMax: 170, optimalMin_f: 125, optimalMax_f: 155 },
  'hematology.mcv': { optimalMin: 85.0, optimalMax: 92.0 },
  'hematology.rdwcv': { optimalMin: 11.5, optimalMax: 13.0 },
  'hematology.platelets': { optimalMin: 200, optimalMax: 300 },
  // WBC Differential
  'differential.neutrophils': { optimalMin: 2.0, optimalMax: 4.0 },
  'differential.lymphocytes': { optimalMin: 1.5, optimalMax: 3.0 },
  // Coagulation
  'coagulation.homocysteine': { optimalMin: 5.0, optimalMax: 8.0 },
  // Body Composition
  'bodyComposition.bodyFatPct': { optimalMin: 8, optimalMax: 19, optimalMin_f: 18, optimalMax_f: 25 },
  'bodyComposition.bmiDexa': { optimalMin: 20.0, optimalMax: 23.0 },
  'bodyComposition.agRatio': { optimalMin: 0.4, optimalMax: 0.8 },
  'bodyComposition.visceralFatArea': { optimalMin: 0, optimalMax: 65 },
  // Bone Density
  'boneDensity.tScoreSpine': { optimalMin: 0, optimalMax: null },
  'boneDensity.tScoreFemurTotal': { optimalMin: 0, optimalMax: null },
  'boneDensity.tScoreFemurNeck': { optimalMin: 0, optimalMax: null },
  'boneDensity.zScoreSpine': { optimalMin: 0, optimalMax: null },
  'boneDensity.zScoreFemurTotal': { optimalMin: 0, optimalMax: null },
  'boneDensity.zScoreFemurNeck': { optimalMin: 0, optimalMax: null },
  // Calculated Ratios
  'calculatedRatios.crpHdlRatio': { optimalMin: 0, optimalMax: 0.24 },
};

// Phase-specific reference ranges for cycle-dependent hormones (premenopausal female, SI units)
// Sources: ACOG, Endocrine Society, Quest/LabCorp clinical reference tables
export const PHASE_RANGES = {
  'hormones.estradiol': {
    menstrual:  { min: 45,   max: 130  },
    follicular: { min: 45,   max: 400  },
    ovulatory:  { min: 400,  max: 1470 },
    luteal:     { min: 180,  max: 780  }
  },
  'hormones.progesterone': {
    menstrual:  { min: 0.18, max: 2.5  },
    follicular: { min: 0.18, max: 2.5  },
    ovulatory:  { min: 0.18, max: 9.5  },
    luteal:     { min: 5.7,  max: 75.9 }
  },
  'hormones.lh': {
    menstrual:  { min: 2.4,  max: 12.6 },
    follicular: { min: 2.4,  max: 12.6 },
    ovulatory:  { min: 14.0, max: 95.6 },
    luteal:     { min: 1.0,  max: 11.4 }
  },
  'hormones.fsh': {
    menstrual:  { min: 3.5,  max: 12.5 },
    follicular: { min: 3.5,  max: 12.5 },
    ovulatory:  { min: 4.7,  max: 21.5 },
    luteal:     { min: 1.7,  max: 7.7  }
  }
};

// ═══════════════════════════════════════════════
// SBM-2015 — Building Biology EMF Thresholds (sleeping areas)
// ═══════════════════════════════════════════════
export const SBM_2015_THRESHOLDS = {
  acElectric: {
    name: 'AC Electric Fields', unit: 'V/m',
    sleeping: [
      { max: 1,        label: 'No concern',      color: 'green'  },
      { max: 5,        label: 'Slight concern',   color: 'yellow' },
      { max: 50,       label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ],
    daytime: [
      { max: 3,        label: 'No concern',      color: 'green'  },
      { max: 10,       label: 'Slight concern',   color: 'yellow' },
      { max: 50,       label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ]
  },
  acMagnetic: {
    name: 'AC Magnetic Fields', unit: 'nT',
    sleeping: [
      { max: 20,       label: 'No concern',      color: 'green'  },
      { max: 100,      label: 'Slight concern',   color: 'yellow' },
      { max: 500,      label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ],
    daytime: [
      { max: 50,       label: 'No concern',      color: 'green'  },
      { max: 200,      label: 'Slight concern',   color: 'yellow' },
      { max: 1000,     label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ]
  },
  rfMicrowave: {
    name: 'RF/Microwave Radiation', unit: 'µW/m²',
    sleeping: [
      { max: 0.1,      label: 'No concern',      color: 'green'  },
      { max: 10,       label: 'Slight concern',   color: 'yellow' },
      { max: 1000,     label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ],
    daytime: [
      { max: 1,        label: 'No concern',      color: 'green'  },
      { max: 50,       label: 'Slight concern',   color: 'yellow' },
      { max: 1000,     label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ]
  },
  dirtyElectricity: {
    name: 'Dirty Electricity', unit: 'GS',
    sleeping: [
      { max: 25,       label: 'No concern',      color: 'green'  },
      { max: 50,       label: 'Slight concern',   color: 'yellow' },
      { max: 200,      label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ],
    daytime: [
      { max: 50,       label: 'No concern',      color: 'green'  },
      { max: 100,      label: 'Slight concern',   color: 'yellow' },
      { max: 300,      label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ]
  },
  dcMagnetic: {
    name: 'DC Magnetic Field Deviation', unit: 'µT',
    sleeping: [
      { max: 1,        label: 'No concern',      color: 'green'  },
      { max: 5,        label: 'Slight concern',   color: 'yellow' },
      { max: 20,       label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ],
    daytime: [
      { max: 2,        label: 'No concern',      color: 'green'  },
      { max: 10,       label: 'Slight concern',   color: 'yellow' },
      { max: 20,       label: 'Severe concern',   color: 'orange' },
      { max: Infinity, label: 'Extreme concern',  color: 'red'    }
    ]
  }
};

export function getEMFSeverity(type, value, sleeping = true) {
  const def = SBM_2015_THRESHOLDS[type];
  if (!def || value == null) return null;
  const tiers = sleeping ? def.sleeping : def.daytime;
  for (const tier of tiers) {
    if (value < tier.max) return tier;
  }
  return tiers[tiers.length - 1];
}
