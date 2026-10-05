#!/usr/bin/env python3
"""
Touch-point planner — where each MPR121 electrode goes on ANY creature.

Touch points are defined by anatomy, not by coordinates, so the same
rule set works for every shape the engine builds:

  1 头顶      top of the cap, nearest the body axis      (touch face: up)
  2 伞盖左缘  left-most cube of the cap                   (left)
  3 伞盖右缘  right-most cube of the cap                  (right)
  4 左脸颊    skin cell core-relative (1,3)               (front)
  5 右脸颊    skin cell core-relative (5,3)               (front)
  6 额头      between the eyes, one row above the frames  (front)
  8 左侧身    left-most cube at core row 3                (left)
  9 右侧身    right-most cube at core row 3               (right)
 10 背后      copper foil on the MC02-P backplane (3 mm, no special cube)
 11 底座边缘  bottom row, front-centre                    (down)

Each electrode cube becomes a touch cube (thin wall on the touch face,
foil inside). Its wire must reach the core cavity without showing: the
route runs through empty interior cells where it can and bores through
hidden cubes where it must (fewest bores, never through an exposed face,
an eye frame or a function cube). Every bored cube is listed.

Usage: python3 hardware/touch_plan.py <base> <variants_dir> [points]
       points e.g. 1,2,3,4,5,6,8,9,10,11 (default)
Writes <variants_dir>/touch_plan.json + touch_plan.png
"""
import heapq
import json
import os
import sys
from collections import deque

DIRS = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
NAMES = {1: '头顶', 2: '伞盖左缘', 3: '伞盖右缘', 4: '左脸颊', 5: '右脸颊', 6: '额头',
         8: '左侧身', 9: '右侧身', 10: '背后', 11: '底座边缘'}
