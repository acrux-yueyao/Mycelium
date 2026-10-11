#!/usr/bin/env python3
"""
Structure sheet for the moving Moony Moth (demo-8) — drawn from its real voxels.

Splits the spore into BASE (new round plinth: electronics + pan servo),
BODY (lower rows, fixed on the turntable, tilt servo inside), HEAD (face
+ cap, nods; eyes live here) and PETALS (outer cap cubes that open/close
= breathing). Cube pitch is a parameter (10 mm keeps it light).

Usage: python3 hardware/concept_moth.py <front_colours.json> <sculpt.json> <out_dir> [pitch_mm]
Writes concept_moth.png
"""
import json
import sys

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch

BG, INK, DIM, RED = '#f6f5f0', '#1c1c1a', '#8a8880', '#c14953'
SERVO, ELEC, BAT = '#d07f2e', '#4a7d43', '#c9a35a'


def main(front_json, sculpt_json, out, P=10.0):
    fm = json.load(open(front_json)); sm = json.load(open(sculpt_json))
    front = {}
    for x, y, z, h, *_ in fm['voxels']:
        if (x, y) not in front or z > front[(x, y)][0]:
            front[(x, y)] = (z, h)
    vox = {(x, y, z) for x, y, z, *_ in sm['voxels']}
    a = sm['anchor']; ye = a['rows'] - 1 - a['eyeRow']
    ys = sorted({k[1] for k in front}); top = max(ys)
    split = ye - 1                                  # head = face (eye row ±1) + cap
    cap0 = ye + 2
    W = max(k[0] for k in front) + 1
    # petals: outermost cap cells (row ends + top row)
    petals = set()
    for y in range(cap0, top + 1):
        row = sorted(x for (x, yy) in front if yy == y)
        if not row:
            continue
        petals |= {(row[0], y), (row[-1], y)}
        if y == top:
            petals |= {(x, y) for x in row}
        if y == top - 1:
            petals |= {(row[1], y), (row[-2], y)}
    BASE_H = 24.0
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 9.5), facecolor=BG)
    for ax in (ax1, ax2):
        ax.set_facecolor(BG); ax.set_aspect('equal'); ax.axis('off')
    # ---------- front ----------
    ax1.add_patch(FancyBboxPatch((-0.6 * P, -BASE_H), (W + 1.2) * P, BASE_H - 2, boxstyle='round,pad=0,rounding_size=8',
                                 fc='#3d3a4a', ec=INK))
    ax1.text(W * P / 2, -BASE_H / 2 - 1, '底座(会转的圆台)', ha='center', va='center', color='#f6f5f0', fontsize=9)
    for (x, y), (z, h) in front.items():
        ax1.add_patch(Rectangle((x * P, y * P), P, P, fc=h, ec=BG, lw=0.8))
        if (x, y) in petals:
            ax1.add_patch(Rectangle((x * P + 1, y * P + 1), P - 2, P - 2, fill=False, ec='#f6f5f0', lw=1.6, ls=(0, (2, 1.5))))
    ax1.plot([-8, (W + 0.5) * P], [split * P + P, split * P + P], color=RED, lw=1.5, ls='--')
    ax1.text((W + 0.6) * P, split * P + P, '点头轴', color=RED, fontsize=9, va='center')
    ax1.text((W + 0.6) * P, (cap0 + top + 1) / 2 * P, '头:脸+伞盖\n(会点头,眼睛在这)', fontsize=9, va='center')
    ax1.text((W + 0.6) * P, split * P / 2 + 5, '身体\n(跟底座一起转)', fontsize=9, va='center')
    ax1.text(-1.0 * P, (top + 0.5) * P + 6, '白虚框 = 菌瓣:伞盖最外一圈,呼吸时向外翻开 8–10°', fontsize=8.5, color='#6d6a62')
    ax1.set_xlim(-2 * P, (W + 5.5) * P); ax1.set_ylim(-BASE_H - 6, (top + 2.2) * P)
    ax1.set_title(f'Moony Moth · 正面 · {W}×{top + 1} 格 × {P:.0f} mm = {W * P:.0f}×{(top + 1) * P:.0f} mm(+底座 {BASE_H:.0f})',
                  fontsize=11)
    # ---------- side section ----------
    zs = [k[2] for k in vox]; z0, z1 = min(zs), max(zs) + 1
    prof = {}
    for (x, y, z) in vox:
        prof.setdefault(y, set()).add(z)
    for y, zz in prof.items():
        for z in zz:
            col = '#c9b6e4' if y <= split else ('#e9c3d9' if y < cap0 else '#c7b2e8')
            ax2.add_patch(Rectangle(((z - z0) * P, y * P), P, P, fc=col, ec=BG, lw=0.8, alpha=0.8))
    D = (z1 - z0) * P; cx = D / 2
    ax2.add_patch(FancyBboxPatch((cx - 60, -BASE_H), 120, BASE_H - 2, boxstyle='round,pad=0,rounding_size=8', fc='#d9d6de', ec=INK))
    # base contents
    ax2.add_patch(Rectangle((cx - 34, -BASE_H + 4), 68, 2.4, fc=ELEC, ec=INK)); ax2.text(cx - 30, -BASE_H - 11, '脸板 MC03-F(平放在底座里)', fontsize=7)
    ax2.add_patch(Rectangle((cx - 50, -BASE_H + 8), 30, 9, fc=BAT, ec=INK)); ax2.text(cx - 50, -BASE_H - 6, '电池 103450', fontsize=7)
    ax2.add_patch(Rectangle((cx - 11, -BASE_H + 8), 22, 12, fc=SERVO, ec=INK)); ax2.text(cx - 9, -BASE_H + 21, '① 转身', fontsize=7.5)
    ax2.add_patch(Rectangle((cx + 26, -BASE_H + 8), 22, 8, fc=INK)); ax2.text(cx + 30, -BASE_H - 5, '喇叭/PCA9685', fontsize=7)
    ax2.add_patch(Rectangle((cx - 30, -3), 60, 3, fc='#8a8880', ec=INK)); ax2.text(cx + 34, -2, '转盘轴承', fontsize=7)
    # body: tilt servo near the split
    ax2.add_patch(Rectangle((cx - 12, split * P - 4), 24, 12, fc=SERVO, ec=INK)); ax2.text(cx + 16, split * P, '② 点头舵机', fontsize=7.5)
    ax2.plot([cx - 30, cx + 30], [(split + 1) * P, (split + 1) * P], color=RED, lw=1.5, ls='--')
    # head: eyes front, ToF, breathing servo + umbrella
    fz = (max(z for (xx, y, z) in vox if y == ye) - z0) * P
    ax2.add_patch(Rectangle((fz - 2, ye * P - 3), 4, 16, fc=INK)); ax2.text(fz + 4, ye * P + 15, '眼睛 OLED', fontsize=7.5)
    ax2.add_patch(Rectangle((cx - 9, (top - 1) * P - 8), 18, 10, fc=SERVO, ec=INK)); ax2.text(cx + 12, (top - 1) * P - 6, '③ 呼吸舵机', fontsize=7.5)
    ax2.plot([cx, cx], [(top - 1) * P + 2, (top + 0.6) * P], color=INK, lw=2)
    for s in (-1, 1):
        ax2.plot([cx, cx + s * D * 0.45], [(top + 0.6) * P, (top - 0.4) * P], color=INK, lw=1)
    ax2.text(cx - D / 2, (top + 1.6) * P, '中心推杆上下 5 mm → 伞骨顶开菌瓣', fontsize=7.5)
    ax2.plot([cx + 2, cx + 2, cx + 6], [-2, split * P - 4, ye * P], color=RED, lw=1, ls=':')
    ax2.text(cx - D / 2 - 34, split * P - 14, '线束从转盘中心孔\n穿上来,留余量', fontsize=7, color=RED)
    ax2.text(fz + P + 3, ye * P - 8, '脸 →', fontsize=8, color=DIM)
    ax2.set_xlim(cx - 80, cx + 85); ax2.set_ylim(-BASE_H - 16, (top + 2.2) * P)
    ax2.set_title(f'侧面(左=背后,右=脸)· 最厚 {D:.0f} mm · 外壳为打印的大块马赛克面板', fontsize=11)
    fig.suptitle('会转身、会点头、会呼吸的 Moony Moth · 结构草图 v1', fontsize=15)
    fig.savefig(f'{out}/concept_moth.png', dpi=115, facecolor=BG, bbox_inches='tight')
    print('split row', split, 'cap from', cap0, 'petal cells', len(petals))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 10.0)
