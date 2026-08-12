// @ts-check
// Stable built-in cardiac marker category.

export const CARDIAC_CATEGORY = {
  label: "Cardiac Markers", icon: "\u2764\uFE0F",
  markers: {
    hsTroponinT: { name: "High-Sensitivity Troponin T", unit: "ng/l", refMin: 0, refMax: 15, refMax_f: 10, desc: "Cardiac-injury marker interpreted with symptoms and serial change; the 99th-percentile limit is sex- and assay-specific." },
    hsTroponinI: { name: "High-Sensitivity Troponin I", unit: "ng/l", refMin: 0, refMax: 20, refMin_f: 0, refMax_f: 15, desc: "Cardiac-injury marker interpreted with symptoms and serial change; this assay-specific adult 99th-percentile limit is sex-specific, and the reporting laboratory's assay limit takes priority." },
    bnp: { name: "BNP", unit: "ng/l", refMin: 0, refMax: 35, refMin_f: 0, refMax_f: 64, desc: "Natriuretic peptide released with cardiac wall stress. These representative healthy-adult limits apply through age 45; limits rise with age, and interpretation also depends on kidney function, rhythm, body composition, and clinical setting." },
    ntProBnp: { name: "NT-proBNP", unit: "ng/l", refMin: 0, refMax: 88, refMin_f: 0, refMax_f: 226, desc: "Inactive natriuretic-peptide fragment used in heart-failure assessment. These broad adult limits cover ages 19\u201364; the healthy-reference limit rises to 540 ng/l from age 65, while acute diagnostic thresholds are different." }
  }
};