FACE = {'up': (0, 1, 0), 'down': (0, -1, 0), 'left': (-1, 0, 0), 'right': (1, 0, 0),
        'front': (0, 0, 1)}


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def plan(meta, man, points):
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    tx, ty = meta['zone']['tx'], meta['zone']['ty']
    a = meta['anchor']
    Z = meta['dims'][2]
    SKIN = Z - 1 - 4
    rows = a['rows']
    ye = rows - 1 - a['eyeRow']
    cav = {(x, y, z) for x in range(tx + 1, tx + 6) for y in range(ty + 1, ty + 7)
           for z in range(0, SKIN) if (x, y, z) not in K}
    xs = [k[0] for k in K]; ys = [k[1] for k in K]; zs = [k[2] for k in K]
    lo = (min(xs) - 1, min(ys) - 1, min(zs) - 1); hi = (max(xs) + 1, max(ys) + 1, max(zs) + 1)
    # exterior = flood from outside, treating the open back of the cavity as
    # closed (the backplane caps it)
    ext, q = set(), deque([lo])
    while q:
        p = q.popleft()
        if p in ext or p in K or p in cav or any(p[i] < lo[i] or p[i] > hi[i] for i in range(3)):
            continue
        ext.add(p)
        q.extend(add(p, d) for d in DIRS)
    inside = lambda p: p not in K and p not in ext and all(lo[i] <= p[i] <= hi[i] for i in range(3))
    exposed = lambda k, d: add(k, d) in ext
    special = {k for k, c in K.items() if c.get('eye') or c['code'][0] in 'WMUG'}

    def front_cell(x, y):
        col = [k for k in K if k[0] == x and k[1] == y]
        return max(col, key=lambda k: k[2]) if col else None

    cap_rows = [y for y in set(ys) if y >= ty + 7]
    pick = {}
    if cap_rows:
        cap = [k for k in K if k[1] >= ty + 7]
        top = max(k[1] for k in cap)
        pick[1] = (min((k for k in cap if k[1] == top and exposed(k, FACE['up'])),
                       key=lambda k: (abs(k[0] - (tx + 3)), -k[2]), default=None), 'up')
        pick[2] = (min((k for k in cap if exposed(k, FACE['left'])),
                       key=lambda k: (k[0], -k[2], abs(k[1] - (ty + 9)))), 'left')
        pick[3] = (min((k for k in cap if exposed(k, FACE['right'])),
                       key=lambda k: (-k[0], -k[2], abs(k[1] - (ty + 9)))), 'right')
    for n, rx in ((4, 1), (5, 5)):
        k = (tx + rx, ty + 3, SKIN)
        pick[n] = (k if k in K and exposed(k, FACE['front']) and k not in special else None, 'front')
    ecx = round((a['L0'] + 1 + a['R0']) / 2)
    pick[6] = (front_cell(ecx, ye + 2), 'front')
    row3 = [k for k in K if k[1] == ty + 3]
    pick[8] = (min((k for k in row3 if exposed(k, FACE['left'])), key=lambda k: (k[0], -k[2]), default=None), 'left')
    pick[9] = (min((k for k in row3 if exposed(k, FACE['right'])), key=lambda k: (-k[0], -k[2]), default=None), 'right')
    bot = [k for k in K if k[1] == min(ys) and exposed(k, FACE['down']) and k not in special]
    pick[11] = (min(bot, key=lambda k: (abs(k[0] - (tx + 3)), -k[2]), default=None), 'down')

    # wire route: Dijkstra from the electrode cube to any cavity cell.
    # Step costs: empty interior 1, boring through a hidden cube 20; never
    # through exterior, eye frames, function cubes or other electrodes.
    elec = {v[0] for v in pick.values() if v[0]}
    trunk = set()          # cubes already bored by an earlier route: reuse them

    def route(src):
        best, pq = {src: 0}, [(0, src, None)]
        prev = {}
        while pq:
            d, p, _ = heapq.heappop(pq)
            if d > best.get(p, 1e18):
                continue
            if p in cav:
                path = [p]
                while path[-1] in prev:
                    path.append(prev[path[-1]])
                return path[::-1]
            for dd in DIRS:
                n = add(p, dd)
                if n in cav or inside(n):
                    c = d + 1
                elif n in trunk:
                    c = d + 2
                elif n in K and n not in special and n not in elec:
                    c = d + 20
                else:
                    continue
                if c < best.get(n, 1e18):
                    best[n] = c; prev[n] = p
                    heapq.heappush(pq, (c, n, p))
        return None

    out = []
    for n in points:
        if n == 10:
            out.append({'n': 10, 'name': NAMES[10], 'cell': None, 'face': 'back',
                        'note': '铜箔贴在背板内侧上半部(避开电池凹槽),隔 3mm 背板感应', 'bores': [], 'route': []})
            continue
        k, face = pick.get(n, (None, None))
        if k is None:
            out.append({'n': n, 'name': NAMES[n], 'cell': None, 'face': face,
                        'note': '这个形状上找不到合适的格子', 'bores': [], 'route': []})
            continue
        path = route(k)
        bores = [p for p in (path or [])[1:] if p in K]
        new = [p for p in bores if p not in trunk]
        trunk.update(bores)
        out.append({'n': n, 'name': NAMES[n], 'cell': list(k), 'face': face,
                    'code': K[k]['code'], 'route': [list(p) for p in (path or [])],
                    'bores': [list(p) for p in bores], 'new_bores': len(new),
                    'note': '' if path else '没有隐藏的走线路径(头部背面是开口的,线会露出来)'})
    return out, (tx, ty, SKIN, ext)


