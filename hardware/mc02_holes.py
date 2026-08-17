#!/usr/bin/env python3
"""
MC02-AB hole map — the 18×24 perfboard, hole by hole.

Viewed from the COMPONENT side (the face that looks into the cavity),
columns 1-18 left→right, rows 1-24 bottom→top, XIAO USB toward row 24.
Soldering happens on the back = mirror image; always recount from the
component side before touching the iron.

Usage: python3 hardware/mc02_holes.py [out_dir]   Writes mc02_holes.png
"""
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

INK, BG, DIM = '#1c1c1a', '#f6f5f0', '#b8b4a8'
C = {'3V3': '#c14953', 'GND': '#1c1c1a', 'SDA0': '#3e6fb8', 'SCL0': '#4a7d43',
     'BUS1': '#d07f2e', 'I2S': '#7a4fd0', 'MIC': '#1e8a8a', 'PIN': '#8a8880',
     'BAT': '#c9a35a'}

# (col, row, label, net) — nets pick the dot colour
HOLES = []
# 4 vertical buses, rows 3..15
for r in range(3, 16):
    HOLES += [(8, r, '', '3V3'), (9, r, '', 'GND'),
              (10, r, '', 'SDA0'), (11, r, '', 'SCL0')]
# XIAO socket: left col 6 D0..D6 (top->bottom), right col 12 5V..D7
XL = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']
XR = ['5V', 'GND', '3V3', 'D10', 'D9', 'D8', 'D7']
for i in range(7):
    HOLES.append((6, 23 - i, XL[i], 'PIN'))
    HOLES.append((12, 23 - i, XR[i], 'PIN'))
# J3 screens 6P, col 2 rows 22..17
for i, (lab, net) in enumerate((('3V3', '3V3'), ('GND', 'GND'),
                                ('SDA0', 'SDA0'), ('SCL0', 'SCL0'),
                                ('SDA1', 'BUS1'), ('SCL1', 'BUS1'))):
    HOLES.append((2, 22 - i, lab, net))
# J1 ToF 4P, row 23 cols 15..18(弯针朝上出板)
for i, (lab, net) in enumerate((('3V3', '3V3'), ('GND', 'GND'),
                                ('SDA0', 'SDA0'), ('SCL0', 'SCL0'))):
    HOLES.append((15 + i, 23, lab, net))
# MPU6050 8P 竖装: 列12 行11..4, VCC在最上, 体朝右
for i, (lab, net) in enumerate((('VCC', '3V3'), ('GND', 'GND'),
                                ('SCL', 'SCL0'), ('SDA', 'SDA0'),
                                ('XDA', 'PIN'), ('XCL', 'PIN'),
                                ('AD0', 'PIN'), ('INT', 'PIN'))):
    HOLES.append((12, 11 - i, lab, net))
# MPR121 6P col 2 rows 12..7: 3V3 IRQ SCL SDA ADD GND (上→下)
for i, (lab, net) in enumerate((('3V3', '3V3'), ('IRQ', 'PIN'),
                                ('SCL', 'SCL0'), ('SDA', 'SDA0'),
                                ('ADD', 'PIN'), ('GND', 'GND'))):
    HOLES.append((2, 12 - i, lab, net))
# bottom row 2: J2 mic 1-5 · J6 amp 7-11 · J5 led 13-15 · J4 battery 17-18
for i, (lab, net) in enumerate((('VDD', '3V3'), ('GND', 'GND'),
                                ('SCK', 'MIC'), ('WS', 'MIC'), ('SD', 'MIC'))):
    HOLES.append((1 + i, 2, lab, net))
for i, (lab, net) in enumerate((('VIN', '3V3'), ('GND', 'GND'), ('BCLK', 'I2S'),
                                ('LRC', 'I2S'), ('DIN', 'I2S'))):
    HOLES.append((7 + i, 2, lab, net))
for i, (lab, net) in enumerate((('B+', 'BAT'), ('GND', 'GND'), ('DIN', 'MIC'))):
    HOLES.append((13 + i, 2, lab, net))
HOLES += [(17, 2, 'BAT+', 'BAT'), (18, 2, 'BAT-', 'GND')]

ZONES = [(1, 3, 9, 15, 'MPR121 竖放(体)'), (12, 2, 18, 11, 'MPU6050(体朝右)'),
         (5, 17, 13, 23, 'XIAO(插排母)')]

