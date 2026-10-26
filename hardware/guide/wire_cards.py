#!/usr/bin/env python3
"""One card per touch wire: the chain of pieces from the board out to the touch cube, each with
its colour, assembly number, engraved code, what it looks like (bed face) and which face the wire
goes in / comes out of; plus where the chain sits on the body and the steps. All cards → one PDF.
Usage: python3 hardware/guide/wire_cards.py <set_dir> <kit_manifest.json> <out_dir>"""
import json
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
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from touch_wiring import WIRES, HEX
from piece_id import heightmap, shade
from seq_plates import seq_slots

FIL = {'serene-blue': ('宁静蓝', '#8fa6d8'), 'deep-green': ('深绿', '#2f5d48'), 'lavender': ('薰衣草紫', '#b7a6e0'),
       'purple': ('紫', '#7a4fb0'), 'rouge-snow': ('胭脂雪', '#e3c7c9'), 'white': ('白', '#f4f2ec')}
# board → touch cube. ('L', seq, in_face, out_face) wire cube; ('T', seq, wire_face, lid_face) touch cube;
# ('gap',) the wire crosses the hollow head. Faces as in fix_manifest.txt (the cube's own axes).
CHAINS = {
    10: [('T', '70', '后', '前')],
    6: [('L', '54', '右', '前'), ('T', '56', '后', '左')],
    7: [('L', '55', '左', '前'), ('T', '62', '后', '右')],
    9: [('L', '15', '上', '下'), ('T', '7', '上', '下')],
    5: [('L', '143', '下', '上'), ('L', '180', '下', '前'), ('T', '184', '后', '前')],
    1: [('L', '96', '右', '上'), ('L', '123', '右', '左'), ('T', '137', '右', '左')],
    2: [('L', '97', '左', '上'), ('L', '124', '左', '右'), ('T', '138', '左', '右')],
    0: [('L', '154', '下', '上'), ('gap',), ('L', '296', '下', '上'), ('T', '308', '下', '上')],
    11: [('L', '134', '下', '上'), ('gap',), ('T', '236', '前', '后')],
}
ORDER = [10, 6, 7, 9, 5, 1, 2, 0, 11]


def load_pieces(set_dir):
    man = open(f'{set_dir}/fix_manifest.txt', encoding='utf-8').read()
    pieces, colour, codes = {}, {}, {}
    for line in man.splitlines():
        m = re.match(r'(fix_\d+_([a-z-]+)_\d+\.stl|fix_white_\d+\.stl)\s', line)
        if not m:
            continue
        stl = m.group(1); slug = m.group(2) or 'white'
        labels = line.split(':', 1)[1].split()
        mesh = trimesh.load(f'{set_dir}/{stl}')
        parts = sorted([c for c in mesh.split(only_watertight=False) if c.volume > 1],
                       key=lambda c: (round(c.bounds[0][1] / 16), round(c.bounds[0][0] / 16)))
        for p, lab in zip(parts, labels):
            pieces[lab] = p
            colour[re.match(r'\d+', lab).group()] = slug
    codes.update(re.findall(r'序号\s*(\d+) .*?(?:\) )([A-Z]-[0-9A-F]{2})', man))
    return pieces, colour, codes


