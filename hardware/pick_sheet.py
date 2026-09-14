#!/usr/bin/env python3
"""
Pick sheet — assembly map with an assigned plate slot in every cell.

Same-code cubes are interchangeable, so we may as well fix a bijection:
each assembly cell of the zone names the exact plate/tray slot (行·列)
to take its cube from. The tray empties slot by slot as the creature
grows, and nothing is ever grabbed twice.

Repair plates: pass the repair manifest as [extra]. For every code it
contains, the first N original slots of that code are considered
replaced (that is why the repair plate exists) and their cells draw
from the repair plate instead, labelled 补r-c.

Usage: python3 hardware/pick_sheet.py <variants_dir> <ci> <out_dir> [extra_manifest]
Reads  kit_manifest.json (+ extra)   Writes pick_sheet_c<ci>.png
"""
import json
import os
import sys
from collections import defaultdict

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plate_gen import GRID, layout_slots


def slots_by_code(cells):
    by = defaultdict(list)
    for page, slots in enumerate(layout_slots(sorted(cells, key=lambda c: c['code']))):
        for k, _, c in slots:
            by[c['code']].append((page + 1, k // GRID + 1, k % GRID + 1))
    return by


def main(vdir, ci, out, extra=None):
    ci = int(ci)
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    cells = [c for c in man['cells'] if c['ci'] == ci]
    pool = {k: [('' if p == 1 else f'{p}·', r, c) for p, r, c in v]
            for k, v in slots_by_code(cells).items()}
    if extra:
        eman = json.load(open(extra))
        for code, slots in slots_by_code(eman['cells']).items():
            keep = pool.get(code, [])[len(slots):]          # first N replaced
            pool[code] = [('补', r, c) for _, r, c in slots] + keep

    take = defaultdict(int)
    cellmap = {}
    for c in sorted(cells, key=lambda c: (c['y'], c['z'], c['x'])):
        src = pool[c['code']][take[c['code']]]
        take[c['code']] += 1
        cellmap[(c['x'], c['y'], c['z'])] = src

    allcells = man['cells']
    cols = max(c['x'] for c in allcells) + 1
    Z = max(c['z'] for c in allcells) + 1
    layers = sorted({c['y'] for c in cells})
    ncol = 3
    nrow = (len(layers) + ncol - 1) // ncol
    fig, axes = plt.subplots(nrow, ncol, figsize=(5.4 * ncol, 4.6 * nrow + 1.2),
                             facecolor='#f6f5f0', squeeze=False)
    for ax in axes.flat:
        ax.axis('off')
    zone_col = man['colors'][ci]
    for ax, ly in zip(axes.flat, layers):
        ax.set_facecolor('#f6f5f0')
        n = 0
        for c in allcells:
            if c['y'] != ly:
                continue
            mine = c['ci'] == ci
            ax.add_patch(Rectangle((c['x'], c['z']), 1, 1,
                                   fc=zone_col if mine else '#e3e0d8',
                                   ec='#1c1c1a' if mine else '#b8b4a8',
                                   lw=0.5 if mine else 0.3))
            if mine:
                n += 1
                pre, r, cc = cellmap[(c['x'], c['y'], c['z'])]
                ax.text(c['x'] + 0.5, c['z'] + 0.30, c['code'][2:], ha='center',
                        va='center', fontsize=4.2, family='monospace',
                        color='#31564a')
                ax.text(c['x'] + 0.5, c['z'] + 0.68, f'{pre}{r}-{cc}',
                        ha='center', va='center', fontsize=5.4,
                        family='monospace', fontweight='bold', color='#1c1c1a')
        ax.set_xlim(-0.6, cols + 0.6)
        ax.set_ylim(-0.6, Z + 0.6)
        ax.set_aspect('equal')
        ax.invert_yaxis()
        ax.set_title(f'第 {ly + 1} 层(从下往上)· 本区 {n} 颗',
                     fontsize=9, family='monospace')
    fig.suptitle(f'取件装配图 · 区域 {ci}(盘{ci})· 格内大字=从盘/托盘的 行-列 取件,'
                 f'补=补印盘 · 小字=变体号核对 · 灰格=其他区域',
                 fontsize=11, family='monospace')
    fig.savefig(f'{out}/pick_sheet_c{ci}.png', dpi=150, facecolor='#f6f5f0',
                bbox_inches='tight')
    print(f'{len(cells)} cells, {len(layers)} layers → {out}/pick_sheet_c{ci}.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3],
         sys.argv[4] if len(sys.argv) > 4 else None)
