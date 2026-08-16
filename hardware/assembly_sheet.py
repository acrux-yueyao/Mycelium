#!/usr/bin/env python3
"""
Assembly sheet — layer-by-layer build map with variant codes in place.

Complement of the plate sheets: plates tell you what a printed cube IS,
this tells you where it GOES. One grid per layer (bottom-up); every cell
prints its variant code (matching the code engraved on the cube / shown
on the plate) on the region colour. Top of each plan = back of creature.

Usage: python3 hardware/assembly_sheet.py <variants_dir> [out_dir]
Reads  kit_manifest.json   Writes assembly_sheet.png
"""
import json
import os
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle


def luma(hexcol):
    r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def main(vdir, out=None):
    out = out or vdir
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    colors, cells = man['colors'], man['cells']
    for i, c in enumerate(sorted(cells, key=lambda c: (c['y'], c['z'], c['x']))):
        c['seq'] = i + 1                       # global assembly order
    cols = max(c['x'] for c in cells) + 1
    Z = max(c['z'] for c in cells) + 1
    layers = sorted({c['y'] for c in cells})

    ncol = 3
    nrow = (len(layers) + ncol - 1) // ncol
    fig, axes = plt.subplots(nrow, ncol, figsize=(4.6 * ncol, 4.0 * nrow + 1.2),
                             facecolor='#f6f5f0', squeeze=False)
    for ax in axes.flat:
        ax.axis('off')
    for ax, ly in zip(axes.flat, layers):
        ax.set_facecolor('#f6f5f0')
        n = 0
        for c in cells:
            if c['y'] != ly:
                continue
            n += 1
            col = colors[c['ci']]
            ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc=col,
                                   ec='#1c1c1a', lw=0.5))
            tc = '#1c1c1a' if luma(col) > 130 else '#f6f5f0'
            ax.text(c['x'] + 0.5, c['z'] + 0.42, str(c['seq']), ha='center',
                    va='center', fontsize=6, family='monospace',
                    fontweight='bold', color=tc)
            ax.text(c['x'] + 0.5, c['z'] + 0.8, c['code'][2:], ha='center',
                    va='center', fontsize=3.6, family='monospace', color=tc)
        ax.set_xlim(-0.6, cols + 0.6)
        ax.set_ylim(-0.6, Z + 0.6)
        ax.set_aspect('equal')
        ax.invert_yaxis()
        ax.axis('on')
        ax.set_xticks(range(0, cols + 1, 2))
        ax.set_yticks([])
        ax.tick_params(labelsize=6, length=0)
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.set_title(f'第 {layers.index(ly) + 1}/{len(layers)} 层(从下往上)· {n} 颗',
                     fontsize=9, family='monospace')
    fig.suptitle('逐层装配图 · 粗体=拼装序号(=顺序盘剥取次序) · 小字=变体号 · '
                 '底色=区域(盘号) · 每格上沿=背面,下沿=正面',
                 fontsize=12, family='monospace')
    fig.text(0.01, 0.005, '眼罩 3×3(EP9)与功能块另装,见 variant_map.json',
             fontsize=8, family='monospace', color='#8a8880')
    fig.savefig(f'{out}/assembly_sheet.png', dpi=140, facecolor='#f6f5f0',
                bbox_inches='tight')
    print(f'{len(layers)} layers · {len(cells)} cubes → {out}/assembly_sheet.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
