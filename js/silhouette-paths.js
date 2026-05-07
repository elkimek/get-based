// silhouette-paths.js — figure-study silhouettes for the sun-session picker.
//
// AESTHETIC: Pompeii fresco × Klimt golden line × app-modern.
//
// Each figure is built from a list of CLOCKWISE waypoints — anatomical
// landmarks at exact (x, y) coordinates — and a Catmull-Rom-to-Bezier
// converter that smoothly interpolates curves through them. This means:
//
//   • The silhouette HITS every anatomical x at every anatomical y
//     (so waist actually narrows, bust actually bulges, etc.)
//   • One closed continuous outline per figure — arms integrated into
//     the body trace via "into-armpit" waypoints
//   • Sex-specific anatomy is in the WAYPOINT DATA, not in path math
//
// Waypoint convention: ordered clockwise starting from the top of the head.
// Right side of body first (from viewer's perspective the FIGURE'S right is
// the LEFT side of the SVG), then around feet, then left side back to head.
//
// For each (sex, view) pair we additionally render:
//   • Landmarks: thin stroke detail lines (collarbone, sternum, navel,
//     spine, scapulae, calf split) — character without clinical-ness
//   • Details: small filled accents (nipples, mons, penis, glutes)
//
// API:
//   buildBody(sex, view)      → { d }
//   buildLandmarks(sex, view) → string[]
//   buildDetails(sex, view)   → string[]
//
// Legacy:
//   MALE_BODY_PATH / FEMALE_BODY_PATH (front view canonical)
//   SILHOUETTE_NATIVE — viewBox dimensions
//   buildBodyParts(sex)

