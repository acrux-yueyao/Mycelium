#!/usr/bin/env python3
"""
MC02 carrier board v1 — net-label schematic.

Single source of truth for the custom PCB that replaces the 18×24
perfboard: every block lists its pins and the net each pin lands on.
Same nets as the hand-wired board (SOLDER_STEPS.md, mc02_holes.py), so
the firmware does not change. Pins with the same net name are connected
— that is how a schematic with net labels reads.

Usage: python3 hardware/schematic_v1.py [out_dir]   Writes schematic_v1.png
"""
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

INK, BG, DIM = '#1c1c1a', '#f6f5f0', '#8a8880'
NET_COL = {'3V3': '#c14953', 'GND': '#1c1c1a', 'VBAT': '#c9a35a', 'VBUS': '#d07f2e',
           'SDA0': '#3e6fb8', 'SCL0': '#4a7d43', 'SDA1': '#6b93d6', 'SCL1': '#79a86f',
           'I2S_BCLK': '#7a4fd0', 'I2S_LRC': '#7a4fd0', 'I2S_DIN': '#7a4fd0',
           'MIC_SCK': '#1e8a8a', 'MIC_WS': '#1e8a8a', 'MIC_SD': '#1e8a8a',
           'LED_DIN': '#b0507a', 'SPK+': '#555', 'SPK-': '#555'}

# block: (x, _, title, subtitle, [(pin, net)], side)  side = 'L'|'R' net labels
BLOCKS = [
    (0.0, 9.6, 'U1  XIAO ESP32-S3', '邮票孔贴焊 · BAT± 走板上通孔', [
        ('D0', 'SDA1'), ('D1', 'I2S_LRC'), ('D2', 'I2S_BCLK'), ('D3', 'I2S_DIN'),
        ('D4', 'SDA0'), ('D5', 'SCL0'), ('D6', 'LED_DIN'), ('D7', 'SCL1'),
        ('D8', 'MIC_SCK'), ('D9', 'MIC_WS'), ('D10', 'MIC_SD'),
        ('3V3', '3V3'), ('GND', 'GND'), ('5V', 'VBUS'),
        ('BAT+ (底面焊盘)', 'VBAT'), ('BAT− (底面焊盘)', 'GND')], 'R'),
    (8.6, 9.6, 'U2  MPR121 触摸板', '模块平贴 · 0x5A', [
        ('3V3', '3V3'), ('GND', 'GND'), ('SDA', 'SDA0'), ('SCL', 'SCL0'),
        ('IRQ', 'NC'), ('ADD', 'NC (=0x5A)'), ('E0–E11', '→ J7 电极')], 'R'),
    (8.6, 5.2, 'U3  MPU6050 (GY-521)', '模块平贴 · 0x68 · X 轴指向右', [
        ('VCC', '3V3'), ('GND', 'GND'), ('SDA', 'SDA0'), ('SCL', 'SCL0'),
        ('XDA/XCL/INT', 'NC'), ('AD0', 'NC (=0x68)')], 'R'),
    (17.2, 9.6, 'J3  双屏 6P', 'GME12864-11 ×2 · 都是 0x3C', [
        ('1', '3V3'), ('2', 'GND'), ('3', 'SDA0'), ('4', 'SCL0'),
        ('5', 'SDA1'), ('6', 'SCL1')], 'R'),
    (17.2, 5.9, 'J1  ToF 4P', 'VL53L0X · 0x29', [
        ('1', '3V3'), ('2', 'GND'), ('3', 'SDA0'), ('4', 'SCL0')], 'R'),
    (17.2, 3.2, 'J2  麦克风 5P', 'INMP441 (L/R 在模块上接地)', [
        ('1', '3V3'), ('2', 'GND'), ('3', 'MIC_SCK'), ('4', 'MIC_WS'),
        ('5', 'MIC_SD')], 'R'),
    (0.0, 2.6, 'J6  功放 5P', 'MAX98357A 贴腔底 · 喇叭焊在功放上', [
        ('1 VIN', '3V3 或 VBAT (JP1)'), ('2', 'GND'), ('3', 'I2S_BCLK'),
        ('4', 'I2S_LRC'), ('5', 'I2S_DIN')], 'R'),
    (8.6, 1.6, 'J5  灯带 3P (可选)', 'WS2812B 3–5 颗', [
        ('1', 'VBAT'), ('2', 'GND'), ('3', 'LED_DIN')], 'R'),
    (17.2, 0.4, 'J4  电池 2P', '603040 锂电 · 另引 TP4057 B±', [
        ('+', 'VBAT'), ('−', 'GND')], 'R'),
]


def draw_block(ax, x, y, title, sub, pins, side):
    h = 0.42 * len(pins) + 1.0
    ax.add_patch(FancyBboxPatch((x, y - h), 3.3, h, boxstyle='round,pad=0.05,rounding_size=0.15',
                                fc='#ffffff', ec=INK, lw=1.0))
    ax.text(x + 0.12, y - 0.3, title, fontsize=9.5, fontweight='bold', va='center')
    ax.text(x + 0.12, y - 0.68, sub, fontsize=6.6, color=DIM, va='center')
    for i, (pin, net) in enumerate(pins):
        py = y - 1.1 - 0.42 * i
        ax.text(x + 0.15, py, pin, fontsize=7.6, va='center')
        col = NET_COL.get(net.split(' ')[0], DIM)
        ax.plot([x + 3.3, x + 3.9], [py, py], color=col, lw=1.6)
        ax.text(x + 3.98, py, net, fontsize=7.6, va='center', color=col,
                fontweight='bold' if net in NET_COL else 'normal')


def main(out='.'):
    fig, ax = plt.subplots(figsize=(17, 11.5), facecolor=BG)
    ax.set_facecolor(BG); ax.axis('off')
    tops = {}                       # stack blocks per column, top-down
    for x, _, *rest in BLOCKS:
        y = tops.get(x, 10.0)
        draw_block(ax, x, y, *rest)
        tops[x] = y - (0.42 * len(rest[2]) + 1.0) - 0.45
    ybot = min(tops.values())
    notes = ('同名网络 = 连在一起(网络标签画法)· NC = 不连\n'
             '总线0 (SDA0/SCL0): 左屏 0x3C · ToF 0x29 · MPU 0x68 · MPR121 0x5A — 模块自带上拉, '
             '板上 R1–R4 4.7k 预留不贴\n'
             '总线1 (SDA1/SCL1): 右屏 0x3C 独占 · VBUS(XIAO 5V) 只接测试点 TP1\n'
             'JP1: 功放供电选择, 默认 3V3; 嫌音量小改 VBAT (MAX98357A 2.5–5.5V 可直接吃电池)\n'
             'J7: 触摸电极 12P (E0–E11) 引出到铜箔 · C1 10µF + C2 100nF 靠近 XIAO 3V3 · C3 100µF 靠近 J6\n'
             '板框 46×61 · 4×M2 孔距 40×55 (孔心离板边 3mm) · 板厚 0.8 · 两层 · 底层整面铺 GND')
    ax.text(0, ybot - 0.2, notes, fontsize=8.6, va='top', linespacing=1.7)
    ax.set_xlim(-0.3, 22.5); ax.set_ylim(ybot - 4.4, 10.4)
    ax.set_title('MC02 载板 v1 · 原理图(网络标签版)· 与现洞洞板接法完全一致, 固件不改',
                 fontsize=13, fontweight='bold')
    fig.savefig(f'{out}/schematic_v1.png', dpi=140, facecolor=BG, bbox_inches='tight')
    print(f'→ {out}/schematic_v1.png')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
