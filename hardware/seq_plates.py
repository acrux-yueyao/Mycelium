#!/usr/bin/env python3
"""
Assembly-ordered plates — the plate IS the pick list.

Cubes are placed on the print plate in global assembly order (layer
bottom-up, back row to front, left to right), serpentine row-major,
with one blank slot at every layer boundary. Peel cubes in reading
order and place them at the matching sequence number on the assembly
sheet — no lookups, no tray required; the plate is the storage.

Orientation is unchanged from plate_gen: every cube still lands with a
FLAT exposed face on the bed (orient_flat_down), so the show face gets
the textured-PEI finish and no pocket sits in the elephant-foot zone.

The per-plate sheet shows, per slot: sequence number (bold), variant
code (small), and the magnet polarity of every pocket (centre circle =
up, edge marks = sides) — same conventions as the plate_gen sheets.

Usage: python3 hardware/seq_plates.py <variants_dir> <out_dir> [ci,ci,...]
       ci list filters which zones to print (default: all); sequence
       numbers are always GLOBAL over the whole creature, so already
       printed zones keep their numbers on the assembly sheet.
Reads  kit_manifest.json
Writes plate_seq_<n>.stl + plate_seq_<n>_sheet.png + seq_manifest.txt
"""
import json
import os
import sys

import trimesh
from trimesh.transformations import translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import orient_flat_down, variant_mesh
from magnet_polarity import plate_faces
from plate_gen import GRID, PITCH

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

NC, SC, FC = '#c14953', '#3e6fb8', '#c9c5ba'
EDGE = {(-1, 0, 0): (1.7, 6), (1, 0, 0): (10.3, 6),
        (0, 1, 0): (6, 10.3), (0, -1, 0): (6, 1.7)}


def main(vdir, out, cis=None):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    cells = sorted(man['cells'], key=lambda c: (c['y'], c['z'], c['x']))
    for i, c in enumerate(cells):
        c['seq'] = i + 1
    sel = [c for c in cells
           if cis is None or c['ci'] in cis]
    os.makedirs(out, exist_ok=True)

    # slot layout: assembly order, blank slot at each layer boundary
    paged, slots, k, lasty = [], [], 0, None
    for c in sel:
        if lasty is not None and c['y'] != lasty:
            k += 1
        lasty = c['y']
        if k >= GRID * GRID:
            paged.append(slots)
            slots, k = [], 0
        slots.append((k, c))
        k += 1
    if slots:
        paged.append(slots)

    geo = {}
    def geom(c):
        code = c['code']
        if code not in geo:
            mask = [tuple(m) for m in c['mask']]
            geo[code] = orient_flat_down(variant_mesh(code, mask), set(mask))
        return geo[code][0]

    lines = [f"assembly-ordered plates · {len(sel)} cubes of {len(cells)} · "
             f"zones {sorted(set(c['ci'] for c in sel))}",
             "orientation: flat show-face DOWN (unchanged) · blank slot = layer boundary",
             "peel in reading order (row1 left→right, then row2 …) = assembly order", '']
    for n0, slots in enumerate(paged):
        parts = []
        for k, c in slots:
            p = geom(c).copy()
            gx, gy = k % GRID, k // GRID
            lo = p.bounds[0]
            p.apply_transform(TM([gx * PITCH - lo[0], gy * PITCH - lo[1], -lo[2]]))
            parts.append(p)
        plate = trimesh.util.concatenate(parts)
        fname = f'plate_seq_{n0 + 1}.stl'
        plate.export(f'{out}/{fname}')
        s0, s1 = slots[0][1]['seq'], slots[-1][1]['seq']
        lines.append(f'{fname:18s} {len(slots):3d} 颗 · 序号 {s0}–{s1} · '
                     f'层 {slots[0][1]["y"] + 1}–{slots[-1][1]["y"] + 1}')

        nrows = slots[-1][0] // GRID + 1
        fig, ax = plt.subplots(figsize=(11.5, nrows * 0.83 + 2.6),
                               facecolor='#f6f5f0')
        ax.axis('off'); ax.set_facecolor('#f6f5f0')
        for k, c in slots:
            gx, gy = k % GRID, k // GRID
            x0, y0 = gx * PITCH, gy * PITCH
            ax.add_patch(Rectangle((x0, y0), 12, 12, fc=man['colors'][c['ci']],
                                   ec='#1c1c1a', lw=0.5, alpha=0.3))
            poles = dict(plate_faces({tuple(m) for m in c['mask']}))
            up = poles.get((0, 0, 1))
            ax.add_patch(Circle((x0 + 6, y0 + 5.2), 2.3,
                                fc={None: FC, 'N': NC, 'S': SC}[up],
                                ec='#1c1c1a', lw=0.5))
            ax.text(x0 + 6, y0 + 5.2, up or '平', ha='center', va='center',
                    fontsize=7 if up else 5, family='monospace',
                    fontweight='bold' if up else 'normal',
                    color='#ffffff' if up else '#6d6a62')
            for w, (ex, ey) in EDGE.items():
                p_ = poles.get(w)
                if p_ and (ex, ey) != (6, 1.7):
                    ax.add_patch(Rectangle((x0 + ex - 1.1, y0 + ey - 1.1),
                                           2.2, 2.2, fc={'N': NC, 'S': SC}[p_],
                                           ec='#1c1c1a', lw=0.4))
                    ax.text(x0 + ex, y0 + ey, p_, ha='center', va='center',
                            fontsize=5.2, family='monospace', color='#ffffff')
            p_ = poles.get((0, -1, 0))
            if p_:
                ax.add_patch(Rectangle((x0 + 6 - 1.1, y0 + 1.7 - 1.1), 2.2, 2.2,
                                       fc={'N': NC, 'S': SC}[p_],
                                       ec='#1c1c1a', lw=0.4))
                ax.text(x0 + 6, y0 + 1.7, p_, ha='center', va='center',
                        fontsize=5.2, family='monospace', color='#ffffff')
            ax.text(x0 + 1.0, y0 + 10.5, str(c['seq']), ha='left', va='center',
                    fontsize=6.6, family='monospace', fontweight='bold',
                    color='#1c1c1a')
            ax.text(x0 + 11.0, y0 + 10.5, c['code'][2:], ha='right', va='center',
                    fontsize=4.2, family='monospace', color='#6d6a62')
        for gx in range(GRID):
            ax.text(gx * PITCH + 6, -5, str(gx + 1), ha='center', va='center',
                    fontsize=7, color='#8a8880')
        for gy in range(nrows):
            ax.text(-7, gy * PITCH + 6, f'行{gy + 1}', ha='center', va='center',
                    fontsize=7, color='#8a8880')
        ax.set_xlim(-14, GRID * PITCH + 4)
        ax.set_ylim(-13, nrows * PITCH + 2)
        ax.set_aspect('equal')
        ax.set_title(f'{fname} 顺序盘 · {len(slots)}颗 · 序号{s0}–{s1}\n'
                     '左上粗体=拼装序号(按序剥取) · 空位=换层 · 圆=上袋极性 '
                     '边块=侧袋 · 红N 蓝S · 右上小字=变体号 · 底色=区域',
                     fontsize=10, family='monospace')
        fig.savefig(f'{out}/plate_seq_{n0 + 1}_sheet.png', dpi=140,
                    facecolor='#f6f5f0', bbox_inches='tight')
        plt.close(fig)

    open(f'{out}/seq_manifest.txt', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    cis = ({int(x) for x in sys.argv[3].split(',')}
           if len(sys.argv) > 3 else None)
    main(sys.argv[1], sys.argv[2], cis)
