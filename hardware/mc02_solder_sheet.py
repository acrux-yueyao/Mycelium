#!/usr/bin/env python3
"""
MC02-AB combo-board sheet — where everything sits.

Left panel : the 55×60 perfboard, component placement + JST edge row,
             matching the 4 bosses on MC02-P (M2, board-local corners
             at 3,3 / 52,3 / 3,57 / 52,57).
Right panel: the plate/cavity plan view — board footprint, battery
             recess behind the board, TP4057 port-down over the U-cube
             slot, speaker face-down on the G-cube grille.
Bottom     : side-view stack + harness table H1–H7.

Usage: python3 hardware/mc02_solder_sheet.py [out_dir]
Writes mc02_ab_sheet.png
"""
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrow, Rectangle

INK, BG, ACC, DIM = '#1c1c1a', '#f6f5f0', '#5b4fd0', '#8a8880'


def rect(ax, x, y, w, h, label, fc='#ffffff', ec=INK, fs=7, sub=''):
    ax.add_patch(Rectangle((x, y), w, h, fc=fc, ec=ec, lw=1.0))
    ax.text(x + w / 2, y + h / 2 + (1.2 if sub else 0), label, ha='center',
            va='center', fontsize=fs, family='monospace')
    if sub:
        ax.text(x + w / 2, y + h / 2 - 2.2, sub, ha='center', va='center',
                fontsize=5.5, family='monospace', color=DIM)