// Catmull-Rom-to-Bezier path builder.
//
// Given an array of waypoints [[x, y], ...] (clockwise, closed implicit),
// emits a single closed Bezier path that passes through every waypoint
// with tangent continuity. Tension controls curve tightness — 0.5 reads
// as natural-figure-drawing, lower for tighter bends, higher for swoopier.
function smoothPath(waypoints, tension = 0.5) {
  const n = waypoints.length;
  if (n < 2) return '';
  const t = tension / 6;
  const out = [`M ${waypoints[0][0]} ${waypoints[0][1]}`];
  for (let i = 0; i < n; i++) {
    const p0 = waypoints[(i - 1 + n) % n];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % n];
    const p3 = waypoints[(i + 2) % n];
    const cp1x = (p1[0] + (p2[0] - p0[0]) * t * 1).toFixed(2);
    const cp1y = (p1[1] + (p2[1] - p0[1]) * t * 1).toFixed(2);
    const cp2x = (p2[0] - (p3[0] - p1[0]) * t * 1).toFixed(2);
    const cp2y = (p2[1] - (p3[1] - p1[1]) * t * 1).toFixed(2);
    out.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`);
  }
  out.push('Z');
  return out.join(' ');
}

const D = (raw) => raw.replace(/\s+/g, ' ').trim();

// ─── Female front waypoints ──────────────────────────────────────────────
//
// Clockwise from crown: right side down (head, neck, shoulder, outer arm,
// wrist, inner arm to armpit), right side of torso (rib, BUST APEX,
// underbust, waist, hip), right outer leg, foot, right inner leg up to
// crotch, mirror left side back to crown.
const FEMALE_FRONT_WAYPOINTS = [
  // — head right side
  [50,    4],
  [56,    7],
  [58,   13],
  [57.5, 19],
  [55.5, 24],
  [54,   26],     // jaw
  [52,   28],     // chin tuck
  [52,   31],     // upper neck
  [52.5, 33.5],   // base of neck
  // — right shoulder slope
  [56,   34.8],
  [62,   36],
  [66,   37.5],
  [69,   39],     // shoulder cap
  // — outer right arm down
  [70,   42],     // deltoid peak
  [70.5, 47],
  [69.5, 56],
  [68.5, 67],
  [67.5, 80],
  [66,   95],
  [64,  108],
  [63,  116],
  // — wrist arc
  [62.5,121],
  [61,  122.5],   // hand tip
  [59.5,121],
  [58.5,118],
  // — inner right arm up
  [58.5,108],
  [58.5, 95],
  [58.5, 80],
  [59,   67],
  [59,   58],
  [58.5, 51],
  // — into armpit and right side of torso
  [56.5, 47],     // armpit point
  [57,   50],
  [60.5, 54],     // shoulder of bust
  [65,   59],     // BUST APEX outer
  [65.5, 64],
  [62,   72],     // underbust
  [58.5, 80],
  [55,   86],
  [54,   90],     // WAIST cinch
  [56,   97],
  [62,  108],     // iliac flare begins
  [66,  114],     // hip outer
  [66.5,120],
  [66,  130],
  // — right outer leg
  [64,  144],
  [60,  158],
  [56,  170],     // outer knee
  [55,  178],
  [54,  188],
  [52.5,198],     // outer ankle
  [53,  204],
  [54,  207],     // outer toe corner
  [50,  207.5],   // foot bottom mid
  // — back up inner foot/leg
  [47.5,207],
  [47.5,202],     // inner foot edge
  [48,  198],     // inner ankle
  [48.5,188],
  [49,  178],
  [49.2,170],     // inner knee
  [49.4,158],
  [49.6,145],
  [49.8,135],     // crotch right
  // — crotch line
  [50.2,135],
  // — left inner leg DOWN (mirror)
  [50.4,145],
  [50.6,158],
  [50.8,170],
  [51,  178],
  [51.5,188],
  [52,  198],
  [52.5,202],
  [52.5,207],
  // — back across foot
  [50,  207.5],   // (already shared, but acts as continuation)
  // — left foot/leg up (mirror)
  [46,  207],
  [45,  204],
  [45.5,198],
  [46,  188],
  [47,  178],
  [48,  170],
  [49,  158],
  [51,  144],
  [53.5,130],
  [53.5,120],
  [54,  114],
  [38,  108],
  [44,   97],
  [46,   90],
  [45,   86],
  [41.5, 80],
  [38,   72],
  [34.5, 64],
  [35,   59],
  [39.5, 54],
  [43,   50],
  [43.5, 47],
  [41.5, 51],
  [41,   58],
  [41,   67],
  [41,   80],
  [41.5, 95],
  [41.5,108],
  [41.5,118],
  [40.5,121],
  [39,  122.5],
  [37.5,121],
  [37,  116],
  [36,  108],
  [34,   95],
  [32.5, 80],
  [31.5, 67],
  [30.5, 56],
  [29.5, 47],
  [30,   42],
  [31,   39],
  [34,   37.5],
  [38,   36],
  [44,   34.8],
  [47.5, 33.5],
  [48,   31],
  [48,   28],
  [46,   26],
  [44.5, 24],
  [42.5, 19],
  [42,   13],
  [44,    7],
];

// Hmm — the closed-loop Catmull-Rom on a *huge* waypoint array with
// asymmetric counts on left and right is fragile. Re-author with a
// cleaner mirrored structure: define the right side, then mirror to the
// left side automatically via the mirrorAndClose helper.
function mirrorAndClose(rightSide, opts = {}) {
  // rightSide: waypoints from crown down right side to crotch-right,
  //            INCLUDING crotch midpoint as last element if you want.
  // Returns full closed waypoint loop with left side mirrored across cx=50.
  const cx = opts.cx ?? 50;
  const out = [...rightSide];
  // Mirror in reverse, skipping the final element if it's on the centerline
  // (avoids duplicating the crotch midpoint).
  for (let i = rightSide.length - 1; i >= 0; i--) {
    const [x, y] = rightSide[i];
    if (Math.abs(x - cx) < 0.01 && i === rightSide.length - 1) continue;
    out.push([2 * cx - x, y]);
  }
  return out;
}

// Right-side waypoint convention: clockwise starting from crown, going DOWN
// the right side of the figure (head → arm → body → outer leg → outer foot
// → foot bottom right corner → inner foot/leg UP → crotch). This produces
// a single closed loop after mirroring that has the legs as separate
// shapes meeting at the crotch cleft (proper figure topology).

// — Female front, right-side waypoints
const FF_RIGHT = [
  [50,    4],     // crown
  [56,    7],
  [58,   13],
  [57.5, 19],
  [55.5, 24],
  [54,   26],
  [52.5, 27.5],
  [52.5, 31],
  [52.5, 33.5],   // base of neck
  [56,   34.8],
  [62,   36],
  [67,   37.5],
  [70,   39],     // shoulder cap (wider)
  [71.5, 43],     // deltoid peak (more outward)
  [71,   49],     // bicep
  [69,   60],     // upper arm
  [67,   75],     // mid arm
  [65,   90],     // elbow
  [63,  103],     // forearm
  [61.5,114],     // wrist outer
  [61,   119],    // wrist
  [59.5, 122],    // hand tip
  [58,   121],    // inner wrist
  [57.5, 117],
  [57.8, 105],    // inner forearm
  [58,    92],
  [58.2,  78],    // inner upper arm
  [58.5,  65],
  [58.5,  56],
  [58,    50],
    [56,    47],    // armpit
  [56.5,  50],
  [60.5,  54],    // upper bust
  [67,    60],    // BUST APEX (more pronounced)
  [67,    66],
  [63,    74],    // underbust
  [58.5,  82],
  [55,    87],
  [53.5,  90],    // WAIST (cinched)
  [54.5,  96],
  [60,   106],
  [66,   113],
  [67,   118],
  [66.5, 130],
  [64.5, 145],
  [60,   160],
  [56,   172],    // outer knee
  [56.5, 180],    // calf bulge
  [55,   190],
  [53.5, 200],    // outer ankle
  [54.5, 206],    // outer foot
  [56,   208],    // outer toe
  [50.5, 208],    // foot bottom inner
  [50.5, 202],    // inner ankle
  [51,   192],
  [51,   182],
  [51,   172],    // inner knee
  [50.8, 160],
  [50.5, 145],
  [50,   135],    // crotch
];

// — Female back: same envelope but smoother torso (no bust apex)
const FB_RIGHT = [
  [50,    4],
  [56,    7],
  [58,   13],
  [57.5, 19],
  [55.5, 24],
  [54,   26],
  [52.5, 27.5],
  [52.5, 31],
  [52.5, 33.5],
  [56,   34.8],
  [62,   36],
  [67,   37.5],
  [70,   39],
  [71.5, 43],
  [71,   49],
  [69,   60],
  [67,   75],
  [65,   90],
  [63,  103],
  [61.5,114],
  [61,   119],
  [59.5, 122],
  [58,   121],
  [57.5, 117],
  [57.8, 105],
  [58,    92],
  [58.2,  78],
  [58.5,  65],
  [58.5,  56],
  [58,    50],
  [56,    47],
  [57,    55],
  [58.5,  66],   // smoother — no bust bulge
  [58.5,  76],
  [56.5,  84],
  [54,    89],
  [53,    90],   // WAIST
  [54.5,  96],
  [60,   106],
  [66,   113],
  [67,   118],
  [66.5, 130],
  [64.5, 145],
  [60,   160],
  [56,   172],
  [56.5, 180],
  [55,   190],
  [53.5, 200],
  [54.5, 206],
  [56,   208],
  [50.5, 208],
  [50.5, 202],
  [51,   192],
  [51,   182],
  [51,   172],
  [50.8, 160],
  [50.5, 145],
  [50,   135],
];

// — Male front: V-shape, no bust bulge, broader shoulders, narrower hips
const MF_RIGHT = [
  [50,    4],
  [57,    7],
  [59,   13],
  [58.5, 19],
  [56.5, 24],
  [54.5, 26],
  [53,   27.5],
  [53,   31],
  [53,   33.5],
  [58,   34.5],
  [65,   35.8],
  [70,   37.5],
  [74,   39],     // shoulder cap (much wider for male)
  [76,   43],     // deltoid peak
  [75.5, 50],
  [73.5, 60],     // bicep
  [71,   75],     // mid arm
  [69,   90],     // elbow
  [67,  103],     // forearm
  [65.5,114],     // wrist outer
  [65,  119],
  [63,  122],     // hand tip
  [61.5,121],     // inner wrist
  [61,  117],
  [61,  105],
  [60.5, 92],
  [60.5, 78],
  [61,   65],
  [61,   56],
  [60.5, 50],
  [58,   47],     // armpit
  [59,   54],     // upper pec
  [63.5, 60],     // pec outer
  [64.5, 68],
  [63,   78],
  [61.5, 86],
  [60.5, 92],     // waist (less cinched than female)
  [60.5, 100],
  [62,  108],
  [63,  114],     // hip
  [63,  120],
  [63,  130],
  [61,  145],
  [58.5,160],
  [56,  172],     // outer knee
  [56.5,180],     // calf bulge
  [55,  190],
  [53.5,200],     // outer ankle
  [54.5,206],     // outer foot
  [56,  208],     // outer toe
  [50.5,208],     // foot bottom inner (close to cx for foot meet)
  [50.5,202],     // inner ankle
  [51,  192],
  [51,  182],
  [51,  172],     // inner knee
  [50.8,160],
  [50.5,145],
  [50,  135],     // crotch
];

// — Male back: V-shape, smoother torso
const MB_RIGHT = [
  [50,    4],
  [57,    7],
  [59,   13],
  [58.5, 19],
  [56.5, 24],
  [54.5, 26],
  [53,   27.5],
  [53,   31],
  [53,   33.5],
  [58,   34.5],
  [65,   35.8],
  [70,   37.5],
  [74,   39],
  [76,   43],
  [75.5, 50],
  [73.5, 60],
  [71,   75],
  [69,   90],
  [67,  103],
  [65.5,114],
  [65,  119],
  [63,  122],
  [61.5,121],
  [61,  117],
  [61,  105],
  [60.5, 92],
  [60.5, 78],
  [61,   65],
  [61,   56],
  [60.5, 50],
  [58,   47],
  [59,   55],
  [62,   65],     // smoother back (no pec line)
  [62,   75],
  [60.5, 84],
  [60.5, 92],
  [60.5,100],
  [62,  108],
  [63,  114],
  [63,  120],
  [63,  130],
  [61,  145],
  [58.5,160],
  [56,  172],
  [56.5,180],
  [55,  190],
  [53.5,200],
  [54.5,206],
  [56,  208],
  [50.5,208],
  [50.5,202],
  [51,  192],
  [51,  182],
  [51,  172],
  [50.8,160],
  [50.5,145],
  [50,  135],
];

// Build complete closed waypoint loops by mirroring.
function buildClosedLoop(rightSide) {
  return mirrorAndClose(rightSide);
}

const FEMALE_FRONT_BODY = smoothPath(buildClosedLoop(FF_RIGHT), 0.4);
const FEMALE_BACK_BODY  = smoothPath(buildClosedLoop(FB_RIGHT), 0.4);
const MALE_FRONT_BODY   = smoothPath(buildClosedLoop(MF_RIGHT), 0.4);
const MALE_BACK_BODY    = smoothPath(buildClosedLoop(MB_RIGHT), 0.4);

// ─── Landmarks ────────────────────────────────────────────────────────────

const FEMALE_FRONT_LANDMARKS = [
  // Clavicle — soft V from neck to shoulders.
  D(`M 45 34 C 47.5 34.8, 50 35, 52.5 35 C 55 35, 57.5 34.8, 60 34`),
  // Sternum — central vertical between breasts.
  D(`M 50 36 L 50 50`),
  // Right breast under-curve.
  D(`M 56 56 C 58 60, 61 64, 64 67`),
  // Left breast under-curve.
  D(`M 44 56 C 42 60, 39 64, 36 67`),
  // Diaphragm/upper-abdomen vertical.
  D(`M 50 70 L 50 100`),
  // Navel.
  D(`M 49 100 Q 50 102, 51 100`),
  // Iliac line.
  D(`M 47 113 Q 50 114.5, 53 113`),
  // Knee dimple right.
  D(`M 53 168 L 54 173`),
  // Knee dimple left.
  D(`M 47 168 L 46 173`),
];

const FEMALE_FRONT_DETAILS = [
  // Right nipple.
  D(`M 60 58 a 0.7 0.7 0 1 0 1.4 0 a 0.7 0.7 0 1 0 -1.4 0`),
  // Left nipple.
  D(`M 38.6 58 a 0.7 0.7 0 1 0 1.4 0 a 0.7 0.7 0 1 0 -1.4 0`),
  // Mons pubis — soft inverted teardrop.
  D(`M 46 124 C 45.5 128, 47 132, 50 134 C 53 132, 54.5 128, 54 124 C 52 122, 48 122, 46 124 Z`),
];

const FEMALE_BACK_LANDMARKS = [
  // Spine.
  D(`M 50 33.5 C 50 60, 50 90, 50 122`),
  // Right scapula.
  D(`M 56 42 C 58 48, 59 54, 57 60`),
  // Left scapula.
  D(`M 44 42 C 42 48, 41 54, 43 60`),
  // Sacral dimples.
  D(`M 47.5 117 Q 48.5 118, 49.5 117`),
  D(`M 50.5 117 Q 51.5 118, 52.5 117`),
  // Knee crease right.
  D(`M 54 168 Q 55 169, 56 168`),
  // Knee crease left.
  D(`M 44 168 Q 45 169, 46 168`),
  // Calf split right.
  D(`M 55 178 C 55.5 188, 55 196, 54 200`),
  // Calf split left.
  D(`M 45 178 C 44.5 188, 45 196, 46 200`),
];

const FEMALE_BACK_DETAILS = [
  // Gluteal globes.
  D(`M 41 122 C 41 130, 44 138, 49 138 C 49.5 134, 49.5 128, 49.5 124 C 47 120, 43 120, 41 122 Z`),
  D(`M 59 122 C 59 130, 56 138, 51 138 C 50.5 134, 50.5 128, 50.5 124 C 53 120, 57 120, 59 122 Z`),
];

const MALE_FRONT_LANDMARKS = [
  // Clavicle.
  D(`M 45 34 C 47.5 34.8, 50 35, 52.5 35 C 55 35, 57.5 34.8, 60 34`),
  // Sternum.
  D(`M 50 36 L 50 56`),
  // Right pec lower line.
  D(`M 50 56 C 54 58, 58 58, 62 55`),
  // Left pec lower line.
  D(`M 50 56 C 46 58, 42 58, 38 55`),
  // Linea alba.
  D(`M 50 60 L 50 100`),
  // Abdominal segments.
  D(`M 47 70 Q 50 71, 53 70`),
  D(`M 47 80 Q 50 81, 53 80`),
  D(`M 47 90 Q 50 91, 53 90`),
  // Navel.
  D(`M 49 100 Q 50 102, 51 100`),
  // Iliac V.
  D(`M 43 115 C 46 120, 49 124, 50 126`),
  D(`M 57 115 C 54 120, 51 124, 50 126`),
  // Knee dimples.
  D(`M 53 168 L 54 173`),
  D(`M 47 168 L 46 173`),
];

const MALE_FRONT_DETAILS = [
  // Right nipple.
  D(`M 60 56 a 0.6 0.6 0 1 0 1.2 0 a 0.6 0.6 0 1 0 -1.2 0`),
  // Left nipple.
  D(`M 38.8 56 a 0.6 0.6 0 1 0 1.2 0 a 0.6 0.6 0 1 0 -1.2 0`),
  // Genitals.
  D(`
    M 47.5 124
    C 47 126, 46.6 128.5, 46.8 131
    C 47.2 133, 48 134.5, 49 134.6
    L 49 138
    L 51 138
    L 51 134.6
    C 52 134.5, 52.8 133, 53.2 131
    C 53.4 128.5, 53 126, 52.5 124
    C 51 122.5, 49 122.5, 47.5 124 Z
  `),
];

const MALE_BACK_LANDMARKS = [
  D(`M 50 33 C 50 60, 50 90, 50 122`),
  D(`M 54 36 C 58 38, 62 42, 64 47`),
  D(`M 46 36 C 42 38, 38 42, 36 47`),
  D(`M 56 44 C 59 50, 60 56, 58 62`),
  D(`M 44 44 C 41 50, 40 56, 42 62`),
  D(`M 64 64 C 64 72, 62 80, 60 86`),
  D(`M 36 64 C 36 72, 38 80, 40 86`),
  D(`M 47.5 117 Q 48.5 118, 49.5 117`),
  D(`M 50.5 117 Q 51.5 118, 52.5 117`),
  D(`M 53 168 Q 54 169, 55 168`),
  D(`M 45 168 Q 46 169, 47 168`),
  D(`M 54 178 C 54.5 188, 54 196, 53 200`),
  D(`M 46 178 C 45.5 188, 46 196, 47 200`),
];

const MALE_BACK_DETAILS = [
  D(`M 41 122 C 41 130, 44 138, 49 138 C 49.5 134, 49.5 128, 49.5 124 C 47 120, 43 120, 41 122 Z`),
  D(`M 59 122 C 59 130, 56 138, 51 138 C 50.5 134, 50.5 128, 50.5 124 C 53 120, 57 120, 59 122 Z`),
];

// ─── Public API ────────────────────────────────────────────────────────────

export function buildBody(sex, view) {
  const key = `${sex}-${view}`;
  switch (key) {
    case 'female-front': return { d: FEMALE_FRONT_BODY };
    case 'female-back':  return { d: FEMALE_BACK_BODY };
    case 'male-front':   return { d: MALE_FRONT_BODY };
    case 'male-back':    return { d: MALE_BACK_BODY };
    default:             return { d: MALE_FRONT_BODY };
  }
}

export function buildLandmarks(sex, view) {
  const key = `${sex}-${view}`;
  switch (key) {
    case 'female-front': return FEMALE_FRONT_LANDMARKS;
    case 'female-back':  return FEMALE_BACK_LANDMARKS;
    case 'male-front':   return MALE_FRONT_LANDMARKS;
    case 'male-back':    return MALE_BACK_LANDMARKS;
    default:             return [];
  }
}

export function buildDetails(sex, view) {
  const key = `${sex}-${view}`;
  switch (key) {
    case 'female-front': return FEMALE_FRONT_DETAILS;
    case 'female-back':  return FEMALE_BACK_DETAILS;
    case 'male-front':   return MALE_FRONT_DETAILS;
    case 'male-back':    return MALE_BACK_DETAILS;
    default:             return [];
  }
}

export const MALE_BODY_PATH   = MALE_FRONT_BODY;
export const FEMALE_BODY_PATH = FEMALE_FRONT_BODY;

export const SILHOUETTE_NATIVE = {
  male:   { vbW: 100, vbH: 210 },
  female: { vbW: 100, vbH: 210 },
};

export function buildBodyParts(sex) {
  const d = sex === 'female' ? FEMALE_FRONT_BODY : MALE_FRONT_BODY;
  return { head: d, torso: d, armR: d, armL: d, legR: d, legL: d };
}
