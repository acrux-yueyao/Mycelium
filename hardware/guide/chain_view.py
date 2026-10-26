#!/usr/bin/env python3
"""Exploded three views (+3D) of a whole touch wire: every printed piece it passes through, from
the real generated meshes, as they sit on the body seen standing behind Moony (x → your right,
y → away from you = 前, z → up), with the wire threaded through the grooves, holes and slots.
LB halves lift off their LA along the split; lids come off the touch face. In a view that looks
straight down a split, that LB is left out so the groove in its LA shows.
Usage: python3 hardware/guide/chain_view.py <kit_manifest.json> <set_dir> <out_dir>"""
import json
import os
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.collections import PolyCollection
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from touch_cubes import (touch_pieces, wire_pieces, touch_opening, dir_key, FACE_OF, P, RING, CH_D, LID,
                         HOLE_AT, frame_to, to_canonical)
from seq_plates import seq_slots
from touch_wiring import WIRES, HEX
from wire_cards import FIL, ORDER, load_pieces

H = P / 2 - CH_D / 2                 # groove centre height in a wire cube's canonical frame


def mesh_off(cell):
    return np.array([cell[0], cell[2], cell[1]], float) * P     # creature (x, up, front) → mesh (x, 前, 上)


def setup(kit, plan):
    man = json.load(open(kit)); seq_slots(man)
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    touch, ports = {}, {}
    for r in plan:
        if not r['cell'] or not r['route']:
            continue
        R = [tuple(p) for p in r['route']]
        touch[R[0]] = FACE_OF[r['face']]
        for i, cell in enumerate(R):
            if cell in K:
                for n in ([R[i - 1]] if i else []) + ([R[i + 1]] if i + 1 < len(R) else []):
                    ports.setdefault(cell, set()).add(dir_key((n[0] - cell[0], n[1] - cell[1], n[2] - cell[2])))
    return K, touch, ports


def nb_of(cell, p):
    d = [0, 0, 0]; d[{0: 0, 1: 2, 2: 1}[p[0]]] = 1 if p[1] else -1
    return (cell[0] + d[0], cell[1] + d[1], cell[2] + d[2])


def wire_cube(cell, K, touch, ports):
    c = K[cell]; mask = [tuple(m) for m in c['mask']]; pts = sorted(ports[cell])
    targets = {p: touch_opening(touch[nb_of(cell, p)], (p[0], not p[1])) for p in pts if nb_of(cell, p) in touch}
    (pa, pb), k = wire_pieces(c['code'], mask, pts, targets)
    T = frame_to((k, True)); Ti = np.linalg.inv(T)
    def port_path(p):
        """canonical points: face opening → onto the ring (for this port)."""
        ax, pos = to_canonical(p, T)
        if ax == 2:                                   # hole along the split normal at the free corner
            z = P if pos else 0
            return [np.array([HOLE_AT, P - HOLE_AT, z]), np.array([HOLE_AT, P - HOLE_AT, H]),
                    np.array([RING, P - RING, H])]
        u = 1 - ax
        if p in targets:
            cc = (Ti @ np.r_[[sum(targets[p].get(i, (6, 6))) / 2 for i in range(3)], 1])[:3]
            uc, nz = cc[u], cc[2]
        else:
            uc, nz = RING, H
        s = P - RING if pos else RING
        face = np.zeros(3); face[ax] = P if pos else 0; face[u] = uc; face[2] = nz
        mid = face.copy(); mid[ax] = s; mid[2] = H
        ring = mid.copy(); ring[u] = min(max(uc, RING), P - RING)
        return [face, mid, ring]
    def ring_walk(a, b):
        """shortest way round the square ring from a to b (both on it)."""
        lo, hi = RING, P - RING
        def t(p):                                     # perimeter parameter
            x, y = p[0], p[1]
            if abs(y - lo) < 1e-6: return x - lo
            if abs(x - hi) < 1e-6: return (hi - lo) + (y - lo)
            if abs(y - hi) < 1e-6: return 2 * (hi - lo) + (hi - x)
            return 3 * (hi - lo) + (hi - y)
        L = 4 * (hi - lo); corners = [(lo, lo), (hi, lo), (hi, hi), (lo, hi)]
        ta, tb = t(a), t(b); fwd = (tb - ta) % L
        step = 1 if fwd <= L / 2 else -1
        out = [a]; cur = ta
        cs = sorted(((i * (hi - lo)) for i in range(4)))
        span = fwd if step == 1 else L - fwd
        for i in range(1, 5):
            for ci, ctp in enumerate(cs):
                d = (ctp - ta) % L if step == 1 else (ta - ctp) % L
                if 0 < d < span and abs(d - i * 0) >= 0:
                    pass
        cand = [((ctp - ta) % L if step == 1 else (ta - ctp) % L, ci) for ci, ctp in enumerate(cs)]
        for d, ci in sorted(cand):
            if 0 < d < span:
                out.append(np.array([corners[ci][0], corners[ci][1], H]))
        out.append(b)
        return out
    def through(p_in, p_out):
        a = port_path(p_in); b = port_path(p_out)
        pts = a + ring_walk(a[-1], b[-1]) + b[::-1]
        return [(T @ np.r_[q, 1])[:3] + mesh_off(cell) for q in pts]
    return pa[1], pb[1], k, through


