#!/usr/bin/env python3
"""
Assembly guide — one big page per layer, bottom-up.

Each page is the plan view of one layer (top of page = creature BACK,
bottom = FRONT, left = creature left). Cells show the assembly number
(= tray / plate number) on the zone colour, the layer below is drawn as
a faint outline so the new layer can be aligned on it, and special
cubes are marked: eye frames (blue dashed), function cubes W/M/U/G
(letter), two-piece touch / wire cubes (hatched, from touch_plan.json).

The orientation rule is printed on every page: every coupled face is
engraved with its pole - S faces point RIGHT / FRONT / UP, N faces point
LEFT / BACK / DOWN. A cube that breaks the rule is turned wrong.

Usage: python3 hardware/assembly_guide.py <variants_dir> <out_dir>
Writes assembly_guide.pdf + layer_<n>.png
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seq_plates import build_order

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, Circle

NC, SC = '#c14953', '#3e6fb8'


def luma(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def main(vdir, out):
    os.makedirs(out, exist_ok=True)
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    cells = man['cells']
    ordered, hanging = build_order(cells)
    for i, c in enumerate(ordered):
        c['seq'] = i + 1
    names = man.get('color_names') or [''] * len(man['colors'])
    nos = man.get('color_nos') or [''] * len(names)
    two = set()
    if os.path.exists(f'{vdir}/touch_plan.json'):
        K = {(c['x'], c['y'], c['z']) for c in cells}
        for r in json.load(open(f'{vdir}/touch_plan.json')):
            two |= {tuple(p) for p in r.get('route', []) if tuple(p) in K}
    layers = sorted({c['y'] for c in cells})
    X0, X1 = min(c['x'] for c in cells), max(c['x'] for c in cells) + 1
    Z0, Z1 = min(c['z'] for c in cells), max(c['z'] for c in cells) + 1
    W, D = X1 - X0, Z1 - Z0
    pdf = PdfPages(f'{out}/assembly_guide.pdf')
    for li, ly in enumerate(layers):
        this = [c for c in cells if c['y'] == ly]
        below = [c for c in cells if c['y'] == ly - 1]
        fig, ax = plt.subplots(figsize=(11, 8.5), facecolor='#f6f5f0')
        ax.set_facecolor('#f6f5f0')
        door = [c for c in cells if c.get('tag') == 'door']
        if door and any(c['door_face'][0] == 0 and c['y'] == ly for c in door) or \
           door and min(c['y'] for c in door if c['door_face'][0] == 0) <= ly <= max(c['y'] for c in door if c['door_face'][0] == 0) + 0:
            pass
        if door:
            zb = door[0]['z']; xs_ = sorted({c['x'] for c in door if c['door_face'][0] == 2})
            ys_ = [c['y'] for c in door if c['door_face'][0] == 2]
            if min(ys_) < ly < max(ys_):
                for x in range(min(c['x'] for c in door if c['door_face'][0] == 0) + 1, max(c['x'] for c in door if c['door_face'][0] == 0)):
                    ax.add_patch(Rectangle((x, zb), 1, 1, fc='#e6e2d8', ec='#8a8880', lw=0.8, hatch='..'))
                ax.text((min(c['x'] for c in door) + max(c['x'] for c in door) + 1) / 2, zb + 0.5, '门板 MC04-D(最后装)', ha='center',
                        va='center', fontsize=8, color='#6d6a62', family='monospace')
        for c in below:                                 # alignment ghost
            ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc='none', ec='#b8b4a8', lw=0.8, ls=(0, (2, 2))))
        for c in this:
            col = man['colors'][c['ci']]
            ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc=col, ec='#1c1c1a', lw=1.0))
            k = (c['x'], c['y'], c['z'])
            if k in two:
                ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fill=False, ec='#1c1c1a', lw=0.6, hatch='///'))
            if c.get('eye'):
                ax.add_patch(Rectangle((c['x'] + 0.06, c['z'] + 0.06), 0.88, 0.88, fill=False, ec='#3b82f6', lw=2, ls='--'))
            tc = '#1c1c1a' if luma(col) > 130 else '#f6f5f0'
            # magnet pockets in the CREATURE frame: + faces (right/front/up) S out, - faces N out
            mask = {tuple(m) for m in c['mask']}
            seam = {tuple(m) for m in c['eye']['seam']} if c.get('eye') else set()
            x0, z0 = c['x'], c['z']
            marks = {(0, False): (x0 + 0.12, z0 + 0.5, 'N'), (0, True): (x0 + 0.88, z0 + 0.5, 'S'),
                     (1, False): (x0 + 0.5, z0 + 0.12, 'N'), (1, True): (x0 + 0.5, z0 + 0.88, 'S')}
            for key, (mx, mz, pole) in marks.items():
                if key in mask:
                    small = key in seam
                    sz = 0.14 if small else 0.2
                    ax.add_patch(Rectangle((mx - sz / 2, mz - sz / 2), sz, sz, fc=NC if pole == 'N' else SC, ec='#1c1c1a', lw=0.3))
                    ax.text(mx, mz, pole.lower() if small else pole, ha='center', va='center', fontsize=5 if small else 6,
                            color='#ffffff', family='monospace', fontweight='bold')
            if (2, True) in mask:                                  # up face
                ax.add_patch(Circle((x0 + 0.5, z0 + 0.42), 0.2, fc=SC, ec='#1c1c1a', lw=0.3))
                ax.text(x0 + 0.5, z0 + 0.42, str(c['seq']), ha='center', va='center', fontsize=8, fontweight='bold',
                        color='#ffffff', family='monospace')
            else:
                ax.text(x0 + 0.5, z0 + 0.42, str(c['seq']), ha='center', va='center', fontsize=10, fontweight='bold',
                        color=tc, family='monospace')
            if (2, False) in mask:                                 # down face
                ax.text(x0 + 0.22, z0 + 0.3, '底N', ha='center', va='center', fontsize=5, color=NC, family='monospace', fontweight='bold')
            tag = c['code'][0] if c['code'][0] in 'WMUG' else ''
            ax.text(c['x'] + 0.5, c['z'] + 0.7, (tag + ' ' if tag else '') + c['code'][2:], ha='center', va='center',
                    fontsize=5.5, color=tc, family='monospace')
        # frame + axes
        ax.set_xlim(X0 - 0.8, X1 + 0.8); ax.set_ylim(Z0 - 1.2, Z1 + 0.8)
        ax.set_aspect('equal')                      # z (front) increases UP the page: builder stands behind
        ax.set_xticks([x + 0.5 for x in range(X0, X1)]); ax.set_xticklabels([str(x - X0 + 1) for x in range(X0, X1)], fontsize=8)
        ax.set_yticks([]); ax.tick_params(length=0)
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.text(X0 - 0.5, Z1 + 0.5, '← 你的左手', fontsize=9, color='#6d6a62', ha='left')
        ax.text(X1 + 0.5, Z1 + 0.5, '你的右手 →', fontsize=9, color='#6d6a62', ha='right')
        ax.text((X0 + X1) / 2, Z1 + 0.5, '▲ 正面(脸,远离你)', fontsize=9, color='#6d6a62', ha='center')
        ax.text((X0 + X1) / 2, Z0 - 0.6, '▼ 背面(后,靠近你)— 你站在机器人背后拼', fontsize=9, color='#6d6a62', ha='center')
        cols_here = sorted({c['ci'] for c in this})
        legend = ' · '.join(f"{nos[ci]}号 {names[ci].split(' ')[0] if names[ci] else ''}" for ci in cols_here)
        ax.set_title(f'第 {li + 1} / {len(layers)} 层(从下往上)· 本层 {len(this)} 颗 · 序号 '
                     f'{min(c["seq"] for c in this)}–{max(c["seq"] for c in this)}\n{legend}',
                     fontsize=12, family='monospace')
        fig.text(0.5, 0.015,
                 '站在机器人背后拼 · 刻 S 的面朝 右手/远处/上,刻 N 的面朝 左手/近处/下 · 从盘里拿方块:抬起远离你的那边,向你翻 90° 立起来\n'
                 '边上小块=侧面磁铁袋 · 蓝圆底序号=朝上有袋(S) · 底N=朝下有袋 · 小写=Ø2×1 · 灰虚线=下一层 · 蓝虚框=眼框 · 斜线=两件式 · W ToF M 麦 U 充电 G 喇叭',
                 ha='center', fontsize=8.5, family='monospace', color='#6d6a62')
        fig.tight_layout(rect=(0, 0.05, 1, 1))
        fig.savefig(f'{out}/layer_{li + 1:02d}.png', dpi=130, facecolor='#f6f5f0')
        pdf.savefig(fig, facecolor='#f6f5f0')
        plt.close(fig)
    pdf.close()
    print(f'{len(layers)} layers → {out}/assembly_guide.pdf')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
