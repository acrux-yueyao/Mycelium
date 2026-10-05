#!/usr/bin/env python3
"""
Touch cubes + wire-channel cubes — the reprint set for a touch_plan.

A 12 mm mosaic cube has no room to thread a wire past its magnet pockets
and pins, so every cube the touch wiring passes through is printed in
TWO pieces that close over the wire:

  T  touch cube   = LID (the touch face, 1.2 mm thin, copper foil stuck
                    inside) + BODY (6.6×6.6 cavity behind the lid; a
                    1.0 mm channel from the cavity to the wire port)
  L  wire cube    = two HALVES split across the middle; the lower half
                    carries a 1.0 mm channel ring (3 mm in from the
                    edges, clear of every pocket) with spokes to each
                    port face; ports on the split axis are Ø1.2 holes at
                    the free corners (3,9)/(9,3)

Wire: 0.3 mm enamelled copper (stiff, three fit one channel). Glue the
pieces with CA after laying the wire. Pockets, pins, dimples and the
variant engraving are untouched, so the closed cube couples like the
plain one it replaces and keeps its assembly number.

Also lists cubes whose variant changed since a previous manifest
(--prev), so one set of plates covers every reprint.

Usage: python3 hardware/touch_cubes.py <base> <variants_dir> <out_dir> [--prev old_kit_manifest.json]
Reads  <variants_dir>/kit_manifest.json + touch_plan.json
Writes fix_<no>_<slug>_<n>.stl + _sheet.png, fix_manifest.txt
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.creation import box, cylinder
from trimesh.transformations import rotation_matrix as RM, translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cubes import FACE_KEYS, DIRS, variant_mesh, cell_mesh, orient_mask, orient_flat_down
from magnet_polarity import plate_faces
from plate_gen import GRID, PITCH
from seq_plates import seq_slots, _slug

P = 12.0
LID = 1.2            # touch wall (foil behind it)
CAV = 6.6            # cavity width behind the lid: leaves 2.7 walls for the side pockets
CAV_FLOOR = 2.9      # above the opposite face's pocket (2.1) + wall
CH_W, CH_D = 1.0, 1.0
RING = 3.0           # channel ring inset from the cube edges
HOLE_R = 0.6

FACE_OF = {'up': (2, True), 'down': (2, False), 'left': (0, False), 'right': (0, True),
           'front': (1, True), 'back': (1, False)}
NAME = dict(FACE_KEYS)


def dir_key(d):
    """creature step (dx,dy,dz) → mesh face key (axis, positive)."""
    dx, dy, dz = d
    if dx:
        return (0, dx > 0)
    if dz:
        return (1, dz > 0)
    return (2, dy > 0)


def frame_to(face):
    """4×4 transform taking the canonical frame (+z = `face`) onto the cube,
    rotating about the cube centre."""
    axis, pos = face
    c = TM([P / 2, P / 2, P / 2]); ci = TM([-P / 2, -P / 2, -P / 2])
    if axis == 2:
        r = np.eye(4) if pos else RM(np.pi, [1, 0, 0])
    elif axis == 0:
        r = RM(np.pi / 2, [0, 1, 0]) if pos else RM(-np.pi / 2, [0, 1, 0])
    else:
        r = RM(-np.pi / 2, [1, 0, 0]) if pos else RM(np.pi / 2, [1, 0, 0])
    return c @ r @ ci


def to_canonical(key, T):
    """face key in cube frame → key in the canonical frame of transform T."""
    n = np.zeros(4); n[key[0]] = 1 if key[1] else -1
    m = np.linalg.inv(T) @ n
    ax = int(np.argmax(np.abs(m[:3])))
    return (ax, m[ax] > 0)


def B(x0, y0, z0, x1, y1, z1):
    return box(extents=[x1 - x0, y1 - y0, z1 - z0], transform=TM([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]))


def CYL(x, y, z0, z1, r):
    c = cylinder(radius=r, height=z1 - z0, sections=24)
    c.apply_transform(TM([x, y, (z0 + z1) / 2]))
    return c


def tf(meshes, T):
    out = []
    for m in meshes:
        m = m.copy(); m.apply_transform(T); out.append(m)
    return out


def touch_pieces(code, mask, face, ports):
    """→ [('lid', mesh), ('body', mesh)]; canonical: touch face = +z."""
    cube = variant_mesh(code, mask)
    T = frame_to(face)
    cuts = [B(P / 2 - CAV / 2, P / 2 - CAV / 2, CAV_FLOOR, P / 2 + CAV / 2, P / 2 + CAV / 2, P - LID + 1)]
    for p in ports:
        ax, pos = to_canonical(p, T)
        if ax == 2:                        # opposite face: hole at a free corner
            cuts.append(CYL(RING, P - RING, -1, CAV_FLOOR + 1, HOLE_R))
        elif ax == 0:                      # side port: channel on the split plane, face centre line
            x0, x1 = (P / 2, P + 1) if pos else (-1, P / 2)
            cuts.append(B(x0, P / 2 - CH_W / 2, P - LID - CH_D, x1, P / 2 + CH_W / 2, P - LID + 1))
        else:
            y0, y1 = (P / 2, P + 1) if pos else (-1, P / 2)
            cuts.append(B(P / 2 - CH_W / 2, y0, P - LID - CH_D, P / 2 + CH_W / 2, y1, P - LID + 1))
    lid_box = B(-1, -1, P - LID, P + 1, P + 1, P + 1)
    body_box = B(-1, -1, -1, P + 1, P + 1, P - LID)
    lid_box, body_box = tf([lid_box, body_box], T)
    cuts = tf(cuts, T)
    lid = trimesh.boolean.intersection([cube, lid_box])
    body = trimesh.boolean.difference([trimesh.boolean.intersection([cube, body_box])] + cuts)
    return [('lid', lid), ('body', body)]


def wire_pieces(code, mask, ports):
    """→ [('A', lower half), ('B', upper half)] split across an axis that
    carries no port where possible."""
    axes = [p[0] for p in ports]
    k = min(range(3), key=lambda a: (axes.count(a), a))
    T = frame_to((k, True))                 # canonical +z = (k, True)
    cube = variant_mesh(code, mask)
    h = P / 2
    cuts = [B(RING - CH_W / 2, RING - CH_W / 2, h - CH_D, P - RING + CH_W / 2, RING + CH_W / 2, h + 0.01),
            B(RING - CH_W / 2, P - RING - CH_W / 2, h - CH_D, P - RING + CH_W / 2, P - RING + CH_W / 2, h + 0.01),
            B(RING - CH_W / 2, RING - CH_W / 2, h - CH_D, RING + CH_W / 2, P - RING + CH_W / 2, h + 0.01),
            B(P - RING - CH_W / 2, RING - CH_W / 2, h - CH_D, P - RING + CH_W / 2, P - RING + CH_W / 2, h + 0.01)]
    holes = []
    for p in ports:
        ax, pos = to_canonical(p, T)
        if ax == 0:
            x0, x1 = (P - RING, P + 1) if pos else (-1, RING)
            cuts.append(B(x0, RING - CH_W / 2, h - CH_D, x1, RING + CH_W / 2, h + 0.01))
        elif ax == 1:
            y0, y1 = (P - RING, P + 1) if pos else (-1, RING)
            cuts.append(B(RING - CH_W / 2, y0, h - CH_D, RING + CH_W / 2, y1, h + 0.01))
        else:
            z0, z1 = (h - 0.5, P + 1) if pos else (-1, h + 0.5)
            holes.append(CYL(RING, P - RING, z0, z1, HOLE_R))
    lo = B(-1, -1, -1, P + 1, P + 1, h); hi = B(-1, -1, h, P + 1, P + 1, P + 1)
    lo, hi = tf([lo, hi], T); cuts = tf(cuts, T); holes = tf(holes, T)
    A = trimesh.boolean.difference([trimesh.boolean.intersection([cube, lo])] + cuts + holes)
    Bm = trimesh.boolean.difference([trimesh.boolean.intersection([cube, hi])] + holes) if holes else \
        trimesh.boolean.intersection([cube, hi])
    return [('A', A), ('B', Bm)], k


def main(base, vdir, out, prev=None):
    os.makedirs(out, exist_ok=True)
    man = json.load(open(f'{vdir}/kit_manifest.json'))
    plan = json.load(open(f'{vdir}/touch_plan.json'))
    K = {(c['x'], c['y'], c['z']): c for c in man['cells']}
    for pg in seq_slots(man):                        # gives every cell its seq number
        pass
    names = man.get('color_names') or [None] * len(man['colors'])
    nos = man.get('color_nos') or [''] * len(names)

    # ports per cube from the routes
    touch, ports = {}, {}
    for r in plan:
        if not r['cell'] or not r['route']:
            continue
        R = [tuple(p) for p in r['route']]
        touch[R[0]] = (r['n'], FACE_OF[r['face']])
        for i, cell in enumerate(R):
            if cell not in K:
                continue
            nb = []
            if i > 0:
                nb.append(R[i - 1])
            if i + 1 < len(R):
                nb.append(R[i + 1])
            for n in nb:
                d = (n[0] - cell[0], n[1] - cell[1], n[2] - cell[2])
                ports.setdefault(cell, set()).add(dir_key(d))

    pieces = []       # (cell, kind, label, mesh, bed_key, faces_shown, note)
    notes = []
    for cell, (n, face) in sorted(touch.items(), key=lambda kv: kv[1][0]):
        c = K[cell]; mask = [tuple(m) for m in c['mask']]
        assert face not in mask, (cell, 'touch face must be exposed')
        pts = sorted(ports.get(cell, set()) - {face})
        for kind, m in touch_pieces(c['code'], mask, face, pts):
            shown = set(mask) if kind == 'body' else set()
            pieces.append((cell, f'T{kind}', f"{c['seq']}", m, face, shown,
                           f"触摸面 {NAME[face]} · 出线 {'/'.join(NAME[p] for p in pts)}"))
        notes.append(f"序号{c['seq']:>3} 触摸点{n:>2} ({cell[0]},{cell[1]},{cell[2]}) {c['code']}  盖=触摸面{NAME[face]}  "
                     f"出线{'/'.join(NAME[p] for p in pts)}")
    for cell in sorted(ports):
        if cell in touch:
            continue
        c = K[cell]; mask = [tuple(m) for m in c['mask']]
        pts = sorted(ports[cell])
        (pa, pb), k = wire_pieces(c['code'], mask, pts)
        for kind, m in (pa, pb):
            bed = (k, kind == 'A')                    # split face down: A shows +k up... bed = split normal
            shown = {f for f in mask if f != (k, kind == 'A')}
            pieces.append((cell, f'L{kind}', f"{c['seq']}", m, bed, shown,
                           f"线槽 {'/'.join(NAME[p] for p in pts)} · 剖面⊥{'xzy'[k]}"))
        notes.append(f"序号{c['seq']:>3} 线槽块 ({cell[0]},{cell[1]},{cell[2]}) {c['code']}  "
                     f"线进出{'/'.join(NAME[p] for p in pts)}  剖面垂直于{NAME[(k, True)][-1]}轴")
    if prev:
        old = {(c['x'], c['y'], c['z']): c for c in json.load(open(prev))['cells']}
        for cell, c in K.items():
            if cell in old and old[cell]['code'] != c['code'] and cell not in ports:
                mask = [tuple(m) for m in c['mask']]
                m, _ = orient_flat_down(cell_mesh(c['code'], mask, c.get('eye')), orient_mask(mask, c.get('eye')),
                                        c['code'], c.get('bed'))
                pieces.append((cell, c['code'], f"{c['seq']}", m, tuple(c['bed']), set(mask),
                               f"变体改动 {old[cell]['code']}→{c['code']}"))
                notes.append(f"序号{c['seq']:>3} 改型 ({cell[0]},{cell[1]},{cell[2]}) {old[cell]['code']} → {c['code']}")

    # ---- plates per colour, assembly order inside ----
    import matplotlib
    matplotlib.use('Agg')
    matplotlib.rcParams['font.family'] = 'monospace'
    matplotlib.rcParams['font.monospace'] = ['Noto Sans Mono CJK SC', 'DejaVu Sans Mono']
    import matplotlib.pyplot as plt
    from matplotlib.patches import Circle, Rectangle
    NC, SC, FC = '#c14953', '#3e6fb8', '#c9c5ba'
    EDGE = {(-1, 0, 0): (1.7, 6), (1, 0, 0): (10.3, 6), (0, 1, 0): (6, 10.3), (0, -1, 0): (6, 1.7)}
    COL = {None: FC, 'N': NC, 'S': SC}
    lines = [f'reprint set · {len(pieces)} pieces · 两件式触摸/线槽块 + 改型块', '']
    by_ci = {}
    for pc in pieces:
        by_ci.setdefault(K[pc[0]]['ci'], []).append(pc)
    for ci, pcs in sorted(by_ci.items()):
        pcs.sort(key=lambda pc: (K[pc[0]]['seq'], pc[1]))
        stem = f"fix_{nos[ci] + '_' if nos[ci] else ''}{_slug(names[ci], ci)}_1"
        parts = []
        for k, (cell, kind, lab, m, bed, shown, note) in enumerate(pcs):
            # lay flat: touch lid/body and halves are built in cube frame; put the
            # piece's flat split/touch face on the bed via the same rotation table
            from kit_cubes import FLAT_ROT
            r = FLAT_ROT[bed]
            p = m.copy()
            if r is not None:
                p.apply_transform(r)
            lo = p.bounds[0]
            p.apply_transform(TM([(k % GRID) * PITCH - lo[0], (k // GRID) * PITCH - lo[1], -lo[2]]))
            parts.append(p)
        trimesh.util.concatenate(parts).export(f'{out}/{stem}.stl')
        nrows = (len(pcs) - 1) // GRID + 1
        fig, ax = plt.subplots(figsize=(11.5, nrows * 0.83 + 2.6), facecolor='#f6f5f0')
        ax.axis('off'); ax.set_facecolor('#f6f5f0')
        for k, (cell, kind, lab, m, bed, shown, note) in enumerate(pcs):
            gx, gy = k % GRID, k // GRID
            x0, y0 = gx * PITCH, gy * PITCH
            ax.add_patch(Rectangle((x0, y0), 12, 12, fc=man['colors'][ci], ec='#1c1c1a', lw=0.5, alpha=0.3))
            mask = {tuple(mm) for mm in K[cell]['mask']}
            poles = {w: pole for w, pole in plate_faces(mask, (), K[cell]['code'], bed)}
            keyof = {}
            for (axis, pos), _ in FACE_KEYS:                 # plate dir → cube face key
                nvec = np.zeros(3); nvec[axis] = 1 if pos else -1
                from kit_cubes import FLAT_ROT
                rr = FLAT_ROT[bed]
                rot = np.asarray(rr)[:3, :3] if rr is not None else np.eye(3)
                keyof[tuple(int(round(v)) for v in rot @ nvec)] = (axis, pos)
            up = poles.get((0, 0, 1)) if keyof.get((0, 0, 1)) in shown else None
            ax.add_patch(Circle((x0 + 6, y0 + 5.2), 2.3, fc=COL[up], ec='#1c1c1a', lw=0.5))
            ax.text(x0 + 6, y0 + 5.2, up or '平', ha='center', va='center', fontsize=7 if up else 5,
                    family='monospace', fontweight='bold' if up else 'normal', color='#ffffff' if up else '#6d6a62')
            for w, (ex, ey) in EDGE.items():
                p_ = poles.get(w) if keyof.get(w) in shown else None
                if p_:
                    ax.add_patch(Rectangle((x0 + ex - 1.1, y0 + ey - 1.1), 2.2, 2.2, fc=COL[p_], ec='#1c1c1a', lw=0.4))
                    ax.text(x0 + ex, y0 + ey, p_, ha='center', va='center', fontsize=5.2, family='monospace', color='#ffffff')
            ax.text(x0 + 1.0, y0 + 10.5, lab, ha='left', va='center', fontsize=6.6, family='monospace',
                    fontweight='bold', color='#1c1c1a')
            ax.text(x0 + 11.0, y0 + 10.5, kind if kind[0] in 'TL' else kind[2:], ha='right', va='center',
                    fontsize=4.6, family='monospace', color='#1c1c1a')
            ax.text(x0 + 6, y0 + 1.2, note.split(' · ')[0][:10], ha='center', va='center', fontsize=3.6,
                    family='monospace', color='#6d6a62')
        for gx in range(GRID):
            ax.text(gx * PITCH + 6, -5, str(gx + 1), ha='center', va='center', fontsize=7, color='#8a8880')
        for gy in range(nrows):
            ax.text(-7, gy * PITCH + 6, f'行{gy + 1}', ha='center', va='center', fontsize=7, color='#8a8880')
        ax.set_xlim(-14, GRID * PITCH + 4); ax.set_ylim(-13, nrows * PITCH + 2); ax.set_aspect('equal')
        ax.set_title(f'{stem}.stl · 耗材 {nos[ci]}号 {names[ci]} · {len(pcs)} 件 · 重打件(替换同序号的方块)\n'
                     '粗体=拼装序号 · 右上=件名(Tlid=触摸盖 Tbody=触摸身 LA/LB=线槽上下半)· 圆/边块=该件上的磁铁袋极性 · 红N 蓝S',
                     fontsize=10, family='monospace')
        fig.savefig(f'{out}/{stem}_sheet.png', dpi=140, facecolor='#f6f5f0', bbox_inches='tight')
        plt.close(fig)
        lines.append(f'{stem}.stl  {nos[ci]}号 {names[ci]} · {len(pcs)} 件: ' +
                     ' '.join(f"{lab}{kind if kind[0] in 'TL' else ''}" for _, kind, lab, *_ in pcs))
    lines += [''] + notes
    open(f'{out}/fix_manifest.txt', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    prev = sys.argv[sys.argv.index('--prev') + 1] if '--prev' in sys.argv else None
    main(args[0], args[1], args[2], prev)