def render(meta, man, res, ctx, out_png):
    import matplotlib
    matplotlib.use('Agg')
    matplotlib.rcParams['font.family'] = 'monospace'
    matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle, Circle
    tx, ty, SKIN, _ = ctx
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    fig, axs = plt.subplots(1, 2, figsize=(15, 9), facecolor='#f6f5f0')
    views = (('正面(从前看)', 0, 1, 2, 1), ('侧面(从右看,左=后 右=前)', 2, 1, 0, 1))
    for ax, (title, ia, ib, idepth, _) in zip(axs, views):
        ax.set_facecolor('#f6f5f0')
        top = {}
        for k, c in K.items():
            key = (k[ia], k[ib])
            if key not in top or k[idepth] > top[key][0]:
                top[key] = (k[idepth], c)
        for (u, v), (_, c) in top.items():
            ax.add_patch(Rectangle((u, v), 1, 1, fc=man['colors'][c['ci']], ec='#ffffff', lw=0.5, alpha=0.35))
        if ia == 0:
            ax.add_patch(Rectangle((tx + 1, ty + 1), 5, 6, fill=False, ec='#1c1c1a', lw=1.6, ls='--'))
        else:
            ax.add_patch(Rectangle((0, ty + 1), SKIN, 6, fill=False, ec='#1c1c1a', lw=1.6, ls='--'))
        for r in res:
            if r['route']:
                pu = [p[ia] + 0.5 for p in r['route']]; pv = [p[ib] + 0.5 for p in r['route']]
                ax.plot(pu, pv, color='#c9a35a', lw=1.6, alpha=0.9)
                for b in r['bores']:
                    ax.add_patch(Rectangle((b[ia] + 0.25, b[ib] + 0.25), 0.5, 0.5, fc='#c9a35a', ec='#1c1c1a', lw=0.4))
            if r['cell']:
                c = r['cell']
                ax.add_patch(Circle((c[ia] + 0.5, c[ib] + 0.5), 0.42, fc='#c14953', ec='#1c1c1a', lw=0.8))
                ax.text(c[ia] + 0.5, c[ib] + 0.5, str(r['n']), color='w', ha='center', va='center',
                        fontsize=9, fontweight='bold')
        ax.set_aspect('equal'); ax.autoscale_view(); ax.axis('off'); ax.set_title(title, fontsize=11)
        ax.set_xlim(ax.get_xlim()[0] - 1, ax.get_xlim()[1] + 1)
    lines = []
    for r in res:
        if r['cell']:
            lines.append(f"{r['n']:>2} {r['name']}  格{tuple(r['cell'])}  触摸面:{r['face']}  "
                         f"走线穿 {len(r['bores'])} 颗(新钻 {r.get('new_bores', 0)})" + (f"  ⚠{r['note']}" if r['note'] else ''))
        else:
            lines.append(f"{r['n']:>2} {r['name']}  {r['note']}")
    fig.text(0.02, 0.01, '\n'.join(lines), fontsize=9, va='bottom', linespacing=1.5)
    fig.suptitle(f"{os.path.basename(out_png).split('.')[0]} · 触摸点 + 隐藏走线 · 红圈=触摸方块 "
                 '金线=走线 金方块=要钻线孔的方块 · 虚线=机身空腔(主板)', fontsize=12)
    fig.subplots_adjust(bottom=0.08 + 0.022 * len(lines))
    fig.savefig(out_png, dpi=120, facecolor='#f6f5f0')
    plt.close(fig)


def main(base, vdir, points=(1, 2, 3, 4, 5, 6, 8, 9, 10, 11)):
    meta = json.load(open(base + '.json'))
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    res, ctx = plan(meta, man, points)
    json.dump(res, open(f'{vdir}/touch_plan.json', 'w'), ensure_ascii=False, indent=1)
    render(meta, man, res, ctx, f'{vdir}/touch_plan.png')
    for r in res:
        print(r['n'], r['name'], r['cell'], r['face'], 'bores', len(r['bores']), 'new', r.get('new_bores'), r['note'])
    print('total bored cubes', len({tuple(b) for r in res for b in r['bores']}))


if __name__ == '__main__':
    pts = tuple(int(v) for v in sys.argv[3].split(',')) if len(sys.argv) > 3 else (1, 2, 3, 4, 5, 6, 8, 9, 10, 11)
    main(sys.argv[1], sys.argv[2], pts)
