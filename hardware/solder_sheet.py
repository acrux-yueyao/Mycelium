#!/usr/bin/env python3
"""
MC-01 soldering & wiring sheet — carrier-board construction drawing.

Layer allocation (v1.5.1, corrected so the TP4056's USB-C meets the frame
window in the D bay):
  A  sensing carrier 55×48 : VL53L0X (window-aligned) + INMP441 (mic holes)
                             + OLED ribbon pass zone + I2C/I2S stubs
  B  logic carrier  55×48  : XIAO ESP32-S3 · MAX98357A · MPU6050 · MPR121
                             + bus rail (3V3/GND/SDA/SCL) + harness headers
  C  energy slot           : 603040 battery (velcro) + spare TCA9548A zone
  D  bay                   : TP4056-C at the USB window + 2030 speaker

Perfboard: 2.54 mm pitch, cut to 55×48 (21×18 holes). Wires 28 AWG silicone.
Output: hardware/mc01_solder_sheet.pdf
"""
import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, Circle, FancyArrow

INK = '#1c1c1a'; SOFT = '#8a8880'; ACC = '#5b4fd0'; BG = '#f6f5f0'
PITCH = 2.54


def board(ax, w=55, h=48, title=''):
    ax.add_patch(Rectangle((0, 0), w, h, fill=False, ec=INK, lw=2))
    nx, ny = int(w // PITCH), int(h // PITCH)
    ox, oy = (w - (nx - 1) * PITCH) / 2, (h - (ny - 1) * PITCH) / 2
    for i in range(nx):
        for j in range(ny):
            ax.add_patch(Circle((ox + i * PITCH, oy + j * PITCH), 0.35,
                                fc='#d8d6cc', ec='none'))
    ax.set_xlim(-6, w + 6); ax.set_ylim(-7, h + 5)
    ax.set_aspect('equal'); ax.axis('off'); ax.set_facecolor(BG)
    ax.set_title(title, fontsize=11, family='monospace')


def mod(ax, x0, y0, w, h, name, sub='', pins=None, ec=INK):
    ax.add_patch(Rectangle((x0, y0), w, h, fill=False, ec=ec, lw=1.8))
    ax.text(x0 + w/2, y0 + h/2 + (1.6 if sub else 0), name, ha='center',
            va='center', fontsize=8.5, weight='bold')
    if sub:
        ax.text(x0 + w/2, y0 + h/2 - 2.2, sub, ha='center', va='center',
                fontsize=6.5, color=SOFT)
    if pins:
        px0, py0, n, dx, dy = pins
        for k in range(n):
            ax.add_patch(Circle((px0 + k*dx, py0 + k*dy), 0.7, fc=ACC, ec='none'))


def rail(ax, x, y0, y1, label):
    ax.plot([x, x], [y0, y1], color=ACC, lw=2.5, solid_capstyle='round')
    ax.text(x, y1 + 1.2, label, ha='center', fontsize=6.5, color=ACC)


def jst(ax, x0, y0, n, label, horiz=True):
    w, h = (n * 2.0 + 1.5, 4.5) if horiz else (4.5, n * 2.0 + 1.5)
    ax.add_patch(Rectangle((x0, y0), w, h, fill=False, ec='#b05a2a', lw=1.6))
    ax.text(x0 + w/2, y0 - 2.2 if horiz else y0 + h + 1.8,
            label, ha='center', fontsize=6.5, color='#b05a2a')


with PdfPages('/home/user/Mycelium/hardware/mc01_solder_sheet.pdf') as pdf:
    # ================= page 1: A + B carriers =================
    fig, (axA, axB) = plt.subplots(1, 2, figsize=(12.5, 6.4), facecolor=BG)

    board(axA, title='A 感知载板 55×48 · 元件面朝后')
    mod(axA, 15, 37, 25, 10.7, 'VL53L0X', '窗口对位 · I2C',
        pins=(18, 38.5, 4, 2.54, 0))
    mod(axA, 20, 0.5, 15, 11, 'INMP441', '对准麦孔',
        pins=(22, 9.5, 6, 2.2, 0))
    axA.add_patch(Rectangle((9.5, 14), 36, 12, fill=False, ec=ACC, ls='--', lw=1.3))
    axA.text(27.5, 20, 'OLED 排线过区\n(对前壁线槽 · 勿装高件)', ha='center',
             va='center', fontsize=7, color=ACC)
    rail(axA, 48.5, 4, 44, '3V3')
    rail(axA, 52, 4, 44, 'GND')
    jst(axA, 1, 0.5, 4, 'J1→B ·I2C(3V3 GND SDA SCL)')
    jst(axA, 1, 8, 3, 'J2→B ·I2S 麦(SCK WS SD)')
    axA.text(27.5, -5, 'ToF/麦排针直插焊 · 屏排线不落板,穿过区进线槽',
             ha='center', fontsize=7, color=SOFT)

    board(axB, title='B 主控载板 55×48 · 元件面朝后')
    mod(axB, 2, 28, 21, 17.8, 'XIAO ESP32-S3', '铸边孔全焊',
        pins=(4, 29.5, 7, 2.54, 0))
    mod(axB, 32, 29, 19, 16, 'MAX98357A', 'I2S 功放',
        pins=(33.5, 30.5, 7, 2.54, 0))
    mod(axB, 2, 4, 21, 16, 'MPU6050', '姿态 · I2C',
        pins=(4, 18, 8, 2.4, 0))
    mod(axB, 32, 4, 20, 17, 'MPR121', '触摸 · I2C',
        pins=(33.5, 5.5, 4, 2.54, 0))
    rail(axB, 26.5, 3, 45, 'SDA')
    rail(axB, 29.5, 3, 45, 'SCL')
    jst(axB, 1, 44, 4, 'J1←A · I2C', horiz=True)
    jst(axB, 12, 44, 3, 'J2←A · 麦', horiz=True)
    jst(axB, 40, 0.2, 2, 'J3←D · 电池入(经TP4056)')
    jst(axB, 24, 0.2, 2, 'J4→D · 喇叭')
    jst(axB, 48, 44, 3, 'J5→ 顶部 · WS2812/触摸铜箔')
    axB.text(27.5, -5, '汇流条:SDA/SCL 两条镀锡母线,四路 I2C 全部飞线上母线',
             ha='center', fontsize=7, color=SOFT)
    fig.suptitle('MC-01 焊接施工图 · 1/2(载板按 2.54 洞洞板裁 55×48)',
                 fontsize=12, y=0.98)
    pdf.savefig(fig); plt.close(fig)

    # ================= page 2: C + D bay + harness table =================
    fig = plt.figure(figsize=(12.5, 6.4), facecolor=BG)
    axC = fig.add_axes([0.04, 0.12, 0.27, 0.78])
    axD = fig.add_axes([0.33, 0.45, 0.33, 0.42])
    axT = fig.add_axes([0.33, 0.05, 0.64, 0.36]); axT.axis('off')
    axW = fig.add_axes([0.68, 0.45, 0.29, 0.42]); axW.axis('off')

    board(axC, title='C 能量层 55×48(免焊)')
    axC.add_patch(Rectangle((3, 4), 30, 40, fill=False, ec='#b05a2a', lw=1.8))
    axC.text(18, 24, '603040 电池\n竖放 · 魔术贴', ha='center', va='center', fontsize=8)
    axC.add_patch(Rectangle((38, 12), 15, 24, fill=False, ec=SOFT, ls='--', lw=1.2))
    axC.text(45.5, 24, 'TCA9548A\n备用位', ha='center', va='center',
             fontsize=7, color=SOFT)
    axC.text(27.5, -5, '电池线沿右侧壁下行 → D 舱 TP4056 B+/B−',
             ha='center', fontsize=7, color=SOFT)

    axD.add_patch(Rectangle((0, 0), 56, 22, fill=False, ec=INK, lw=2))
    axD.add_patch(Circle((16, 11), 9.5, fill=False, ec=INK, lw=1.8))
    axD.text(16, 11, '2030 喇叭\n朝下', ha='center', va='center', fontsize=8)
    axD.add_patch(Rectangle((34, 2), 20, 17.5, fill=False, ec=INK, lw=1.8))
    axD.text(44, 12, 'TP4056-C', ha='center', fontsize=8, weight='bold')
    axD.text(44, 7, 'USB口↓对准前窗', ha='center', fontsize=6.5, color=SOFT)
    axD.set_xlim(-3, 59); axD.set_ylim(-5, 26)
    axD.set_aspect('equal'); axD.axis('off'); axD.set_facecolor(BG)
    axD.set_title('D 底舱平面 56×22', fontsize=11, family='monospace')

    harness = [
        ('线束', '从 → 到', '芯数/线序', '长度'),
        ('H1 I2C 干线', 'B·J1 → A·J1', '4:3V3 GND SDA SCL', '70mm'),
        ('H2 麦克风', 'B·J2 → A·J2', '3:SCK WS SD', '70mm'),
        ('H3 双屏', 'B 母线 → 升高柱×2', '4×2:并联 0x3C/0x3D', '110mm'),
        ('H4 电池', 'C 电池 → D·TP4056 B±', '2:红+黑−(验极性!)', '90mm'),
        ('H5 系统电', 'D·TP4056 OUT± → B·J3', '2', '80mm'),
        ('H6 喇叭', 'B·J4 → D 喇叭', '2', '80mm'),
        ('H7 外设', 'B·J5 → 顶槽出舱', '3:5V GND DIN + 铜箔', '150mm'),
    ]
    for i, row in enumerate(harness):
        for j, cell in enumerate(row):
            axT.text([0, 0.16, 0.42, 0.88][j], 0.95 - i * 0.13, cell,
                     fontsize=8.2 if i else 9, va='top',
                     weight='bold' if i == 0 else 'normal',
                     color=INK if i else ACC, family='monospace')

    tips = ['焊接顺序:', '1 载板裁切 55×48,断角避开槽肋', '2 B 板母线先行(两条镀锡裸线)',
            '3 模块排针落板→飞线上母线', '4 JST 插座最后焊,插头一律可拆',
            '5 通电前:万用表量 3V3-GND 无短路', '6 H4 电池线插前必验极性']
    for i, t in enumerate(tips):
        axW.text(0, 0.95 - i * 0.14, t, fontsize=8.2 if i else 9.5,
                 weight='bold' if i == 0 else 'normal', va='top',
                 family='monospace')
    fig.suptitle('MC-01 焊接施工图 · 2/2(线束表 + 装配要点)', fontsize=12, y=0.98)
    pdf.savefig(fig); plt.close(fig)

print('wrote hardware/mc01_solder_sheet.pdf')
