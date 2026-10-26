#!/usr/bin/env python3
"""Three views (+ a 3D view) of each touch wire's cubes in place on the body: which cells they
occupy, which neighbours they snap to, and the wire's path through them. Axes use the same words
as the wire cards (the robot's own 左右前后上下, as seen standing behind it: 右 = your right hand,
前 = away from you, 上 = up — the convention of TOUCH.md and the layer sheets).
Usage: python3 hardware/guide/wire_3view.py <set_dir> <kit_manifest.json> <out_dir>"""
import json
import os
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from touch_wiring import WIRES, HEX
from wire_cards import CHAINS, ORDER, FIL, load_pieces
from seq_plates import seq_slots

# view: (horizontal axis, vertical axis, depth axis, depth sign toward viewer, h label, v label)
VIEWS = [('后视图 · 站在机器人背后往前看', 0, 1, 2, -1, '← 左    右 →', '↑ 上'),
         ('俯视图 · 从头顶往下看', 0, 2, 1, +1, '← 左    右 →', '↑ 前(远离你)'),
         ('侧视图 · 从机器人右边看', 2, 1, 0, +1, '← 后    前 →', '↑ 上')]


def main(set_dir, kit_manifest, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    _, colour, codes = load_pieces(set_dir)
    man = json.load(open(kit_manifest)); seq_slots(man)
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    by_seq = {str(c['seq']): k for k, c in K.items()}
    res = json.load(open(f'{set_dir}/touch_plan.json'))
    with PdfPages(f'{out_dir}/三视图_全部.pdf') as pdf:
        for pad in ORDER:
            _, name, _, col, tape, cm = WIRES[pad]
            chain = [st for st in CHAINS[pad] if st[0] != 'gap']
            cells = {by_seq[st[1]]: st for st in chain}
            route = [tuple(p) for p in res[pad]['route']]
            pts = np.array(list(cells) + route)
            lo = pts.min(0) - 2; hi = pts.max(0) + 2
            ctx = [k for k in K if all(lo[i] <= k[i] <= hi[i] for i in range(3))]
            fig = plt.figure(figsize=(17, 11), facecolor='#f6f5f0')
            fig.text(0.02, 0.955, f"E{pad} · {name} · 线 {col}{f' + {tape} 道胶带' if tape else ''}", fontsize=20,
                     weight='bold')
            fig.text(0.02, 0.92, '彩色 = 这条线的方块(数字 = 拼装序号)· 灰 = 周围的普通方块(磁吸在一起)· '
                     '线 = 走线 · 虚线框 = 主板所在的空腔 · 虚线边的彩块 = 在这个方向被别的方块挡住',
                     fontsize=11, color='#55524a')
            for vi, (title, a, b, d, sgn, hl, vl) in enumerate(VIEWS):
                ax = fig.add_axes([0.02 + vi * 0.245, 0.08, 0.23, 0.78])
                ax.set_aspect('equal'); ax.axis('off'); ax.set_facecolor('#f6f5f0')
                for k in ctx:
                    ax.add_patch(Rectangle((k[a], k[b]), 1, 1, fc='#d6d2c6', ec='#f6f5f0', lw=0.8, alpha=0.55))
                # cavity (core) outline: x 5..9, y 2..7, z < 7
                cav_lo = {0: 5, 1: 2, 2: 0}; cav_hi = {0: 10, 1: 8, 2: 7}
                ax.add_patch(Rectangle((cav_lo[a], cav_lo[b]), cav_hi[a] - cav_lo[a], cav_hi[b] - cav_lo[b],
                                       fill=False, ec='#1c1c1a', lw=1, ls='--'))
                groups = {}
                for k, st in sorted(cells.items(), key=lambda kv: -sgn * kv[0][d]):   # nearest to viewer first
                    groups.setdefault((k[a], k[b]), []).append((k, st))
                for (u, v), grp in groups.items():
                    k, st = grp[0]                                   # the one you actually see
                    hidden = any(k2[a] == u and k2[b] == v and sgn * (k2[d] - k[d]) > 0 for k2 in ctx)
                    slug = colour[st[1]]
                    ax.add_patch(Rectangle((u + 0.04, v + 0.04), 0.92, 0.92, fc=FIL[slug][1], ec='#1c1c1a', lw=1.6,
                                           ls='--' if hidden else '-', alpha=0.75 if hidden else 1, zorder=3))
                    lab = ' 后面 '.join(g[1][1] for g in grp) if len(grp) > 1 else st[1]
                    ax.text(u + 0.5, v + 0.72, lab, ha='center', va='center', fontsize=10 if len(grp) == 1 else 8,
                            weight='bold', zorder=8, bbox=dict(boxstyle='round,pad=0.15', fc='#ffffffd0', ec='none'))
                    ax.text(u + 0.5, v + 0.2, '/'.join('触摸' if g[1][0] == 'T' else '线槽' for g in grp), ha='center',
                            va='center', fontsize=7, zorder=8, bbox=dict(boxstyle='round,pad=0.1', fc='#ffffffb0', ec='none'))
                ax.plot([p[a] + 0.5 for p in route], [p[b] + 0.5 for p in route], color='#1c1c1a', lw=2.6, zorder=5)
                ax.plot([p[a] + 0.5 for p in route], [p[b] + 0.5 for p in route], color=HEX[col], lw=1.6, zorder=6)
                e = route[-1]
                ax.plot(e[a] + 0.5, e[b] + 0.5, 'o', color='#2e7d5b', ms=9, zorder=7)
                ax.text(e[a] + 0.5, e[b] + 0.05, '→主板', ha='center', va='top', fontsize=8, color='#2e7d5b', zorder=7)
                ax.set_xlim(lo[a] - 0.3, hi[a] + 1.3); ax.set_ylim(lo[b] - 1.0, hi[b] + 1.3)
                ax.set_title(title, fontsize=12)
                ax.text(0.5, -0.01, hl, transform=ax.transAxes, ha='center', va='top', fontsize=10, color='#55524a')
                ax.text(-0.01, 0.5, vl, transform=ax.transAxes, ha='right', va='center', fontsize=10,
                        color='#55524a', rotation=90)
            # 3D
            ax3 = fig.add_axes([0.74, 0.08, 0.25, 0.78], projection='3d')
            shp = (hi - lo + 1).astype(int)
            vox = np.zeros((shp[0], shp[2], shp[1]), bool); fc = np.empty(vox.shape, object)
            for k in ctx:
                i = (k[0] - lo[0], k[2] - lo[2], k[1] - lo[1])
                vox[i] = True; fc[i] = '#d6d2c61c'
            for k, st in cells.items():
                i = (k[0] - lo[0], k[2] - lo[2], k[1] - lo[1])
                vox[i] = True; fc[i] = FIL[colour[st[1]]][1] + 'ff'
            ax3.voxels(vox, facecolors=fc, edgecolor='#ffffff40', linewidth=0.3)
            ax3.plot([p[0] - lo[0] + 0.5 for p in route], [p[2] - lo[2] + 0.5 for p in route],
                     [p[1] - lo[1] + 0.5 for p in route], color=HEX[col], lw=3)
            for k, st in cells.items():
                ax3.text(k[0] - lo[0] + 0.5, k[2] - lo[2] + 0.5, k[1] - lo[1] + 1.25, st[1], fontsize=9,
                         weight='bold', ha='center')
            ax3.set_xlabel('← 左  右 →'); ax3.set_ylabel('← 后  前 →'); ax3.set_zlabel('上 ↑')
            ax3.set_xticks([]); ax3.set_yticks([]); ax3.set_zticks([])
            ax3.set_box_aspect(shp[[0, 2, 1]]); ax3.view_init(22, -60)
            ax3.set_title('立体图(从右后上方看)', fontsize=12)
            png = f'{out_dir}/三视图_E{pad:02d}_{name}.png'
            fig.savefig(png, dpi=100, facecolor='#f6f5f0')
            pdf.savefig(fig, facecolor='#f6f5f0')
            plt.close(fig)
            print(png)


if __name__ == '__main__':
    main(*sys.argv[1:4])
