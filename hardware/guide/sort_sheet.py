#!/usr/bin/env python3
"""Sorting sheet: every cube is identified by its colour + the two characters engraved on it (the
variant code). Cubes with the same colour and engraving are identical and interchangeable, so a
loose pile sorts into small bins without knowing assembly numbers. One page per colour: each
engraving, how many, special features, and which layers / assembly numbers take it.
Usage: python3 hardware/guide/sort_sheet.py <variants_dir> <touch_plan.json> <out.pdf>"""
import json
import os
import sys
from collections import defaultdict

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seq_plates import build_order

FEAT = {'W': 'ToF 窗口:侧面大方窗', 'M': '麦克风孔:侧面小圆孔', 'U': '充电口通槽', 'G': '喇叭网孔'}
FACE = {(0, True): '右', (0, False): '左', (1, True): '前', (1, False): '后', (2, True): '上', (2, False): '下'}


def main(vdir, plan_p, out):
    man = json.load(open(f'{vdir}/kit_manifest.json')); cells = man['cells']
    ordered, _ = build_order(cells)
    for i, c in enumerate(ordered):
        c['seq'] = i + 1
    K = {(c['x'], c['y'], c['z']): c for c in cells}
    wired = set()
    for r in json.load(open(plan_p)):
        wired |= {tuple(p) for p in r.get('route', []) if tuple(p) in K}
    names = man.get('color_names') or [''] * len(man['colors'])
    groups = defaultdict(list)
    for c in cells:
        k = (c['x'], c['y'], c['z'])
        kind = 'wired' if k in wired else ('eye' if c.get('eye') else 'plain')
        groups[(c['ci'], c['code'][2:], c['code'][0], kind)].append(c)
    with PdfPages(out) as pdf:
        for ci, cname in enumerate(names):
            rows = sorted([(k, v) for k, v in groups.items() if k[0] == ci],
                          key=lambda kv: (kv[0][3] != 'plain', len(kv[0][1]), kv[0][1], kv[0][2]))
            if not rows:
                continue
            per_page = 26
            for pg in range(0, len(rows), per_page):
                chunk = rows[pg:pg + per_page]
                fig = plt.figure(figsize=(11.7, 16.5), facecolor='#f6f5f0')
                fig.text(0.05, 0.965, f'分拣表 · {cname}', fontsize=22, weight='bold')
                fig.text(0.05, 0.945, '按「颜色 + 方块上刻的两个字符」分堆。同一行的方块完全一样,可以互换;'
                         '拼的时候说明书每格小字就是刻字。', fontsize=11, color='#55524a')
                ax = fig.add_axes([0.04, 0.02, 0.92, 0.91]); ax.axis('off'); ax.set_xlim(0, 100); ax.set_ylim(0, per_page + 1)
                for j, t in ((2, '刻字'), (14, '数量'), (22, '有磁铁的面'), (44, '说明'), (66, '用在第几层 · 序号')):
                    ax.text(t[0] if False else j, per_page + 0.4, t, fontsize=11, weight='bold', color='#55524a')
                for i, ((_, code, letter, kind), cs) in enumerate(chunk):
                    y = per_page - 0.6 - i
                    ax.add_patch(Rectangle((0.5, y - 0.38), 99, 0.76, fc=man['colors'][ci], alpha=0.18, ec='none'))
                    ax.text(2, y, code, fontsize=20, weight='bold', va='center', family='DejaVu Sans Mono')
                    ax.text(14, y, f'× {len(cs)}', fontsize=14, va='center')
                    mask = {tuple(m) for m in cs[0]['mask']}
                    ax.text(22, y, '、'.join(FACE[f] for f in FACE if f in mask) or '无', fontsize=11, va='center')
                    note = FEAT.get(letter, '')
                    if kind == 'eye':
                        note = (note + ' ' if note else '') + '眼框块(带小磁铁)'
                    if kind == 'wired':
                        note = (note + ' ' if note else '') + '走线件:看线路卡'
                    ax.text(44, y, note, fontsize=10.5, va='center', color='#8a3b2f' if kind != 'plain' else '#33312b')
                    by_layer = defaultdict(list)
                    for c in sorted(cs, key=lambda c: c['seq']):
                        by_layer[c['y'] + 1].append(str(c['seq']))
                    txt = ' · '.join(f'{l}层:{",".join(s)}' for l, s in sorted(by_layer.items()))
                    ax.text(66, y, txt if len(txt) < 46 else txt[:44] + '…', fontsize=10, va='center')
                pdf.savefig(fig, facecolor='#f6f5f0'); plt.close(fig)
    print(out)


if __name__ == '__main__':
    main(*sys.argv[1:4])
