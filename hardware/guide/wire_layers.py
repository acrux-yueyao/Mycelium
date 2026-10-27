#!/usr/bin/env python3
"""Per-wire assembly pages: for each touch wire, the plan view of every layer it passes through
(same drawing convention as assembly_guide.py — builder stands behind Moony, page up = front,
left/right = your hands), every cube numbered and coloured as printed, the wire's cubes outlined in
the wire colour with what they are and which faces the wire uses, and the wire drawn through the
layer with ↑/↓ where it climbs to the next layer.
Usage: python3 hardware/guide/wire_layers.py <variants_dir> <touch_plan.json> <out_dir>"""
import json
import os
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seq_plates import build_order
from touch_wiring import WIRES, HEX
from wire_cards import CHAINS, ORDER


def luma(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def main(vdir, plan_p, out):
    os.makedirs(out, exist_ok=True)
    man = json.load(open(f'{vdir}/kit_manifest.json')); cells = man['cells']
    ordered, _ = build_order(cells)
    for i, c in enumerate(ordered):
        c['seq'] = i + 1
    K = {(c['x'], c['y'], c['z']): c for c in cells}
    plan = json.load(open(plan_p))
    X0, X1 = min(c['x'] for c in cells), max(c['x'] for c in cells) + 1
    Z0, Z1 = min(c['z'] for c in cells), max(c['z'] for c in cells) + 1
    layers_all = sorted({c['y'] for c in cells})
    with PdfPages(f'{out}/拼装图_每条线.pdf') as pdf:
        for pad in ORDER:
            _, name, _, col, tape, cm = WIRES[pad]
            r = plan[pad]; R = [tuple(p) for p in r['route']]
            info = {st[1]: st for st in CHAINS[pad] if st[0] != 'gap'}
            wcol = HEX[col] if col != '白' else '#c9c3b0'
            lys = sorted({p[1] for p in R if p in K} | {p[1] for p in R})
            lys = [ly for ly in lys if any(p[1] == ly and p in K for p in R)] or lys
            n = len(lys)
            fig, axs = plt.subplots(1, n, figsize=(6.2 * n + 0.6, 8.6), facecolor='#f6f5f0', squeeze=False)
            fig.text(0.015, 0.955, f'E{pad} · {name} · 线 {col}{f" + {tape} 道胶带" if tape else ""} · {cm} cm',
                     fontsize=18, weight='bold')
            seqs = ' → '.join(str(K[p]['seq']) for p in reversed(R) if p in K)
            fig.text(0.015, 0.915, f'从主板往外:{seqs}。按拼装顺序从下往上,每张是这条线经过的一层;'
                     '粗框 = 这条线的方块,粗线 = 走线,↑↓ = 线在这里竖着去上/下一层。站在机器人背后拼。',
                     fontsize=10.5, color='#55524a')
            for ax, ly in zip(axs[0], lys):
                ax.set_facecolor('#f6f5f0'); notes = []
                for c in cells:
                    if c['y'] == ly - 1:
                        ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc='none', ec='#c9c5ba', lw=0.6, ls=(0, (2, 2))))
                for c in cells:
                    if c['y'] != ly:
                        continue
                    k = (c['x'], c['y'], c['z']); fc = man['colors'][c['ci']]
                    mine = k in R
                    ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc=fc, ec='#1c1c1a', lw=0.6,
                                           alpha=1 if mine else 0.45))
                    tc = '#1c1c1a' if luma(fc) > 130 else '#f6f5f0'
                    if mine:
                        ax.text(c['x'] + 0.5, c['z'] + 0.62, str(c['seq']), ha='center', va='center', fontsize=10,
                                weight='bold', color='#1c1c1a', zorder=14,
                                bbox=dict(boxstyle='round,pad=0.12', fc='#ffffffe8', ec='none'))
                    else:
                        ax.text(c['x'] + 0.5, c['z'] + 0.5, str(c['seq']), ha='center', va='center', fontsize=7,
                                color=tc, alpha=0.7)
                    if mine:
                        ax.add_patch(Rectangle((c['x'] + 0.03, c['z'] + 0.03), 0.94, 0.94, fill=False, ec=wcol, lw=3.2, zorder=6))
                        ax.add_patch(Rectangle((c['x'] - 0.01, c['z'] - 0.01), 1.02, 1.02, fill=False, ec='#1c1c1a', lw=0.8, zorder=7))
                        st = info.get(str(c['seq']))
                        if st:
                            notes.append(f"{c['seq']}:" + (f'线槽块(LA+LB),线从【{st[2]}】进、【{st[3]}】出' if st[0] == 'L'
                                                            else f'触摸块(Tbody+Tlid),线从【{st[2]}】进腔,盖子朝【{st[3]}】'))
                # the cavity (board) outline on layers that have it
                if 2 <= ly <= 7:
                    ax.add_patch(Rectangle((5, 0), 5, 7, fill=False, ec='#2e7d5b', lw=1.4, ls='--'))
                    ax.text(7.5, 3.5, '主板空腔', ha='center', va='center', color='#2e7d5b', fontsize=9, alpha=0.8)
                # wire in this layer
                for p, q in zip(R, R[1:]):
                    if p[1] == ly and q[1] == ly:
                        ax.plot([p[0] + 0.5, q[0] + 0.5], [p[2] + 0.5, q[2] + 0.5], color='#1c1c1a', lw=4.6, zorder=10,
                                solid_capstyle='round')
                        ax.plot([p[0] + 0.5, q[0] + 0.5], [p[2] + 0.5, q[2] + 0.5], color=wcol, lw=3, zorder=11,
                                solid_capstyle='round')
                    for a, b in ((p, q), (q, p)):
                        if a[1] == ly and b[1] != ly:
                            up = b[1] > ly
                            ax.text(a[0] + 0.5, a[2] + 0.18, '↑上一层' if up else '↓下一层', ha='center', va='center',
                                    fontsize=7.5, weight='bold', color='#1c1c1a', zorder=15,
                                    bbox=dict(boxstyle='round,pad=0.12', fc=wcol, ec='#1c1c1a', lw=0.6))
                if R[-1][1] == ly:
                    e = R[-1]
                    ax.plot(e[0] + 0.5, e[2] + 0.5, 'o', ms=11, color='#2e7d5b', zorder=12)
                    ax.text(e[0] + 0.5, e[2] + 0.25, '→主板', ha='center', va='top', fontsize=8, color='#2e7d5b', zorder=12)
                ax.set_xlim(X0 - 0.5, X1 + 0.5); ax.set_ylim(Z0 - 1.0, Z1 + 0.6); ax.set_aspect('equal')
                ax.set_xticks([]); ax.set_yticks([])
                for sp in ax.spines.values():
                    sp.set_visible(False)
                li = layers_all.index(ly) + 1
                ax.set_title(f'第 {li} 层(从下往上)', fontsize=13, weight='bold')
                ax.text(0.02, 0.06, '\n'.join(notes), transform=ax.transAxes, fontsize=10, va='bottom',
                        bbox=dict(boxstyle='round,pad=0.4', fc='#ffffff', ec=wcol, lw=1.5))
                ax.text(X0 - 0.3, Z1 + 0.3, '← 你的左手', fontsize=8, color='#6d6a62')
                ax.text(X1 + 0.3, Z1 + 0.3, '你的右手 →', fontsize=8, color='#6d6a62', ha='right')
                ax.text((X0 + X1) / 2, Z1 + 0.3, '▲ 正面(远离你)', fontsize=8, color='#6d6a62', ha='center')
                ax.text((X0 + X1) / 2, Z0 - 0.75, '▼ 背面(靠近你)', fontsize=8, color='#6d6a62', ha='center')
            fig.subplots_adjust(left=0.01, right=0.99, top=0.86, bottom=0.02, wspace=0.05)
            png = f'{out}/拼装图_E{pad:02d}_{name}.png'
            fig.savefig(png, dpi=105, facecolor='#f6f5f0'); pdf.savefig(fig, facecolor='#f6f5f0'); plt.close(fig)
            print(png, 'layers', [layers_all.index(l) + 1 for l in lys])


if __name__ == '__main__':
    main(*sys.argv[1:4])
