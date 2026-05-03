// silhouette-paths.js — body silhouette d-strings.
//
// Compound paths supplied directly by the maintainer — each silhouette is
// composed of multiple subpaths (body, head, arms, legs) joined into one
// d-string so it renders as a single fill in our picker.
//
// Each silhouette has its own native viewBox. We render via
// <symbol viewBox="..."> + <use width="100" height="200"> with
// preserveAspectRatio="xMidYMid meet" — the SVG engine handles
// scale + center automatically, no manual transform math.

export const FEMALE_BODY_PATH =
  // body (torso + hips + thighs)
  'M180 80 Q160 120 140 220 Q120 320 150 480 Q150 550 170 580 Q175 600 165 620 Q180 630 195 620 Q210 580 230 480 Q260 320 240 220 Q220 120 200 80 Z ' +
  // head + neck
  'M175 65 Q165 45 175 35 Q185 30 195 40 Q200 55 190 65 Z ' +
  // left arm
  'M140 220 Q90 280 70 380 Q80 420 110 380 Z ' +
  // right arm
  'M240 220 Q300 280 320 380 Q310 420 280 380 Z ' +
  // left leg
  'M170 480 Q160 580 155 620 Q175 625 180 580 Z ' +
  // right leg
  'M195 480 Q205 580 210 620 Q190 625 185 580 Z';

export const MALE_BODY_PATH =
  // body (torso + hips + legs as one shape)
  'M180 380 Q150 420 140 520 Q140 580 155 630 Q165 650 180 640 Q195 580 210 520 Q230 420 200 380 Z ' +
  // head — ellipse cx=175 cy=355 rx=35 ry=38 expressed as two SVG arcs
  'M140 355 A 35 38 0 1 0 210 355 A 35 38 0 1 0 140 355 Z ' +
  // left shoulder + arm
  'M140 420 Q100 480 95 550 Q110 570 130 520 Z ' +
  // right shoulder + arm
  'M210 420 Q250 480 255 550 Q240 570 220 520 Z';

// Native viewBoxes — chosen to crop tightly around each compound path with
// a small (~5 unit) margin so the figure doesn't kiss the edge.
// Format: { vbX, vbY, vbW, vbH } — matches SVG viewBox "x y w h".
export const SILHOUETTE_NATIVE = {
  female: { vbX: 60, vbY: 25,  vbW: 270, vbH: 610 },
  male:   { vbX: 90, vbY: 312, vbW: 180, vbH: 343 },
};