def main(out='.'):
    fig = plt.figure(figsize=(13.4, 10.2), facecolor=BG)
    gs = fig.add_gridspec(2, 2, height_ratios=[64, 34], width_ratios=[1, 1.25],
                          left=0.04, right=0.98, top=0.92, bottom=0.03,
                          wspace=0.14, hspace=0.16)

    # ---- board panel ----
    ax = fig.add_subplot(gs[0, 0])
    ax.set_facecolor(BG); ax.axis('off')
    ax.add_patch(Rectangle((0, 0), 55, 60, fc='#efe9db', ec=INK, lw=1.6))
    for hx, hy in ((3, 3), (52, 3), (3, 57), (52, 57)):
        ax.add_patch(Circle((hx, hy), 1.1, fc=BG, ec=INK, lw=1.0))
    rect(ax, 16, 40, 22, 18, 'XIAO ESP32-S3', fc='#dcd6f2',
         sub='两条7P排母·USB朝上')
    rect(ax, 2, 6, 16, 16, 'MAX98357A', sub='功放·喇叭焊盘朝下')
    rect(ax, 32, 6, 21, 16, 'MPU6050', sub='箭头X朝右=机器人右')
    rect(ax, 2, 25, 15, 30, 'MPR121', fc='#ffffff', sub='触摸·竖放')
    for i, (name, sub) in enumerate((('J1 ToF', '4芯·H1'), ('J2 麦', '5芯·H2'),
                                     ('J3 双屏', '6芯·H3'), ('J4 电源', '2芯·H4'),
                                     ('J5 灯', '3芯·H7'))):
        rect(ax, 46, 26 + i * 6.6, 9, 5.6, name.split()[0], fs=6, sub=None)
        ax.text(45, 26 + i * 6.6 + 2.8, f'{name.split()[1]} {sub}', ha='right',
                va='center', fontsize=5.5, family='monospace', color=DIM)
    ax.plot([20, 20], [2, 38], ls='--', lw=1, color='#c14953')
    ax.plot([23, 23], [2, 38], ls='--', lw=1, color=INK)
    ax.text(19, 20, '3V3', rotation=90, fontsize=6, color='#c14953',
            ha='right', va='center', family='monospace')
    ax.text(24, 20, 'GND', rotation=90, fontsize=6, ha='left', va='center',
            family='monospace')
    ax.annotate('', xy=(27, 63), xytext=(27, 58.5),
                arrowprops=dict(arrowstyle='->', lw=1.2, color=ACC))
    ax.text(28.5, 61, 'H3 → T块通道 → 眼罩', fontsize=6.5, color=ACC,
            family='monospace')
    ax.set_xlim(-8, 62); ax.set_ylim(-4, 66)
    ax.set_aspect('equal')
    ax.set_title('MC02-AB 合板 55×60(洞洞板 21×23 孔)· 元件面朝腔内',
                 fontsize=10, family='monospace')

    # ---- cavity plan panel ----
    ax = fig.add_subplot(gs[0, 1])
    ax.set_facecolor(BG); ax.axis('off')
    ax.add_patch(Rectangle((0, 0), 84, 84, fc='#efe9db', ec=INK, lw=1.6))
    for i in range(7):
        for j in range(7):
            wall = i in (0, 6) or j == 0
            ax.add_patch(Rectangle((i * 12, j * 12), 12, 12, fill=False,
                                   ec=DIM, lw=0.6, ls=':' if not wall else '-'))
    ax.add_patch(Rectangle((6, 24), 41, 41, fc='#f7edd9', ec='#c9a35a',
                           lw=1.1, ls='--'))
    ax.text(26.5, 61, '电池603040凹槽\n(板后·魔术贴)', ha='center', fontsize=6.5,
            family='monospace', color='#8a6a1e')
    ax.add_patch(Rectangle((14.5, 22), 55, 60, fc='#dcd6f2', ec=ACC, lw=1.4,
                           alpha=0.75))
    ax.text(42, 52, 'MC02-AB\n(柱高9·板下净空6)', ha='center', va='center',
            fontsize=7.5, family='monospace', color=ACC)
    for px, py in ((17.5, 25), (66.5, 25), (17.5, 79), (66.5, 79)):
        ax.add_patch(Circle((px, py), 3, fc='#ffffff', ec=ACC, lw=1))
        ax.add_patch(Circle((px, py), 0.9, fc=ACC, ec='none'))
    rect(ax, 31.5, 13, 21, 8, 'TP4057', fc='#f6d9d9', fs=6.5,
         sub='USB-C朝下↓')
    ax.add_patch(Rectangle((37, 3), 10, 6, fc='#ffffff', ec='#c14953', lw=1.2))
    ax.text(42, 6, 'U块通槽', ha='center', va='center', fontsize=5.5,
            family='monospace', color='#c14953')
    ax.add_patch(Circle((21, 8), 8, fc='#e8f0e4', ec='#4a7d43', lw=1.2))
    ax.text(21, 8, '喇叭3020\n面朝下', ha='center', va='center', fontsize=6,
            family='monospace', color='#2f5b28')
    ax.text(21, -3.4, 'G块(网孔)', ha='center', fontsize=6, family='monospace',
            color='#4a7d43')
    ax.add_patch(Rectangle((60, 12), 12, 12, fill=False, ec='#c14953', lw=1.2))
    ax.text(66, 8.5, 'T块(排线)', ha='center', fontsize=6, family='monospace',
            color='#c14953')
    ax.text(42, 87.5, '↑ 头顶方向 · 视角=从背后看背板正面(元件侧)',
            ha='center', fontsize=7, family='monospace', color=DIM)
    ax.set_xlim(-6, 92); ax.set_ylim(-7, 92)
    ax.set_aspect('equal')
    ax.set_title('MC02-P 背板 84×84 · 腔体布置(腔深21)', fontsize=10,
                 family='monospace')

    # ---- side stack ----
    ax = fig.add_subplot(gs[1, 0])
    ax.set_facecolor(BG); ax.axis('off')
    layers = [(0, 3, '背板 MC02-P', '#d8d4c8'),
              (3, 9, '电池 6.0(凹槽内·板下)', '#f7edd9'),
              (12, 1.6, '合板 1.6', '#dcd6f2'),
              (13.6, 8, '元件区 ≤8(XIAO+排母最高)', '#ffffff')]
    for z0, dz, label, fc in layers:
        ax.add_patch(Rectangle((0, z0), 60, dz, fc=fc, ec=INK, lw=0.8))
        ax.text(62, z0 + dz / 2, f'{label}', va='center', fontsize=7,
                family='monospace')
    ax.plot([0, 60], [24, 24], ls='--', color='#c14953', lw=1.2)
    ax.text(62, 24, '腔体前沿(3+21)· 余量2.4', va='center', fontsize=7,
            family='monospace', color='#c14953')
    ax.set_xlim(0, 130); ax.set_ylim(-2, 30)
    ax.set_title('侧视堆叠(mm)', fontsize=9, family='monospace')

    # ---- harness table ----
    ax = fig.add_subplot(gs[1, 1])
    ax.set_facecolor(BG); ax.axis('off')
    rows = [('H1', 'J1→ToF(前壁W窗)', '4芯 70mm', 'VIN GND SDA0 SCL0'),
            ('H2', 'J2→INMP441(M孔)', '5芯 70mm', '3V3 GND SCK WS SD'),
            ('H3', 'J3→眼罩双屏', '6芯 110mm', '3V3 GND SDA0 SCL0 SDA1 SCL1'),
            ('H4', 'J4→TP4057 OUT', '2芯 60mm', 'OUT+ OUT−'),
            ('H5', 'TP4057 B±→电池', '2芯 40mm', '装前验极性!'),
            ('H6', 'MAX→喇叭焊盘', '2芯 60mm', 'SPK+ SPK−'),
            ('H7', 'J5→WS2812(可选)', '3芯 80mm', '5V GND DIN')]
    ax.text(0, 1.0, '线束表(28AWG 硅胶线,长度含余量)', fontsize=9,
            family='monospace')
    for i, (h, path, spec, pins) in enumerate(rows):
        y = 0.86 - i * 0.125
        ax.text(0.00, y, h, fontsize=7.5, family='monospace', fontweight='bold')
        ax.text(0.06, y, path, fontsize=7.5, family='monospace')
        ax.text(0.47, y, spec, fontsize=7.5, family='monospace', color=DIM)
        ax.text(0.63, y, pins, fontsize=7, family='monospace', color=ACC)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1.05)

    fig.suptitle('MC02-AB 内舱装配图 · 双屏都 0x3C(总线0=D4/D5 · 总线1=D0/D7)· '
                 '配合 SOLDERING.md 使用', fontsize=11, family='monospace')
    fig.savefig(f'{out}/mc02_ab_sheet.png', dpi=140, facecolor=BG,
                bbox_inches='tight')
    print(f'→ {out}/mc02_ab_sheet.png')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
