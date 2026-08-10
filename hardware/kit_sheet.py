#!/usr/bin/env python3
"""
Mosaic kit sheet — the per-sentence "外形图纸".

Takes a --companion voxel dump (spore3d) and produces the assembly drawing
for the magnetic mosaic cubes: cover view, layer-by-layer build plans
(bottom-up), the core-cartridge void, and the parts bill (cubes per colour,
magnets, steel discs).

Kit conventions:
  - cube pitch 12 mm (brick_lib.mosaic_cube), one voxel = one cube
  - core void: 6 × 7 × 3 cells anchored to the eye rows; front wall keeps
    one cell; the cartridge slides in from the BACK, lid flush
  - the ±4 mm eye-line offset between grid and cartridge is absorbed in
    firmware (eyes draw a few pixels higher on the OLEDs)

Usage: python3 hardware/kit_sheet.py <base>   (expects <base>.json)
Writes <base>_kit.pdf
"""
import json
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = ['Noto Sans CJK SC', 'DejaVu Sans Mono', 'monospace']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle

MAX_COLORS = 8


def quantize(hexes):
    rgb = np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
                    for h in hexes], float)
    uniq = np.unique(rgb, axis=0)
    k = min(MAX_COLORS, len(uniq))
    centers = uniq[np.linspace(0, len(uniq) - 1, k).astype(int)].copy()
    for _ in range(12):
        d = ((rgb[:, None] - centers[None]) ** 2).sum(2)
        lab = d.argmin(1)
        for i in range(k):
            if (lab == i).any():
                centers[i] = rgb[lab == i].mean(0)
    d = ((rgb[:, None] - centers[None]) ** 2).sum(2)
    return d.argmin(1), centers.astype(int)


def main(base):
    meta = json.load(open(base + '.json'))
    a = meta['anchor']
    rows, cols = a['rows'], a['cols']
    Z = meta['dims'][2]
    vox = meta['voxels']

    # core void: 6 cols from anchor, 7 engine rows around the eyes, back 3 depth
    vc0 = a['coreC0']
    vr0, vr1 = a['eyeRow'] - 2, a['eyeRow'] + 4        # inclusive engine rows
    void = lambda x, r, z: (vc0 <= x < vc0 + 6) and (vr0 <= r <= vr1) and z < Z - 1

    kit, removed = [], 0
    for x, y, z, hexcol, *_ in vox:
        r = rows - 1 - y                                # engine row
        if void(x, r, z):
            removed += 1
            continue
        kit.append((x, y, z, hexcol))
    lab, centers = quantize([v[3] for v in kit])
    chex = ['#%02x%02x%02x' % tuple(c) for c in centers]

    counts = np.bincount(lab, minlength=len(centers))
    total = len(kit)

    with PdfPages(base + '_kit.pdf') as pdf:
        # ---- cover: front view + stats ----
        fig, (ax, ax2) = plt.subplots(1, 2, figsize=(11, 7),
                                      facecolor='#f6f5f0', width_ratios=[3, 2])
        front = {}
        for (x, y, z, _), li in zip(kit, lab):
            if (x, y) not in front or z > front[(x, y)][0]:
                front[(x, y)] = (z, li)
        for (x, y), (z, li) in front.items():
            ax.add_patch(Rectangle((x, y), 1, 1, fc=chex[li], ec='#1c1c1a', lw=0.4))
        ax.set_xlim(-1, cols + 1); ax.set_ylim(-1, rows + 1)
        ax.set_aspect('equal'); ax.axis('off'); ax.set_facecolor('#f6f5f0')
        ax.set_title(f"{meta['name']} — mosaic kit", family='monospace', fontsize=13)
        ax2.axis('off'); ax2.set_facecolor('#f6f5f0')
        lines = [f"sentence  {meta['text']}",
                 f"family    {meta['family']}",
                 f"cubes     {total}",
                 f"magnets   {total * 3}  (O4x2 N35)",
                 f"discs     {total * 3}  (O5x0.5 steel)",
                 f"core void 6x7x3 cells, insert from back",
                 "", "colour bill:"]
        for i, c in enumerate(counts):
            lines.append(f"  [{i + 1}]  {chex[i]}   x {c}")
        ax2.text(0, 0.95, '\n'.join(lines), family='monospace',
                 fontsize=10.5, va='top')
        for i in range(len(centers)):
            ax2.add_patch(Rectangle((0.62, 0.95 - 0.264 - i * 0.0337), 0.05, 0.024,
                                    transform=ax2.transAxes, fc=chex[i], ec='#1c1c1a'))
        pdf.savefig(fig); plt.close(fig)

        # ---- layer plans, bottom-up, 4 per page ----
        layers = sorted({v[1] for v in kit})
        per_page = 4
        for p0 in range(0, len(layers), per_page):
            fig, axes = plt.subplots(1, per_page, figsize=(11, 4.2),
                                     facecolor='#f6f5f0')
            for ax, ly in zip(axes, layers[p0:p0 + per_page]):
                r = rows - 1 - ly
                for (x, y, z, _), li in zip(kit, lab):
                    if y != ly:
                        continue
                    ax.add_patch(Rectangle((x, z), 1, 1, fc=chex[li],
                                           ec='#1c1c1a', lw=0.5))
                    ax.text(x + 0.5, z + 0.5, str(li + 1), ha='center',
                            va='center', fontsize=6.5, family='monospace')
                if vr0 <= r <= vr1:
                    ax.add_patch(Rectangle((vc0, 0), 6, Z - 1, fill=False,
                                           ec='#5b4fd0', ls='--', lw=1.4))
                    ax.text(vc0 + 3, (Z - 1) / 2, 'CORE', ha='center',
                            va='center', fontsize=9, color='#5b4fd0',
                            family='monospace')
                ax.set_xlim(-0.5, cols + 0.5); ax.set_ylim(-0.5, Z + 0.5)
                ax.set_aspect('equal'); ax.invert_yaxis()
                ax.set_title(f'layer {layers.index(ly) + 1}/{len(layers)}  (bottom-up)',
                             fontsize=9, family='monospace')
                ax.set_xticks([]); ax.set_yticks([])
                ax.set_facecolor('#f6f5f0')
            for ax in axes[len(layers[p0:p0 + per_page]):]:
                ax.axis('off')
            fig.text(0.01, 0.02, 'top of plan = back of creature · numbers = colour bill',
                     fontsize=8, family='monospace', color='#8a8880')
            pdf.savefig(fig); plt.close(fig)

    print(f'kit: {total} cubes ({removed} voided for core) · {len(centers)} colours '
          f'→ {base}_kit.pdf')


if __name__ == '__main__':
    main(sys.argv[1])
