"""
Region map generator — v3 (tighter arm bands, anatomical proportions).

Walks the body alpha mask row-by-row, assigns each body pixel to a region
based on:
  - Y-band (face/throat/chest/torso/abdomen/genitals/legs/feet)
  - X position WITHIN that row's body extent — using narrower arm bands
    so torso/back/chest take up most of the body width and arms truly
    hug the silhouette edges.

Changes vs v2:
  - Arm bands narrowed from outer 18% to outer 11% (chest/torso) and
    outer 13% (waist/abdomen/hands) to match real proportions.
  - Below the hip (py >= yPubicTop), no arm painting on BACK view —
    everything is torso-back / glutes. On front, hands at hip use
    outer 13% only above yCrotch.
  - Feet band slightly extended downward to capture full toe area.
"""
from PIL import Image
import numpy as np
import os

MASK = '/home/elkim/Documents/Claude Code/Lab-Charts-sun/er-mask.png'
OUT  = '/home/elkim/Documents/Claude Code/Lab-Charts-sun/er-regionmap.png'

VB_W = 3082.45
VB_H = 4890.47

cells = {
    'female-front': {'sx': 232,  'sy': 200,  'cw': 542, 'ch': 2089},
    'female-back':  {'sx': 2241, 'sy': 207,  'cw': 550, 'ch': 2120},
    'male-front':   {'sx': 162,  'sy': 2623, 'cw': 672, 'ch': 2108},
    'male-back':    {'sx': 2135, 'sy': 2611, 'cw': 683, 'ch': 2127},
}

COLORS = {
    'face':           (255,   0,   0),
    'thyroid-throat': (  0, 255,   0),
    'breast-chest':   (  0,   0, 255),
    'arms-front':     (255, 255,   0),
    'torso-front':    (255,   0, 255),
    'abdomen':        (  0, 255, 255),
    'genitals':       (255, 128,   0),
    'legs-front':     (128,   0, 255),
    'feet-front':     (255,   0, 128),
    'arms-back':      (128, 255,   0),
    'torso-back':     (  0, 128, 255),
    'glutes':         (128, 128, 255),
    'legs-back':      (255, 128, 255),
    'feet-back':      (128, 255, 255),
}

yHairTop  = 6
yChinTop  = 31
yShldrTop = 39
yChestTop = 42
yChestBot = 66
yNavel    = 90
yPubicTop = 107
yCrotch   = 114
yKnee     = 150
yAnkle    = 189
ySole     = 200

mask = Image.open(MASK).convert('RGBA')
arr = np.array(mask)
H, W = arr.shape[:2]
alpha = arr[..., 3]
mask_scale_x = W / VB_W
mask_scale_y = H / VB_H

out = np.zeros((H, W, 4), dtype=np.uint8)

def source_y_to_mask_y(src_y):
    return int(round(src_y * mask_scale_y))

def source_x_to_mask_x(src_x):
    return int(round(src_x * mask_scale_x))

def paint_cell(cell_key, cell):
    sex, view = cell_key.split('-')
    is_front = view == 'front'

    y0 = source_y_to_mask_y(cell['sy'])
    y1 = source_y_to_mask_y(cell['sy'] + cell['ch'])
    x0 = source_x_to_mask_x(cell['sx'])
    x1 = source_x_to_mask_x(cell['sx'] + cell['cw'])
    pad = 30
    y0 = max(0, y0 - pad); y1 = min(H, y1 + pad)
    x0 = max(0, x0 - pad); x1 = min(W, x1 + pad)

    def src_y_to_picker(src_y):
        return (src_y - cell['sy']) * 210 / cell['ch']

    for my in range(y0, y1):
        row = alpha[my, x0:x1]
        body_cols = np.where(row > 30)[0]
        if len(body_cols) == 0:
            continue
        abs_cols = body_cols + x0
        body_left = abs_cols[0]
        body_right = abs_cols[-1]
        body_width = body_right - body_left + 1

        src_y = my / mask_scale_y
        py = src_y_to_picker(src_y)
        if py < -2 or py > 215:
            continue

        def in_central(x, frac):
            edge = body_width * frac
            return body_left + edge <= x <= body_right - edge

        for x in abs_cols:
            paint = None
            if py < yChinTop:
                paint = 'face'
            elif py < yShldrTop:
                paint = 'thyroid-throat'
            elif py < yChestTop:
                # Clavicle gap — keep tiny outer slivers as arm caps
                if not in_central(x, 0.40):
                    paint = 'arms-front' if is_front else 'arms-back'
                else:
                    paint = None
            elif py < yChestBot:
                # Chest / pec band — narrow arms (outer 11% each side)
                if in_central(x, 0.11):
                    paint = 'breast-chest' if is_front else 'torso-back'
                else:
                    paint = 'arms-front' if is_front else 'arms-back'
            elif py < yNavel:
                # Upper torso — even narrower waist arm strip
                if is_front:
                    if in_central(x, 0.11):
                        paint = 'torso-front'
                    else:
                        paint = 'arms-front'
                else:
                    if in_central(x, 0.10):
                        paint = 'torso-back'
                    else:
                        paint = 'arms-back'
            elif py < yPubicTop:
                # Abdomen / lumbar — hands begin to be at hip-side
                if is_front:
                    if in_central(x, 0.13):
                        paint = 'abdomen'
                    else:
                        paint = 'arms-front'
                else:
                    if in_central(x, 0.12):
                        paint = 'torso-back'
                    else:
                        paint = 'arms-back'
            elif py < yCrotch:
                # Pubic / hip-fold band
                if is_front:
                    if in_central(x, 0.18):
                        paint = 'genitals'
                    else:
                        paint = 'arms-front'  # hands at hip
                else:
                    paint = 'glutes'
            elif py < yAnkle:
                paint = 'legs-front' if is_front else 'legs-back'
            elif py <= ySole + 8:
                paint = 'feet-front' if is_front else 'feet-back'

            if paint:
                col = COLORS[paint]
                out[my, x, 0] = col[0]
                out[my, x, 1] = col[1]
                out[my, x, 2] = col[2]
                out[my, x, 3] = 255

paint_cell('female-front', cells['female-front'])
paint_cell('female-back',  cells['female-back'])
paint_cell('male-front',   cells['male-front'])
paint_cell('male-back',    cells['male-back'])

Image.fromarray(out).save(OUT, optimize=True, compress_level=9)

print('Region map size:', os.path.getsize(OUT), 'bytes')
print('Painted pixel count:', (out[..., 3] > 0).sum())
