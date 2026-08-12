// @ts-check
// schema-environment.js - cycle phase ranges and EMF threshold definitions

// Assay-specific phase reference ranges for naturally cycling premenopausal
// adults (SI units). These are built-in fallbacks, not universal targets:
// laboratories and methods can legitimately report different intervals.
// Menstrual days reuse the follicular interval because the source tables do
// not publish a separate menstrual range. Calendar-derived phases are only
// attached for regular cycles without hormonal contraception (see data.js).
//
// Sources (accessed 2026-08-12; Roche cobas ECLIA):
// - Labcorp 004515 Estradiol: https://www.labcorp.com/tests/004515/estradiol
// - Labcorp 004317 Progesterone: https://www.labcorp.com/tests/004317/progesterone
// - Labcorp 004283 LH: https://www.labcorp.com/tests/004283/luteinizing-hormone-lh
// - Labcorp 004309 FSH: https://www.labcorp.com/tests/004309/follicle-stimulating-hormone-fsh
// Estradiol pg/mL and progesterone ng/mL source values are converted using the
// same factors as UNIT_CONVERSIONS and rounded to avoid false precision.
export const PHASE_RANGES = {
  'hormones.estradiol': {
    menstrual:  { min: 46,  max: 609,  label: 'Predicted menstrual range', source: 'Labcorp 004515 (Roche cobas ECLIA)' },
    follicular: { min: 46,  max: 609,  label: 'Predicted follicular range', source: 'Labcorp 004515 (Roche cobas ECLIA)' },
    ovulatory:  { min: 315, max: 1828, label: 'Predicted ovulatory range', source: 'Labcorp 004515 (Roche cobas ECLIA)' },
    luteal:     { min: 161, max: 775,  label: 'Predicted luteal range', source: 'Labcorp 004515 (Roche cobas ECLIA)' }
  },
  'hormones.progesterone': {
    menstrual:  { min: 0.32, max: 2.86, label: 'Predicted menstrual range', source: 'Labcorp 004317 (Roche cobas ECLIA)' },
    follicular: { min: 0.32, max: 2.86, label: 'Predicted follicular range', source: 'Labcorp 004317 (Roche cobas ECLIA)' },
    ovulatory:  { min: 0.32, max: 38.2, label: 'Predicted ovulatory range', source: 'Labcorp 004317 (Roche cobas ECLIA)' },
    luteal:     { min: 5.72, max: 76.0, label: 'Predicted luteal range', source: 'Labcorp 004317 (Roche cobas ECLIA)' }
  },
  'hormones.lh': {
    menstrual:  { min: 2.4,  max: 12.6, label: 'Predicted menstrual range', source: 'Labcorp 004283 (Roche cobas ECLIA)' },
    follicular: { min: 2.4,  max: 12.6, label: 'Predicted follicular range', source: 'Labcorp 004283 (Roche cobas ECLIA)' },
    ovulatory:  { min: 14.0, max: 95.6, label: 'Predicted ovulatory range', source: 'Labcorp 004283 (Roche cobas ECLIA)' },
    luteal:     { min: 1.0,  max: 11.4, label: 'Predicted luteal range', source: 'Labcorp 004283 (Roche cobas ECLIA)' }
  },
  'hormones.fsh': {
    menstrual:  { min: 3.5,  max: 12.5, label: 'Predicted menstrual range', source: 'Labcorp 004309 (Roche cobas ECLIA)' },
    follicular: { min: 3.5,  max: 12.5, label: 'Predicted follicular range', source: 'Labcorp 004309 (Roche cobas ECLIA)' },
    ovulatory:  { min: 4.7,  max: 21.5, label: 'Predicted ovulatory range', source: 'Labcorp 004309 (Roche cobas ECLIA)' },
    luteal:     { min: 1.7,  max: 7.7,  label: 'Predicted luteal range', source: 'Labcorp 004309 (Roche cobas ECLIA)' }
  }
};

