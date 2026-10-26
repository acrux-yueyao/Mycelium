#!/usr/bin/env python3
"""Exploded three views (+3D) of one wire cube and the touch cube it feeds, from the real
generated meshes, placed as they sit on the body and seen standing behind Moony
(x → your right, y → away from you = 前, z → up), with the wire drawn through both.
Usage: python3 hardware/guide/pair_view.py <kit_manifest.json> <touch_plan.json> <wire_seq> <touch_seq> <out.png>"""
import json
import os
import sys

import numpy as np
import trimesh
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['font.family'] = 'sans-serif'
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'DejaVu Sans']
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from touch_cubes import (touch_pieces, wire_pieces, touch_opening, dir_key, FACE_OF, P, RING, CH_D, LID,
                         frame_to, to_canonical)
from seq_plates import seq_slots

FILL = {'LA': '#7a4fb0', 'LB': '#a98bd6', 'Tbody': '#7a4fb0', 'Tlid': '#c9b8ea'}


def build(man, plan, wseq, tseq):
    seq_slots(man)
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    by = {str(c['seq']): k for k, c in K.items()}
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
    w, t = by[wseq], by[tseq]
    kw = dir_key((t[0] - w[0], t[1] - w[1], t[2] - w[2]))
    cw, ct = K[w], K[t]
    (pa, pb), k = wire_pieces(cw['code'], [tuple(m) for m in cw['mask']], sorted(ports[w]),
                              {kw: touch_opening(touch[t], (kw[0], not kw[1]))})
    face = touch[t]
    tl = dict(touch_pieces(ct['code'], [tuple(m) for m in ct['mask']], face, sorted(ports[t] - {face})))
    off = lambda cell: np.array([cell[0], cell[2], cell[1]], float) * P      # creature → mesh (x, 前, 上)
    o = off(w)
    parts = []
    for name, m, cell in (('LA', pa[1], w), ('LB', pb[1], w), ('Tbody', tl['body'], t), ('Tlid', tl['lid'], t)):
        m = m.copy(); m.apply_translation(off(cell) - o); parts.append((f'{K[cell]["seq"]}{name}', name, m))
    return parts, k, face, kw, sorted(ports[w]), K, w, t


def explode(parts, k, face, lb=None):
    """LB lifts off LA along the split normal (or moves by lb), the lid comes off its touch face."""
    out = []
    for lab, kind, m in parts:
        m = m.copy(); d = np.zeros(3)
        if kind == 'LB':
            if lb is not None:
                d = np.array(lb, float)
            else:
                d[k] = 9
        if kind == 'Tlid':
            d[face[0]] = 7 if face[1] else -7
        m.apply_translation(d); out.append((lab, kind, m, d))
    return out


def draw2d(ax, items, a, b, depth, sgn, title, hl, vl, wire):
    polys, cols, keys = [], [], []
    light = np.array([0.3, -0.6, 0.75]); light /= np.linalg.norm(light)
    for lab, kind, m, d in items:
        base = np.array(matplotlib.colors.to_rgb(FILL[kind]))
        tri = m.vertices[m.faces]; nrm = m.face_normals
        for f, n in zip(tri, nrm):
            if sgn * n[depth] <= 1e-6:
                continue
            shade = 0.55 + 0.45 * abs(n @ light)
            polys.append(f[:, [a, b]]); cols.append(np.clip(base * shade, 0, 1)); keys.append(sgn * f[:, depth].max())
    order = np.argsort(keys)
    ax.add_collection(PolyCollection([polys[i] for i in order], facecolors=[cols[i] for i in order],
                                     edgecolors='none'))
    ax.plot(wire[:, a], wire[:, b], color='#1c1c1a', lw=3.2, zorder=10)
    ax.plot(wire[:, a], wire[:, b], color='#e0b21b', lw=2, zorder=11)
    for lab, kind, m, d in items:
        c = m.bounds.mean(0)
        ax.text(c[a], c[b], lab, ha='center', va='center', fontsize=9, weight='bold', zorder=12,
                bbox=dict(boxstyle='round,pad=0.2', fc='#ffffffd8', ec='none'))
    ax.autoscale(); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title, fontsize=12)
    ax.text(0.5, -0.03, hl, transform=ax.transAxes, ha='center', va='top', fontsize=10, color='#55524a')
    ax.text(-0.03, 0.5, vl, transform=ax.transAxes, ha='right', va='center', fontsize=10, color='#55524a', rotation=90)


