// @ts-check
// Stable built-in bone density marker category.

export const BONE_DENSITY_CATEGORY = {
  label: "Bone Density", icon: "\uD83D\uDCC9", group: "DEXA",
  markers: {
    bmdSpine: { name: "BMD Spine L1\u2013L4", unit: "g/cm\u00b2", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Bone mineral density of the lumbar spine. Raw BMD has no universal device-independent interval; interpret it through the report's normative database, T/Z scores, and serial change." },
    bmdFemurTotal: { name: "BMD Femur Total", unit: "g/cm\u00b2", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Bone mineral density of the total proximal femur. Raw BMD has no universal device-independent interval; interpret it through the report's normative database, T/Z scores, and serial change." },
    bmdFemurNeck: { name: "BMD Femur Neck", unit: "g/cm\u00b2", refMin: null, refMax: null, rangePolicy: "contextual", desc: "Bone mineral density of the femoral neck. Raw BMD has no universal device-independent interval; interpret it through the report's normative database, T/Z scores, and serial change." },
    tScoreSpine: { name: "T-score Spine", unit: "", refMin: -1.0, refMax: null, desc: "Standard deviations from peak young-adult bone density at the spine; WHO criteria: above \u22121 normal, \u22121 to \u22122.5 osteopenia, below \u22122.5 osteoporosis." },
    tScoreFemurTotal: { name: "T-score Femur Total", unit: "", refMin: -1.0, refMax: null, desc: "Standard deviations from peak young-adult bone density at the total proximal femur; used alongside femoral neck for hip fracture risk assessment." },
    tScoreFemurNeck: { name: "T-score Femur Neck", unit: "", refMin: -1.0, refMax: null, desc: "Standard deviations from peak young-adult bone density at the femoral neck; the WHO-preferred diagnostic site for osteoporosis in postmenopausal women and men over 50." },
    zScoreSpine: { name: "Z-score Spine", unit: "", refMin: -2.0, refMax: null, desc: "Standard deviations from age-matched bone density at the spine; used for premenopausal women and men under 50. Below \u22122.0 indicates low bone density for age." },
    zScoreFemurTotal: { name: "Z-score Femur Total", unit: "", refMin: -2.0, refMax: null, desc: "Standard deviations from age-matched bone density at the total proximal femur; values below \u22122.0 warrant investigation for secondary causes of bone loss." },
    zScoreFemurNeck: { name: "Z-score Femur Neck", unit: "", refMin: -2.0, refMax: null, desc: "Standard deviations from age-matched bone density at the femoral neck; values below \u22122.0 at the WHO diagnostic site require clinical evaluation." }
  }
};
