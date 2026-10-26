#!/usr/bin/env python3
"""Beginner card: for every J7 pad, which cubes its wire runs through (touch cube + wire cubes,
by assembly number), drawn on the body's front projection in the wire's own colour.
Usage: python3 hardware/guide/touch_routes.py <kit_manifest.json> <touch_plan.json> <out.png>"""
import json
import os
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seq_plates import seq_slots
from touch_wiring import WIRES, HEX

man = json.load(open(sys.argv[1]))
res = json.load(open(sys.argv[2]))
seq_slots(man)                                   # assigns c['seq'] (global assembly order)
K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
front = {}
for (x, y, z), c in K.items():
    if (x, y) not in front or z > front[(x, y)][0]:
        front[(x, y)] = (z, c)
FACE = {'up': '上面', 'down': '底面', 'left': '左面', 'right': '右面', 'front': '正面', 'back': '背面'}

fig, axs = plt.subplots(3, 4, figsize=(17, 16.5), facecolor='#f6f5f0')
for ax, (pad, name, cube, col, tape, cm) in zip(axs.flat, WIRES):
    r = res[pad]
    ax.set_facecolor('#f6f5f0'); ax.set_aspect('equal'); ax.axis('off')
    for (x, y), (_, c) in front.items():
        ax.add_patch(Rectangle((x, y), 1, 1, fc='#dcd8cc', ec='#f6f5f0', lw=0.6))
    ax.add_patch(Rectangle((5, 2), 5, 6, fill=False, ec='#1c1c1a', lw=1.2, ls='--'))
    ax.text(7.5, 2.3, '主板', ha='center', fontsize=8, color='#55524a')
    ink = HEX[col] if col != '白' else '#b9b4a6'
    steps = []
    if r['route']:
        pts = r['route']
        ax.plot([p[0] + 0.5 for p in pts], [p[1] + 0.5 for p in pts], color='#1c1c1a', lw=4.2, zorder=3)
        ax.plot([p[0] + 0.5 for p in pts], [p[1] + 0.5 for p in pts], color=HEX[col], lw=3, zorder=4)
        for b in r['bores']:
            c = K[tuple(b)]
            ax.add_patch(Rectangle((b[0] + 0.12, b[1] + 0.12), 0.76, 0.76, fc='#d8b45a', ec='#1c1c1a', lw=0.8, zorder=5))
            ax.text(b[0] + 0.5, b[1] + 0.5, str(c['seq']), ha='center', va='center', fontsize=7.5, weight='bold', zorder=6)
            steps.append(f"线槽块 {c['seq']}(第 {b[1] + 1} 层{'·靠后' if b[2] < 6 else ''})")
        t = r['cell']; c = K[tuple(t)]
        ax.add_patch(Circle((t[0] + 0.5, t[1] + 0.5), 0.62, fc='#c14953', ec='#1c1c1a', lw=1, zorder=7))
        ax.text(t[0] + 0.5, t[1] + 0.5, str(c['seq']), ha='center', va='center', fontsize=8, color='w', weight='bold', zorder=8)
        head = f"触摸块 {c['seq']}(第 {t[1] + 1} 层 · 摸{FACE[r['face']]})"
    else:
        ax.add_patch(Rectangle((5.3, 6.2), 4.4, 1.4, fc='#d8b45a', ec='#1c1c1a', zorder=5))
        ax.text(7.5, 6.9, '门板内侧铜箔卡片', ha='center', va='center', fontsize=8, zorder=6)
        head = '门板铜箔(不经过方块)'
    ax.set_xlim(-0.5, 14.5); ax.set_ylim(-1.8, 17.8)
    ax.add_patch(Rectangle((0.2, 16.75), 1.4, 0.7, fc=HEX[col], ec='#1c1c1a'))
    for b in range(tape):
        ax.add_patch(Rectangle((0.55 + b * 0.45, 16.65), 0.22, 0.9, fc='#efe3c2', ec='#8a7a52', lw=0.6))
    ax.text(1.9, 17.1, f"E{pad} {col}{f'+{tape}道胶带' if tape else ''} · {name} · {cm} cm",
            fontsize=11.5, weight='bold', va='center')
    ax.text(0.2, -0.6, head + ('\n→ ' + ' → '.join(steps) if steps else '') + '\n→ 主板 J7',
            fontsize=8.6, va='top', color='#33312b')

fig.suptitle('每一路触摸线经过哪些方块 · 红圈 = 触摸块,金方块 = 线槽块,数字 = 拼装序号,虚线 = 主板/空腔\n'
             '图是正面投影(和 touch_plan.png 同向);以序号为准。「靠后」= 在后面几排,正面投影里被挡住',
             fontsize=13, y=0.995)
fig.subplots_adjust(left=0.01, right=0.99, top=0.93, bottom=0.02, wspace=0.04, hspace=0.12)
fig.savefig(sys.argv[3], dpi=110, facecolor='#f6f5f0')
