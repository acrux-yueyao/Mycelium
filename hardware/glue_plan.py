#!/usr/bin/env python3
"""
Glue plan — a rigid glued skeleton + detachable outer head cubes.

Magnet-only joints cannot survive being touched: most shell cubes touch
one or two neighbours. So the kit is split:
  GLUE   the skeleton (wick thin CA into the seams) - everything that
         carries load, every cube with fewer than two skeleton neighbours
  KEEP   detachable head cubes (layer >= HEAD_FROM): exposed, held by
         magnets to AT LEAST TWO skeleton cubes, and not needed to keep
         the skeleton in one piece
  DOOR   the back door and the inner faces of its 8 anchor cubes stay free

Greedy, outermost-first: a head cube becomes KEEP if (a) it has an
exposed face, (b) >= 2 neighbours are still GLUE, (c) removing it from
GLUE keeps GLUE connected, (d) every cube already KEEP still has >= 2
GLUE neighbours. Detachable cubes never touch each other's magnets as
their only support.

Usage: python3 hardware/glue_plan.py <variants_dir> <out_dir> [head_from_layer]
Writes glue_plan.pdf (one page per layer), glue_plan.txt
"""
import json
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seq_plates import build_order

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'monospace'
matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle

D6 = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def nb(k):
    return [(k[0] + d[0], k[1] + d[1], k[2] + d[2]) for d in D6]


def connected(cells):
    if not cells:
        return True
    start = next(iter(cells)); seen = {start}; q = deque([start])
    while q:
        for n in nb(q.popleft()):
            if n in cells and n not in seen:
                seen.add(n); q.append(n)
    return len(seen) == len(cells)


def plan(man, head_from):
    order, _ = build_order(man['cells'])
    for i, c in enumerate(order):
        c['seq'] = i + 1
    K = {(c['x'], c['y'], c['z']): c for c in order}
    layers = sorted({k[1] for k in K})
    ymin = layers[head_from - 1]
    glue, keep = set(K), set()
    door = {k for k, c in K.items() if c.get('tag') == 'door'}
    eyes = {k for k, c in K.items() if c.get('eye')}        # eye frames hold the screens: always skeleton
    exposed = lambda k: any(n not in K for n in nb(k))
    # outermost first: farthest from the core axis, then top-down
    cx = sum(k[0] for k in K) / len(K); cz = sum(k[2] for k in K) / len(K)
    cand = sorted((k for k in K if k[1] >= ymin and exposed(k) and k not in door and k not in eyes),
                  key=lambda k: (-(abs(k[0] - cx) + abs(k[2] - cz) + 0.5 * k[1]), k))
    for k in cand:
        g = [n for n in nb(k) if n in glue]
        if len(g) < 2:
            continue
        trial = glue - {k}
        if any(sum(n in trial for n in nb(j)) < 2 for j in keep | {k}):
            continue
        if not connected(trial):
            continue
        glue, keep = trial, keep | {k}
    return order, K, layers, glue, keep, door


def main(vdir, out, head_from=9):
    os.makedirs(out, exist_ok=True)
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    order, K, layers, glue, keep, door = plan(man, head_from)
    hold = {k: sum(n in glue for n in nb(k)) for k in keep}
    lines = [f'骨架(胶死) {len(glue)} 颗 · 可拆外饰 {len(keep)} 颗(第 {head_from} 层以上)· 门板锚定块 {len(door)} 颗(内侧面不涂胶)', '']
    lines.append('可拆外饰(序号: 吸在几颗骨架上):')
    lines.append('  ' + ' '.join(f"{K[k]['seq']}:{hold[k]}" for k in sorted(keep, key=lambda k: K[k]['seq'])))
    lines.append('')
    lines.append('涂胶规则: 两颗都是骨架 → 这条缝涂胶; 有一颗是外饰 → 这条缝不涂; 门板四周不涂。')
    open(f'{out}/glue_plan.txt', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines[:1]))
    X0 = min(k[0] for k in K); X1 = max(k[0] for k in K) + 1
    Z0 = min(k[2] for k in K); Z1 = max(k[2] for k in K) + 1
    pdf = PdfPages(f'{out}/glue_plan.pdf')
    for li, y in enumerate(layers):
        fig, ax = plt.subplots(figsize=(11, 8.5), facecolor='#f6f5f0'); ax.set_facecolor('#f6f5f0')
        for k, c in K.items():
            if k[1] != y:
                continue
            col = man['colors'][c['ci']]
            if k in keep:
                ax.add_patch(Rectangle((k[0], k[2]), 1, 1, fc=col, ec='#1c1c1a', lw=1.6))
                ax.add_patch(Rectangle((k[0] + 0.08, k[2] + 0.08), 0.84, 0.84, fill=False, ec='#e0a020', lw=2.2))
                lab = f"{c['seq']}\n可拆"
            else:
                ax.add_patch(Rectangle((k[0], k[2]), 1, 1, fc=col, ec='#1c1c1a', lw=0.8, alpha=0.45))
                ax.add_patch(Rectangle((k[0], k[2]), 1, 1, fill=False, ec='#6d6a62', lw=0.4, hatch='xx' if k not in door else '..'))
                lab = f"{c['seq']}" + ('\n门' if k in door else '')
            ax.text(k[0] + 0.5, k[2] + 0.5, lab, ha='center', va='center', fontsize=8, fontweight='bold', color='#1c1c1a')
            # glue seams to the neighbour on the right / far side (each seam drawn once)
            for d in ((1, 0, 0), (0, 0, 1)):
                n = (k[0] + d[0], k[1], k[2] + d[2])
                if n in K and k in glue and n in glue:
                    if d[0]:
                        ax.plot([k[0] + 1, k[0] + 1], [k[2] + 0.1, k[2] + 0.9], color='#c14953', lw=3)
                    else:
                        ax.plot([k[0] + 0.1, k[0] + 0.9], [k[2] + 1, k[2] + 1], color='#c14953', lw=3)
        ax.set_xlim(X0 - 0.8, X1 + 0.8); ax.set_ylim(Z0 - 1.2, Z1 + 0.8); ax.set_aspect('equal'); ax.axis('off')
        ax.text((X0 + X1) / 2, Z1 + 0.4, '▲ 正面(脸,远离你)', ha='center', fontsize=9, color='#6d6a62')
        ax.text((X0 + X1) / 2, Z0 - 0.7, '▼ 背面(靠近你)— 站在机器人背后', ha='center', fontsize=9, color='#6d6a62')
        n_keep = sum(1 for k in keep if k[1] == y); n_all = sum(1 for k in K if k[1] == y)
        ax.set_title(f'第 {li + 1}/{len(layers)} 层 · {n_all} 颗 · 可拆 {n_keep} 颗\n'
                     '金框=可拆外饰(不涂胶) · 斜线=骨架(涂胶) · 红线=本层要涂胶的缝 · 层与层之间:骨架叠骨架的竖缝也涂',
                     fontsize=11)
        pdf.savefig(fig, facecolor='#f6f5f0'); fig.savefig(f'{out}/glue_L{li + 1:02d}.png', dpi=110, facecolor='#f6f5f0')
        plt.close(fig)
    pdf.close()
    return glue, keep


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 9)