def touch_cube(cell, K, touch, ports):
    c = K[cell]; face = touch[cell]; pts = sorted(ports[cell] - {face})
    pcs = dict(touch_pieces(c['code'], [tuple(m) for m in c['mask']], face, pts))
    p = pts[0]
    op = touch_opening(face, p)
    entry = np.array([sum(op.get(i, (0, 0))) / 2 if i in op else (P if p[1] else 0) for i in range(3)])
    cav = np.array([6.0, 6.0, 6.0])
    inner = entry.copy(); inner[p[0]] = 6.0                          # slot runs straight in to the cavity
    foil = cav.copy(); foil[face[0]] = (P - LID) if face[1] else LID
    path = [entry, inner, cav, foil]
    return pcs['body'], pcs['lid'], face, [q + mesh_off(cell) for q in path]


def chain(pad, K, touch, ports, plan, colour):
    r = plan[pad]; R = [tuple(p) for p in r['route']]
    items, wire = [], [mesh_off(R[-1]) + 6]
    o = mesh_off(R[0])
    for i in range(len(R) - 1, -1, -1):              # from the board side outwards
        cell = R[i]
        if cell not in K:
            if i != len(R) - 1:
                wire.append(mesh_off(cell) + 6)
            continue
        seq = str(K[cell]['seq']); slug = colour[seq]; base = FIL[slug][1]
        if cell in touch:
            body, lid, face, path = touch_cube(cell, K, touch, ports)
            wire += path
            for nm, m, d in ((f'{seq}Tbody', body, 0), (f'{seq}Tlid', lid, 7)):
                m = m.copy(); m.apply_translation(mesh_off(cell)); dv = np.zeros(3)
                if d: dv[face[0]] = d if face[1] else -d
                m.apply_translation(dv); items.append((nm, m, base, 0.55 if 'lid' in nm else 1.0, None))
        else:
            A, Bm, k, through = wire_cube(cell, K, touch, ports)
            nxt, prv = R[i - 1], R[i + 1]
            kin = dir_key((prv[0] - cell[0], prv[1] - cell[1], prv[2] - cell[2]))
            kout = dir_key((nxt[0] - cell[0], nxt[1] - cell[1], nxt[2] - cell[2]))
            wire += through(kin, kout)
            for nm, m, lift in ((f'{seq}LA', A, 0), (f'{seq}LB', Bm, 8)):
                m = m.copy(); m.apply_translation(mesh_off(cell)); dv = np.zeros(3); dv[k] = lift
                m.apply_translation(dv); items.append((nm, m, base, 0.7 if lift else 1.0, k if lift else None))
    return items, np.array(wire)


def draw2d(ax, items, a, b, depth, sgn, title, hl, vl, wire, wcol):
    polys, cols, keys, hidden = [], [], [], []
    light = np.array([0.3, -0.6, 0.75]); light /= np.linalg.norm(light)
    for nm, m, base, lt, splitk in items:
        if splitk is not None and splitk == depth:
            hidden.append(nm); continue
        rgb = np.array(matplotlib.colors.to_rgb(base)); rgb = rgb + (1 - rgb) * (1 - lt) * 0.9
        for f, n in zip(m.vertices[m.faces], m.face_normals):
            if sgn * n[depth] <= 1e-6:
                continue
            polys.append(f[:, [a, b]]); cols.append(np.clip(rgb * (0.55 + 0.45 * abs(n @ light)), 0, 1))
            keys.append(sgn * f[:, depth].max())
    order = np.argsort(keys)
    ax.add_collection(PolyCollection([polys[i] for i in order], facecolors=[cols[i] for i in order], edgecolors='none'))
    ax.plot(wire[:, a], wire[:, b], color='#1c1c1a', lw=3.4, zorder=10, solid_joinstyle='round')
    ax.plot(wire[:, a], wire[:, b], color=wcol, lw=2.1, zorder=11, solid_joinstyle='round')
    ax.plot(wire[0, a], wire[0, b], 'o', color='#2e7d5b', ms=8, zorder=12)
    ax.text(wire[0, a], wire[0, b], ' 主板', color='#2e7d5b', fontsize=9, zorder=12, va='center')
    placed = []
    for nm, m, base, lt, splitk in sorted(items, key=lambda it: -sgn * it[1].bounds.mean(0)[depth]):
        if nm in hidden:
            continue
        c = m.bounds.mean(0); x, y = c[a], c[b]
        while any(abs(x - px) < 6 and abs(y - py) < 2.2 for px, py in placed):
            y -= 2.4                                     # nearer piece keeps the spot, the next stacks below
        placed.append((x, y))
        ax.text(x, y, nm, ha='center', va='center', fontsize=8.5, weight='bold', zorder=13,
                bbox=dict(boxstyle='round,pad=0.15', fc='#ffffffd8', ec='none'))
    ax.autoscale(); ax.set_aspect('equal'); ax.axis('off')
    ax.set_title(title + (f'\n(这张隐藏了 {"、".join(hidden)},露出下面的槽)' if hidden else ''), fontsize=11)
    ax.text(0.5, -0.03, hl, transform=ax.transAxes, ha='center', va='top', fontsize=10, color='#55524a')
    ax.text(-0.03, 0.5, vl, transform=ax.transAxes, ha='right', va='center', fontsize=10, color='#55524a', rotation=90)


