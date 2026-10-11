#!/usr/bin/env python3
"""
Mosaic "ground" base for the moving spore — layout sheet.

An organic patch of 12 mm cells, 2 cells (24 mm) tall: the top layer is a
moss/soil mosaic in owned filament colours, the inside is hollow and
holds the face board (flat), the battery, the speaker and the servo
driver. The spore stands on a turntable (Ø66, centre at the spore's body)
and the pan servo sits upside-down in the spore's body with its horn
screwed to the ground, so the whole spore turns over a fixed ground.

Usage: python3 hardware/ground_gen.py <spore_sculpt.json> <out_dir> [seed]
Writes ground_layout.png + ground.json (cells, colours, part positions)
"""
import json
import math
import random
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle

P = 12.0
INK, BG = '#1c1c1a', '#f6f5f0'
# owned spools (filaments.json ids) used for the ground
MOSS = [('deep-green', '#3d8a6a'), ('green', '#2fa84f'), ('avocado', '#8ccb3e'), ('black', '#2a2a28')]
ACCENT = [('aqua', '#8ed1cc'), ('pink-marble', '#efd6de')]


def blob(w, h, seed):
    """Organic patch: an ellipse with a few wobbles, as a set of cells."""
    rnd = random.Random(seed)
    k = [(rnd.uniform(0.05, 0.12), rnd.uniform(0, 6.28), n) for n in (2, 3, 5)]
    cells = set()
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for x in range(w):
        for y in range(h):
            dx, dy = (x - cx) / (w / 2), (y - cy) / (h / 2)
            r = math.hypot(dx, dy); a = math.atan2(dy, dx)
            lim = 1 + sum(amp * math.sin(n * a + ph) for amp, ph, n in k)
            if r <= lim * 0.98:
                cells.add((x, y))
    return cells