def draw_card(pad, pieces, colour, codes, K, res, pdf, out_dir):
    _, name, _, col, tape, cm = WIRES[pad]
    chain = CHAINS[pad]
    n = len(chain) + 1
    fig = plt.figure(figsize=(max(13, 3.3 * n + 4.5), 10.6), facecolor='#f6f5f0')
    W = max(13, 3.3 * n + 4.5)
    fig.text(0.02, 0.955, f"E{pad} · {name}", fontsize=22, weight='bold')
    fig.text(0.02, 0.915, f"线:{col}{f' + {tape} 道胶带' if tape else ''} · 剪 {cm} cm · 从主板往外穿,"
             f"最后一站是触摸块", fontsize=12, color='#33312b')
    # ---- chain row
    x0, bw, y0 = 0.02, 2.75 / W, 0.34
    def box(ix):
        return x0 + ix * (bw + 0.55 / W)
    ax = fig.add_axes([box(0), y0 + 0.12, bw, 0.3]); ax.axis('off')
    ax.add_patch(FancyBboxPatch((0.05, 0.1), 0.9, 0.8, boxstyle='round,pad=0,rounding_size=0.06', fc='#2e7d5b',
                                ec='#1c1c1a', transform=ax.transAxes))
    ax.text(0.5, 0.62, '主板 J7', ha='center', color='w', fontsize=15, weight='bold', transform=ax.transAxes)
    ax.text(0.5, 0.4, f'E{pad} 孔(从上往下第 {pad + 1} 个)', ha='center', color='w', fontsize=9.5,
            transform=ax.transAxes)
    ax.plot([0.25, 0.75], [0.22, 0.22], color='#1c1c1a', lw=7, transform=ax.transAxes)
    ax.plot([0.25, 0.75], [0.22, 0.22], color=HEX[col], lw=5, transform=ax.transAxes)
    steps = []
    for i, st in enumerate(chain, start=1):
        fx = box(i)
        fig.text(fx - 0.45 / W, y0 + 0.27, '→', fontsize=26, ha='center', va='center', color='#55524a')
        if st[0] == 'gap':
            a = fig.add_axes([fx, y0 + 0.12, bw, 0.3]); a.axis('off')
            a.add_patch(FancyBboxPatch((0.05, 0.25), 0.9, 0.5, boxstyle='round,pad=0,rounding_size=0.06',
                                       fc='#ffffff', ec='#8a8578', ls='--', transform=a.transAxes))
            a.text(0.5, 0.5, '头里的空腔\n线自由穿过,多留 5 cm', ha='center', va='center', fontsize=11,
                   transform=a.transAxes)
            steps.append('线穿过头里的空腔(不经过方块),这一段先多留 5 cm。')
            continue
        kind, seq = st[0], st[1]
        slug = colour[seq]; cname, chex = FIL[slug]
        code = codes.get(seq, '')[2:]
        # header strip
        hx = fig.add_axes([fx, y0 + 0.4, bw, 0.13]); hx.axis('off')
        hx.add_patch(Rectangle((0, 0.55), 1, 0.45, fc=chex, ec='#1c1c1a', transform=hx.transAxes))
        hx.text(0.04, 0.77, f"{seq}", fontsize=20, weight='bold', va='center', transform=hx.transAxes,
                color='w' if slug in ('deep-green', 'purple') else '#1c1c1a')
        hx.text(0.96, 0.77, cname, fontsize=12, va='center', ha='right', transform=hx.transAxes,
                color='w' if slug in ('deep-green', 'purple') else '#1c1c1a')
        if kind == 'L':
            hx.text(0, 0.3, f"线槽块 · 2 件 {seq}LA + {seq}LB", fontsize=10.5, weight='bold', transform=hx.transAxes)
            hx.text(0, 0.03, f"刻字 {code} · 主板那头从【{st[2]}】进,从【{st[3]}】出", fontsize=10,
                    transform=hx.transAxes)
            imgs = [(f'{seq}LA', 'LA 剖面(有槽,线放这里)'), (f'{seq}LB', 'LB 剖面(平的,盖上去)')]
            steps.append(f"{seq}(线槽块,{cname}):线放进 {seq}LA 的槽,从【{st[2]}】面进、【{st[3]}】面出;"
                         f"剖面涂胶避开槽,合上 {seq}LB,装磁铁。")
        else:
            hx.text(0, 0.3, f"触摸块 · 2 件 {seq}Tbody + {seq}Tlid", fontsize=10.5, weight='bold',
                    transform=hx.transAxes)
            hx.text(0, 0.03, f"刻字 {code} · 线从【{st[2]}】进腔 · 盖子(摸的面)在【{st[3]}】", fontsize=10,
                    transform=hx.transAxes)
            imgs = [(f'{seq}Tbody', 'Tbody 方腔那面'), (f'{seq}Tlid', 'Tlid 薄盖(贴铜箔)')]
            steps.append(f"{seq}(触摸块,{cname}):线从【{st[2]}】的出线口进腔,拉出 2–3 cm 焊铜箔,"
                         f"铜箔贴在 {seq}Tlid 内侧,按 e 测过再粘盖。")
        for j, (lab, cap) in enumerate(imgs):
            a = fig.add_axes([fx + j * bw / 2, y0 + 0.1, bw / 2 - 0.004, 0.3]); a.axis('off')
            if 'Tlid' in lab:
                a.add_patch(Rectangle((0.1, 0.3), 0.8, 0.5, fc=chex, ec='#1c1c1a', transform=a.transAxes))
                a.add_patch(Rectangle((0.32, 0.43), 0.36, 0.24, fc='#c98b5a', ec='#8a5a33', transform=a.transAxes))
                a.text(0.5, 0.2, 'Tlid 薄盖 1.2 mm\n铜箔贴在这面', ha='center', va='top', fontsize=8.5,
                       transform=a.transAxes)
                continue
            else:
                a.imshow(shade(heightmap(pieces[lab], True)), cmap='Greys_r', vmin=-0.2, vmax=1.05, origin='lower')
            a.set_title(cap, fontsize=8.5, color='#55524a', pad=2)
    # ---- location inset
    front = {}
    for (x, y, z), c in K.items():
        if (x, y) not in front or z > front[(x, y)][0]:
            front[(x, y)] = (z, c)
    ia = fig.add_axes([0.02, 0.01, 0.26, 0.31]); ia.axis('off'); ia.set_aspect('equal')
    for (x, y) in front:
        ia.add_patch(Rectangle((x, y), 1, 1, fc='#dcd8cc', ec='#f6f5f0', lw=0.5))
    ia.add_patch(Rectangle((5, 2), 5, 6, fill=False, ec='#1c1c1a', lw=1, ls='--'))
    r = res[pad]
    pts = r['route']
    ia.plot([p[0] + 0.5 for p in pts], [p[1] + 0.5 for p in pts], color='#1c1c1a', lw=3.6)
    ia.plot([p[0] + 0.5 for p in pts], [p[1] + 0.5 for p in pts], color=HEX[col], lw=2.4)
    for b in r['bores']:
        ia.add_patch(Rectangle((b[0] + 0.1, b[1] + 0.1), 0.8, 0.8, fc='#d8b45a', ec='#1c1c1a', lw=0.6))
        ia.text(b[0] + 0.5, b[1] + 0.5, str(K[tuple(b)]['seq']), ha='center', va='center', fontsize=6.5, weight='bold')
    t = r['cell']
    ia.add_patch(Circle((t[0] + 0.5, t[1] + 0.5), 0.6, fc='#c14953', ec='#1c1c1a'))
    ia.text(t[0] + 0.5, t[1] + 0.5, str(K[tuple(t)]['seq']), ha='center', va='center', fontsize=7, color='w', weight='bold')
    ia.set_xlim(-0.5, 14.5); ia.set_ylim(-0.5, 16.5)
    ia.set_title('在身体上的位置(正面投影,以序号为准)', fontsize=9.5, color='#55524a')
    # ---- steps
    txt = '步骤(先把线从主板这头往外穿,一站一站来)\n\n' + '\n'.join(f'{i}. {s}' for i, s in enumerate(steps, 1)) + \
          f'\n{len(steps) + 1}. 插 USB,按 e 选到 E{pad},隔着盖子按住:信号 10 以上、显示「摸到」→ 粘盖。' \
          '\n\n站与站之间的线别拉紧,留 1–2 cm;拼身体时多余的线从主板那头收回去。'
    fig.text(0.31, 0.30, txt, fontsize=11, va='top', linespacing=1.55, wrap=True)
    png = f'{out_dir}/线路_E{pad:02d}_{name}.png'
    fig.savefig(png, dpi=105, facecolor='#f6f5f0')
    pdf.savefig(fig, facecolor='#f6f5f0')
    plt.close(fig)
    return png


def main(set_dir, kit_manifest, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    pieces, colour, codes = load_pieces(set_dir)
    man = json.load(open(kit_manifest)); seq_slots(man)
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    res = json.load(open(f'{set_dir}/touch_plan.json'))
    with PdfPages(f'{out_dir}/线路卡_全部.pdf') as pdf:
        for pad in ORDER:
            print(draw_card(pad, pieces, colour, codes, K, res, pdf, out_dir))


if __name__ == '__main__':
    main(*sys.argv[1:4])