NOTES = [
    '母线: 8=3V3(红) 9=GND(黑) 10=SDA0(蓝) 11=SCL0(绿), 行3拉到行15',
    'J1-J5 全用弯排针(90°), 壳体朝板边外出线; 直针+杜邦壳太高放不进腔',
    'XIAO 底面 BAT+→孔(17,2) BAT−→孔(18,2), 线从两排母之间垂下',
    'MAX98357A 不上板! 双面胶贴腔底喇叭旁, 5芯线走 J6(行2 列8-12)',
    'D4→SDA0母线 · D5→SCL0母线 · D0→(2,18) · D7→(2,17)  [背面飞线]',
    'D2/D1/D3→J6 的 BCLK/LRC/DIN · D8/D9/D10→(3,2)(4,2)(5,2) · D6→(15,2)',
    'BAT+(17,2) 另引一根去 TP4057 B+ · BAT−(18,2)与GND母线共地并去 B− (=H5)',
    'MAX 的 GAIN/SD 悬空不接 · MPU 后4孔(XDA..INT)留空 · MPR 的 IRQ/ADD 留空',
    '土黄=电池轨(3.7-4.2V)! 绝不可碰 3V3 母线',
    '看图方向=元件面; 翻到背面焊接时左右镜像, 先数孔再下烙铁',
]


def main(out='.'):
    fig, ax = plt.subplots(figsize=(10.5, 13.5), facecolor=BG)
    ax.set_facecolor(BG); ax.axis('off')
    for cc in range(1, 19):
        for rr in range(1, 25):
            ax.add_patch(Circle((cc, rr), 0.13, fc=DIM, ec='none'))
    for x0, y0, x1, y1, lab in ZONES:
        ax.add_patch(Rectangle((x0 - 0.45, y0 - 0.45), x1 - x0 + 0.9,
                               y1 - y0 + 0.9, fill=False, ec=DIM, lw=1.1,
                               ls='--'))
        ax.text(x0 - 0.3, y1 + 0.62, lab, fontsize=7, family='monospace',
                color='#6d6a62')
    for cc, rr, lab, net in HOLES:
        ax.add_patch(Circle((cc, rr), 0.34, fc=C[net], ec=INK, lw=0.4))
        if lab:
            ax.annotate(lab, (cc, rr), (0, 9), textcoords='offset points',
                        ha='center', fontsize=5.2, family='monospace',
                        color=INK, rotation=45)
    for cc in range(1, 19):
        ax.text(cc, 0.1, str(cc), ha='center', fontsize=6.5, color='#6d6a62')
        ax.text(cc, 24.85, str(cc), ha='center', fontsize=6.5, color='#6d6a62')
    for rr in range(1, 25):
        ax.text(0.15, rr, str(rr), va='center', ha='right', fontsize=6.5,
                color='#6d6a62')
    leg = [('3V3', '3V3'), ('GND', 'GND'), ('SDA0', 'SDA0'), ('SCL0', 'SCL0'),
           ('总线1(右屏)', 'BUS1'), ('I2S功放', 'I2S'), ('麦/灯', 'MIC'),
           ('电池轨', 'BAT'), ('留空/结构', 'PIN')]
    for i, (lab, key) in enumerate(leg):
        x = 1 + (i % 4) * 4.6
        y = -1.4 - (i // 4) * 1.1
        ax.add_patch(Circle((x, y), 0.32, fc=C[key], ec=INK, lw=0.4))
        ax.text(x + 0.6, y, lab, fontsize=7.5, va='center', family='monospace')
    for i, n in enumerate(NOTES):
        ax.text(0.4, -3.2 - i * 0.95, '· ' + n, fontsize=7.3,
                family='monospace', color=INK)
    ax.set_xlim(-0.8, 19.4)
    ax.set_ylim(-10.6, 26.3)
    ax.set_aspect('equal')
    ax.set_title('MC02-AB 逐孔布局 · 18×24 · 元件面视角 · 列1-18左→右 · 行1-24下→上\n'
                 '彩点=要用的孔(斜字=针脚名) · 虚线框=模块体投影 · USB朝上(行24侧)',
                 fontsize=10, family='monospace')
    fig.savefig(f'{out}/mc02_holes.png', dpi=150, facecolor=BG,
                bbox_inches='tight')
    print(f'→ {out}/mc02_holes.png')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
