#!/usr/bin/env node
// test-trend-alerts.js — Trend detection, alerts, and status logic
//
// Run: node tests/test-trend-alerts.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const dashboardCssSrc = read('styles.css') + '\n' + read('css/dashboard-core.css');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Trend Alerts & Status Tests ===\n');

const { linearRegression, getStatus } = await import('../js/utils.js');
const { detectTrendAlerts, getKeyTrendMarkers, getEffectiveRange } = await import('../js/data.js');

  // =======================================
  // 1. linearRegression — perfect fit
  // =======================================
  console.log('%c 1. linearRegression \u2014 Perfect Linear ', 'font-weight:bold;color:#f59e0b');

  const lr1 = linearRegression([1, 2, 3, 4, 5]);
  assert('slope = 1 for [1,2,3,4,5]', Math.abs(lr1.slope - 1) < 1e-10, `got ${lr1.slope}`);
  assert('intercept = 1', Math.abs(lr1.intercept - 1) < 1e-10, `got ${lr1.intercept}`);
  assert('R\u00B2 = 1 (perfect fit)', Math.abs(lr1.r2 - 1) < 1e-10, `got ${lr1.r2}`);

  // =======================================
  // 2. linearRegression — flat data
  // =======================================
  console.log('%c 2. linearRegression \u2014 Flat Data ', 'font-weight:bold;color:#f59e0b');

  const lr2 = linearRegression([5, 5, 5, 5]);
  assert('slope = 0 for flat data', Math.abs(lr2.slope) < 1e-10, `got ${lr2.slope}`);
  assert('intercept = 5', Math.abs(lr2.intercept - 5) < 1e-10, `got ${lr2.intercept}`);
  assert('R\u00B2 = 0 for flat data (ssTot = 0)', lr2.r2 === 0, `got ${lr2.r2}`);

  // =======================================
  // 3. linearRegression — noisy data
  // =======================================
  console.log('%c 3. linearRegression \u2014 Noisy Data ', 'font-weight:bold;color:#f59e0b');

  const lr3 = linearRegression([2, 4, 3, 6, 5, 8]);
  assert('Noisy slope > 0', lr3.slope > 0, `got ${lr3.slope}`);
  assert('Noisy R\u00B2 between 0 and 1', lr3.r2 > 0 && lr3.r2 < 1, `got ${lr3.r2}`);

  // Descending noisy data
  const lr3b = linearRegression([10, 8, 9, 6, 7, 4]);
  assert('Descending noisy slope < 0', lr3b.slope < 0, `got ${lr3b.slope}`);
  assert('Descending R\u00B2 between 0 and 1', lr3b.r2 > 0 && lr3b.r2 < 1, `got ${lr3b.r2}`);

  // =======================================
  // 4. linearRegression — edge cases
  // =======================================
  console.log('%c 4. linearRegression \u2014 Edge Cases ', 'font-weight:bold;color:#f59e0b');

  const lr4a = linearRegression([42]);
  assert('1 point: slope = 0', lr4a.slope === 0, `got ${lr4a.slope}`);
  assert('1 point: intercept = value', lr4a.intercept === 42, `got ${lr4a.intercept}`);
  assert('1 point: R\u00B2 = 0', lr4a.r2 === 0, `got ${lr4a.r2}`);

  const lr4b = linearRegression([]);
  assert('0 points: slope = 0', lr4b.slope === 0, `got ${lr4b.slope}`);
  assert('0 points: intercept = 0', lr4b.intercept === 0, `got ${lr4b.intercept}`);

  const lr4c = linearRegression([3, 7]);
  assert('2 points: slope = 4', Math.abs(lr4c.slope - 4) < 1e-10, `got ${lr4c.slope}`);
  assert('2 points: R\u00B2 = 1 (perfect fit with 2)', Math.abs(lr4c.r2 - 1) < 1e-10, `got ${lr4c.r2}`);

  // =======================================
  // 5. getStatus — basic classification
  // =======================================
  console.log('%c 5. getStatus \u2014 Basic Classification ', 'font-weight:bold;color:#f59e0b');

  assert('Below refMin = low', getStatus(3.0, 3.9, 5.8) === 'low');
  assert('Above refMax = high', getStatus(6.0, 3.9, 5.8) === 'high');
  assert('Within range = normal', getStatus(4.5, 3.9, 5.8) === 'normal');
  assert('At refMin = normal (not < min)', getStatus(3.9, 3.9, 5.8) === 'normal');
  assert('At refMax = normal (not > max)', getStatus(5.8, 3.9, 5.8) === 'normal');
  assert('null value = missing', getStatus(null, 3.9, 5.8) === 'missing');
  assert('undefined value = missing', getStatus(undefined, 3.9, 5.8) === 'missing');
  assert('null refs = normal', getStatus(100, null, null) === 'normal');
  assert('Only refMin, value above = normal', getStatus(10, 5, null) === 'normal');
  assert('Only refMin, value below = low', getStatus(3, 5, null) === 'low');
  assert('Only refMax, value below = normal', getStatus(3, null, 10) === 'normal');
  assert('Only refMax, value above = high', getStatus(15, null, 10) === 'high');
  assert('Zero value, within range = normal', getStatus(0, -1, 1) === 'normal');

  // =======================================
  // 6. detectTrendAlerts — sudden change (high)
  // =======================================
  console.log('%c 6. detectTrendAlerts \u2014 Sudden High ', 'font-weight:bold;color:#f59e0b');

  // Ref range: 3.9-5.8, width = 1.9. Jump > 0.475 (25%) + latest above refMax => sudden_high
  const mockSuddenHigh = {
    dates: ['2024-01-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [5.0, 6.5],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts1 = detectTrendAlerts(mockSuddenHigh);
  assert('Sudden high detected', alerts1.length === 1, `got ${alerts1.length}`);
  if (alerts1.length >= 1) {
    assert('Concern = sudden_high', alerts1[0].concern === 'sudden_high');
    assert('Has name (Glucose)', alerts1[0].name === 'Glucose');
    assert('Has category label', alerts1[0].category === 'Biochemistry');
    assert('Direction = rising', alerts1[0].direction === 'rising');
    assert('Has id', alerts1[0].id === 'biochemistry_glucose');
    assert('Has spark values', Array.isArray(alerts1[0].spark) && alerts1[0].spark.length === 2);
  }

  // =======================================
  // 7. detectTrendAlerts — sudden change (low)
  // =======================================
  console.log('%c 7. detectTrendAlerts \u2014 Sudden Low ', 'font-weight:bold;color:#f59e0b');

  const mockSuddenLow = {
    dates: ['2024-01-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [5.0, 3.5],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts2 = detectTrendAlerts(mockSuddenLow);
  assert('Sudden low detected', alerts2.length === 1, `got ${alerts2.length}`);
  if (alerts2.length >= 1) {
    assert('Concern = sudden_low', alerts2[0].concern === 'sudden_low');
    assert('Direction = falling', alerts2[0].direction === 'falling');
  }

  // =======================================
  // 8. detectTrendAlerts — no alert for in-range jump
  // =======================================
  console.log('%c 8. detectTrendAlerts \u2014 No Alert for In-Range Jump ', 'font-weight:bold;color:#f59e0b');

  // Jump is large (> 25% range) but latest value is within range = no sudden alert
  const mockInRange = {
    dates: ['2024-01-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [4.0, 5.5],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts3 = detectTrendAlerts(mockInRange);
  assert('No sudden alert for in-range jump', alerts3.length === 0, `got ${alerts3.length}`);

  // =======================================
  // 9. detectTrendAlerts — regression (past_high)
  // =======================================
  console.log('%c 9. detectTrendAlerts \u2014 Regression Trend (past_high) ', 'font-weight:bold;color:#f59e0b');

  // 3+ points with rising trend and latest above refMax => past_high
  // normSlope must be >= 0.02 and if 4+ points, R2 >= 0.5
  const mockRegressionHigh = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [5.2, 5.6, 6.0],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts4 = detectTrendAlerts(mockRegressionHigh);
  assert('Regression past_high detected', alerts4.length === 1, `got ${alerts4.length}`);
  if (alerts4.length >= 1) {
    assert('Concern = past_high', alerts4[0].concern === 'past_high');
    assert('Direction = rising', alerts4[0].direction === 'rising');
  }

  // =======================================
  // 10. detectTrendAlerts — regression (approaching_low)
  // =======================================
  console.log('%c 10. detectTrendAlerts \u2014 Approaching Low ', 'font-weight:bold;color:#f59e0b');

  // Falling trend, latest within 15% of refMin = approaching_low
  // Range = 1.9, 15% = 0.285, so refMin + 0.285 = 4.185. Latest <= 4.185
  const mockApproachLow = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [4.8, 4.4, 4.1],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts5 = detectTrendAlerts(mockApproachLow);
  assert('Approaching low detected', alerts5.length === 1, `got ${alerts5.length}`);
  if (alerts5.length >= 1) {
    assert('Concern = approaching_low', alerts5[0].concern === 'approaching_low');
    assert('Direction = falling', alerts5[0].direction === 'falling');
  }

  // =======================================
  // 11. detectTrendAlerts — skips singlePoint categories
  // =======================================
  console.log('%c 11. detectTrendAlerts \u2014 singlePoint Skipped ', 'font-weight:bold;color:#f59e0b');

  const mockSinglePoint = {
    dates: ['2024-01-15', '2024-06-15'],
    categories: {
      bodycomp: {
        label: 'Body Comp', singlePoint: true,
        markers: {
          bmi: {
            name: 'BMI', unit: 'kg/m\u00B2', values: [22, 35],
            refMin: 18.5, refMax: 25, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts6 = detectTrendAlerts(mockSinglePoint);
  assert('singlePoint category yields no alerts', alerts6.length === 0);

  // =======================================
  // 12. detectTrendAlerts — skips markers with null refs
  // =======================================
  console.log('%c 12. detectTrendAlerts \u2014 Null Refs Skipped ', 'font-weight:bold;color:#f59e0b');

  const mockNullRefs = {
    dates: ['2024-01-15', '2024-06-15'],
    categories: {
      custom: {
        label: 'Custom', singlePoint: false,
        markers: {
          noref: {
            name: 'No Refs', unit: 'U', values: [10, 100],
            refMin: null, refMax: null, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts7 = detectTrendAlerts(mockNullRefs);
  assert('No alerts when refs are null', alerts7.length === 0);

  // =======================================
  // 13. detectTrendAlerts — sorts sudden before regression
  // =======================================
  console.log('%c 13. detectTrendAlerts \u2014 Sort Priority ', 'font-weight:bold;color:#f59e0b');

  const mockMixed = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          // Regression trend: gradual rise past ref
          creatinine: {
            name: 'Creatinine', unit: '\u00B5mol/L', values: [90, 100, 110],
            refMin: 62, refMax: 106, optimalMin: null, optimalMax: null
          }
        }
      },
      lipids: {
        label: 'Lipids', singlePoint: false,
        markers: {
          // Sudden jump: huge jump past ref (just 2 points, triggers sudden)
          ldl: {
            name: 'LDL', unit: 'mmol/L', values: [null, 2.5, 4.5],
            refMin: 0, refMax: 3.4, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts8 = detectTrendAlerts(mockMixed);
  const suddenIdx = alerts8.findIndex(a => a.concern.startsWith('sudden_'));
  const pastIdx = alerts8.findIndex(a => a.concern.startsWith('past_'));
  if (suddenIdx >= 0 && pastIdx >= 0) {
    assert('Sudden alerts sorted before past alerts', suddenIdx < pastIdx);
  } else {
    // At least verify the sorting logic runs without error
    assert('Sorting logic runs (mixed alerts)', alerts8.length >= 1, `got ${alerts8.length} alerts`);
  }

  // =======================================
  // 14. detectTrendAlerts — nulls in values
  // =======================================
  console.log('%c 14. detectTrendAlerts \u2014 Null Values Filtered ', 'font-weight:bold;color:#f59e0b');

  const mockNulls = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15', '2024-09-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [null, 5.0, null, 6.5],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts9 = detectTrendAlerts(mockNulls);
  assert('Handles null-interspersed values', alerts9.length >= 0);
  // Only 2 non-null values: [5.0, 6.5], jump = 1.5 > 0.475 (25% of 1.9), latest 6.5 > 5.8 = sudden_high
  assert('Detects sudden high with interspersed nulls', alerts9.length === 1 && alerts9[0].concern === 'sudden_high',
    `got ${alerts9.length} alerts${alerts9[0] ? ', concern=' + alerts9[0].concern : ''}`);

  // =======================================
  // 15. detectTrendAlerts — R2 filter at 4+ points
  // =======================================
  console.log('%c 15. detectTrendAlerts \u2014 R\u00B2 Filter (4+ points) ', 'font-weight:bold;color:#f59e0b');

  // 4 points with very noisy data: high variance, low R2, should be filtered out
  const mockLowR2 = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15', '2024-09-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [5.5, 4.0, 6.0, 4.2],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts10 = detectTrendAlerts(mockLowR2);
  // Very noisy with no clear trend, no sudden jump > 25% of range (1.9) with out-of-range latest
  // The last two points: 6.0->4.2 jump=1.8 > 0.475 but 4.2 is within range: no sudden
  // Regression on 4 points: zig-zag, R2 should be very low, normSlope may be small
  assert('Noisy 4-point data filtered (no regression alert)', alerts10.length === 0, `got ${alerts10.length}`);

  // =======================================
  // 16. detectTrendAlerts — approaching_high
  // =======================================
  console.log('%c 16. detectTrendAlerts \u2014 Approaching High ', 'font-weight:bold;color:#f59e0b');

  // Rising trend, latest within 15% of refMax but not past it
  // Range = 1.9, 15% = 0.285. refMax - 0.285 = 5.515. Latest >= 5.515
  const mockApproachHigh = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [4.8, 5.2, 5.6],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts11 = detectTrendAlerts(mockApproachHigh);
  assert('Approaching high detected', alerts11.length === 1, `got ${alerts11.length}`);
  if (alerts11.length >= 1) {
    assert('Concern = approaching_high', alerts11[0].concern === 'approaching_high');
    assert('Direction = rising', alerts11[0].direction === 'rising');
  }

  // =======================================
  // 17. detectTrendAlerts — empty data
  // =======================================
  console.log('%c 17. detectTrendAlerts \u2014 Empty Data ', 'font-weight:bold;color:#f59e0b');

  const mockEmpty = { dates: [], categories: {} };
  const alerts12 = detectTrendAlerts(mockEmpty);
  assert('Empty data returns empty array', Array.isArray(alerts12) && alerts12.length === 0);

  // =======================================
  // 18. detectTrendAlerts — < 2 non-null points skipped
  // =======================================
  console.log('%c 18. detectTrendAlerts \u2014 Single Point Skipped ', 'font-weight:bold;color:#f59e0b');

  const mockOnePoint = {
    dates: ['2024-01-15'],
    categories: {
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          glucose: {
            name: 'Glucose', unit: 'mmol/L', values: [10.0],
            refMin: 3.9, refMax: 5.8, optimalMin: null, optimalMax: null
          }
        }
      }
    }
  };

  const alerts13 = detectTrendAlerts(mockOnePoint);
  assert('Single data point yields no alerts', alerts13.length === 0);

  // =======================================
  // 19. getKeyTrendMarkers — structure
  // =======================================
  console.log('%c 19. getKeyTrendMarkers \u2014 Structure ', 'font-weight:bold;color:#f59e0b');

  // Build mock data with some markers that have data
  const mockTrend = {
    dates: ['2024-01-15', '2024-03-15', '2024-06-15'],
    categories: {
      diabetes: {
        label: 'Diabetes', singlePoint: false,
        markers: {
          hba1c: { name: 'HbA1c', unit: '%', values: [5.2, 5.3, 5.4], refMin: 4.0, refMax: 5.6, optimalMin: null, optimalMax: null },
          homaIR: { name: 'HOMA-IR', unit: '', values: [1.0, 1.1, 1.2], refMin: 0, refMax: 2.5, optimalMin: null, optimalMax: null }
        }
      },
      lipids: {
        label: 'Lipids', singlePoint: false,
        markers: {
          ldl: { name: 'LDL', unit: 'mmol/L', values: [2.5, 2.6, 2.7], refMin: 0, refMax: 3.4, optimalMin: null, optimalMax: null }
        }
      },
      vitamins: {
        label: 'Vitamins', singlePoint: false,
        markers: {
          vitaminD: { name: 'Vitamin D', unit: 'nmol/L', values: [75, 80, 85], refMin: 75, refMax: 150, optimalMin: null, optimalMax: null }
        }
      },
      thyroid: {
        label: 'Thyroid', singlePoint: false,
        markers: {
          tsh: { name: 'TSH', unit: 'mIU/L', values: [2.0, 2.1, 2.2], refMin: 0.4, refMax: 4.0, optimalMin: null, optimalMax: null }
        }
      },
      proteins: {
        label: 'Proteins', singlePoint: false,
        markers: {
          hsCRP: { name: 'hs-CRP', unit: 'mg/L', values: [0.5, 0.6, 0.7], refMin: 0, refMax: 3.0, optimalMin: null, optimalMax: null }
        }
      },
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          ggt: { name: 'GGT', unit: 'U/L', values: [20, 22, 24], refMin: 5, refMax: 40, optimalMin: null, optimalMax: null }
        }
      },
      hematology: {
        label: 'Hematology', singlePoint: false,
        markers: {
          hemoglobin: { name: 'Hemoglobin', unit: 'g/L', values: [140, 142, 144], refMin: 130, refMax: 170, optimalMin: null, optimalMax: null }
        }
      }
    }
  };

  const trends1 = getKeyTrendMarkers(mockTrend);
  assert('Returns array', Array.isArray(trends1));
  assert('Max 8 markers', trends1.length <= 8, `got ${trends1.length}`);
  if (trends1.length > 0) {
    assert('Each item has cat property', trends1.every(t => typeof t.cat === 'string'));
    assert('Each item has key property', trends1.every(t => typeof t.key === 'string'));
  }

  // =======================================
  // 20. getKeyTrendMarkers — prioritizes alerts
  // =======================================
  console.log('%c 20. getKeyTrendMarkers \u2014 Alert Priority ', 'font-weight:bold;color:#f59e0b');

  // Build data where one marker has a clear alert (sudden_high)
  const mockAlertPriority = {
    dates: ['2024-01-15', '2024-06-15'],
    categories: {
      diabetes: {
        label: 'Diabetes', singlePoint: false,
        markers: {
          hba1c: { name: 'HbA1c', unit: '%', values: [5.2, 5.3], refMin: 4.0, refMax: 5.6, optimalMin: null, optimalMax: null },
          homaIR: { name: 'HOMA-IR', unit: '', values: [1.0, 1.1], refMin: 0, refMax: 2.5, optimalMin: null, optimalMax: null }
        }
      },
      lipids: {
        label: 'Lipids', singlePoint: false,
        markers: {
          // Large jump above refMax => sudden_high, should appear first
          ldl: { name: 'LDL', unit: 'mmol/L', values: [2.5, 4.5], refMin: 0, refMax: 3.4, optimalMin: null, optimalMax: null }
        }
      },
      vitamins: {
        label: 'Vitamins', singlePoint: false,
        markers: {
          vitaminD: { name: 'Vitamin D', unit: 'nmol/L', values: [80, 82], refMin: 75, refMax: 150, optimalMin: null, optimalMax: null }
        }
      },
      thyroid: {
        label: 'Thyroid', singlePoint: false,
        markers: {
          tsh: { name: 'TSH', unit: 'mIU/L', values: [2.0, 2.1], refMin: 0.4, refMax: 4.0, optimalMin: null, optimalMax: null }
        }
      },
      proteins: {
        label: 'Proteins', singlePoint: false,
        markers: {
          hsCRP: { name: 'hs-CRP', unit: 'mg/L', values: [0.5, 0.6], refMin: 0, refMax: 3.0, optimalMin: null, optimalMax: null }
        }
      },
      biochemistry: {
        label: 'Biochemistry', singlePoint: false,
        markers: {
          ggt: { name: 'GGT', unit: 'U/L', values: [20, 22], refMin: 5, refMax: 40, optimalMin: null, optimalMax: null }
        }
      },
      hematology: {
        label: 'Hematology', singlePoint: false,
        markers: {
          hemoglobin: { name: 'Hemoglobin', unit: 'g/L', values: [140, 142], refMin: 130, refMax: 170, optimalMin: null, optimalMax: null }
        }
      }
    }
  };

  const trends2 = getKeyTrendMarkers(mockAlertPriority);
  assert('Alert marker (LDL) appears in results', trends2.some(t => t.cat === 'lipids' && t.key === 'ldl'));
  if (trends2.length > 0) {
    assert('Alert marker (LDL) is first', trends2[0].cat === 'lipids' && trends2[0].key === 'ldl',
      `first was ${trends2[0].cat}.${trends2[0].key}`);
  }

  // =======================================
  // 21. getKeyTrendMarkers — fills with defaults
  // =======================================
  console.log('%c 21. getKeyTrendMarkers \u2014 Default Fallback ', 'font-weight:bold;color:#f59e0b');

  // No alerts, no flagged markers — should fill from sex-aware defaults
  assert('Fills up to 8 from defaults', trends1.length > 0, `got ${trends1.length}`);
  // Default markers for unset sex include hba1c, homaIR, ldl, vitaminD, tsh, hsCRP, ggt, hemoglobin
  const defaultKeys = trends1.map(t => t.cat + '.' + t.key);
  assert('Includes default marker hba1c', defaultKeys.includes('diabetes.hba1c'));
  assert('Includes default marker ldl', defaultKeys.includes('lipids.ldl'));

  // =======================================
  // 22. getKeyTrendMarkers — no duplicates
  // =======================================
  console.log('%c 22. getKeyTrendMarkers \u2014 No Duplicates ', 'font-weight:bold;color:#f59e0b');

  const ids2 = trends2.map(t => t.cat + '_' + t.key);
  const uniqueIds = new Set(ids2);
  assert('No duplicate markers', ids2.length === uniqueIds.size, `${ids2.length} total, ${uniqueIds.size} unique`);

  // =======================================
  // 23. Source code verification
  // =======================================
  console.log('%c 23. Source Code Checks ', 'font-weight:bold;color:#f59e0b');

  const dataSrc = read('js/data.js');
  assert('detectTrendAlerts exported', dataSrc.includes('export function detectTrendAlerts'));
  assert('getKeyTrendMarkers exported', dataSrc.includes('export function getKeyTrendMarkers'));
  assert('Uses linearRegression', dataSrc.includes('linearRegression('));
  assert('25% threshold for sudden change',
    dataSrc.includes('TREND_SUDDEN_JUMP_FRAC = 0.25') &&
    dataSrc.includes('range * TREND_SUDDEN_JUMP_FRAC'));
  assert('normSlope threshold 0.02',
    dataSrc.includes('TREND_MIN_NORM_SLOPE = 0.02') &&
    dataSrc.includes('Math.abs(normSlope) < TREND_MIN_NORM_SLOPE'));
  assert('R\u00B2 filter 0.5 for 4+ points',
    dataSrc.includes('TREND_MIN_R2 = 0.5') &&
    dataSrc.includes('reg.r2 < TREND_MIN_R2'));
  assert('Approaching zone 15%',
    dataSrc.includes('TREND_APPROACH_BAND = 0.15') &&
    dataSrc.includes('range * TREND_APPROACH_BAND'));
  assert('Sort by priority (sudden > past > approaching)', dataSrc.includes("c.startsWith('sudden_')"));
  assert('KEY_TRENDS_MAX = 8 in getKeyTrendMarkers',
    dataSrc.includes('KEY_TRENDS_MAX = 8') &&
    dataSrc.includes('MAX = KEY_TRENDS_MAX'));
  assert('detectTrendAlerts on window', dataSrc.includes('detectTrendAlerts'));
  assert('getKeyTrendMarkers on window', dataSrc.includes('getKeyTrendMarkers'));

  const utilsSrc = read('js/utils.js');
  assert('linearRegression exported', utilsSrc.includes('export function linearRegression'));
  assert('getStatus exported', utilsSrc.includes('export function getStatus'));
  assert('linearRegression handles denom=0', utilsSrc.includes('denom === 0'));

  const viewsSrc = read('js/views.js');
  const dashboardPageViewSrc = read('js/dashboard-page-view.js');
  const dashboardWidgetsSrc = read('js/dashboard-widgets.js');
  const dashboardControlsSrc = read('js/dashboard-widget-controls.js');
  const dashboardRenderersSrc = read('js/dashboard-widget-renderers.js');
  const lensPagesSrc = read('js/lens-pages.js');
  const routerSrc = read('js/views-router.js');
  assert('Marker Spotlight uses explicit priority scoring', dashboardRenderersSrc.includes('function scoreDashboardSpotlightHit') && dashboardRenderersSrc.includes('priorityScore'));
  assert('Marker Spotlight scores range distance', dashboardRenderersSrc.includes('getDashboardSpotlightRangeSignal') && dashboardRenderersSrc.includes('rangeSignal.outside'));
  assert('Marker Spotlight scores trend alert severity', dashboardRenderersSrc.includes('DASHBOARD_SPOTLIGHT_ALERT_SCORE') && dashboardRenderersSrc.includes('sudden_high: 90'));
  assert('Marker Spotlight no longer picks first trend alert directly', !dashboardRenderersSrc.includes('const firstAlert = ctx.trendAlerts?.[0]'));
  assert('Marker Spotlight renders priority reason', dashboardRenderersSrc.includes('db-spotlight-priority') && dashboardRenderersSrc.includes('priorityReason'));
  assert('Dashboard priority labels are user-facing, not numeric',
    dashboardRenderersSrc.includes('function getDashboardPriorityLabel') &&
    dashboardRenderersSrc.includes("'Needs attention'") &&
    dashboardRenderersSrc.includes("'Watch closely'") &&
    !dashboardRenderersSrc.includes('`Priority ${'));
  assert('Dashboard has dynamic Quick Markers widget',
    dashboardWidgetsSrc.includes("id: 'quick-markers'") &&
    dashboardRenderersSrc.includes('renderDashboardQuickMarkersWidget') &&
    !viewsSrc.includes("id: 'stat-vitd'"));
  assert('Quick Markers use priority scoring and avoid Spotlight duplication',
    dashboardRenderersSrc.includes('function scoreDashboardQuickMarkerHit') &&
    dashboardRenderersSrc.includes('const spotlightId = getDashboardSpotlight(ctx)?.id') &&
    dashboardRenderersSrc.includes('hit.id !== spotlightId'));
  assert('Quick Markers support per-profile pins and goal matches',
    dashboardRenderersSrc.includes('dashboardQuickMarkerPinsKey') &&
    dashboardRenderersSrc.includes('toggleDashboardQuickMarkerPin') &&
    dashboardRenderersSrc.includes('DASHBOARD_QUICK_MARKER_GOAL_RULES'));
  assert('Dashboard supports user-added single marker widgets',
    dashboardControlsSrc.includes('dashboardMarkerWidgetId') &&
    dashboardControlsSrc.includes('addDashboardMarkerWidget') &&
    dashboardRenderersSrc.includes('renderDashboardSingleMarkerWidget') &&
    dashboardControlsSrc.includes('dashboard-marker-widget-option'));
  assert('Dashboard widget insert uses viewport position',
    dashboardControlsSrc.includes('getDashboardViewportTargetWidgetId') &&
    dashboardControlsSrc.includes('insertDashboardWidgetAtViewport') &&
    dashboardControlsSrc.includes('scrollDashboardWidgetIntoView'));
  assert('Dashboard widget controls float without consuming widget layout space',
    dashboardControlsSrc.includes('renderDashboardStickyControls') &&
    dashboardCssSrc.includes('.dashboard-sticky-actions') &&
    dashboardCssSrc.includes('position: fixed'));
  assert('Dashboard no longer duplicates top and sticky widget controls',
    !viewsSrc.includes('class="dashboard-actions"') &&
    dashboardCssSrc.includes('width: max-content'));
  assert('Dashboard default widget sizes avoid half-plus-third grid gaps',
    /id: 'focus'[\s\S]*?size: 'half'/.test(dashboardWidgetsSrc) &&
    /id: 'insights'[\s\S]*?size: 'half'/.test(dashboardWidgetsSrc));
  assert('Dashboard does not expose duplicate All Biomarkers widget',
    !dashboardWidgetsSrc.includes("title: 'All Biomarkers'") &&
    !viewsSrc.includes("title: 'All Biomarkers'") &&
    !viewsSrc.includes('renderDashboardMarkerListWidget') &&
    !dashboardCssSrc.includes('.db-marker-row'));
  const keyTrendsWidgetBlock = (dashboardRenderersSrc.match(/function renderDashboardKeyTrendsWidget\(ctx\) \{([\s\S]*?)\n\}/) || [null, ''])[1];
  assert('Dashboard Key Trends uses compact rows instead of duplicate chart cards',
    dashboardRenderersSrc.includes('function renderDashboardKeyTrendRow') &&
    keyTrendsWidgetBlock.includes('db-key-trend-list') &&
    !keyTrendsWidgetBlock.includes('renderChartCard') &&
    !keyTrendsWidgetBlock.includes('renderChartLayersDropdown') &&
    dashboardCssSrc.includes('.db-key-trend-row'));
  assert('Current Priority is the user-facing spotlight label',
    dashboardWidgetsSrc.includes("id: 'spotlight'") &&
    dashboardWidgetsSrc.includes("title: 'Current Priority'") &&
    dashboardRenderersSrc.includes('renderLabsPriorityBanner') &&
    dashboardCssSrc.includes('.labs-priority-banner'));
  const labsWidgetsBlock = (lensPagesSrc.match(/renderLensPageWidgets\('labs', \[([\s\S]*?)\]\);/) || [null, ''])[1];
  assert('Labs page demotes standalone alerts and full spotlight sections',
    labsWidgetsBlock.includes("id: 'quick-markers'") &&
    labsWidgetsBlock.includes("id: 'key-trends'") &&
    !labsWidgetsBlock.includes("id: 'alerts'") &&
    !labsWidgetsBlock.includes("id: 'spotlight'") &&
    lensPagesSrc.includes('renderLabsPriorityBanner(ctx)'));
  const dashboardDefaultOrderBlock = (dashboardWidgetsSrc.match(/const DASHBOARD_WIDGET_DEFAULT_IDS = \[([\s\S]*?)\];/) || [null, ''])[1];
  const dashboardWidgetsBlock = (dashboardWidgetsSrc.match(/const dashboardWidgets = \[([\s\S]*?)\];/) || [null, ''])[1];
  const dashboardDefaultOrder = [...dashboardDefaultOrderBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert('Dashboard default order prioritizes female cycle context and evidence',
    JSON.stringify(dashboardDefaultOrder) === JSON.stringify([
      'focus',
      'cycle',
      'spotlight',
      'quick-markers',
      'key-trends',
      'recommendations',
      'profile-context',
      'wearables',
      'bio-age',
    ]) &&
    !dashboardDefaultOrderBlock.includes("'light-today'") &&
    !dashboardDefaultOrderBlock.includes("'alerts'") &&
    !dashboardDefaultOrderBlock.includes("'markers'") &&
    !dashboardDefaultOrderBlock.includes("'genome'") &&
    !dashboardDefaultOrderBlock.includes("'correlation'") &&
    !dashboardDefaultOrderBlock.includes("'supplements'") &&
    !dashboardDefaultOrderBlock.includes("'light-conditions-now'") &&
    !dashboardDefaultOrderBlock.includes("'light-session-log'") &&
    !dashboardDefaultOrderBlock.includes("'light-channels'"));
  assert('Dashboard exposes dashboard-safe Light widgets without page-only Light workspaces',
    dashboardWidgetsBlock.includes("id: 'light-conditions-now'") &&
    dashboardWidgetsBlock.includes("id: 'light-session-log'") &&
    dashboardWidgetsBlock.includes("id: 'light-channels'") &&
    !dashboardWidgetsBlock.includes("id: 'light-setup'") &&
    !dashboardWidgetsBlock.includes("id: 'light-guidance'") &&
    !dashboardWidgetsBlock.includes("id: 'light-sessions'") &&
    !dashboardWidgetsBlock.includes("id: 'light-devices'") &&
    !dashboardWidgetsBlock.includes("id: 'light-environment'") &&
    !dashboardWidgetsBlock.includes("id: 'light-tools'") &&
    !dashboardWidgetsBlock.includes("id: 'light-methods'"));
  assert('Genome dashboard widget copy describes modifiers, not import management',
    dashboardWidgetsSrc.includes("id: 'genome'") &&
    dashboardWidgetsSrc.includes("title: 'Genetic Modifiers'") &&
    dashboardWidgetsSrc.includes("description: 'Actionable SNP context relevant to labs and goals'"));
  assert('Dashboard adds biometrics inside the Biometrics Overview widget',
    dashboardControlsSrc.includes('dashboardBiometricSelectionKey') &&
    dashboardControlsSrc.includes('addDashboardBiometricMetric') &&
    dashboardControlsSrc.includes('removeDashboardBiometricMetric') &&
    dashboardWidgetsSrc.includes("'wearables',") &&
    dashboardControlsSrc.includes('Add to Biometrics Overview') &&
    !viewsSrc.includes("`biometric_${") &&
    !dashboardControlsSrc.includes("`biometric_${") &&
    !dashboardRenderersSrc.includes("`biometric_${"));
  assert('Dashboard treats biometric summaries as dashboard data',
    dashboardPageViewSrc.includes('const hasWearableData = Object.values(wearableMetrics).some') &&
    dashboardPageViewSrc.includes('data.dates.length > 0 || hasWearableData'));
  assert('Dashboard removes separate Wearable Connections widget',
    dashboardWidgetsSrc.includes("title: 'Biometrics Overview'") &&
    !dashboardWidgetsSrc.includes("title: 'Wearable Connections'") &&
    !viewsSrc.includes("title: 'Wearable Connections'") &&
    !viewsSrc.includes("renderWearableStrip"));
  assert('Dashboard biometric sync button only appears for stale data',
    dashboardRenderersSrc.includes('getDashboardBiometricSyncState') &&
    dashboardRenderersSrc.includes('DASHBOARD_BIOMETRIC_STALE_MS') &&
    dashboardRenderersSrc.includes("syncState.showSync ? `<button"));
  assert('Cycle widget is gated to female profiles',
    dashboardWidgetsSrc.includes("id: 'cycle'") &&
    dashboardWidgetsSrc.includes("isAvailable: () => state.profileSex === 'female'"));
  assert('AI Lens is not a dashboard widget',
    !dashboardWidgetsSrc.includes("id: 'lens', title: 'AI Lens'"));
  assert('Recommendations are a first-class route and dashboard widget',
    viewsSrc.includes('showRecommendations') &&
    routerSrc.includes('routeCategory === "recommendations"') &&
    dashboardWidgetsSrc.includes("id: 'recommendations'") &&
    lensPagesSrc.includes('showRecommendations') &&
    dashboardRenderersSrc.includes('renderDashboardRecommendationsWidget') &&
    dashboardControlsSrc.includes('DASHBOARD_WIDGET_SOURCE_ORDER'));

  // =======================================
  // Summary
  // =======================================
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
