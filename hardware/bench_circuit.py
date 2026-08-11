#!/usr/bin/env python3
"""面包板测试电路图 — WROOM-32 验货台(上:阶段1 I2C / 下:阶段2 I2S)"""
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch

INK = '#1c1c1a'; SOFT = '#8a8880'; BG = '#f6f5f0'
C33 = '#c0392b'; CGND = '#1c1c1a'; CSDA = '#5b4fd0'; CSCL = '#2471a3'
CI2S = '#2e7d4f'; CAMP = '#b05a2a'

fig = plt.figure(figsize=(16, 13), facecolor=BG)
fig.suptitle('面包板验货电路 · ESP32 WROOM-32(全程 USB 供电,不接电池)',
             fontsize=15, y=0.975, color=INK)

# ============================================================ 阶段 1 · I2C
ax = fig.add_axes([0.03, 0.50, 0.94, 0.42])
ax.set_xlim(0, 150); ax.set_ylim(0, 62)
ax.set_aspect('equal'); ax.axis('off'); ax.set_facecolor(BG)
ax.text(2, 59, '阶段 1 · I2C(两条总线:屏2 单独走总线1,两块屏都保持出厂 0x3C)',
        fontsize=12, color=CSDA, weight='bold')

ax.add_patch(FancyBboxPatch((3, 20), 20, 28, boxstyle='round,pad=0.6',
                            fill=False, ec=INK, lw=2))
ax.text(13, 43, 'ESP32\nWROOM-32', ha='center', fontsize=9.5, weight='bold')
ax.text(13, 36, 'USB→电脑', ha='center', fontsize=7, color=SOFT)

rails = [('3V3', 48, C33, '3V3'), ('GND', 43, CGND, 'GND'),
         ('SDA0', 38, CSDA, 'G21'), ('SCL0', 33, CSCL, 'G22'),
         ('SDA1', 28, '#8e44ad', 'G18'), ('SCL1', 23.5, '#6c3483', 'G19')]
for name, y, c, gp in rails:
    ax.plot([23, 138], [y, y], color=c, lw=2.4, solid_capstyle='round')
    ax.add_patch(Circle((23, y), 0.8, fc=c, ec='none'))
    ax.text(139.5, y, f'{name} 轨', va='center', fontsize=9, color=c, weight='bold')
    ax.text(21.5, y, gp, ha='right', va='center', fontsize=8, color=c)

BUS0 = [('VCC', 48, C33), ('GND', 43, CGND), ('SDA', 38, CSDA), ('SCL', 33, CSCL)]
BUS1 = [('VCC', 48, C33), ('GND', 43, CGND), ('SDA', 28, '#8e44ad'), ('SCL', 23.5, '#6c3483')]
mods = [('SSD1306 屏1', '0x3C 总线0', 33, BUS0),
        ('SSD1306 屏2', '0x3C 总线1', 54, BUS1),
        ('VL53L0X', '0x29 总线0', 75, BUS0),
        ('MPU6050', '0x68 总线0', 96, BUS0),
        ('MPR121', '0x5A 总线0', 117, BUS0)]
for name, addr, x0, order in mods:
    hl = order is BUS1
    ax.add_patch(Rectangle((x0 - 8.5, 8), 17, 13, fill=False,
                           ec='#8e44ad' if hl else INK, lw=2.2 if hl else 1.8))
    ax.text(x0, 17, name, ha='center', fontsize=7.8, weight='bold')
    ax.text(x0, 11.5, addr, ha='center', fontsize=7,
            color='#8e44ad' if hl else SOFT)
    for i, (p, ry, c) in enumerate(order):
        px = x0 - 6 + i * 4
        ax.plot([px, px], [21, ry], color=c, lw=1.5)
        ax.add_patch(Circle((px, ry), 0.75, fc=c, ec='none'))
        ax.text(px, 22.2, p, ha='center', va='bottom', fontsize=5.8,
                rotation=90, color=c)
ax.text(2, 4.5, '屏2 是唯一走总线1 的:SDA→G18  SCL→G19(紫色);其余四个模块全在总线0\n'
                '两块屏地址相同也不冲突 —— 各自独占一条总线,不用改地址电阻\n'
                '扫描程序会分别列出两条总线上的设备',
        fontsize=8.5, color=SOFT, va='top')

# ============================================================ 阶段 2 · I2S
ax = fig.add_axes([0.03, 0.045, 0.94, 0.40])
ax.set_xlim(0, 150); ax.set_ylim(0, 60)
ax.set_aspect('equal'); ax.axis('off'); ax.set_facecolor(BG)
ax.text(2, 57, '阶段 2 · I2S 声音链(屏点亮之后再接,和上面共用 3V3/GND 轨)',
        fontsize=12, color=CI2S, weight='bold')

