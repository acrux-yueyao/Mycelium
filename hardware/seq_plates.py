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

Usage: python3 hardware/seq_plates.py <variants_dir> <out_dir> [ci,ci,...] [--by-color]
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
from kit_cubes import orient_flat_down, variant_mesh, cell_mesh, orient_mask
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


def build_order(cells):
    """Assembly order in which no cube is placed into thin air.

    Layer by layer, bottom-up. Inside a layer, cubes resting on the layer
    below go first (back-to-front, left-to-right), then the layer grows
    outward from them one neighbour at a time, so every cube touches an
    already-placed cube the moment it goes down. Cubes with no support
    below and no path to one inside their layer are appended last and
    returned as `hanging` - those need a geometry fix, not a new order.
    """
    from collections import deque
    S = {(c['x'], c['y'], c['z']): c for c in cells}
    placed, order, hanging = set(), [], []
    for y in sorted({k[1] for k in S}):
        layer = {k for k in S if k[1] == y}
        seeds = sorted((k for k in layer if y == 0 or (k[0], y - 1, k[2]) in placed),
                       key=lambda k: (k[2], k[0]))
        q, seen = deque(seeds), set(seeds)
        while q:
            k = q.popleft()
            order.append(S[k]); placed.add(k)
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (k[0] + dx, y, k[2] + dz)
                if n in layer and n not in seen:
                    seen.add(n); q.append(n)
        for k in sorted(layer - seen, key=lambda k: (k[2], k[0])):
            order.append(S[k]); placed.add(k); hanging.append(k)
    return order, hanging


def seq_slots(man, cis=None):
    """Global assembly order → pages of (slot, cell), one blank slot per
    layer boundary. Cells gain c['seq']. Shared by plates and trays."""
    cells, _ = build_order(man['cells'])
    for i, c in enumerate(cells):
        c['seq'] = i + 1
    sel = [c for c in cells if cis is None or c['ci'] in cis]
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
    return paged


def render_page(man, geom, out, stem, slots, fil_name, lines):
    parts = []
    for k, c in slots:
        p = geom(c).copy()
        gx, gy = k % GRID, k // GRID
        lo = p.bounds[0]
        p.apply_transform(TM([gx * PITCH - lo[0], gy * PITCH - lo[1], -lo[2]]))
        parts.append(p)
    plate = trimesh.util.concatenate(parts)
    fname = f'{stem}.stl'
    plate.export(f'{out}/{fname}')
    s0, s1 = slots[0][1]['seq'], slots[-1][1]['seq']
    lines.append(f'{fname:28s} ' + (f'{fil_name} · ' if fil_name else '')
                 + f'{len(slots):3d} 颗 · 序号 {s0}–{s1} · '
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
        small = {tuple(k) for k in c['eye']['seam']} if c.get('eye') else set()
        poles = dict(plate_faces({tuple(m) for m in c['mask']}, small))
        COL = {None: FC, 'N': NC, 'S': SC, 'n': NC, 's': SC}
        up = poles.get((0, 0, 1))
        ax.add_patch(Circle((x0 + 6, y0 + 5.2), 2.3 if up is None or up.isupper() else 1.3,
                            fc=COL[up], ec='#1c1c1a', lw=0.5))
        ax.text(x0 + 6, y0 + 5.2, up or '平', ha='center', va='center',
                fontsize=(7 if up.isupper() else 5.5) if up else 5, family='monospace',
                fontweight='bold' if up else 'normal',
                color='#ffffff' if up else '#6d6a62')
        for w, (ex, ey) in list(EDGE.items()):
            p_ = poles.get(w)
            if not p_:
                continue
            sz = 2.2 if p_.isupper() else 1.4
            ax.add_patch(Rectangle((x0 + ex - sz / 2, y0 + ey - sz / 2), sz, sz,
                                   fc=COL[p_], ec='#1c1c1a', lw=0.4))
            ax.text(x0 + ex, y0 + ey, p_, ha='center', va='center',
                    fontsize=5.2 if p_.isupper() else 4.2, family='monospace', color='#ffffff')
        if c.get('eye'):
            ax.add_patch(Rectangle((x0, y0), 12, 12, fill=False, ec='#3b82f6', lw=1.2, ls='--'))
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
    ax.set_title(f'{fname} ' + (f'· 耗材 {fil_name} ' if fil_name else '顺序盘 ')
                 + f'· {len(slots)}颗 · 序号{s0}–{s1}\n'
                 '左上粗体=拼装序号(按序剥取) · 空位=换层 · 圆=上袋极性 '
                 '边块=侧袋 · 红N 蓝S · 小写小块=Ø2×1小磁铁 · 蓝虚框=眼框块 · 右上小字=变体号',
                 fontsize=10, family='monospace')
    fig.savefig(f'{out}/{stem}_sheet.png', dpi=140,
                facecolor='#f6f5f0', bbox_inches='tight')
    plt.close(fig)


def _slug(name, ci):
    if not name:
        return f'c{ci}'
    en = name.split(' ', 1)[1] if ' ' in name else name
    return '-'.join(en.lower().split())


def main(vdir, out, cis=None, by_color=False):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    os.makedirs(out, exist_ok=True)
    names = man.get('color_names') or [None] * len(man['colors'])

    geo = {}
    def geom(c):
        code = c['code']
        if code not in geo:
            mask = [tuple(m) for m in c['mask']]
            geo[code] = orient_flat_down(cell_mesh(code, mask, c.get('eye')), orient_mask(mask, c.get('eye')))
        return geo[code][0]

    if by_color:
        # one filament per plate set; inside, still global assembly order
        used = sorted({c['ci'] for c in man['cells']} if cis is None else cis)
        groups = [(f'plate_{_slug(names[ci], ci)}', names[ci] or man['colors'][ci],
                   seq_slots(man, {ci})) for ci in used]
    else:
        groups = [('plate_seq', None, seq_slots(man, cis))]
    total = sum(len(sl) for _, _, pg in groups for sl in pg)

    lines = [f"assembly-ordered plates · {total} cubes of {len(man['cells'])}"
             + (' · one filament per plate' if by_color else ''),
             "orientation: flat show-face DOWN (unchanged) · blank slot = layer boundary",
             "peel in reading order (row1 left→right, then row2 …) = assembly order", '']
    for prefix, fil_name, paged in groups:
        for n0, slots in enumerate(paged):
            render_page(man, geom, out, f'{prefix}_{n0 + 1}', slots, fil_name, lines)

    open(f'{out}/seq_manifest.txt', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    cis = {int(x) for x in args[2].split(',')} if len(args) > 2 else None
    main(args[0], args[1], cis, by_color='--by-color' in sys.argv)
