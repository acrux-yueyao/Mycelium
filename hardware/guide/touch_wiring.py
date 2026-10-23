#!/usr/bin/env python3
"""Beginner wiring card: TOUCH pads (J7, E0-E11) -> 12 touch points, with wire colour, tape marks and cut length.
Usage: python3 hardware/guide/touch_wiring.py <out.png>"""
import sys
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch, Circle

HEX = {'白': '#f4f2ec', '蓝': '#2f6fd0', '黄': '#e0b21b', '绿': '#2f9d5a', '红': '#d6453d', '黑': '#1c1c1a'}
# (pad, touch point, cube seq, colour, tape bands, cut cm) — same as print/moony_touch_v9/J7_wiring.txt
WIRES = [
    (0, '头顶', '308', '白', 0, 30),
    (1, '伞盖左缘', '137', '蓝', 0, 30),
    (2, '伞盖右缘', '138', '黄', 0, 25),
    (3, '左脸颊', '57', '绿', 0, 20),
    (4, '右脸颊', '61', '红', 0, 15),
    (5, '额头', '184', '黑', 0, 25),
    (6, '左侧身', '56', '蓝', 1, 20),
    (7, '右侧身', '62', '黄', 1, 15),
    (8, '背后', '门板铜箔', '白', 1, 20),
    (9, '底座边缘', '7', '绿', 1, 20),
    (10, '鼻尖', '70', '白', 2, 20),
    (11, '后脑勺', '236', '红', 1, 30),
]

fig, ax = plt.subplots(figsize=(13, 10), facecolor='#f6f5f0')
ax.set_facecolor('#f6f5f0'); ax.set_xlim(0, 130); ax.set_ylim(0, 100); ax.axis('off'); ax.set_aspect('equal')
ax.text(65, 97, 'Moony 触摸线 · J7 孔位 ↔ 线的颜色', ha='center', fontsize=17, weight='bold')
ax.text(65, 93.2, '主板正面朝你(眼睛插座在上),J7 是左边那一竖排 12 个孔,方形焊盘 = E0 在最上面', ha='center',
        fontsize=10.5, color='#55524a')

# board edge + J7 column
ax.add_patch(FancyBboxPatch((4, 8), 22, 80, boxstyle='round,pad=0,rounding_size=2', fc='#2e7d5b', ec='#1c1c1a'))
ax.text(15, 89.5, '主板左边', ha='center', fontsize=11, weight='bold')
ax.text(15, 10.5, '丝印 TOUCH E0..E11', ha='center', fontsize=8.5, color='white')
y0, dy = 82, 6
for pad, name, cube, col, tape, cm in WIRES:
    y = y0 - pad * dy
    shape = Rectangle((19.6, y - 1.4), 2.8, 2.8, fc='#d8b45a', ec='#1c1c1a') if pad == 0 else \
        Circle((21, y), 1.4, fc='#d8b45a', ec='#1c1c1a')
    ax.add_patch(shape)
    ax.add_patch(Circle((21, y), 0.55, fc='#1c1c1a'))
    ax.text(17, y, f'E{pad}', va='center', ha='right', fontsize=10, color='white', weight='bold')
    # wire
    ax.plot([21, 50], [y, y], color='#1c1c1a', lw=7.5, solid_capstyle='round', zorder=1)
    ax.plot([21, 50], [y, y], color=HEX[col], lw=6, solid_capstyle='round', zorder=2)
    for b in range(tape):                               # paper-tape bands near the board end
        ax.add_patch(Rectangle((34 + b * 3.2, y - 1.6), 1.8, 3.2, fc='#efe3c2', ec='#8a7a52', lw=0.8, zorder=3))
    ax.text(52, y, f'{col}' + (f' + {tape} 道胶带' if tape else ''), va='center', fontsize=11, weight='bold')
    ax.text(76, y, f'{name}', va='center', fontsize=11)
    ax.text(94, y, cube if not cube.isdigit() else f'{cube} 号方块', va='center', fontsize=10, color='#55524a')
    ax.text(116, y, f'{cm} cm', va='center', fontsize=11, weight='bold', ha='right')
for x, t in ((52, '颜色'), (76, '触摸点'), (94, '接到'), (116, '剪多长')):
    ax.text(x, 87, t, fontsize=10, color='#8a8578', ha='right' if x == 116 else 'left')

ax.text(4, 3.2, '· 胶带缠在线的两头,离线头约 2 cm;每根线两头再写上 E 编号。  '
        '· 同颜色的线靠胶带道数分:没有 / 1 道 / 2 道。  · 长度已含拉出门板的 10 cm 余量。',
        fontsize=9.5, color='#55524a')
fig.savefig(sys.argv[1] if len(sys.argv) > 1 else 'touch_wiring.png', dpi=130, facecolor='#f6f5f0',
            bbox_inches='tight')