def main(sculpt, out, seed=8):
    sm = json.load(open(sculpt))
    vox = [(x, y, z) for x, y, z, *_ in sm['voxels']]
    foot = {(x, z) for x, y, z in vox if y == min(v[1] for v in vox)}       # spore's bottom row footprint
    fx = [p[0] for p in foot]; fz = [p[1] for p in foot]
    W, H = 13, 11                                     # ground cells (x, depth)
    cells = blob(W, H, seed)
    # place the spore footprint centred left-right, a little toward the front
    ox = (W - (max(fx) - min(fx) + 1)) // 2 - min(fx)
    oz = H - 3 - (max(fz) - min(fz) + 1) - min(fz) + 1
    stand = {(x + ox, z + oz) for x, z in foot}
    cells |= stand
    # colours: moss noise, darker toward the rim, a few accent "spores"
    rnd = random.Random(seed * 7 + 1)
    colour = {}
    cx, cz = (W - 1) / 2, (H - 1) / 2
    for c in cells:
        rim = math.hypot((c[0] - cx) / (W / 2), (c[1] - cz) / (H / 2))
        r = rnd.random() + 0.35 * rim
        colour[c] = MOSS[0] if r > 1.0 else MOSS[1] if r > 0.7 else MOSS[2] if r > 0.35 else MOSS[0]
        if rnd.random() < 0.07 and c not in stand:
            colour[c] = ACCENT[rnd.randrange(2)]
    # inside parts (mm, ground frame: x right, y = depth toward the face)
    sx = (np.mean([p[0] for p in stand]) + 0.5) * P; sz = (np.mean([p[1] for p in stand]) + 0.5) * P
    parts = {
        'turntable': dict(c=(sx, sz), r=33),
        'board': dict(x=sx - 34, y=(min(p[1] for p in cells) + 0.6) * P, w=68, h=56, label='脸板 MC03-F(平放)'),
        'battery': dict(x=(min(p[0] for p in cells) + 1.2) * P, y=sz - 10, w=34, h=50, label='电池 103450'),
        'driver': dict(x=(max(p[0] for p in cells) - 3.2) * P, y=sz - 4, w=25, h=20, label='PCA9685\n+升压'),
        'speaker': dict(x=(max(p[0] for p in cells) - 3.6) * P, y=sz + 22, w=30, h=20, label='喇叭(朝下)'),
    }
    json.dump({'cells': [list(c) for c in sorted(cells)], 'colour': {f'{c[0]},{c[1]}': colour[c][0] for c in cells},
               'stand': [list(c) for c in sorted(stand)], 'parts': parts, 'pitch': P, 'height_cells': 2},
              open(f'{out}/ground.json', 'w'), indent=1)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(16, 8), facecolor=BG)
    for ax in (a1, a2):
        ax.set_facecolor(BG); ax.set_aspect('equal'); ax.axis('off')
    for c in cells:
        a1.add_patch(Rectangle((c[0] * P, c[1] * P), P, P, fc=colour[c][1], ec=BG, lw=0.8))
    for c in stand:
        a1.add_patch(Rectangle((c[0] * P + 1, c[1] * P + 1), P - 2, P - 2, fill=False, ec='#f2f1ec', lw=1.6, ls=(0, (2, 1.5))))
    a1.add_patch(Circle(parts['turntable']['c'], 33, fill=False, ec='#f2f1ec', lw=1.2))
    a1.text(parts['turntable']['c'][0], parts['turntable']['c'][1] - 40, '孢子站在这里(白虚框)· 圆=转盘', ha='center', fontsize=8.5)
    a1.text(W * P / 2, (H + 0.6) * P, '▲ 正面(孢子的脸朝这边)', ha='center', fontsize=9, color='#6d6a62')
    a1.set_xlim(-10, W * P + 10); a1.set_ylim(-14, (H + 1.6) * P)
    a1.set_title(f'土地 · 俯视 · {W}×{H} 格 = {W * P:.0f}×{H * P:.0f} mm · 高 2 格(24 mm)· {len(cells)} 格', fontsize=11)
    # inside
    for c in cells:
        a2.add_patch(Rectangle((c[0] * P, c[1] * P), P, P, fc='#e6e2d8', ec=BG, lw=0.6))
    for k, p in parts.items():
        if k == 'turntable':
            a2.add_patch(Circle(p['c'], p['r'], fc='#8a8880', ec=INK, alpha=0.5))
            a2.add_patch(Circle(p['c'], 6, fc=BG, ec=INK)); a2.text(p['c'][0] + 8, p['c'][1] - 2, '中心孔:线束', fontsize=7.5)
            a2.text(p['c'][0], p['c'][1] + 36, '转盘 Ø66(舵机倒装在孢子身体里,舵盘拧在这)', ha='center', fontsize=7.5)
            continue
        col = {'board': '#4a7d43', 'battery': '#c9a35a', 'driver': '#2e5f8a', 'speaker': INK}[k]
        a2.add_patch(Rectangle((p['x'], p['y']), p['w'], p['h'], fc=col, ec=INK, alpha=0.85))
        a2.text(p['x'] + p['w'] / 2, p['y'] + p['h'] / 2, p['label'], ha='center', va='center', fontsize=7.5, color=BG)
    a2.text(W * P / 2, -8, '底面:一块可拧下的底板(4 颗 M2),换电池/插 USB 从底下来', ha='center', fontsize=8.5, color='#6d6a62')
    a2.set_xlim(-10, W * P + 10); a2.set_ylim(-14, (H + 1.6) * P)
    a2.set_title('土地里面装什么(俯视透视)', fontsize=11)
    used = sorted({colour[c][0] for c in cells})
    fig.suptitle('Moony Moth 的马赛克土地 · 布局 v1 · 耗材: ' + ' / '.join(used), fontsize=13)
    fig.savefig(f'{out}/ground_layout.png', dpi=115, facecolor=BG, bbox_inches='tight')
    print(f'ground {W}x{H} cells, {len(cells)} cells, stand {len(stand)}, colours {used}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8)
