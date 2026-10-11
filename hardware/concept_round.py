#!/usr/bin/env python3
"""
Concept sheet for the round, moving desk robot ("moony 2").

Front view, side section and the two mechanisms (neck pan-tilt, breathing
cap). Dimensions are the working numbers for the first CAD pass.
Usage: python3 hardware/concept_round.py [out_dir]   Writes concept_round.png
"""
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Ellipse, FancyBboxPatch, Polygon, Rectangle, Wedge, Arc

BG, INK, DIM = '#f6f5f0', '#1c1c1a', '#8a8880'
CAP, CAP2, HEAD, BODY, BASE = '#5b8fd6', '#7b6fd6', '#efe7f2', '#c9b6e4', '#6a45c9'
SCREEN, ELEC, SERVO = '#1c1c1a', '#4a7d43', '#d07f2e'

# ---- working dimensions (mm) ----
BASE_W, BASE_H = 96, 10
BODY_W, BODY_H = 84, 62
NECK = 18
HEAD_D = 92
CAP_H = 34


def front(ax):
    ax.set_title('正面 · 约 100 × 150 mm(现在的 moony 是 170 × 190)', fontsize=10)
    ax.add_patch(FancyBboxPatch((-BASE_W / 2, 0), BASE_W, BASE_H, boxstyle='round,pad=0,rounding_size=5', fc=BASE, ec=INK))
    ax.add_patch(Ellipse((0, BASE_H + BODY_H / 2), BODY_W, BODY_H * 1.1, fc=BODY, ec=INK))
    y0 = BASE_H + BODY_H
    hc = y0 + NECK / 2 + HEAD_D / 2 - 6
    ax.add_patch(Circle((0, hc), HEAD_D / 2, fc=HEAD, ec=INK, zorder=3))
    # breathing cap: 10 petals around the crown
    for i in range(10):
        a0 = 15 + i * 15
        ax.add_patch(Wedge((0, hc), HEAD_D / 2 + 7, a0, a0 + 13, width=CAP_H * 0.55,
                           fc=CAP if i % 2 else CAP2, ec=INK, lw=0.8, zorder=4))
    for (dx, dy) in ((-26, 14), (22, 22), (-6, 30), (30, 4), (-34, -2)):     # spore-dot tiles
        ax.add_patch(Circle((dx, hc + dy + 6), 4.2, fc='#f2f1ec', ec=INK, lw=0.6, zorder=5))
    # face: two OLED eyes + ToF between them
    for ex in (-15, 15):
        ax.add_patch(FancyBboxPatch((ex - 11, hc - 14), 22, 12, boxstyle='round,pad=0,rounding_size=3', fc=SCREEN, ec=INK, zorder=6))
        ax.add_patch(Ellipse((ex, hc - 8), 7, 9, fc='#f2f1ec', ec='none', zorder=7))
    ax.add_patch(Circle((0, hc - 24), 2.4, fc=INK, zorder=6)); ax.text(5, hc - 25, 'ToF', fontsize=6, color=DIM, zorder=6)
    ax.add_patch(Circle((-20, BASE_H + 18), 1.4, fc=INK)); ax.text(-16, BASE_H + 17, 'mic', fontsize=6, color=DIM)
    for gx in (16, 20, 24):
        ax.add_patch(Circle((gx, BASE_H + 14), 0.9, fc=INK))
    ax.text(28, BASE_H + 13, '喇叭', fontsize=6, color=DIM)
    ax.annotate('伞盖 10 片“菌瓣”\n缓慢张合 = 呼吸', (44, hc + 30), xytext=(60, hc + 34), fontsize=7.5,
                arrowprops=dict(arrowstyle='-', color=DIM))
    ax.annotate('可拆“孢子斑点”\nØ9 磁吸小圆片', (-34, hc + 6), xytext=(-104, hc + 20), fontsize=7.5,
                arrowprops=dict(arrowstyle='-', color=DIM))
    ax.annotate('两只眼睛(OLED)\n长在头上,跟着头转', (15, hc - 8), xytext=(52, hc - 30), fontsize=7.5,
                arrowprops=dict(arrowstyle='-', color=DIM))
    ax.annotate('身体:脸板、电池、喇叭', (30, BASE_H + 40), xytext=(52, BASE_H + 52), fontsize=7.5,
                arrowprops=dict(arrowstyle='-', color=DIM))
    ax.set_xlim(-105, 105); ax.set_ylim(-8, 185); ax.set_aspect('equal'); ax.axis('off')


