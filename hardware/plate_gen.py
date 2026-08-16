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
from kit_cubes import orient_flat_down, variant_mesh

PITCH, GRID = 16.0, 13                  # 13×13 → 220 mm envelope


def layout_slots(cs, cap=GRID * GRID):
    """Sorted cells → pages of (slot, cluster_index, cell): cubes cluster
    by variant code with one blank slot between clusters. Shared by the
    plate packer, the polarity sheets and the storage tray."""
    paged, slots, k, cur, gi = [], [], 0, None, 0
    for c in cs:
        if cur is not None and c['code'] != cur:
            k += 1
            gi += 1
        cur = c['code']
        if k >= cap:
            paged.append(slots)
            slots, k = [], 0
        slots.append((k, gi, c))
        k += 1
    if slots:
        paged.append(slots)
    return paged


def main(vdir, out):
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    colors, cells = man['colors'], man['cells']
    os.makedirs(out, exist_ok=True)

    geo_cache = {}
    def geom(code, mask):
        if code not in geo_cache:
            m = variant_mesh(code, [tuple(k) for k in mask])
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
             f"orientation: flat show-face DOWN on the bed (textured PEI side)",
             f"layout: one plate per colour zone · sorted by variant · blank slot between variants", '']
    plates = []
    import matplotlib
    matplotlib.use('Agg')
    matplotlib.rcParams['font.family'] = 'monospace'
    matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    def shade(hexcol, f=0.8):
        r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
        return '#%02x%02x%02x' % (int(r * f), int(g * f), int(b * f))

    order = sorted(groups, key=lambda k: (k == 'ream', k))
    for key in order:
        cs = sorted(groups[key], key=lambda c: c['code'])
        col = '#8a8880' if key == 'ream' else colors[key]
        base = 'plate_ream' if key == 'ream' else f'plate_c{key}'
        # slot placement: cluster by variant code, one blank slot between clusters
        paged = layout_slots(cs)
        for n0, slots in enumerate(paged):
            parts, counts = [], {}
            for k, gi, c in slots:
                mesh, _ = geom(c['code'], c['mask'])
                p = mesh.copy()
                gx, gy = k % GRID, k // GRID
                lo = p.bounds[0]
                p.apply_transform(TM([gx * PITCH - lo[0], gy * PITCH - lo[1], -lo[2]]))
                parts.append(p)
                counts[c['code']] = counts.get(c['code'], 0) + 1
            plate = trimesh.util.concatenate(parts)
            fname = f'{base}_{n0 + 1}.stl'
            plate.export(f'{out}/{fname}')
            plates.append((fname, col, slots, counts))
            tagn = sum(1 for _, _, c in slots if c.get('tag'))
            lines.append(
                f'{fname:22s} 区域色 {col} · {len(slots):3d} 颗 · '
                + ' '.join(f'{k}×{v}' for k, v in sorted(counts.items()))
                + (f' · 功能位{tagn}(见map)' if tagn else '')
                + (' · ⚠全耦合:床面磁袋打完手工扩' if key == 'ream' else ''))
            # text layout map: bed row by row (row 1 = front/near edge)
            grid = {}
            for k, gi, c in slots:
                grid[(k % GRID, k // GRID)] = c['code'][2:]
            for gy in range((max(k for k, _, _ in slots) // GRID) + 1):
                lines.append('    行%2d  ' % (gy + 1) + ' '.join(
                    grid.get((gx, gy), '··') for gx in range(GRID)))
            lines.append('')

    # 预览图:每盘一格
    ncol = 3
    nrow = (len(plates) + ncol - 1) // ncol
    fig, axes = plt.subplots(nrow, ncol, figsize=(5.2 * ncol, 5.4 * nrow),
                             facecolor='#f6f5f0', squeeze=False)
    for ax in axes.flat:
        ax.axis('off')
    for ax, (fname, col, slots, counts) in zip(axes.flat, plates):
        ax.set_facecolor('#f6f5f0')
        ax.add_patch(Rectangle((-8, -8), GRID * PITCH + 12, GRID * PITCH + 12,
                               fill=False, ec='#8a8880', lw=1.2))
        for k, gi, c in slots:
            gx, gy = k % GRID, k // GRID
            fc = col if gi % 2 == 0 else shade(col)
            ax.add_patch(Rectangle((gx * PITCH, gy * PITCH), 12, 12,
                                   fc=fc, ec='#1c1c1a', lw=0.4))
            ax.text(gx * PITCH + 6, gy * PITCH + 6, c['code'][2:], ha='center',
                    va='center', fontsize=4.6, color='#1c1c1a')
        for gx in range(GRID):
            ax.text(gx * PITCH + 6, -6, str(gx + 1), ha='center', va='center',
                    fontsize=5.5, color='#8a8880')
        for gy in range((max(k for k, _, _ in slots) // GRID) + 1):
            ax.text(-6, gy * PITCH + 6, f'行{gy + 1}', ha='center', va='center',
                    fontsize=5.5, color='#8a8880')
        ax.set_xlim(-14, GRID * PITCH + 8)
        ax.set_ylim(-14, GRID * PITCH + 8)
        ax.set_aspect('equal')
        ax.set_title(f'{fname} · {len(slots)}颗 · 区域色{col}', fontsize=10,
                     family='monospace')
    fig.suptitle('moony_v2 打印排盘 · 外露面朝下 · 一盘一区域 · 格内数字=变体号 · 深浅相间=不同变体簇',
                 fontsize=13)
    fig.savefig(f'{out}/plates_preview.png', dpi=130, facecolor='#f6f5f0',
                bbox_inches='tight')

    # ---- per-plate polarity sheet: N/S marked on every pocket, in place ----
    from matplotlib.patches import Circle
    from magnet_polarity import plate_faces
    NC, SC, FC = '#c14953', '#3e6fb8', '#c9c5ba'
    EDGE = {(-1, 0, 0): (1.7, 6), (1, 0, 0): (10.3, 6),
            (0, 1, 0): (6, 10.3), (0, -1, 0): (6, 1.7)}
    for fname, col, slots, counts in plates:
        nrows = max(k for k, _, _ in slots) // GRID + 1
        fig, ax = plt.subplots(figsize=(11.5, nrows * 0.83 + 2.6),
                               facecolor='#f6f5f0')
        ax.axis('off'); ax.set_facecolor('#f6f5f0')
        for k, gi, c in slots:
            gx, gy = k % GRID, k // GRID
            x0, y0 = gx * PITCH, gy * PITCH
            fc = col if gi % 2 == 0 else shade(col)
            ax.add_patch(Rectangle((x0, y0), 12, 12, fc=fc, ec='#1c1c1a',
                                   lw=0.5, alpha=0.35))
            poles = dict(plate_faces({tuple(m) for m in c['mask']}))
            up = poles.get((0, 0, 1))
            ax.add_patch(Circle((x0 + 6, y0 + 6), 2.5,
                                fc={None: FC, 'N': NC, 'S': SC}[up],
                                ec='#1c1c1a', lw=0.5))
            ax.text(x0 + 6, y0 + 6, up or '平', ha='center', va='center',
                    fontsize=8 if up else 5.5, family='monospace',
                    fontweight='bold' if up else 'normal',
                    color='#ffffff' if up else '#6d6a62')
            for w, (ex, ey) in EDGE.items():
                p = poles.get(w)
                if p:
                    ax.add_patch(Rectangle((x0 + ex - 1.15, y0 + ey - 1.15),
                                           2.3, 2.3, fc={'N': NC, 'S': SC}[p],
                                           ec='#1c1c1a', lw=0.4))
                    ax.text(x0 + ex, y0 + ey, p, ha='center', va='center',
                            fontsize=5.5, family='monospace', color='#ffffff')
            ax.text(x0 + 1.2, y0 + 10.6, c['code'][2:], ha='left', va='center',
                    fontsize=5, family='monospace', color='#1c1c1a')
        for gx in range(GRID):
            ax.text(gx * PITCH + 6, -5, str(gx + 1), ha='center', va='center',
                    fontsize=7, color='#8a8880')
        for gy in range(nrows):
            ax.text(-7, gy * PITCH + 6, f'行{gy + 1}', ha='center', va='center',
                    fontsize=7, color='#8a8880')
        ax.set_xlim(-14, GRID * PITCH + 4)
        ax.set_ylim(-13, nrows * PITCH + 2)
        ax.set_aspect('equal')
        ax.set_title(f'{fname} 磁铁极性盘面图 · {len(slots)}颗 · 区域色{col}\n'
                     '中心圆=上袋 · 边小块=侧袋(左右/上=后/下=前) · 红N 蓝S 朝外 · '
                     '灰=无袋 · 贴床面=展示面无袋 · 左下角小字=变体号',
                     fontsize=10, family='monospace')
        fig.savefig(f'{out}/{fname[:-4]}_polarity.png', dpi=140,
                    facecolor='#f6f5f0', bbox_inches='tight')
        plt.close(fig)

    open(f'{out}/plates_manifest.txt', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    print(f'→ {len(plates)} plates in {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
