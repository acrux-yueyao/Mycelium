#!/usr/bin/env python3
"""Beginner wiring card: EYES connector (J3) -> two 0.96" OLED eyes (pins GND VCC SCL SDA).
Usage: python3 hardware/guide/eyes_wiring.py <out.png>"""
import sys
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch, Circle

COL = {'3V3': '#d6453d', 'GND': '#1c1c1a', 'SDA0': '#2f6fd0', 'SCL0': '#e0a21b', 'SDA1': '#2f9d5a', 'SCL1': '#8a4fd0'}
J3 = ['3V3', 'GND', 'SDA0', 'SCL0', 'SDA1', 'SCL1']
NAME = {'3V3': '电源 +', 'GND': '地 −', 'SDA0': '左眼 数据', 'SCL0': '左眼 时钟', 'SDA1': '右眼 数据', 'SCL1': '右眼 时钟'}
SCREEN = ['GND', 'VCC', 'SCL', 'SDA']

fig, ax = plt.subplots(figsize=(12, 8), facecolor='#f6f5f0')
ax.set_facecolor('#f6f5f0'); ax.set_xlim(0, 120); ax.set_ylim(0, 80); ax.axis('off'); ax.set_aspect('equal')
# board connector
ax.add_patch(FancyBboxPatch((6, 22), 30, 40, boxstyle='round,pad=0,rounding_size=2', fc='#2e7d5b', ec='#1c1c1a'))
ax.text(21, 64, '主板 · 左上角 EYES 插座', ha='center', fontsize=12, weight='bold')
ax.add_patch(Rectangle((10, 27), 10, 30, fc='#f2efe6', ec='#1c1c1a'))
ys = {}
for i, n in enumerate(J3):
    y = 54 - i * 5.2; ys[n] = y
    ax.add_patch(Rectangle((20, y - 0.6), 4, 1.2, fc='#c9c5b8', ec='#1c1c1a', lw=0.6))
    ax.text(26, y, f'{i + 1}  {NAME[n]}', va='center', fontsize=10, color='white', weight='bold')
ax.text(15, 24, '插头从这边插', ha='center', fontsize=8.5, color='white')
ax.annotate('', (10, 57), (10, 61), arrowprops=dict(arrowstyle='->', color='white'))
ax.text(12, 59.5, '1 在最上面', fontsize=8.5, color='white')

def screen(x0, y0, title, sda, scl):
    ax.add_patch(FancyBboxPatch((x0, y0), 30, 26, boxstyle='round,pad=0,rounding_size=2', fc='#2a52a8', ec='#1c1c1a'))
    ax.add_patch(Rectangle((x0 + 3, y0 + 3), 18, 20, fc='#0d0d0d'))
    ax.text(x0 + 15, y0 + 28, title, ha='center', fontsize=12, weight='bold')
    pins = {}
    for j, p in enumerate(SCREEN):
        y = y0 + 20 - j * 5
        ax.add_patch(Circle((x0 + 26, y), 0.9, fc='#c9c5b8', ec='#1c1c1a'))
        ax.text(x0 + 23.5, y, p, ha='right', va='center', fontsize=9.5, color='white', weight='bold')
        pins[p] = (x0 + 26, y)
    for p, net in (('VCC', '3V3'), ('GND', 'GND'), ('SDA', sda), ('SCL', scl)):
        px, py = pins[p]
        ax.plot([42, 52, px], [ys[net], ys[net], py], color=COL[net], lw=3, solid_capstyle='round')
        ax.plot([px, px + 3], [py, py], color=COL[net], lw=3)

screen(70, 46, '左眼屏', 'SDA0', 'SCL0')
screen(70, 8, '右眼屏', 'SDA1', 'SCL1')
for n, y in ys.items():
    ax.plot([24, 42], [y, y], color=COL[n], lw=3)
ax.text(60, 3, '红线(1 号)和黑线(2 号)两块屏都要接:一根分成两根,或者两根焊在一起。\n'
        '屏背面的字是 GND · VCC · SCL · SDA(从上到下),照着颜色接,别把 VCC 和 GND 弄反。',
        ha='center', fontsize=10)
ax.set_title('两只眼睛怎么接(线的颜色只是示意,按位置 1–6 对)', fontsize=14, weight='bold')
fig.savefig(sys.argv[1], dpi=130, facecolor='#f6f5f0', bbox_inches='tight')
