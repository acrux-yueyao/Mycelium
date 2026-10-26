#!/usr/bin/env python3
"""Piece-ID cards for the touch reprint set: every printed piece drawn as you hold it —
the face that was on the bed and the face that was up — with its assembly number, which
wire it carries and its height, one card per filament colour. For telling loose pieces apart.
Usage: python3 hardware/guide/piece_id.py <set_dir> <out_dir>
Reads <set_dir>/fix_*.stl + fix_manifest.txt"""
import glob
import os
import re
import sys

import numpy as np
import trimesh
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from touch_wiring import WIRES

RES = 0.1
WIRE_OF = {}                       # assembly number → 'E0 白 头顶'
ROUTES = {0: ['154', '296', '308'], 1: ['96', '123', '137'], 2: ['97', '124', '138'], 3: ['57'], 4: ['61'],
          5: ['143', '180', '184'], 6: ['54', '56'], 7: ['55', '62'], 9: ['15', '7'], 10: ['70'], 11: ['134', '236']}
for pad, name, cube, col, tape, cm in WIRES:
    for i, s in enumerate(ROUTES.get(pad, [])):
        WIRE_OF[s] = (f"E{pad} {col}{f'+{tape}道' if tape else ''} · {name}", i + 1, len(ROUTES[pad]))
KIND = {'LA': '线槽块·有槽的半块', 'LB': '线槽块·盖子半块', 'Tbody': '触摸块·身(有腔)', 'Tlid': '触摸块·薄盖'}


def heightmap(m, from_below):
    lo, hi = m.bounds
    xs = np.arange(lo[0] + RES / 2, hi[0], RES); ys = np.arange(lo[1] + RES / 2, hi[1], RES)
    X, Y = np.meshgrid(xs, ys)
    z0 = lo[2] - 1 if from_below else hi[2] + 1
    O = np.c_[X.ravel(), Y.ravel(), np.full(X.size, z0)]
    D = np.tile([0, 0, 1.0 if from_below else -1.0], (len(O), 1))
    loc, ir, _ = m.ray.intersects_location(O, D, multiple_hits=False)
    H = np.full(X.size, np.nan)
    H[ir] = (loc[:, 2] - lo[2]) if from_below else (hi[2] - loc[:, 2])
    H = H.reshape(X.shape)
    if from_below:
        H = H[:, ::-1]             # flipped over toward you: left/right swap
    return H


def shade(H, depth=3.0):
    """depth below the face → light (flat face) … dark (deep); holes → black."""
    v = 1 - np.clip(np.nan_to_num(H, nan=depth), 0, depth) / depth
    return v


def main(set_dir, out):
    os.makedirs(out, exist_ok=True)
    man = open(f'{set_dir}/fix_manifest.txt', encoding='utf-8').read()
    pngs = []
    for stl in sorted(glob.glob(f'{set_dir}/fix_*.stl')):
        stem = os.path.basename(stl)[:-4]
        line = next(l for l in man.splitlines() if l.startswith(os.path.basename(stl)))
        title = line.split('  ', 1)[1].split(':')[0]
        labels = line.split(':', 1)[1].split()
        title = re.sub(r' · \d+ 件$', '', title)
        codes = {a: b for a, b in re.findall(r'序号\s*(\d+) .*?(?:\) |→ )([A-Z]-[0-9A-F]{2})\s*(?:$| )', man, re.M)}
        codes.update(re.findall(r'序号\s*(\d+) 改型 .*?→ ([A-Z]-[0-9A-F]{2})', man))   # modified cubes: new code
        m = trimesh.load(stl)
        parts = sorted([c for c in m.split(only_watertight=False) if c.volume > 1],
                       key=lambda c: (round(c.bounds[0][1] / 16), round(c.bounds[0][0] / 16)))
        assert len(parts) == len(labels), (stem, len(parts), len(labels))
        n = len(parts); cols = min(n, 4); rows = (n + cols - 1) // cols
        fig, axs = plt.subplots(rows, cols * 2, figsize=(cols * 4.6, rows * 3.0 + 1.6), facecolor='#f6f5f0',
                                squeeze=False)
        for ax in axs.flat:
            ax.axis('off')
        for i, (p, lab) in enumerate(zip(parts, labels)):
            r, c = divmod(i, cols)
            seq, kind = re.match(r'(\d+)(.*)', lab).groups()
            hgt = p.bounds[1][2] - p.bounds[0][2]
            for j, below in enumerate((True, False)):
                ax = axs[r][c * 2 + j]
                ax.imshow(shade(heightmap(p, below)), cmap='Greys_r', vmin=-0.2, vmax=1.05, origin='lower')
                ax.set_title('贴床那面(翻过来看)' if below else '朝上那面', fontsize=8, color='#55524a', pad=2)
            w = WIRE_OF.get(seq)
            code = codes.get(seq, '')
            tag = f"   刻字 {code[2:]}" if code and kind != 'Tlid' else ('   无刻字·同色薄盖几乎一样' if kind == 'Tlid' else '')
            head = (f"{seq} {kind}" if kind else f"{seq} 改型块 {dict(W='ToF 窗口', M='麦克风孔', C='普通').get(code[:1], '')}") + tag
            side = {'W': '侧面有一个大方窗,能看穿', 'M': '侧面有一个小圆孔,能看穿', 'C': '侧面没有孔'}.get(code[:1], '') if not kind else ''
            sub = (KIND.get(kind, '普通方块·没有线 · ' + side) + f" · 高 {hgt:.1f} mm") + \
                  (f"\n{w[0]} · 这根线第 {w[1]}/{w[2]} 站" if w else '\n不穿线,直接替换旧的同序号方块')
            axs[r][c * 2].text(0, 1.32, head, transform=axs[r][c * 2].transAxes, fontsize=13, weight='bold')
            axs[r][c * 2].text(0, 1.13, sub, transform=axs[r][c * 2].transAxes, fontsize=8.2, va='bottom',
                               color='#33312b')
        fig.suptitle(f'{title} · {n} 件\n灰度 = 深度(越黑越深,纯黑 = 通孔/空)· 认件先看高度:'
                     '薄盖 1.2 · LA 约 6 · LB 约 6.5 · Tbody 约 10.8', fontsize=12)
        fig.subplots_adjust(left=0.02, right=0.98, top=1 - 1.6 / (rows * 3.0 + 1.6), bottom=0.02,
                            hspace=0.95, wspace=0.08)
        png = f'{out}/认件_{stem}.png'
        fig.savefig(png, dpi=110, facecolor='#f6f5f0')
        plt.close(fig)
        pngs.append(png)
        print(png)
    return pngs


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