ax.add_patch(FancyBboxPatch((3, 14), 20, 32, boxstyle='round,pad=0.6',
                            fill=False, ec=INK, lw=2))
ax.text(13, 41, 'ESP32', ha='center', fontsize=9.5, weight='bold')
gp = [('G14', 34, CI2S), ('G15', 30.5, CI2S), ('G32', 27, CI2S),
      ('G26', 22, CAMP), ('G25', 18.5, CAMP), ('G27', 15, CAMP)]
for name, y, c in gp:
    ax.add_patch(Circle((23, y), 0.8, fc=c, ec='none'))
    ax.text(21.5, y, name, ha='right', va='center', fontsize=8, color=c)

# 电源轨(共用)
for name, y, c in [('3V3', 50, C33), ('GND', 46, CGND)]:
    ax.plot([23, 132], [y, y], color=c, lw=2.2, solid_capstyle='round')
    ax.text(133.5, y, f'{name} 轨(同上)', va='center', fontsize=8, color=c)

# INMP441
mx = 58
ax.add_patch(Rectangle((mx - 13, 24), 26, 13, fill=False, ec=INK, lw=1.8))
ax.text(mx, 33, 'INMP441 麦克风', ha='center', fontsize=8.5, weight='bold')
ax.text(mx, 27.5, 'L/R 脚 → GND(必须!)', ha='center', fontsize=7, color=C33)
for i, (sig, gy) in enumerate([('SCK', 34), ('WS', 30.5), ('SD', 27)]):
    ax.plot([23, mx - 13], [gy, gy], color=CI2S, lw=1.6)
    ax.text(35, gy + 0.8, sig, fontsize=7, color=CI2S, ha='center')
for px, ry, c, lb in [(mx - 8, 50, C33, 'VDD'), (mx + 8, 46, CGND, 'GND')]:
    ax.plot([px, px], [37, ry], color=c, lw=1.5)
    ax.add_patch(Circle((px, ry), 0.75, fc=c, ec='none'))
    ax.text(px + 1.2, 41, lb, fontsize=6.5, color=c, rotation=90)

# MAX98357A + 喇叭
axp = 105
ax.add_patch(Rectangle((axp - 13, 10), 26, 13, fill=False, ec=INK, lw=1.8))
ax.text(axp, 19, 'MAX98357A 功放', ha='center', fontsize=8.5, weight='bold')
ax.text(axp, 13.5, 'GAIN / SD 悬空不接', ha='center', fontsize=7, color=SOFT)
for i, (sig, gy) in enumerate([('BCLK', 22), ('LRC', 18.5), ('DIN', 15)]):
    ax.plot([23, axp - 13], [gy, gy], color=CAMP, lw=1.6)
    ax.text(64, gy + 0.8, sig, fontsize=7, color=CAMP, ha='center')
for px, ry, c, lb in [(axp - 8, 50, C33, 'VIN'), (axp + 8, 46, CGND, 'GND')]:
    ax.plot([px, px], [23, ry], color=c, lw=1.5)
    ax.add_patch(Circle((px, ry), 0.75, fc=c, ec='none'))
    ax.text(px + 1.2, 33, lb, fontsize=6.5, color=c, rotation=90)
ax.add_patch(Circle((134, 16.5), 6, fill=False, ec=INK, lw=1.8))
ax.text(134, 16.5, '3020\n喇叭', ha='center', va='center', fontsize=7)
ax.plot([118, 128], [19, 18.5], color=CAMP, lw=1.6)
ax.plot([118, 128], [14, 14.5], color=CGND, lw=1.6)
ax.text(123, 21, '+', fontsize=9, color=CAMP, ha='center')
ax.text(123, 10.5, '−', fontsize=9, color=CGND, ha='center')

ax.text(2, 5.5, '麦:SCK→G14  WS→G15  SD→G32        功放:BCLK→G26  LRC→G25  DIN→G27\n'
                '全部模块吃 3.3V,不要接 5V · 接线前后各对一遍 VCC/GND,反接会烧模块',
        fontsize=8.5, color=SOFT, va='top')

fig.savefig('/tmp/claude-0/-home-user-Mycelium/6ec5340c-2929-5fe1-b40f-d28d388ebe79/scratchpad/bench_circuit.png',
            dpi=140, facecolor=BG)
print('ok')
