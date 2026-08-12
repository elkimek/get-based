// @ts-check
// Stable built-in thyroid marker category.

export const THYROID_CATEGORY = {
  label: "Thyroid", icon: "\uD83E\uDD8B",
  markers: {
    tsh: { name: "TSH", unit: "mU/l", refMin: 0.270, refMax: 4.200, desc: "Thyroid-stimulating hormone from the pituitary; the primary screening test for thyroid dysfunction (hypo- or hyperthyroidism)." },
    ft4: { name: "Free T4", unit: "pmol/l", refMin: 11.9, refMax: 21.6, desc: "The unbound, active form of thyroxine; reflects actual thyroid hormone available to tissues for metabolism regulation." },
    ft3: { name: "Free T3", unit: "pmol/l", refMin: 3.1, refMax: 6.8, desc: "The most metabolically active thyroid hormone; low levels despite normal T4 may indicate poor T4-to-T3 conversion." },
    t4total: { name: "Total T4", unit: "nmol/l", refMin: 66.0, refMax: 181.0, desc: "Total thyroxine including protein-bound fraction; affected by binding protein levels, making free T4 more reliable." },
    t3total: { name: "Total T3", unit: "nmol/l", refMin: 1.30, refMax: 3.10, desc: "Total triiodothyronine including bound fraction; useful for diagnosing hyperthyroidism when free T3 is unavailable." },
    reverseT3: { name: "Reverse T3", unit: "nmol/l", refMin: null, refMax: 0.54, desc: "Inactive T3 isomer that can rise with illness, fasting, or stress; optional context for T4-to-T3 conversion." },
    tpoAb: { name: "TPO antibodies", unit: "kU/l", refMin: 0, refMax: 34, desc: "Thyroid peroxidase antibodies; elevated values support autoimmune thyroiditis context." },
    tgAb: { name: "Thyroglobulin antibodies", unit: "kU/l", refMin: 0, refMax: 115, desc: "Thyroglobulin antibodies; elevated values support autoimmune thyroid context and can interfere with thyroglobulin measurement." },
    trab: { name: "TSH Receptor Antibodies (TRAb)", unit: "IU/l", refMin: 0, refMax: 1.75, desc: "Antibodies targeting the TSH receptor; used mainly in Graves disease assessment, with cutoffs varying by assay." },
    thyroglobulin: { name: "Thyroglobulin", unit: "\u00b5g/l", refMin: 0, refMax: 33, desc: "Protein produced by thyroid tissue and used chiefly in differentiated thyroid-cancer follow-up. This interval applies only with an intact thyroid; post-thyroidectomy targets depend on residual tissue, TSH, assay, and thyroglobulin antibodies." }
  }
};
