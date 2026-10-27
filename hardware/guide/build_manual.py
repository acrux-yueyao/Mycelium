#!/usr/bin/env python3
"""Moony build + wiring manual: a cover page, then one page per layer, bottom-up. Each layer page
is the assembly plan (same convention as assembly_guide.py: builder stands behind Moony, page up =
front, left/right = your hands; assembly numbers, zone colours, magnet poles, layer below as a ghost)
with every touch wire that passes through the layer drawn on it, its cubes outlined in the wire
colour, and the steps for that layer on the right: which numbers go down, which wired cubes come in
(what they are, which faces the wire uses), which pads to test. A last page closes the back.
Usage: python3 hardware/guide/build_manual.py <variants_dir> <touch_plan.json> <out.pdf>"""
import json
import os
import sys
import textwrap

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, Circle

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seq_plates import build_order
from touch_wiring import WIRES, HEX
from wire_cards import CHAINS

NC, SC = '#c14953', '#3e6fb8'
BG = '#f6f5f0'


def luma(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def wrap(s, n=34):
    return '\n'.join(textwrap.wrap(s, n, break_long_words=True, replace_whitespace=False)) or s


def main(vdir, plan_p, out):
    man = json.load(open(f'{vdir}/kit_manifest.json')); cells = man['cells']
    ordered, _ = build_order(cells)
    for i, c in enumerate(ordered):
        c['seq'] = i + 1
    K = {(c['x'], c['y'], c['z']): c for c in cells}
    by_seq = {c['seq']: c for c in cells}
    plan = json.load(open(plan_p))
    names = man.get('color_names') or [''] * len(man['colors'])
    nos = man.get('color_nos') or [''] * len(names)
    layers = sorted({c['y'] for c in cells})
    X0, X1 = min(c['x'] for c in cells), max(c['x'] for c in cells) + 1
    Z0, Z1 = min(c['z'] for c in cells), max(c['z'] for c in cells) + 1

    # wire info per cell
    wire_of, role = {}, {}
    routes = {}
    for pad, (_, name, cube, col, tape, cm) in enumerate(WIRES):
        r = plan[pad]
        routes[pad] = [tuple(p) for p in r['route']]
        for st in CHAINS.get(pad, []):
            if st[0] == 'gap':
                continue
            c = by_seq[int(st[1])]; k = (c['x'], c['y'], c['z'])
            wire_of[k] = pad; role[k] = st
    for pad in (3, 4):                                       # cheeks: a touch cube straight into the cavity
        r = plan[pad]; k = tuple(r['cell']); wire_of[k] = pad; role[k] = ('T', str(K[k]['seq']), '后', '前')

    def wname(pad):
        _, name, _, col, tape, _ = WIRES[pad]
        return f'E{pad} {col}{f"+{tape}道" if tape else ""}·{name}'

    pdf = PdfPages(out)
    # ---------------- cover
    fig = plt.figure(figsize=(16.5, 11.7), facecolor=BG)
    fig.text(0.04, 0.93, 'Moony 搭建 + 穿线说明书', fontsize=28, weight='bold')
    fig.text(0.04, 0.895, f'{len(layers)} 层,从下往上,一层一页 · 共 {len(cells)} 颗方块 · 12 路触摸线', fontsize=13, color='#55524a')
    rules = [
        '【开始前】',
        '1. 主板放在机器人背后的桌上,插着 USB。12 根触摸线从主板 J7 伸出来:背面焊点打热熔胶,线束扎在板柱上。',
        '2. 带线的方块已经挂在各自的线上(触摸块在线的末端)。拼到它们时,把方块放进位置,多的线往主板方向收。',
        '3. 主板空腔(第 2–7 层中间那个空的大方框)先空着,所有线都从这里往后、从背面的门洞拉出去接主板。',
        '',
        '【方向规则 · 每一页都一样】',
        '· 站在机器人背后拼。页面上方 = 机器人正面(离你远),左右 = 你的左右手。',
        '· 磁铁:刻 S 的面朝 右手 / 远处 / 上;刻 N 的面朝 左手 / 近处 / 下。方块吸不住、往外推 = 转错了。',
        '· 每颗方块上的数字 = 拼装序号,按从小到大放。灰色虚线 = 下面一层的轮廓,用来对齐。',
        '',
        '【线的画法】',
        '· 粗彩线 = 这一层里走的线(颜色 = 线的颜色);彩色粗框 = 这条线的方块;↑↓ = 线在这里竖着去上 / 下一层。',
        '· 线槽块(LA+LB 两半):线放进 LA 剖面的槽,从「进」面进、「出」面出;剖面涂胶避开槽,合 LB,再装磁铁。',
        '· 触摸块(Tbody+Tlid):铜箔贴在薄盖内侧,薄盖(光面朝外)就是被摸的那一面。',
        '· 线不能夹在两颗方块中间:磁铁面要贴平。悬空穿过头里的线拉直,别绷紧。',
        '',
        '【每层拼完】',
        '· 这一层有触摸块的,马上测:串口按 e 选到那一路(按 e 的次数 = E 编号 + 1),隔着盖子摸,显示「摸到」再往上拼。',
    ]
    fig.text(0.04, 0.85, '\n'.join(rules), fontsize=12.5, va='top', linespacing=1.75)
    # wire table
    ax = fig.add_axes([0.62, 0.08, 0.35, 0.78]); ax.axis('off'); ax.set_xlim(0, 10); ax.set_ylim(0, 13.5)
    ax.text(0, 13.1, '12 路线一览', fontsize=15, weight='bold')
    for i, (pad, name, cube, col, tape, cm) in enumerate(WIRES):
        y = 12.2 - i
        ax.add_patch(Rectangle((0, y - 0.25), 1.0, 0.5, fc=HEX[col], ec='#1c1c1a'))
        for b in range(tape):
            ax.add_patch(Rectangle((0.25 + b * 0.3, y - 0.32), 0.15, 0.64, fc='#efe3c2', ec='#8a7a52', lw=0.6))
        chain = ' → '.join(st[1] for st in CHAINS.get(pad, []) if st[0] != 'gap') or (cube if pad != 8 else '门板铜箔卡片')
        lys = sorted({p[1] + 1 for p in routes[pad] if p in K})
        ax.text(1.2, y, f'E{pad}  {name}', fontsize=11.5, va='center', weight='bold')
        ax.text(4.0, y, f'{chain}', fontsize=10.5, va='center')
        ax.text(10, y, f'第 {"、".join(map(str, lys))} 层' if lys else '最后装', fontsize=10, va='center', ha='right', color='#55524a')
    pdf.savefig(fig, facecolor=BG); plt.close(fig)

    # ---------------- layer pages
    for li, ly in enumerate(layers):
        this = sorted([c for c in cells if c['y'] == ly], key=lambda c: c['seq'])
        below = [c for c in cells if c['y'] == ly - 1]
        fig = plt.figure(figsize=(16.5, 11.7), facecolor=BG)
        ax = fig.add_axes([0.02, 0.05, 0.62, 0.86]); ax.set_facecolor(BG)
        for c in below:
            ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc='none', ec='#b8b4a8', lw=0.8, ls=(0, (2, 2))))
        for c in this:
            col = man['colors'][c['ci']]; k = (c['x'], c['y'], c['z'])
            ax.add_patch(Rectangle((c['x'], c['z']), 1, 1, fc=col, ec='#1c1c1a', lw=1.0))
            if c.get('eye'):
                ax.add_patch(Rectangle((c['x'] + 0.06, c['z'] + 0.06), 0.88, 0.88, fill=False, ec='#3b82f6', lw=2, ls='--'))
            tc = '#1c1c1a' if luma(col) > 130 else '#f6f5f0'
            mask = {tuple(m) for m in c['mask']}
            x0, z0 = c['x'], c['z']
            marks = {(0, False): (x0 + 0.12, z0 + 0.5, 'N'), (0, True): (x0 + 0.88, z0 + 0.5, 'S'),
                     (1, False): (x0 + 0.5, z0 + 0.12, 'N'), (1, True): (x0 + 0.5, z0 + 0.88, 'S')}
            for key, (mx, mz, pole) in marks.items():
                if key in mask:
                    ax.add_patch(Rectangle((mx - 0.09, mz - 0.09), 0.18, 0.18, fc=NC if pole == 'N' else SC, ec='#1c1c1a', lw=0.3))
                    ax.text(mx, mz, pole, ha='center', va='center', fontsize=5.5, color='w', weight='bold')
            if (2, True) in mask:
                ax.add_patch(Circle((x0 + 0.5, z0 + 0.45), 0.2, fc=SC, ec='#1c1c1a', lw=0.3))
                ax.text(x0 + 0.5, z0 + 0.45, str(c['seq']), ha='center', va='center', fontsize=8, weight='bold', color='w')
            else:
                ax.text(x0 + 0.5, z0 + 0.45, str(c['seq']), ha='center', va='center', fontsize=9.5, weight='bold', color=tc)
            if (2, False) in mask:
                ax.text(x0 + 0.24, z0 + 0.3, '底N', ha='center', va='center', fontsize=5, color=NC, weight='bold')
            tag = c['code'][0] if c['code'][0] in 'WMUG' else ''
            ax.text(x0 + 0.5, z0 + 0.72, (tag + ' ' if tag else '') + c['code'][2:], ha='center', va='center', fontsize=5.5, color=tc)
            if k in wire_of:
                wc = HEX[WIRES[wire_of[k]][3]] if WIRES[wire_of[k]][3] != '白' else '#b9b4a6'
                ax.add_patch(Rectangle((x0 + 0.03, z0 + 0.03), 0.94, 0.94, fill=False, ec=wc, lw=3.4, zorder=6))
                ax.add_patch(Rectangle((x0 - 0.01, z0 - 0.01), 1.02, 1.02, fill=False, ec='#1c1c1a', lw=0.8, zorder=7))
                ax.text(x0 + 0.97, z0 + 0.97, f'E{wire_of[k]}', ha='right', va='top', fontsize=7, weight='bold', zorder=9,
                        bbox=dict(boxstyle='round,pad=0.1', fc='#ffffffe0', ec='none'))
        if 2 <= ly <= 7:
            ax.add_patch(Rectangle((5, 0), 5, 7, fill=False, ec='#2e7d5b', lw=1.6, ls='--', zorder=5))
            ax.text(7.5, 0.35, '主板空腔(先空着,线从这里往后拉出门洞)', ha='center', color='#2e7d5b', fontsize=9, zorder=5)
        steps_w, passing, tests = [], [], []
        for pad, R in routes.items():
            if not R:
                continue
            wc = HEX[WIRES[pad][3]] if WIRES[pad][3] != '白' else '#b9b4a6'
            here = [p for p in R if p[1] == ly]
            if not here:
                continue
            for p, q in zip(R, R[1:]):
                if p[1] == ly and q[1] == ly:
                    ax.plot([p[0] + 0.5, q[0] + 0.5], [p[2] + 0.5, q[2] + 0.5], color='#1c1c1a', lw=5, zorder=10, solid_capstyle='round')
                    ax.plot([p[0] + 0.5, q[0] + 0.5], [p[2] + 0.5, q[2] + 0.5], color=wc, lw=3.2, zorder=11, solid_capstyle='round')
                for a, b in ((p, q), (q, p)):
                    if a[1] == ly and b[1] != ly:
                        ax.text(a[0] + 0.5, a[2] + 0.2, f'E{pad}{"↑" if b[1] > ly else "↓"}', ha='center', va='center',
                                fontsize=7.5, weight='bold', zorder=12, bbox=dict(boxstyle='round,pad=0.1', fc=wc, ec='#1c1c1a', lw=0.5))
            if not any(p in K for p in here):
                passing.append(f'E{pad}({WIRES[pad][1]})的线竖着/悬空穿过这一层,拉直别绷紧')
        for c in this:
            k = (c['x'], c['y'], c['z'])
            if k in role:
                st = role[k]; pad = wire_of[k]
                if st[0] == 'L':
                    steps_w.append(f'序号 {c["seq"]} = {wname(pad)} 的线槽块:线从【{st[2]}】进、【{st[3]}】出;两半合好、磁铁装好再放')
                else:
                    steps_w.append(f'序号 {c["seq"]} = {wname(pad)} 的触摸块:线从【{st[2]}】进腔,薄盖(摸的面)朝【{st[3]}】')
                    tests.append(f'E{pad}:按 e {pad + 1} 次,摸{WIRES[pad][1]} → 显示「摸到」')
        near = this + below
        lx0, lx1 = min(c['x'] for c in near) - 1, max(c['x'] for c in near) + 2
        lz0, lz1 = min(c['z'] for c in near) - 1, max(c['z'] for c in near) + 2
        if 2 <= ly <= 7:
            lz0 = min(lz0, -1)
        ax.set_xlim(lx0 - 0.3, lx1 + 0.3); ax.set_ylim(lz0 - 0.4, lz1 + 0.4); ax.set_aspect('equal')
        X0, X1, Z0, Z1 = lx0 + 1, lx1 - 1, lz0 + 1, lz1 - 1
        ax.set_xticks([]); ax.set_yticks([])
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.text(X0 - 0.4, Z1 + 0.4, '← 你的左手', fontsize=9, color='#6d6a62')
        ax.text(X1 + 0.4, Z1 + 0.4, '你的右手 →', fontsize=9, color='#6d6a62', ha='right')
        ax.text((X0 + X1) / 2, Z1 + 0.4, '▲ 正面(脸,远离你)', fontsize=9, color='#6d6a62', ha='center')
        ax.text((X0 + X1) / 2, Z0 - 0.6, '▼ 背面(靠近你)· 你站在这边拼', fontsize=9, color='#6d6a62', ha='center')
        cols_here = sorted({c['ci'] for c in this})
        fig.text(0.02, 0.95, f'第 {li + 1} / {len(layers)} 层', fontsize=24, weight='bold')
        fig.text(0.17, 0.953, f'本层 {len(this)} 颗 · 序号 {this[0]["seq"]}–{this[-1]["seq"]} · '
                 + ' · '.join(f'{nos[ci]}号{names[ci].split(" ")[0] if names[ci] else ""}' for ci in cols_here),
                 fontsize=12, color='#55524a')
        # step panel
        lines = [f'① 按序号 {this[0]["seq"]} → {this[-1]["seq"]} 依次放,每颗对准下面一层,磁铁吸住、面贴平。']
        n = 2
        for s in steps_w:
            lines.append(f'{"②③④⑤⑥⑦⑧⑨⑩"[min(n - 2, 8)]} {s}'); n += 1
        for s in passing:
            lines.append(f'{"②③④⑤⑥⑦⑧⑨⑩"[min(n - 2, 8)]} {s}'); n += 1
        if steps_w:
            lines.append(f'{"②③④⑤⑥⑦⑧⑨⑩"[min(n - 2, 8)]} 带线的方块放好后,把多出来的线往主板空腔收,从门洞拉出去。'); n += 1
        if tests:
            lines.append('')
            lines.append('【这层拼完先测】')
            lines += tests
        if not steps_w and not passing:
            lines.append('')
            lines.append('这一层没有线,正常拼。')
        tx = fig.add_axes([0.66, 0.05, 0.32, 0.86]); tx.axis('off')
        tx.text(0, 1, '\n\n'.join(wrap(l, 28) if l and not l.startswith('【') else l for l in lines), fontsize=12.5,
                va='top', linespacing=1.45, transform=tx.transAxes)
        pdf.savefig(fig, facecolor=BG); plt.close(fig)

    # ---------------- closing page
    fig = plt.figure(figsize=(16.5, 11.7), facecolor=BG)
    fig.text(0.04, 0.93, '最后:装主板、合门板', fontsize=26, weight='bold')
    fin = [
        '1. 所有层拼完,12 路全部再测一遍(串口 e,一路一路按)。都显示「摸到」再往下。',
        '2. E8 背后:铜箔卡片(带魔术贴)贴在门板内侧上半部,焊点朝里;按 e 9 次测。',
        '3. 主板装到门板的四根板柱上:眼睛插座朝上,元件面朝机器人正面。',
        '4. USB:弯头插进 XIAO,线往后(门板方向)弯,顺着主板背面走出来。',
        '5. 把门板连同主板从背后慢慢推进空腔:边推边从门洞里把线束往回理,线不能被板边或门框夹住。',
        '6. 门板四周的磁铁吸住。插 USB 开机,等串口出现「触摸基线已重新校准」,再把 12 个点各摸一次。',
        '7. 多出来的线留在空腔里绕成一圈,别剪:以后拉出门板修东西还要用。',
        '',
        '出问题时:某一路不跳 → 按 e 选到它,看信号;直接摸铜箔会跳、隔盖不跳 = 铜箔没贴平;都不跳 = 焊点断了(先查 J7 那头)。',
    ]
    fig.text(0.04, 0.86, '\n\n'.join(wrap(l, 70) for l in fin), fontsize=14, va='top', linespacing=1.5)
    pdf.savefig(fig, facecolor=BG); plt.close(fig)
    pdf.close()
    print(out, len(layers) + 2, 'pages')


if __name__ == '__main__':
    main(*sys.argv[1:4])