def main(kit, set_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    plan = json.load(open(f'{set_dir}/touch_plan.json'))
    K, touch, ports = setup(kit, plan)
    _, colour, _ = load_pieces(set_dir)
    views = [('后视图(站在背后往前看)', 0, 2, 1, -1, '← 左    右 →', '上 ↑'),
             ('俯视图(从上往下看)', 0, 1, 2, 1, '← 左    右 →', '前(远离你)↑'),
             ('侧视图(从右边看)', 1, 2, 0, 1, '← 后    前 →', '上 ↑')]
    with PdfPages(f'{out_dir}/走线图_全部.pdf') as pdf:
        for pad in ORDER:
            _, name, _, col, tape, cm = WIRES[pad]
            items, wire = chain(pad, K, touch, ports, plan, colour)
            wcol = HEX[col] if col != '白' else '#d9d4c4'
            fig = plt.figure(figsize=(18, 8), facecolor='#f6f5f0')
            seqs = ' → '.join(dict.fromkeys(nm[:-2] if nm.endswith(('LA', 'LB')) else nm[:-5] if nm.endswith('Tbody') else nm[:-4]
                                            for nm, *_ in items))
            fig.text(0.02, 0.93, f'E{pad} · {name} · 线 {col}{f" + {tape} 道胶带" if tape else ""}', fontsize=19, weight='bold')
            fig.text(0.02, 0.885, f'从主板往外:{seqs}。实际打印模型画的;LB 往上抬开、薄盖从触摸面拿开;粗线 = 走线(线的颜色)。'
                     '站在机器人背后看:右 = 你的右手,前 = 远离你,上 = 上。', fontsize=10.5, color='#55524a')
            for i, (title, a, b, dp, sg, hl, vl) in enumerate(views):
                ax = fig.add_axes([0.03 + i * 0.245, 0.06, 0.22, 0.72])
                draw2d(ax, items, a, b, dp, sg, title, hl, vl, wire, wcol)
            ax3 = fig.add_axes([0.75, 0.04, 0.24, 0.78], projection='3d')
            for nm, m, base, lt, splitk in items:
                rgb = np.array(matplotlib.colors.to_rgb(base)); rgb = rgb + (1 - rgb) * (1 - lt) * 0.9
                pc = Poly3DCollection(m.vertices[m.faces], edgecolor='none', alpha=0.8)
                pc.set_facecolor([np.clip(rgb * (0.6 + 0.4 * abs(n[2])), 0, 1) for n in m.face_normals])
                ax3.add_collection3d(pc)
                c = m.bounds.mean(0); ax3.text(c[0], c[1], m.bounds[1][2] + 1.5, nm, fontsize=8, weight='bold', ha='center')
            ax3.plot(wire[:, 0], wire[:, 1], wire[:, 2], color=wcol, lw=3)
            allv = np.vstack([m.vertices for _, m, *_ in items] + [wire]); lo, hi = allv.min(0), allv.max(0)
            ax3.set_xlim(lo[0], hi[0]); ax3.set_ylim(lo[1], hi[1]); ax3.set_zlim(lo[2], hi[2])
            ax3.set_box_aspect(np.maximum(hi - lo, 1)); ax3.view_init(28, -125)
            ax3.set_xlabel('右 →'); ax3.set_ylabel('前 →'); ax3.set_zlabel('上')
            ax3.set_xticks([]); ax3.set_yticks([]); ax3.set_zticks([])
            ax3.set_title('立体图(从左后上方看)', fontsize=11)
            png = f'{out_dir}/走线图_E{pad:02d}_{name}.png'
            fig.savefig(png, dpi=105, facecolor='#f6f5f0'); pdf.savefig(fig, facecolor='#f6f5f0'); plt.close(fig)
            print(png)


if __name__ == '__main__':
    main(*sys.argv[1:4])