// Date-specific adult reference guidance. These tables are deliberately kept
// separate from static schema intervals and from OPTIMAL_RANGES: age, sex and
// assay are part of the meaning of these results. A reference interval
// imported from the user's own lab report always takes priority in data.js.
//
// Sources:
// - Mayo Clinic Laboratories DHES1 (DHEA-S; mcg/dL converted to µmol/L)
// - Mayo Clinic Laboratories AMH1 (AMH; ng/mL converted to pmol/L)
// - Bidlingmaier et al., JCEM 2014 / Mayo IGF1S (IGF-1; ng/mL = µg/L)
// - Mayo Clinic Laboratories NFLP (plasma NfL, current assay-specific limits)
export const CONTEXT_REFERENCE_RANGES = {
  'hormones.dheaS': {
    male: [
      { minAge: 18, maxAge: 31, min: 2.848, max: 19.75, label: 'Age/sex assay range (18–30)' },
      { minAge: 31, maxAge: 41, min: 1.546, max: 14.16, label: 'Age/sex assay range (31–40)' },
      { minAge: 41, maxAge: 51, min: 0.922, max: 10.71, label: 'Age/sex assay range (41–50)' },
      { minAge: 51, maxAge: 61, min: 0.542, max: 8.11, label: 'Age/sex assay range (51–60)' },
      { minAge: 61, maxAge: 71, min: 0.325, max: 6.16, label: 'Age/sex assay range (61–70)' },
      { minAge: 71, maxAge: Infinity, min: 0.179, max: 4.39, label: 'Age/sex assay range (71+)' },
    ],
    female: [
      { minAge: 18, maxAge: 31, min: 2.251, max: 10.23, label: 'Age/sex assay range (18–30)' },
      { minAge: 31, maxAge: 41, min: 1.221, max: 8.00, label: 'Age/sex assay range (31–40)' },
      { minAge: 41, maxAge: 51, min: 0.732, max: 6.51, label: 'Age/sex assay range (41–50)' },
      { minAge: 51, maxAge: 61, min: 0.434, max: 5.29, label: 'Age/sex assay range (51–60)' },
      { minAge: 61, maxAge: 71, min: 0.263, max: 4.31, label: 'Age/sex assay range (61–70)' },
      { minAge: 71, maxAge: Infinity, min: 0.144, max: 3.36, label: 'Age/sex assay range (71+)' },
    ],
  },
  'hormones.amh': {
    female: [
      { minAge: 20, maxAge: 25, min: 8.57, max: 85.7, label: 'Age/assay range (20–24)' },
      { minAge: 25, maxAge: 30, min: 6.36, max: 70.7, label: 'Age/assay range (25–29)' },
      { minAge: 30, maxAge: 35, min: 4.14, max: 57.9, label: 'Age/assay range (30–34)' },
      { minAge: 35, maxAge: 40, min: 1.07, max: 53.6, label: 'Age/assay range (35–39)' },
      { minAge: 40, maxAge: 45, min: 0.21, max: 39.3, label: 'Age/assay range (40–44)' },
      { minAge: 45, maxAge: 51, min: 0, max: 18.6, label: 'Age/assay upper limit (45–50)' },
      { minAge: 51, maxAge: 56, min: 0, max: 6.3, label: 'Age/assay upper limit (51–55)' },
      { minAge: 56, maxAge: Infinity, min: 0, max: 0.2, label: 'Age/assay upper limit (56+)' },
    ],
  },
  'hormones.igf1': {
    male: [
      { minAge: 18, maxAge: 19, min: 146.2, max: 493.6, label: 'Age/sex assay range (18)' },
      { minAge: 19, maxAge: 20, min: 140.2, max: 462.7, label: 'Age/sex assay range (19)' },
      { minAge: 20, maxAge: 21, min: 133.1, max: 430.0, label: 'Age/sex assay range (20)' },
      { minAge: 21, maxAge: 26, min: 115.2, max: 354.8, label: 'Age/sex assay range (21–25)' },
      { minAge: 26, maxAge: 31, min: 97.9, max: 281.6, label: 'Age/sex assay range (26–30)' },
      { minAge: 31, maxAge: 36, min: 88.3, max: 246.0, label: 'Age/sex assay range (31–35)' },
      { minAge: 36, maxAge: 41, min: 83.4, max: 232.7, label: 'Age/sex assay range (36–40)' },
      { minAge: 41, maxAge: 46, min: 74.9, max: 216.4, label: 'Age/sex assay range (41–45)' },
      { minAge: 46, maxAge: 51, min: 66.9, max: 205.1, label: 'Age/sex assay range (46–50)' },
      { minAge: 51, maxAge: 56, min: 60.6, max: 200.3, label: 'Age/sex assay range (51–55)' },
      { minAge: 56, maxAge: 61, min: 54.3, max: 194.2, label: 'Age/sex assay range (56–60)' },
      { minAge: 61, maxAge: 66, min: 48.8, max: 187.7, label: 'Age/sex assay range (61–65)' },
      { minAge: 66, maxAge: 71, min: 46.5, max: 191.9, label: 'Age/sex assay range (66–70)' },
      { minAge: 71, maxAge: 76, min: 40.9, max: 179.2, label: 'Age/sex assay range (71–75)' },
      { minAge: 76, maxAge: 81, min: 37.1, max: 172.0, label: 'Age/sex assay range (76–80)' },
      { minAge: 81, maxAge: 86, min: 33.8, max: 165.4, label: 'Age/sex assay range (81–85)' },
      { minAge: 86, maxAge: 91, min: 32.2, max: 166.1, label: 'Age/sex assay range (86–90)' },
    ],
    female: [
      { minAge: 18, maxAge: 19, min: 120.5, max: 485.8, label: 'Age/sex assay range (18)' },
      { minAge: 19, maxAge: 20, min: 114.4, max: 450.8, label: 'Age/sex assay range (19)' },
      { minAge: 20, maxAge: 21, min: 107.8, max: 416.0, label: 'Age/sex assay range (20)' },
      { minAge: 21, maxAge: 26, min: 92.9, max: 342.0, label: 'Age/sex assay range (21–25)' },
      { minAge: 26, maxAge: 31, min: 78.4, max: 270.0, label: 'Age/sex assay range (26–30)' },
      { minAge: 31, maxAge: 36, min: 73.1, max: 243.0, label: 'Age/sex assay range (31–35)' },
      { minAge: 36, maxAge: 41, min: 69.0, max: 227.0, label: 'Age/sex assay range (36–40)' },
      { minAge: 41, maxAge: 46, min: 61.5, max: 204.4, label: 'Age/sex assay range (41–45)' },
      { minAge: 46, maxAge: 51, min: 56.8, max: 194.5, label: 'Age/sex assay range (46–50)' },
      { minAge: 51, maxAge: 56, min: 53.0, max: 189.6, label: 'Age/sex assay range (51–55)' },
      { minAge: 56, maxAge: 61, min: 45.6, max: 172.4, label: 'Age/sex assay range (56–60)' },
      { minAge: 61, maxAge: 66, min: 42.2, max: 169.0, label: 'Age/sex assay range (61–65)' },
      { minAge: 66, maxAge: 71, min: 38.3, max: 162.5, label: 'Age/sex assay range (66–70)' },
      { minAge: 71, maxAge: 76, min: 36.6, max: 164.7, label: 'Age/sex assay range (71–75)' },
      { minAge: 76, maxAge: 81, min: 34.7, max: 164.8, label: 'Age/sex assay range (76–80)' },
      { minAge: 81, maxAge: 86, min: 34.4, max: 172.4, label: 'Age/sex assay range (81–85)' },
      { minAge: 86, maxAge: 91, min: 33.6, max: 177.8, label: 'Age/sex assay range (86–90)' },
    ],
  },
  'proteins.neurofilamentLight': {
    all: [
      { minAge: 20, maxAge: 25, min: 0, max: 10.4, label: 'Age/assay upper limit (20–24)' },
      { minAge: 25, maxAge: 30, min: 0, max: 11.9, label: 'Age/assay upper limit (25–29)' },
      { minAge: 30, maxAge: 35, min: 0, max: 13.5, label: 'Age/assay upper limit (30–34)' },
      { minAge: 35, maxAge: 40, min: 0, max: 15.3, label: 'Age/assay upper limit (35–39)' },
      { minAge: 40, maxAge: 45, min: 0, max: 17.3, label: 'Age/assay upper limit (40–44)' },
      { minAge: 45, maxAge: 50, min: 0, max: 19.7, label: 'Age/assay upper limit (45–49)' },
      { minAge: 50, maxAge: 55, min: 0, max: 22.4, label: 'Age/assay upper limit (50–54)' },
      { minAge: 55, maxAge: 60, min: 0, max: 25.4, label: 'Age/assay upper limit (55–59)' },
      { minAge: 60, maxAge: 65, min: 0, max: 28.8, label: 'Age/assay upper limit (60–64)' },
      { minAge: 65, maxAge: 70, min: 0, max: 32.7, label: 'Age/assay upper limit (65–69)' },
      { minAge: 70, maxAge: 75, min: 0, max: 37.1, label: 'Age/assay upper limit (70–74)' },
      { minAge: 75, maxAge: 80, min: 0, max: 42.1, label: 'Age/assay upper limit (75–79)' },
      { minAge: 80, maxAge: 85, min: 0, max: 47.8, label: 'Age/assay upper limit (80–84)' },
      { minAge: 85, maxAge: Infinity, min: 0, max: 54.3, label: 'Age/assay upper limit (85+)' },
    ],
  },
};

// Contextual wellness/low-risk bands with enough evidence to alter the optional
// optimal view. These are not treatment targets. The older-men testosterone
// band comes from an observational cohort (PMID 24257908), not a TRT guideline.
export const CONTEXT_OPTIMAL_RANGES = {
  'hormones.testosterone': {
    male: [
      { minAge: 70, maxAge: 90, min: 9.8, max: 15.8, label: 'Lower-mortality cohort band (70–89)' },
    ],
  },
};

// SBM-2015 — Building Biology EMF Thresholds (sleeping areas)
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
