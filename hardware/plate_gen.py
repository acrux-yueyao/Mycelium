#!/usr/bin/env python3
"""
Print-plate packer — turn a kit manifest into ready-to-slice build plates.

One plate = one filament colour (single-nozzle printer). Within a plate,
every cube is oriented with a FLAT exposed face on the bed (rule ③ says
show faces carry no features), so on textured PEI the show face lands
down and picks up the matte finish, and no magnet pocket ever sits in
the elephant-foot zone. Cubes with no flat face (fully-coupled interior
survivors) go on their own final plate with a ⚠ ream note.

Grid: 12 mm cubes on a 16 mm pitch, 13×13 slots per plate (220×220 mm
envelope — fits any 235/256 bed).

Usage: python3 hardware/plate_gen.py <variants_dir> <out_dir>
Reads  kit_manifest.json (from kit_cubes.py)
Writes plate_<color>_<n>.stl + plates_manifest.txt + plates_preview.png
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.transformations import translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import mosaic_cube
from kit_cubes import orient_flat_down

PITCH, GRID = 16.0, 13                  # 13×13 → 220 mm envelope


def main(vdir, out):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    colors, cells = man['colors'], man['cells']
    os.makedirs(out, exist_ok=True)

    geo_cache = {}
    def geom(code, mask):
        if code not in geo_cache:
            m = mosaic_cube(faces=[tuple(k) for k in mask])
            geo_cache[code] = orient_flat_down(m, {tuple(k) for k in mask})
        return geo_cache[code]

    # 按颜色分组;全耦合(无平面)单独一盘
    groups = {}
    for c in cells:
        mesh, orient = geom(c['code'], c['mask'])
        hard = orient.startswith('⚠')
        key = 'ream' if hard else c['ci']
        groups.setdefault(key, []).append(c)

    lines = [f"moony print plates · cubes {len(cells)} · colours {len(colors)}",
             f"orientation: flat show-face DOWN on the bed (textured PEI side)", '']
    plates = []
    import matplotlib
    matplotlib.use('Agg')
    matplotlib.rcParams['font.family'] = 'monospace'
    matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    order = sorted(groups, key=lambda k: (k == 'ream', k))
    for key in order:
        cs = groups[key]
        col = '#8a8880' if key == 'ream' else colors[key]
        base = 'plate_ream' if key == 'ream' else f'plate_c{key}'
        for pi in range(0, len(cs), GRID * GRID):
            chunk = cs[pi:pi + GRID * GRID]
            parts, counts = [], {}
            for k, c in enumerate(chunk):
                mesh, _ = geom(c['code'], c['mask'])
                p = mesh.copy()
                gx, gy = k % GRID, k // GRID
                lo = p.bounds[0]
                p.apply_transform(TM([gx * PITCH - lo[0], gy * PITCH - lo[1], -lo[2]]))
                parts.append(p)
                counts[c['code']] = counts.get(c['code'], 0) + 1
            plate = trimesh.util.concatenate(parts)
            n = pi // (GRID * GRID) + 1
            fname = f'{base}_{n}.stl'
            plate.export(f'{out}/{fname}')
            plates.append((fname, col, chunk, counts))
            tagn = sum(1 for c in chunk if c.get('tag'))
            lines.append(
                f'{fname:22s} 颜色 {col} · {len(chunk):3d} 颗 · '
                + ' '.join(f'{k}×{v}' for k, v in sorted(counts.items()))
                + (f' · 功能位{tagn}(见map)' if tagn else '')
                + (' · ⚠全耦合:床面磁袋打完手工扩' if key == 'ream' else ''))

    # 预览图:每盘一格
    ncol = 3
    nrow = (len(plates) + ncol - 1) // ncol
    fig, axes = plt.subplots(nrow, ncol, figsize=(5.2 * ncol, 5.4 * nrow),
                             facecolor='#f6f5f0', squeeze=False)
    for ax in axes.flat:
        ax.axis('off')
    for ax, (fname, col, chunk, counts) in zip(axes.flat, plates):
        ax.set_facecolor('#f6f5f0')
        ax.add_patch(Rectangle((-8, -8), GRID * PITCH + 12, GRID * PITCH + 12,
                               fill=False, ec='#8a8880', lw=1.2))
        for k, c in enumerate(chunk):
            gx, gy = k % GRID, k // GRID
            ax.add_patch(Rectangle((gx * PITCH, gy * PITCH), 12, 12,
                                   fc=col, ec='#1c1c1a', lw=0.4))
            ax.text(gx * PITCH + 6, gy * PITCH + 6, c['code'][2:], ha='center',
                    va='center', fontsize=4.6, color='#1c1c1a')
        ax.set_xlim(-12, GRID * PITCH + 8)
        ax.set_ylim(-12, GRID * PITCH + 8)
        ax.set_aspect('equal')
        ax.set_title(f'{fname} · {len(chunk)}颗 · {col}', fontsize=10,
                     family='monospace')
    fig.suptitle('moony_v2 打印排盘 · 外露面朝下 · 一盘一色 · 格内数字=变体号',
                 fontsize=13)
    fig.savefig(f'{out}/plates_preview.png', dpi=130, facecolor='#f6f5f0',
                bbox_inches='tight')
    open(f'{out}/plates_manifest.txt', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    print(f'→ {len(plates)} plates in {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