def section(ax):
    ax.set_title('侧剖面 · 里面装什么', fontsize=10)
    ax.add_patch(FancyBboxPatch((-BASE_W / 2, 0), BASE_W, BASE_H, boxstyle='round,pad=0,rounding_size=5', fc=BASE, ec=INK, alpha=0.5))
    ax.add_patch(Ellipse((0, BASE_H + BODY_H / 2), BODY_W * 0.8, BODY_H * 1.1, fc=BODY, ec=INK, alpha=0.35))
    # face board standing upright, battery behind, speaker on the floor
    ax.add_patch(Rectangle((8, BASE_H + 4), 2.5, 56, fc=ELEC, ec=INK)); ax.text(13, BASE_H + 26, '脸板 MC03-F\n(竖放)', fontsize=6.5)
    ax.add_patch(Rectangle((-16, BASE_H + 6), 6, 40, fc='#c9a35a', ec=INK)); ax.text(-30, BASE_H + 26, '电池', fontsize=6.5)
    ax.add_patch(Rectangle((-14, BASE_H + 1), 24, 4, fc=INK)); ax.text(-12, BASE_H - 6, '喇叭朝下', fontsize=6.5, color=DIM)
    ax.add_patch(Rectangle((-30, BASE_H + 48), 14, 8, fc=ELEC, ec=INK)); ax.text(-44, BASE_H + 58, 'PCA9685+升压', fontsize=6)
    y0 = BASE_H + BODY_H
    # pan servo in the body top, tilt servo in the neck
    ax.add_patch(Rectangle((-11, y0 - 14), 22, 12, fc=SERVO, ec=INK)); ax.text(46, y0 - 10, '① 转头舵机(左右 ±60°)', fontsize=6.5)
    ax.add_patch(Rectangle((-5, y0 - 2), 10, NECK, fc='#dedbd2', ec=INK))
    hc = y0 + NECK / 2 + HEAD_D / 2 - 6
    ax.add_patch(Circle((0, hc), HEAD_D / 2, fc=HEAD, ec=INK, alpha=0.6))
    ax.add_patch(Rectangle((-12, y0 + NECK - 6), 24, 12, fc=SERVO, ec=INK)); ax.text(50, y0 + NECK + 2, '② 点头舵机(上下 ±20°)', fontsize=6.5)
    # eyes on the head front, cap mechanism on top
    ax.add_patch(Rectangle((HEAD_D / 2 - 10, hc - 14), 4, 24, fc=SCREEN)); ax.text(HEAD_D / 2 - 4, hc + 12, '眼睛', fontsize=6.5)
    ax.add_patch(Rectangle((-10, hc + 14), 20, 10, fc=SERVO, ec=INK)); ax.text(-28, hc + 4, '③ 呼吸舵机', fontsize=6.5)
    ax.plot([0, 0], [hc + 24, hc + 38], color=INK, lw=2)
    for s in (-1, 1):
        ax.plot([0, s * 34], [hc + 38, hc + 30], color=INK, lw=1.2)
        ax.add_patch(Wedge((0, hc), HEAD_D / 2 + 7, 90 - s * 70 - 8, 90 - s * 70 + 8, width=14, fc=CAP, ec=INK, alpha=0.9))
    ax.text(-64, hc + 58, '中心推杆上下 6 mm → 伞骨把菌瓣顶开/收回(像撑伞)', fontsize=6.5)
    ax.plot([2, 2, 6], [y0 - 2, hc - 30, hc - 20], color='#c14953', lw=1, ls='--')
    ax.text(-74, hc - 34, '线束穿过脖子中心,\n留一圈余量让头能转', fontsize=6, color='#c14953')
    ax.set_xlim(-80, 120); ax.set_ylim(-8, 185); ax.set_aspect('equal'); ax.axis('off')


def behaviour(ax):
    ax.axis('off')
    ax.set_title('它会做什么', fontsize=10)
    rows = [
        ('你走近(ToF < 40 cm)', '慢慢转头对准你,眼睛睁大'),
        ('你说话(麦克风)', '转向声音那边,伞盖微微张开'),
        ('摸头顶', '低头蹭一下、眯眼,伞盖收紧'),
        ('摸脸颊', '歪头 15°'),
        ('没人理它', '伞盖每 4 秒一张一合(呼吸),偶尔东张西望'),
        ('被拿起来(姿态芯片)', '伞盖炸开、眼睛变圆,惊讶'),
        ('晚上 / 电量低', '低头、伞盖合上、呼吸变慢 → 睡觉'),
    ]
    for i, (a, b) in enumerate(rows):
        ax.text(0.0, 0.92 - i * 0.12, a, fontsize=8.5, fontweight='bold', transform=ax.transAxes)
        ax.text(0.42, 0.92 - i * 0.12, b, fontsize=8.5, transform=ax.transAxes)


def parts(ax):
    ax.axis('off')
    ax.set_title('要加的零件(脸板不改)', fontsize=10)
    rows = [
        ('转头/点头', '2 × MG90S 金属齿微型舵机', '约 $8'),
        ('呼吸伞盖', '1 × SG90 舵机(或 5 g 微型舵机)', '约 $3'),
        ('舵机驱动', 'PCA9685 16 路板,接 I2C(地址 0x40)', '约 $4'),
        ('舵机电源', 'MT3608 / TPS61023 升压到 5 V 2 A', '约 $2'),
        ('电池', '103450 2000 mAh(原 603040 太小)', '约 $8'),
        ('结构', '打印 6 个大件 + 若干菌瓣和斑点', '料钱'),
        ('磁铁', '斑点用 Ø4×2,现有的就行', '—'),
    ]
    for i, r in enumerate(rows):
        for j, x in enumerate((0.0, 0.22, 0.86)):
            ax.text(x, 0.92 - i * 0.12, r[j], fontsize=8.5, fontweight='bold' if j == 0 else 'normal', transform=ax.transAxes)


def main(out='.'):
    fig = plt.figure(figsize=(16, 11), facecolor=BG)
    gs = fig.add_gridspec(2, 2, height_ratios=[3, 1.4], hspace=0.08, wspace=0.05)
    for f, pos in ((front, gs[0, 0]), (section, gs[0, 1]), (behaviour, gs[1, 0]), (parts, gs[1, 1])):
        ax = fig.add_subplot(pos); ax.set_facecolor(BG); f(ax)
    fig.suptitle('moony 2 · 会转头、会呼吸的圆蘑菇 · 构思草图 v0', fontsize=15)
    fig.savefig(f'{out}/concept_round.png', dpi=120, facecolor=BG, bbox_inches='tight')
    print(f'→ {out}/concept_round.png')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
