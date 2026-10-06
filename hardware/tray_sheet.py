#!/usr/bin/env python3
"""
Tray magnet sheet — polarity of every pocket, laid out like the storage tray.

The storage tray (tray_gen.py, seq mode) mirrors the assembly-ordered
plate: one well per cube at the same row/column, blank well at every
layer boundary, cube sitting show-face DOWN exactly as printed. So the
magnets can be glued while the cubes rest in the tray, reading this sheet
slot by slot: bold number = assembly sequence (engraved in the well),
centre circle = pocket facing UP, edge squares = side pockets, 底X = a
pocket on the bed face (lift the cube for that one). Red N / blue S =
pole facing OUT. Lower-case = Ø2×1 seam magnet (eye frames). Cubes that
are reprinted as two-piece touch/wire cubes are hatched: glue them first,
then magnets as marked.

Usage: python3 hardware/tray_sheet.py <variants_dir> <out_dir>
Reads  kit_manifest.json [+ touch_plan.json]   Writes tray_<n>_magnets.png
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from magnet_polarity import plate_faces
from plate_gen import GRID, PITCH
from seq_plates import seq_slots

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

NC, SC, FC = '#c14953', '#3e6fb8', '#c9c5ba'
EDGE = {(-1, 0, 0): (1.7, 6), (1, 0, 0): (10.3, 6), (0, 1, 0): (6, 10.3), (0, -1, 0): (6, 1.7)}
COL = {None: FC, 'N': NC, 'S': SC, 'n': NC, 's': SC}


def main(vdir, out):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    os.makedirs(out, exist_ok=True)
    two_piece = set()
    tp = f'{vdir}/touch_plan.json'
    if os.path.exists(tp):
        K = {(c['x'], c['y'], c['z']) for c in man['cells']}
        for r in json.load(open(tp)):
            for p in r.get('route', []):
                if tuple(p) in K:
                    two_piece.add(tuple(p))
    pages = seq_slots(man)
    counts = {'Ø4×2': 0, 'Ø2×1': 0}
    for n0, slots in enumerate(pages):
        nrows = slots[-1][0] // GRID + 1
        fig, ax = plt.subplots(figsize=(11.5, nrows * 0.83 + 2.8), facecolor='#f6f5f0')
        ax.axis('off'); ax.set_facecolor('#f6f5f0')
        for k, c in slots:
            gx, gy = k % GRID, k // GRID
            x0, y0 = gx * PITCH, gy * PITCH
            ax.add_patch(Rectangle((x0, y0), 12, 12, fc=man['colors'][c['ci']], ec='#1c1c1a', lw=0.5, alpha=0.3))
            if (c['x'], c['y'], c['z']) in two_piece:
                ax.add_patch(Rectangle((x0, y0), 12, 12, fill=False, ec='#8a8880', lw=0.6, hatch='////'))
            small = {tuple(m) for m in c['eye']['seam']} if c.get('eye') else set()
            poles = dict(plate_faces({tuple(m) for m in c['mask']}, small, c['code'], c.get('bed')))
            for p in poles.values():
                if p:
                    counts['Ø2×1' if p.islower() else 'Ø4×2'] += 1
            up = poles.get((0, 0, 1))
            ax.add_patch(Circle((x0 + 6, y0 + 5.2), 2.3 if up is None or up.isupper() else 1.3, fc=COL[up], ec='#1c1c1a', lw=0.5))
            ax.text(x0 + 6, y0 + 5.2, up or '平', ha='center', va='center',
                    fontsize=(7 if up.isupper() else 5.5) if up else 5, family='monospace',
                    fontweight='bold' if up else 'normal', color='#ffffff' if up else '#6d6a62')
            for w, (ex, ey) in EDGE.items():
                p_ = poles.get(w)
                if not p_:
                    continue
                sz = 2.2 if p_.isupper() else 1.4
                ax.add_patch(Rectangle((x0 + ex - sz / 2, y0 + ey - sz / 2), sz, sz, fc=COL[p_], ec='#1c1c1a', lw=0.4))
                ax.text(x0 + ex, y0 + ey, p_, ha='center', va='center', fontsize=5.2 if p_.isupper() else 4.2,
                        family='monospace', color='#ffffff')
            if c.get('eye'):
                ax.add_patch(Rectangle((x0, y0), 12, 12, fill=False, ec='#3b82f6', lw=1.2, ls='--'))
            bot = poles.get((0, 0, -1))
            if bot:
                ax.text(x0 + 1.0, y0 + 1.4, f'底{bot}', ha='left', va='center', fontsize=5.2, family='monospace',
                        fontweight='bold', color=COL[bot])
            ax.text(x0 + 1.0, y0 + 10.5, str(c['seq']), ha='left', va='center', fontsize=6.6, family='monospace',
                    fontweight='bold', color='#1c1c1a')
            ax.text(x0 + 11.0, y0 + 10.5, c['code'][2:], ha='right', va='center', fontsize=4.2, family='monospace', color='#6d6a62')
        for gx in range(GRID):
            ax.text(gx * PITCH + 6, -5, str(gx + 1), ha='center', va='center', fontsize=7, color='#8a8880')
        for gy in range(nrows):
            ax.text(-7, gy * PITCH + 6, f'行{gy + 1}', ha='center', va='center', fontsize=7, color='#8a8880')
        ax.set_xlim(-14, GRID * PITCH + 4); ax.set_ylim(-13, nrows * PITCH + 2); ax.set_aspect('equal')
        s0, s1 = slots[0][1]['seq'], slots[-1][1]['seq']
        ax.set_title(f'收纳盘 {n0 + 1} 磁铁极性图 · 序号 {s0}–{s1} · {len(slots)} 颗 · 方块按打印姿态放(展示面朝下)\n'
                     '粗体=序号(盘里刻的) · 圆=朝上的袋 · 边块=侧袋 · 底X=贴盘底那面也有袋(拿起来装) · '
                     '红N 蓝S 朝外 · 小写=Ø2×1 小磁铁 · 蓝虚框=眼框块 · 斜线=两件式重打块(先胶合再装)',
                     fontsize=9.5, family='monospace')
        fig.savefig(f'{out}/tray_{n0 + 1}_magnets.png', dpi=150, facecolor='#f6f5f0', bbox_inches='tight')
        plt.close(fig)
        print(f'tray_{n0 + 1}_magnets.png  序号 {s0}–{s1} · {len(slots)} 颗')
    print('磁铁合计', counts)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
