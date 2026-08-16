#!/usr/bin/env python3
"""
Magnet polarity sheet — which pole faces OUT of every pocket.

One global rule governs the whole machine: every magnet's N pole points
toward creature LEFT / DOWN / BACK (−x/−y/−z). Hence −faces have N
outward, +faces have S outward, and any two mating faces attract.
(Flipped 2026-08 to match the user's physical reference magnet; a global
N↔S swap is physically equivalent as long as EVERYTHING follows it.)

But on the print plate each variant is rotated (flat show-face down), so
"which pocket gets N-out" depends on the variant's plate orientation.
This script replays orient_flat_down for every variant in a kit manifest
and draws one unfolded-cross card per variant: the cube exactly as it
sits on the bed, each open pocket marked N (red) or S (blue).

Workflow: glue magnets while the cubes are still on the plate (or lift
one at a time) — that is the only moment orientation is free knowledge.

Usage: python3 hardware/magnet_polarity.py <variants_dir> [out_dir]
Reads  kit_manifest.json   Writes magnet_polarity.png
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import FACE_KEYS, FLAT_PREF, FLAT_ROT

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

N_COL, S_COL, FLAT_COL = '#c14953', '#3e6fb8', '#dedbd2'
# plate-frame direction → cell position in the unfolded cross (col,row)
CROSS = {(0, 0, 1): (1, 2, '上'), (0, 0, -1): (1, 0, '下·贴床'),
         (1, 0, 0): (2, 2, '右'), (-1, 0, 0): (0, 2, '左'),
         (0, -1, 0): (1, 1, '前·朝你'), (0, 1, 0): (1, 3, '后')}


def plate_faces(mask):
    """mask (set of face keys) → list of (plate_dir, pole|None) per face."""
    rot = np.eye(3)
    for key in FLAT_PREF:
        if key not in mask:
            r = FLAT_ROT[key]
            if r is not None:
                rot = np.asarray(r)[:3, :3]
            break
    out = []
    for (axis, pos), _ in FACE_KEYS:
        n = np.zeros(3)
        n[axis] = 1 if pos else -1
        w = tuple(int(round(v)) for v in rot @ n)
        out.append((w, ('S' if pos else 'N') if (axis, pos) in mask else None))
    return out


def main(vdir, out=None):
    out = out or vdir
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    variants = {}
    for c in man['cells']:
        v = variants.setdefault(c['code'],
                                {'mask': {tuple(k) for k in c['mask']}, 'n': 0})
        v['n'] += 1

    codes = sorted(variants)
    ncol = 6
    nrow = (len(codes) + ncol - 1) // ncol
    fig = plt.figure(figsize=(2.1 * ncol, 2.75 * nrow + 2.2), facecolor='#f6f5f0')
    gs = fig.add_gridspec(nrow, ncol, left=0.02, right=0.98,
                          top=1 - 1.9 / (2.75 * nrow + 2.2), bottom=0.02,
                          hspace=0.55, wspace=0.25)
    for i, code in enumerate(codes):
        ax = fig.add_subplot(gs[i // ncol, i % ncol])
        ax.axis('off'); ax.set_facecolor('#f6f5f0')
        for w, pole in plate_faces(variants[code]['mask']):
            cx, cy, name = CROSS[w]
            fc = {None: FLAT_COL, 'N': N_COL, 'S': S_COL}[pole]
            ax.add_patch(Rectangle((cx, cy), 0.94, 0.94, fc=fc,
                                   ec='#1c1c1a', lw=0.6))
            ax.text(cx + 0.47, cy + 0.55, pole or '平', ha='center', va='center',
                    fontsize=11 if pole else 8, family='monospace',
                    color='#ffffff' if pole else '#8a8880',
                    fontweight='bold' if pole else 'normal')
            ax.text(cx + 0.47, cy + 0.17, name, ha='center', va='center',
                    fontsize=5.2, family='monospace',
                    color='#ffffff' if pole else '#8a8880')
        ax.set_xlim(-0.1, 3.05); ax.set_ylim(-0.1, 4.05)
        ax.set_aspect('equal')
        ax.set_title(f'{code} ×{variants[code]["n"]}', fontsize=10,
                     family='monospace')
    fig.suptitle('磁铁极性卡 · 方块按打印盘上的姿态画(展开图) · N=红 S=蓝 = 朝外那面的极\n'
                 '总规则:全机磁铁 N 极统一指向 左/下/后 —— 装配后用基准磁铁抽查即可\n'
                 '操作:①取一颗磁铁涂红一面记作 N(基准) ②新磁铁吸上红面,露出的那面就是 N\n'
                 '③对照本卡:标 N 的袋,N 面朝外压入;标 S 的袋反之 ④趁方块还在盘上装,别先拆',
                 fontsize=11, family='monospace', y=0.995, va='top')
    fig.text(0.02, 0.005,
             '眼罩缝 Ø2×1 与 MC02 背板磁位同一总规则(背板 8 颗:S 朝前=朝方块)· 涂 Loctite 凝胶再压入',
             fontsize=8.5, family='monospace', color='#8a8880')
    fig.savefig(f'{out}/magnet_polarity.png', dpi=140, facecolor='#f6f5f0',
                bbox_inches='tight')
    print(f'{len(codes)} variant cards → {out}/magnet_polarity.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
