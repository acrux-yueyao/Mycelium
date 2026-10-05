#!/usr/bin/env python3
"""
Eye-frame magnet cards — one card per eye cube, drawn as the real cube.

Eye frame cubes carry a corner of the shared screen pocket on the face
that sits on the bed, mix O4x2 and O2x1 magnets, and are easy to mix up
in the flat plate-sheet glyphs. Each card shows the printed cube exactly
as it sits on the plate (seen from the front-right and the back-left,
both from above) with every pocket labelled in place: size + pole that
faces OUT. The bed-side screen notch is the landmark: notch down, then
read the labels.

Usage: python3 hardware/eye_magnet_cards.py <variants_dir> [out_dir]
Reads  kit_manifest.json   Writes eye_magnet_cards.png
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import cell_mesh, orient_mask, orient_flat_down
from magnet_polarity import plate_faces
from seq_plates import seq_slots
from plate_gen import GRID

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

NC, SC = '#c14953', '#3e6fb8'
VIEWS = ((28, -55, '前右上看'), (28, 125, '后左上看'))
# plate-frame direction → which view shows it
SEEN = {(0, 0, 1): (0, 1), (1, 0, 0): (0,), (0, -1, 0): (0,),
        (-1, 0, 0): (1,), (0, 1, 0): (1,)}
DIRNAME = {(0, 0, 1): '朝上', (1, 0, 0): '右', (-1, 0, 0): '左',
           (0, -1, 0): '朝你', (0, 1, 0): '朝盘后'}


def draw(ax, mesh, col, labels, elev, azim):
    v = mesh.vertices
    tri = v[mesh.faces]
    light = np.array([0.4, -0.6, 0.9]); light /= np.linalg.norm(light)
    shade = 0.45 + 0.55 * np.clip(mesh.face_normals @ light, 0, 1)
    base = np.array([int(col[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    fc = np.clip(base[None] * shade[:, None], 0, 1)
    ax.add_collection3d(Poly3DCollection(tri, facecolors=fc, edgecolors='none'))
    lo, hi = mesh.bounds
    c = (lo + hi) / 2
    for d, txt, tc in labels:
        p = c + np.array(d) * (hi - lo) / 2 * 1.55
        ax.text(*p, txt, ha='center', va='center', fontsize=8, fontweight='bold',
                color='#ffffff', bbox=dict(boxstyle='round,pad=0.25', fc=tc, ec='none'))
    ax.text(c[0], c[1], lo[2] - 3.2, '床面', ha='center', fontsize=6.5, color='#8a8880')
    r = 11
    ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
    ax.set_box_aspect((1, 1, 1))
    ax.view_init(elev=elev, azim=azim)
    ax.axis('off')


def main(vdir, out=None):
    out = out or vdir
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    names = man.get('color_names') or [None] * len(man['colors'])
    nos = man.get('color_nos') or [''] * len(names)
    where = {}
    for ci in {c['ci'] for c in man['cells']}:
        for slots in seq_slots(man, {ci}):
            for k, c in slots:
                where[(c['x'], c['y'], c['z'])] = (c['seq'], ci, k // GRID + 1, k % GRID + 1)
    eyes = sorted((c for c in man['cells'] if c.get('eye')),
                  key=lambda c: where[(c['x'], c['y'], c['z'])][0])

    ncol = 2
    nrow = (len(eyes) + ncol - 1) // ncol
    fig = plt.figure(figsize=(8.6 * ncol, 3.9 * nrow + 1.6), facecolor='#f6f5f0')
    for i, c in enumerate(eyes):
        seq, ci, row, col = where[(c['x'], c['y'], c['z'])]
        mask = [tuple(m) for m in c['mask']]
        mesh, _ = orient_flat_down(cell_mesh(c['code'], mask, c['eye']),
                                   orient_mask(mask, c['eye']), c['code'], c.get('bed'))
        small = {tuple(k) for k in c['eye']['seam']}
        poles = dict(plate_faces(set(mask), small, c['code'], c.get('bed')))
        # the screen pocket opens through the rear face (mesh -y): where is it now?
        rear = dict(plate_faces({(1, False)}, (), c['code'], c.get('bed')))
        notch = next(d for d, p in rear.items() if p)
        r0, c0 = i // ncol, i % ncol
        rows_txt = []
        for vi, (elev, azim, vname) in enumerate(VIEWS):
            ax = fig.add_subplot(nrow, ncol * 3, r0 * ncol * 3 + c0 * 3 + vi + 1, projection='3d')
            ax.set_facecolor('#f6f5f0')
            labels = []
            for d, p in poles.items():
                if p and vi in SEEN.get(d, ()):
                    size = 'Ø2' if p.islower() else 'Ø4'
                    labels.append((d, f'{DIRNAME[d]} {size} {p.upper()}', NC if p.upper() == 'N' else SC))
                elif d == notch and vi in SEEN.get(d, ()):
                    labels.append((d, f'{DIRNAME[d]} 屏幕槽', '#8a8880'))
            draw(ax, mesh, man['colors'][ci], labels, elev, azim)
            ax.set_title(vname, fontsize=8, color='#6d6a62', pad=-4)
        for d in ((0, 0, 1), (-1, 0, 0), (1, 0, 0), (0, 1, 0), (0, -1, 0)):
            p = poles.get(d)
            rows_txt.append(f"{DIRNAME[d]:　<3} " + (f"{'Ø2×1' if p.islower() else 'Ø4×2'}  {p.upper()} 朝外" if p
                            else '屏幕槽缺口,不装' if d == notch else '平,不装'))
        bot = poles.get((0, 0, -1))
        rows_txt.append('床面　 ' + (f"{'Ø2×1' if bot.islower() else 'Ø4×2'} {bot.upper()} 朝外" if bot
                        else '屏幕槽缺口,不装' if notch == (0, 0, -1) else '平,不装'))
        nwhere = {(0, 0, -1): '缺口贴床(朝下)', (0, 0, 1): '缺口朝上'}.get(notch, '缺口在' + DIRNAME.get(notch, ''))
        tax = fig.add_subplot(nrow, ncol * 3, r0 * ncol * 3 + c0 * 3 + 3)
        tax.axis('off')
        tax.text(0, 0.98, f"{seq}号  {c['code']}", fontsize=13, fontweight='bold', va='top')
        plate = f"{nos[ci]}号盘" if nos[ci] else (names[ci] or '').split(' ')[0] + '盘'
        tax.text(0, 0.80, f"{plate} · 行{row} 第{col}列 · {nwhere}", fontsize=9, va='top', color='#6d6a62')
        tax.text(0, 0.62, '\n'.join(rows_txt), fontsize=9.5, va='top', linespacing=1.6)
    fig.suptitle('眼框块磁铁卡 · 方块按打印盘上的姿态画 · 标签=孔径 + 朝外的极 · 灰标签=屏幕槽(不装磁铁)\n'
                 '先别从盘上拆:按“行/列”找到这颗,对照图片摆正(缺口位置一致)再装 · 小孔 Ø2×1,大孔 Ø4×2 · '
                 '极性用涂红的基准磁铁确认', fontsize=12, y=0.997, va='top')
    fig.subplots_adjust(left=0.01, right=0.99, top=1 - 1.3 / (3.9 * nrow + 1.6), bottom=0.01,
                        wspace=0.02, hspace=0.12)
    fig.savefig(f'{out}/eye_magnet_cards.png', dpi=120, facecolor='#f6f5f0')
    print(f'{len(eyes)} eye cubes → {out}/eye_magnet_cards.png')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
