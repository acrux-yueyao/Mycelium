#!/usr/bin/env python3
"""
Filament palette card + printable swatch tags.

Reads hardware/filaments.json and writes:
  filament_palette.png  — the owned-spool colour card (zh/en names, hex)
  swatch_<id>.stl       — a 30×14×2 tag per spool with its id debossed;
                          print one on each spool, photograph all tags
                          together in daylight, and correct the hex values
                          in filaments.json from the photo.

Usage: python3 hardware/filament_swatch.py [out_dir] [--stl]
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

HERE = os.path.dirname(os.path.abspath(__file__))


def luma(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def main(out, stl=False):
    data = json.load(open(os.path.join(HERE, 'filaments.json')))
    fil = [f for f in data['filaments'] if f.get('owned')]
    cols = 4
    rows = (len(fil) + cols - 1) // cols
    fig, ax = plt.subplots(figsize=(10, 1.9 * rows + 1.0), facecolor='#f6f5f0')
    ax.axis('off')
    for i, f in enumerate(fil):
        x, y = (i % cols) * 2.5, -(i // cols) * 1.9
        ax.add_patch(Rectangle((x, y), 2.3, 1.2, fc=f['hex'], ec='#1c1c1a', lw=0.8))
        ink = '#1c1c1a' if luma(f['hex']) > 140 else '#f6f5f0'
        ax.text(x + 0.12, y + 0.95, (f"{f['no']}  " if f.get('no') else '') + f['zh'] + (' (备选)' if f.get('backup') else ''), fontsize=12, color=ink, va='center')
        ax.text(x + 0.12, y + 0.62, f['en'], fontsize=8, color=ink, va='center')
        ax.text(x + 0.12, y + 0.25, f['hex'], fontsize=8, color=ink, va='center')
        ax.text(x + 0.12, y - 0.2, f['id'], fontsize=7.5, color='#8a8880', va='center')
    ax.set_xlim(-0.2, cols * 2.5)
    ax.set_ylim(-(rows - 1) * 1.9 - 0.5, 1.5)
    ax.set_aspect('equal')
    ax.set_title(f"耗材色板 · {len(fil)} 卷 · {data.get('brand', '')}\n"
                 "hex 为照片估算值 — 打印色签日光下拍照后校准 filaments.json",
                 fontsize=10)
    fig.savefig(f'{out}/filament_palette.png', dpi=140, facecolor='#f6f5f0',
                bbox_inches='tight')
    print(f'{len(fil)} spools → {out}/filament_palette.png')

    if stl:
        sys.path.insert(0, HERE)
        import trimesh
        from trimesh.transformations import translation_matrix as TM
        from brick_lib import B
        from kit_cubes import _text_slab
        for f in fil:
            tag = B(0, 0, 0, 30, 14, 2)
            txt = _text_slab(f['id'], 5.0)
            txt.apply_transform(TM([15, 7, 2 - 0.6]))
            tag = trimesh.boolean.difference([tag, txt])
            tag.export(f"{out}/swatch_{f['id']}.stl")
        print(f'{len(fil)} swatch tags → {out}/swatch_*.stl')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0] if args else '.', '--stl' in sys.argv)
