// @ts-check
// schema-environment.js - cycle phase ranges and EMF threshold definitions

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
