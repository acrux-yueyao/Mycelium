#!/usr/bin/env python3
"""
MC02-AB fly-wire routing — BACK-SIDE view, exactly what the iron sees.

Mirror of the hole map: back-view x = 19 − front column. Solid wires =
this phase (MPU + MPR onto the buses); the XIAO/connector wires that
wait for parts are listed as text, not drawn.

Usage: python3 hardware/mc02_flywires.py [out_dir]  Writes mc02_flies.png
"""
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

INK, BG, DIM = '#1c1c1a', '#f6f5f0', '#c3bfb4'
C = {'3V3': '#c14953', 'GND': '#1c1c1a', 'SDA': '#3e6fb8', 'SCL': '#4a7d43'}


def bx(col):
    return 19 - col


BUS = {'3V3': bx(8), 'GND': bx(9), 'SDA': bx(10), 'SCL': bx(11)}
MPR = {'3V3': 12, 'IRQ': 11, 'SCL': 10, 'SDA': 9, 'ADD': 8, 'GND': 7}   # col2
MPU = {'VCC': 11, 'GND': 10, 'SCL': 9, 'SDA': 8, 'XDA': 7, 'XCL': 6,
       'AD0': 5, 'INT': 4}                                              # col12


def main(out='.'):
    fig, ax = plt.subplots(figsize=(10, 12), facecolor=BG)
    ax.set_facecolor(BG); ax.axis('off')
    for cc in range(1, 19):
        for rr in range(1, 25):
            ax.add_patch(Circle((cc, rr), 0.12, fc=DIM, ec='none'))
    # buses
    for name, x in BUS.items():
        ax.plot([x, x], [3, 15], lw=3.5, color=C[name],
                solid_capstyle='round', alpha=0.9)
        ax.text(x, 15.8, name, ha='center', fontsize=8, family='monospace',
                color=C[name], fontweight='bold')
    # sockets ghost
    for x in (bx(6), bx(12)):
        for rr in range(17, 24):
            ax.add_patch(Circle((x, rr), 0.3, fc='#dedbd2', ec='#8a8880',
                                lw=0.5))
    ax.text((bx(6) + bx(12)) / 2, 24.3, 'XIAO排母(等件)', ha='center',
            fontsize=7, family='monospace', color='#8a8880')
    # module pins
    for name, row in MPR.items():
        ax.add_patch(Circle((bx(2), row), 0.32,
                            fc=C.get(name, '#8a8880'), ec=INK, lw=0.5))
        ax.text(bx(2) + 0.55, row, name, va='center', fontsize=7,
                family='monospace')
    ax.text(bx(2), 13.0, 'MPR121(背面)', ha='center', fontsize=7.5,
            family='monospace')
    for name, row in MPU.items():
        ax.add_patch(Circle((bx(12), row), 0.32,
                            fc=C.get(name.replace('VCC', '3V3'), '#8a8880'),
                            ec=INK, lw=0.5))
        ax.text(bx(12) - 0.55, row, name, va='center', ha='right', fontsize=7,
                family='monospace')
    ax.text(bx(12), 12.0, 'MPU6050(背面)', ha='center', fontsize=7.5,
            family='monospace')
    # the 8 wires, horizontal at the pin's own row
    wires = [(bx(2), MPR['3V3'], BUS['3V3'], '3V3'),
             (bx(2), MPR['GND'], BUS['GND'], 'GND'),
             (bx(2), MPR['SDA'], BUS['SDA'], 'SDA'),
             (bx(2), MPR['SCL'], BUS['SCL'], 'SCL'),
             (bx(12), MPU['VCC'], BUS['3V3'], '3V3'),
             (bx(12), MPU['GND'], BUS['GND'], 'GND'),
             (bx(12), MPU['SDA'], BUS['SDA'], 'SDA'),
             (bx(12), MPU['SCL'], BUS['SCL'], 'SCL')]
    for x0, row, x1, net in wires:
        ax.annotate('', xy=(x1, row), xytext=(x0, row),
                    arrowprops=dict(arrowstyle='-', lw=2.2, color=C[net],
                                    shrinkA=4, shrinkB=4, alpha=0.85))
        ax.add_patch(Circle((x1, row), 0.22, fc=C[net], ec=INK, lw=0.4))
    ax.text(9.5, 0.0,
            '实线=本阶段8根(带皮硅胶线,横跨母线处绝缘皮自然隔开)\n'
            '接点=线到达母线的那个孔:线头和母线一起裹进同一个焊点',
            ha='center', fontsize=8, family='monospace')
    later = ('等件后的飞线(背面):\n'
             '  D4→SDA母线 · D5→SCL母线(排母右列, 即背面靠MPR侧)\n'
             '  D0→J3的SDA1 · D7→J3的SCL1\n'
             '  D2/D1/D3→J6的BCLK/LRC/DIN · D8/D9/D10→J2的SCK/WS/SD\n'
             '  D6→J5的DIN · XIAO底面BAT±→J4两孔')
    ax.text(0.6, -2.2, later, fontsize=7.5, family='monospace', va='top')
    ax.set_xlim(-0.5, 19.5)
    ax.set_ylim(-6.5, 25.6)
    ax.set_aspect('equal')
    ax.set_title('飞线排布 · 背面视角(左右已镜像,照着焊即可)\n'
                 '左=MPU6050 · 右=MPR121 · 中间四条=母线',
                 fontsize=11, family='monospace')
    fig.savefig(f'{out}/mc02_flies.png', dpi=150, facecolor=BG,
                bbox_inches='tight')
    print(f'→ {out}/mc02_flies.png')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
