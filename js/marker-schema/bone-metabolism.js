// @ts-check
// Stable built-in bone metabolism marker category.

export const BONE_METABOLISM_CATEGORY = {
  label: "Bone Metabolism", icon: "\uD83E\uDDB4",
  markers: {
    osteocalcin: { name: "Osteocalcin", unit: "\u00b5g/l", refMin: 14.0, refMax: 42.0, desc: "A protein secreted by bone-forming cells; reflects bone turnover rate and also influences glucose metabolism." },
    p1np: { name: "P1NP", unit: "\u00b5g/l", refMin: 22, refMax: 87, refMin_f: 16, refMax_f: 96, desc: "Procollagen type I N-terminal propeptide, a bone-formation marker used to assess turnover and monitor osteoporosis treatment. The female interval spans pre- and postmenopausal adult ranges; assay and treatment-related change remain important." },
    ctx: { name: "Beta-CTX", unit: "ng/l", refMin: 118, refMax: 1019, refMin_f: 131, refMax_f: 1060, desc: "C-terminal telopeptide of type I collagen, a bone-resorption marker. These broad adult limits span age bands; fasting status, collection time, kidney function, age, sex, and change from baseline are important." }
  }
};