def main(kit, plan_p, wseq, tseq, out):
    man = json.load(open(kit)); plan = json.load(open(plan_p))
    parts, k, face, kw, wports, K, w, t = build(man, plan, wseq, tseq)
    items = explode(parts, k, face)
    # the wire, from where it enters the wire cube to the foil (in the assembled pose, then
    # each point follows the piece it lies in for the exploded view: LA/body stay put)
    T = frame_to((k, True)); h = P / 2 - CH_D / 2
    other = [p for p in wports if p != kw][0]
    def canon(pt):
        return (T @ np.r_[pt, 1])[:3]
    def side(p):                          # canonical point on the ring side facing port p, and beyond
        ax, pos = to_canonical(p, T); s = P - RING if pos else RING
        return ax, pos, s
    tw = touch_opening(face, (kw[0], not kw[1]))
    tc_ = {i: sum(v) / 2 for i, v in tw.items()}
    ax_in, pos_in, s_in = side(other); ax_out, pos_out, s_out = side(kw)
    def cp(ax_, val, u_ax, uval):
        p = np.zeros(3); p[ax_] = val; p[u_ax] = uval; p[2] = h; return p
    Ti = np.linalg.inv(T)
    tgt = (Ti @ np.r_[[tc_.get(0, 6), tc_.get(1, 6), tc_.get(2, 6)], 1])[:3]
    u_out = 1 - ax_out
    pts_c = [cp(ax_in, -2 if not pos_in else P + 2, 1 - ax_in, RING),     # outside, coming in
             cp(ax_in, s_in, 1 - ax_in, RING)]
    corner = np.zeros(3); corner[ax_in] = s_in; corner[ax_out] = s_out; corner[2] = h
    pts_c += [corner]
    q = corner.copy(); q[u_out] = tgt[u_out]; pts_c.append(q)
    q2 = q.copy(); q2[ax_out] = P if pos_out else 0; q2[2] = tgt[2]; pts_c.append(q2)
    wire = [(T @ np.r_[p, 1])[:3] for p in pts_c]
    d = np.zeros(3); d[kw[0]] = P if kw[1] else -P               # into the touch cube, to the cavity centre
    cav = np.array([6.0, 6.0, 6.0]) + d
    last = wire[-1].copy(); last[kw[0]] += (3 if kw[1] else -3); wire += [last, cav]
    lid = cav.copy(); lid[face[0]] += (4.3 if face[1] else -4.3); wire.append(lid)
    wire = np.array(wire)
    fig = plt.figure(figsize=(17, 7.5), facecolor='#f6f5f0')
    fig.text(0.02, 0.93, f'{wseq}(线槽块)+ {tseq}(触摸块)· 拆开的样子 + 走线', fontsize=19, weight='bold')
    fig.text(0.02, 0.88, f'实际打印模型画的。{wseq}LB 往上抬开、{tseq}Tlid 从触摸面拿开,方便看里面;'
             '黄线 = 走线。站在机器人背后看:右 = 你的右手,前 = 远离你,上 = 上。', fontsize=11, color='#55524a')
    views = [('后视图(站在背后往前看)', 0, 2, 1, -1, '← 左    右 →', '上 ↑'),
             ('俯视图(从上往下看)', 0, 1, 2, 1, '← 左    右 →', '前(远离你)↑'),
             ('侧视图(从右边看)', 1, 2, 0, 1, '← 后    前 →', '上 ↑')]
    for i, (title, a, b, dp, sg, hl, vl) in enumerate(views):
        ax = fig.add_axes([0.03 + i * 0.245, 0.05, 0.22, 0.72])
        its = items
        if dp == k:                          # looking down the split normal: put LB beside LA so the groove shows
            lb = np.zeros(3); lb[a] = -(P + 4)
            its = explode(parts, k, face, lb)
            title += f'\n{wseq}LB 挪到旁边,露出 {wseq}LA 的槽'
        draw2d(ax, its, a, b, dp, sg, title, hl, vl, wire)
    ax3 = fig.add_axes([0.75, 0.03, 0.24, 0.78], projection='3d')
    for lab, kind, m, d in items:
        pc = Poly3DCollection(m.vertices[m.faces], facecolor=FILL[kind], edgecolor='none', alpha=0.85)
        pc.set_facecolor([np.clip(np.array(matplotlib.colors.to_rgb(FILL[kind])) * (0.6 + 0.4 * abs(n[2])), 0, 1)
                          for n in m.face_normals])
        ax3.add_collection3d(pc)
        c = m.bounds.mean(0); ax3.text(c[0], c[1], m.bounds[1][2] + 1.5, lab, fontsize=9, weight='bold', ha='center')
    ax3.plot(wire[:, 0], wire[:, 1], wire[:, 2], color='#e0b21b', lw=3)
    allv = np.vstack([m.vertices for _, _, m, _ in items]); lo, hi = allv.min(0), allv.max(0)
    ax3.set_xlim(lo[0], hi[0]); ax3.set_ylim(lo[1], hi[1]); ax3.set_zlim(lo[2], hi[2])
    ax3.set_box_aspect(hi - lo); ax3.view_init(28, -125)
    ax3.set_xlabel('右 →'); ax3.set_ylabel('前 →'); ax3.set_zlabel('上')
    ax3.set_xticks([]); ax3.set_yticks([]); ax3.set_zticks([])
    ax3.set_title('立体图(从左后上方看)', fontsize=12)
    fig.savefig(out, dpi=110, facecolor='#f6f5f0')
    print(out)


if __name__ == '__main__':
    main(*sys.argv[1:6])
