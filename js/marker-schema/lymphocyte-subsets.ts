import type { MarkerCategory } from './types.js';

// Whole-blood flow-cytometry subsets, distinct from the CBC differential.
// Panel identities and denominators: Mayo TBBS and UW TCSNK.
// https://www.mayocliniclabs.com/test-catalog/overview/9336
// https://dlmp.uw.edu/test-guide/view/TCSNK
// Use the reporting laboratory's age- and method-specific intervals. These
// laboratories publish materially different intervals; no universal optimum
// is inferred from HIV cohorts or the research Immune Health Grade.
// Absolute counts share the differential's SI unit. Percentages are explicitly
// whole percentages of total lymphocytes (0–100), not fractions or % of CD3.
export const LYMPHOCYTE_SUBSETS_CATEGORY = {
  label: 'Lymphocyte Subsets', icon: '\uD83E\uDDA0',
  markers: {
    cd3: { name: 'Total T Cells (CD3+) #', unit: '10^9/l', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'Absolute circulating CD3+ T-lymphocyte count, measured by flow cytometry. Interpret using the laboratory age- and method-specific interval; no universal optimal range.' },
    cd4: { name: 'CD4 T Cells (CD3+CD4+) #', unit: '10^9/l', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'Absolute circulating CD3+CD4+ helper T-lymphocyte count. Interpret with the reporting laboratory interval, clinical context and treatment history; no universal optimal range.' },
    cd8: { name: 'CD8 T Cells (CD3+CD8+) #', unit: '10^9/l', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'Absolute circulating CD3+CD8+ cytotoxic T-lymphocyte count. Laboratory intervals vary with age and method; HIV-cohort prognostic thresholds are not universal healthy targets.' },
    cd19: { name: 'B Cells (CD19+) #', unit: '10^9/l', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'Absolute circulating CD19+ B-lymphocyte count. Use the laboratory age- and method-specific interval; cell count does not measure antibody function and has no universal optimal range.' },
    nkCells: { name: 'NK Cells (CD3− CD16/CD56+) #', unit: '10^9/l', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'Absolute circulating natural killer cells, CD3-negative with CD16 and/or CD56 expression, as gated by the laboratory. Distinct from CD3+ NKT cells and NK functional assays; no universal optimal range.' },
    cd3Pct: { name: 'Total T Cells (CD3+) %', unit: '%', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'CD3+ T cells as a percentage of total lymphocytes, stored on a 0–100 scale. Use the laboratory interval and accompanying absolute count; no universal optimal range.' },
    cd4Pct: { name: 'CD4 T Cells (CD3+CD4+) %', unit: '%', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'CD3+CD4+ T cells as a percentage of total lymphocytes, not of CD3+ T cells; stored on a 0–100 scale. Use the laboratory interval and absolute count; no universal optimal range.' },
    cd8Pct: { name: 'CD8 T Cells (CD3+CD8+) %', unit: '%', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'CD3+CD8+ T cells as a percentage of total lymphocytes, not of CD3+ T cells; stored on a 0–100 scale. Use the laboratory interval and absolute count; no universal optimal range.' },
    cd19Pct: { name: 'B Cells (CD19+) %', unit: '%', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'CD19+ B cells as a percentage of total lymphocytes, stored on a 0–100 scale. Use the laboratory interval and accompanying absolute count; no universal optimal range.' },
    nkCellsPct: { name: 'NK Cells (CD3− CD16/CD56+) %', unit: '%', refMin: null, refMax: null, rangePolicy: 'contextual', desc: 'CD3-negative CD16/CD56-positive NK cells as a percentage of total lymphocytes, stored on a 0–100 scale. This is not an NK activity measurement. Use the laboratory interval; no universal optimal range.' },
  },
} satisfies MarkerCategory;
