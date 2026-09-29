#!/usr/bin/env python3
"""
Exposure-aware cube generator — rule ③ of the mosaic coupling system.

Takes a --companion voxel dump (spore3d) and, for every cube of the kit,
computes which of its six faces touch a neighbour. Only those faces get
the coupling (magnet pocket + pin/dimple); every exposed face — outside
surface, tabletop bottom, core-cavity wall — prints completely flat.

Because all cubes assemble in ONE orientation (dual-magnet polarity), a
variant cannot be rotated into another: each distinct face-mask becomes
its own STL. In practice a body needs a few dozen variants, so output is
one STL per mask + a bill (variant → count) + a position map.

Axis mapping (voxel dump → cube local):
  voxel x (width)  → cube axis 0
  voxel z (depth)  → cube axis 1
  voxel y (height) → cube axis 2   (y=0 is the bottom layer)

Core zone is 7 cols wide (MC02 backplane, cavity 5×6).
The eye-patch 3×3 footprint is EXCLUDED (printed via eye_patch_kit);
mic/vent cells are listed for manual hole_cube substitution.

PRINT ORIENTATION: each variant STL is rotated so one FLAT (exposed)
face sits on the bed. Exposed faces carry no pockets, so elephant foot
near the heated plate can never squeeze a magnet pocket — and on a
textured PEI sheet the show face picks up the nice matte texture for
free. Pockets end up only on top (truest) and side walls. Preference:
front/back flat faces first (the plate-like majority), then bottom/top,
then left/right. A fully-coupled interior cube has no flat face and is
flagged in the bill — ream its bed-side pocket or print it last.

Usage: python3 hardware/kit_cubes.py <base> [out_dir]   (expects <base>.json)
Writes out_dir/cube_<mask>.stl, out_dir/variant_bill.txt, out_dir/variant_map.json
"""
import json
import os
import sys

import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix as RM, translation_matrix as TM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import mosaic_cube

FACE_KEYS = [((0, True), '+x/右'), ((0, False), '-x/左'),
             ((1, True), '+z/前'), ((1, False), '-z/后'),
             ((2, True), '+y/上'), ((2, False), '-y/下')]
# 变体号:六个面按 右左前后上下 占 bit5..bit0,拼成两位十六进制。
# 例:六面全耦合 = C-3F;只右左上下 = C-33;单前面 = C-08。
FACE_BIT = {k: 5 - i for i, (k, _) in enumerate(FACE_KEYS)}
DIRS = {(0, True): (1, 0, 0), (0, False): (-1, 0, 0),
        (1, True): (0, 0, 1), (1, False): (0, 0, -1),
        (2, True): (0, 1, 0), (2, False): (0, -1, 0)}

# 极性总规则:全机磁铁 N 极统一指向 左/下/后 → −面 N 朝外,+面 S 朝外
POLE = lambda positive: 'S' if positive else 'N'


def load_filaments():
    """Owned spools from hardware/filaments.json (None if missing)."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'filaments.json')
    if not os.path.exists(p):
        return None
    return [f for f in json.load(open(p))['filaments'] if f.get('owned')]


def _lab(hexcol):
    """sRGB hex → CIELAB (D65), for perceptual nearest-colour snapping."""
    c = [int(hexcol[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]
    x = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047
    y = (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722)
    z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))

# ---- 耦合面刻字:极性字母 + 变体号,0.4 深,占销钉对角线之外的两个空角 ----
ENG_DEPTH = 0.55
_glyphs = {}


def _text_slab(s, size):
    """2D text → thin extruded cutter, centred at origin, z ∈ [0, d+0.1]."""
    key = (s, size)
    if key not in _glyphs:
        from matplotlib.textpath import TextPath
        from matplotlib.font_manager import FontProperties
        import shapely.geometry as sg
        from shapely.affinity import translate as sh_tr
        from trimesh.creation import extrude_polygon
        tp = TextPath((0, 0), s, size=size,
                      prop=FontProperties(family='DejaVu Sans', weight='bold'))
        merged = None
        for p in tp.to_polygons():
            if len(p) < 3:
                continue
            poly = sg.Polygon(p)
            merged = poly if merged is None else merged.symmetric_difference(poly)
        x0, y0, x1, y1 = merged.bounds
        merged = sh_tr(merged, -(x0 + x1) / 2, -(y0 + y1) / 2)
        geoms = merged.geoms if hasattr(merged, 'geoms') else [merged]
        _glyphs[key] = trimesh.util.concatenate(
            [extrude_polygon(g, ENG_DEPTH + 0.1) for g in geoms if g.area > 0])
    return _glyphs[key].copy()


_ENG_ROT = {(2, True): None,
            (2, False): RM(np.pi, [1, 0, 0]),
            (0, True): RM(np.pi / 2, [0, 1, 0]),
            (0, False): RM(-np.pi / 2, [0, 1, 0]),
            (1, True): RM(-np.pi / 2, [1, 0, 0]),
            (1, False): RM(np.pi / 2, [1, 0, 0])}
_INPLANE = {0: (1, 2), 1: (0, 2), 2: (0, 1)}
_OFF = 3.5                      # brick_lib pin/dimple diagonal offset


# function cubes: W = ToF window, M = mic hole (bores along the depth
# axis, local 1); U = USB-C plug slot, G = speaker grille (vertical,
# local 2 - these lose their top/bottom magnet pockets).
FUNC_VERTICAL = ('U', 'G')


def _function_cut(kind, pitch=12.0):
    from trimesh.creation import box, cylinder
    h = pitch / 2
    if kind in ('W', 'M'):
        r = 3.0 if kind == 'W' else 1.25
        c = cylinder(radius=r, height=pitch + 4, sections=32)
        c.apply_transform(RM(np.pi / 2, [1, 0, 0]))
        c.apply_transform(TM([h, h, h]))
        return [c]
    if kind == 'U':
        return [box(extents=[10.0, 6.0, pitch + 4], transform=TM([h, h, h]))]
    if kind == 'G':
        out = []
        for gx in (3.0, 6.0, 9.0):
            for gy in (3.5, 6.0, 8.5):
                c = cylinder(radius=0.6, height=pitch + 4, sections=16)
                c.apply_transform(TM([gx, gy, h]))
                out.append(c)
        return out
    return []


def variant_mesh(code, mask, pitch=12.0):
    """mosaic_cube + engraving: on every coupled face, the pole letter
    (N/S out) in one free corner and the 2-hex variant code in the other.
    Hidden after assembly; identifies loose cubes. ENGRAVE=0 disables.
    Codes prefixed W/M/U/G are function cubes and get their bore cut."""
    m = mosaic_cube(faces=list(mask))
    if code[0] in 'WMUG':
        m = trimesh.boolean.difference([m] + _function_cut(code[0], pitch))
    import os as _os
    if _os.environ.get('ENGRAVE', '1') == '0':
        return m
    h = pitch / 2
    cuts = []
    for axis, pos in mask:
        for s, (u, v), size in ((POLE(pos), (-_OFF, _OFF), 4.2),
                                (code[2:], (_OFF, -_OFF), 3.2)):
            slab = _text_slab(s, size)
            slab.apply_transform(TM([0, 0, -ENG_DEPTH]))
            r = _ENG_ROT[(axis, pos)]
            if r is not None:
                slab.apply_transform(r)
            t = [0.0, 0.0, 0.0]
            t[axis] = pitch if pos else 0.0
            ia, ib = _INPLANE[axis]
            t[ia] += h + u
            t[ib] += h + v
            slab.apply_transform(TM(t))
            cuts.append(slab)
    if cuts:
        m = trimesh.boolean.difference([m] + cuts)
    return m


def cell_mesh(code, mask, eye=None):
    """Geometry for one kit cube: eye frame piece, or a variant cube."""
    if eye:
        from brick_lib import eye_frame_piece
        return eye_frame_piece(tuple(eye['pocket']), [tuple(k) for k in eye['std']],
                               [tuple(k) for k in eye['seam']])
    return variant_mesh(code, mask)


def orient_mask(mask, eye=None):
    """Faces that must NOT land on the bed (coupled, or the pocket side)."""
    if eye:
        return {tuple(k) for k in eye['orient']}
    return {tuple(k) for k in mask}


# 平面朝下的优先级(前后 → 下上 → 左右)与对应的放倒旋转
FLAT_PREF = [(1, True), (1, False), (2, False), (2, True), (0, False), (0, True)]
FLAT_ROT = {(1, True):  RM(-np.pi/2, [1, 0, 0]),   # 前面(+y)贴床
            (1, False): RM(+np.pi/2, [1, 0, 0]),   # 后面(-y)贴床
            (2, False): None,                       # 底面本来就贴床
            (2, True):  RM(np.pi, [1, 0, 0]),      # 顶面翻下去
            (0, False): RM(-np.pi/2, [0, 1, 0]),   # 左面贴床
            (0, True):  RM(+np.pi/2, [0, 1, 0])}   # 右面贴床


def orient_flat_down(m, mask):
    """把一个没有耦合特征的外露面转到床面,返回 (mesh, 说明)."""
    for key in FLAT_PREF:
        if key not in mask:
            r = FLAT_ROT[key]
            if r is not None:
                m = m.copy()
                m.apply_transform(r)
            lo = m.bounds[0]
            m.apply_transform(TM([-lo[0], -lo[1], -lo[2]]))
            name = dict(FACE_KEYS)[key]
            return m, f'贴床面 {name}'
    lo = m.bounds[0]
    m = m.copy(); m.apply_transform(TM([-lo[0], -lo[1], -lo[2]]))
    return m, '⚠ 六面全耦合,床面磁袋需手工扩孔'


def main(base, out_dir):
    meta = json.load(open(base + '.json'))
    a = meta['anchor']
    rows = a['rows']
    Z = meta['dims'][2]

    zone = meta.get('zone')
    if zone:
        # sculpt 管线:舱区内格(5×6)在"皮面平面"之后的体素 = MC02 腔,挖除。
        # 皮面平面 = 舱背板前 3 格(Zb=12/MIDb=5 → 引擎 z=7):
        # 皮面统一共面(横向必然连通),皮前方的鼓包保留(踩在皮上)。
        SKIN_Z = Z - 1 - 4                     # bench MIDb-1=4 → 引擎 z=7
        tx, ty = zone['tx'], zone['ty']
        inner = lambda x, yb: tx + 1 <= x <= tx + 5 and ty + 1 <= yb <= ty + 6
        kit = set()
        for x, y, z, *_ in meta['voxels']:
            if inner(x, y) and z < SKIN_Z:
                continue
            kit.add((x, y, z))
    else:
        vc0 = a.get('voidC0', a['coreC0'] + 1)
        vr0, vr1 = a['eyeRow'] - 2, a['eyeRow'] + 4
        void = lambda x, r, z: (vc0 <= x < vc0 + 5) and (vr0 <= r <= vr1) and 0 < z < Z - 1
        kit = set()
        for x, y, z, *_ in meta['voxels']:
            if not void(x, rows - 1 - y, z):
                kit.add((x, y, z))

    if zone:
        vc0 = zone['tx'] + 1                  # 腔起始列(功能块定位用)
    # eye-patch 3×3 footprint — anchored to each cell's FRONT-most voxel
    fzall = {}
    for x, y, z, *_ in meta['voxels']:
        fzall[(x, y)] = max(fzall.get((x, y), -1), z)
    zf = Z - 1
    er = a['eyeRow']
    ep_c0 = a['L0'] + 1                       # patch centred on the eye pair
    patch_xy = {(c, rows - 1 - r) for c in range(ep_c0, ep_c0 + 3)
                for r in range(er - 1, er + 2)}
    added = set()
    eye_frame = {}          # (x,y,z) -> {'side','pocket'} for zone builds
    eye_socket = set()      # (x,y) of the empty 2x1 socket cells
    if zone:
        # two screens, one per eye, at the drawn eyes (GME12864-11 viewing
        # area 23.7x12.9 = one 2x1-cell eye). Socket cells stay empty (the
        # glass is the eye); the 4x3 ring around each on the skin plane
        # carries a shared pocket from behind. Only the socket columns are
        # cleared in front; bulges on the frame stay.
        from brick_lib import EYE_MODULE
        ye = rows - 1 - er
        patch = set()
        patch_xy = set()
        for side, e0 in (('L', a['L0']), ('R', a['R0'])):
            cx, cy = (e0 + 1) * 12.0, (ye + 0.5) * 12.0      # socket centre (mm)
            px0, px1 = cx - EYE_MODULE[0] / 2, cx + EYE_MODULE[0] / 2
            py0, py1 = cy - EYE_MODULE[1] / 2, cy + EYE_MODULE[1] / 2
            for x in range(e0 - 1, e0 + 3):
                for y in range(ye - 1, ye + 2):
                    patch_xy.add((x, y))
                    if y == ye and x in (e0, e0 + 1):
                        eye_socket.add((x, y))
                        continue
                    eye_frame[(x, y, SKIN_Z)] = {
                        'side': side, 'i': x - (e0 - 1), 'j': y - (ye - 1),
                        'pocket': [px0 - x * 12, px1 - x * 12, py0 - y * 12, py1 - y * 12]}
        kit = {k for k in kit if not ((k[0], k[1]) in eye_socket and k[2] >= SKIN_Z)}
        for k in eye_frame:
            if k not in kit:
                kit.add(k); added.add(k)
        # close skin holes over the cavity: a missing skin cube leaves the
        # bulge in front of it hanging and opens the cavity to the face
        for x in range(tx + 1, tx + 6):
            for y in range(ty + 1, ty + 7):
                if (x, y) not in eye_socket and (x, y, SKIN_Z) not in kit:
                    kit.add((x, y, SKIN_Z)); added.add((x, y, SKIN_Z))
    else:
        patch = {(c, y, fzall.get((c, y), zf)) for c, y in patch_xy}
    # mic / vents (manual hole_cube substitution)
    tcx = vc0 + 3
    special = {(tcx, rows - 1 - (er + 2), zf): 'M-mic',
               (tcx - 1, rows - 1 - (er + 4), 0): 'V-vent',
               (tcx + 1, rows - 1 - (er + 4), 0): 'V-vent'}

    # 安全掏空:埋没块(六邻居全实)逐个尝试移除,
    # 只有当每个邻居移除后仍有 ≥1 个其他面接触时才真移除;
    # 最后整体 BFS 验证连通,不连通的方案直接放弃该次移除。
    nb6 = lambda c: [(c[0] + d[0], c[1] + d[1], c[2] + d[2]) for d in DIRS.values()]

    # 先剔孤块(眼件背后等只邻拼件的格):不可拼装,入另册
    strays = set()
    if kit:
        # 反复取最大连通域
        comps = []
        rest = set(kit)
        while rest:
            s0, st = set(), [next(iter(sorted(rest)))]
            while st:
                c = st.pop()
                if c in s0 or c not in rest:
                    continue
                s0.add(c)
                st.extend(n for n in nb6(c) if n in rest)
            comps.append(s0)
            rest -= s0
        comps.sort(key=len, reverse=True)
        # 含眼件占位格的小连通域不算孤块(拼件靠缝耦合物理连接)
        strays = set()
        for comp in comps[1:]:
            if comp & patch:
                continue
            strays |= comp
        kit -= strays

    # 掏空判定:移除后,它的所有原邻居必须仍互相可达(局部 BFS)
    def still_linked(nbrs):
        if len(nbrs) <= 1:
            return True
        target = set(nbrs)
        seen, stack = set(), [nbrs[0]]
        while stack and not target <= seen:
            c = stack.pop()
            if c in seen or c not in kit:
                continue
            seen.add(c)
            stack.extend(n for n in nb6(c) if n in kit)
        return target <= seen

    removed = set()
    for c in sorted(c for c in kit if c not in eye_frame and all(n in kit for n in nb6(c))):
        kit.discard(c)
        nbrs = [n for n in nb6(c) if n in kit]
        if still_linked(nbrs):
            removed.add(c)
        else:
            kit.add(c)
    buried = removed
    # 终检:零邻居的幸存孤块也入另册
    zero = {c for c in kit if not any(n in kit for n in nb6(c))}
    kit -= zero
    strays |= zero

    if zone:
        special.clear()                       # legacy anchors don't apply
        # no cube may be placed into thin air: give every hanging island
        # the shortest support chain straight down or straight back
        from seq_plates import build_order
        for _ in range(40):
            cells = [{'x': k[0], 'y': k[1], 'z': k[2]} for k in kit | patch]
            _, hang = build_order(cells)
            if not hang:
                break
            k, best = hang[0], None
            for dy, dz in ((-1, 0), (0, -1)):
                chain, q = [], (k[0], k[1] + dy, k[2] + dz)
                while q[1] >= 0 and q[2] >= 0 and q not in kit and q not in patch and len(chain) < 6:
                    chain.append(q); q = (q[0], q[1] + dy, q[2] + dz)
                if (q in kit or q in patch) and (best is None or len(chain) < len(best)):
                    best = chain
            if best is None:
                kit.discard(k); strays.add(k)
            else:
                kit.update(best); added.update(best)
        # front function cubes on exposed skin cells: ToF window + mic hole
        front_of = {}
        for k in kit | patch:
            front_of[(k[0], k[1])] = max(front_of.get((k[0], k[1]), -1), k[2])
        exposed = sorted((x, y) for x in range(tx + 1, tx + 6) for y in range(ty + 1, ty + 7)
                         if (x, y) not in patch_xy and front_of.get((x, y)) == SKIN_Z)
        pcx = sum(x for x, _ in patch_xy) / max(1, len(patch_xy))
        pby = min(y for _, y in patch_xy)
        if exposed:
            w = min(exposed, key=lambda c: (abs(c[0] - pcx) + abs(c[1] - (pby - 1)), c))
            special[(w[0], w[1], SKIN_Z)] = 'W'
            rest = [c for c in exposed if c != w]
            if rest:
                m = min(rest, key=lambda c: (abs(c[0] - pcx) + abs(c[1] - (pby - 3)), c))
                special[(m[0], m[1], SKIN_Z)] = 'M'
        # bottom wall: speaker grille (left) and USB-C slot (right), one
        # cube behind the skin; the cloud cube under each is bored too so
        # sound / the plug reach the dock below
        zc = SKIN_Z - 1
        for tag, x in (('G', tx + 1), ('U', tx + 4)):
            for y in (ty, ty - 1):
                if (x, y, zc) in kit:
                    special[(x, y, zc)] = tag

    # 颜色量化(与 kit_sheet 同思路,≤8 色 → 每盘一种耗材)
    hexes = {}
    for x, y, z, hx, *_ in meta['voxels']:
        hexes[(x, y, z)] = hx
    # added support / skin cubes borrow the colour of the nearest original
    # voxel (same column first, then any neighbour) - they are hidden or
    # sit flush with the skin, so they should read as the body around them
    for k in sorted(added):
        col = [(abs(z - k[2]), h) for (x, y, z), h in hexes.items()
               if x == k[0] and y == k[1]]
        if not col:
            col = [(abs(x - k[0]) + abs(y - k[1]) + abs(z - k[2]), h)
                   for (x, y, z), h in hexes.items()]
        hexes[k] = min(col)[1]
    import numpy as _np
    kcols = [hexes.get(c, '#b0aca0') for c in sorted(kit)]
    rgbs = _np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
                      for h in kcols], float)
    import os as _os
    n_colors = int(_os.environ.get('KIT_COLORS', '8'))
    palette_mode = _os.environ.get('KIT_PALETTE', 'filaments')
    color_names = None
    fil = load_filaments() if palette_mode == 'filaments' else None
    if fil:
        # snap every cube to the nearest OWNED filament (CIELAB distance);
        # KIT_COLORS then keeps only the N most-used filaments and re-snaps,
        # so the kit never asks for a spool you don't have.
        flab = _np.array([_lab(f['hex']) for f in fil])
        clab = _np.array([_lab(h) for h in kcols])
        d = ((clab[:, None] - flab[None]) ** 2).sum(2)
        # designer overrides: <base>.filmap.json maps a source colour to a
        # chosen spool id — for in-between hues no owned spool matches
        fm_path = base + '.filmap.json'
        if os.path.exists(fm_path):
            fmap = {k.lower(): v for k, v in json.load(open(fm_path)).items()}
            fidx = {f['id']: i for i, f in enumerate(fil)}
            for row, h in enumerate(kcols):
                fid = fmap.get(h.lower())
                if fid in fidx:
                    d[row, :] = 1e9
                    d[row, fidx[fid]] = 0
        lb = d.argmin(1)
        use = _np.bincount(lb, minlength=len(fil))
        keep = [i for i in _np.argsort(-use) if use[i] > 0][:n_colors]
        d2 = d[:, keep]
        lb = d2.argmin(1)
        plate_colors = [fil[i]['hex'] for i in keep]
        color_names = [f"{fil[i]['zh']} {fil[i]['en']}" for i in keep]
    else:
        uq = _np.unique(rgbs, axis=0)
        kq = min(n_colors, len(uq))
        cent = uq[_np.linspace(0, len(uq) - 1, kq).astype(int)].copy()
        for _ in range(12):
            dd = ((rgbs[:, None] - cent[None]) ** 2).sum(2)
            lb = dd.argmin(1)
            for i_ in range(kq):
                if (lb == i_).any():
                    cent[i_] = rgbs[lb == i_].mean(0)
        dd = ((rgbs[:, None] - cent[None]) ** 2).sum(2)
        lb = dd.argmin(1)
        plate_colors = ['#%02x%02x%02x' % tuple(int(v) for v in c) for c in cent]
    ci_of = {c: int(l) for c, l in zip(sorted(kit), lb)}

    percube = []
    variants, vmap = {}, {}
    for k in patch:
        vmap[f'{k[0]},{k[1]},{k[2]}'] = 'EYEPATCH'
    solid = kit | patch

    def pocket_hits(pk, key):
        x0, x1, y0, y1 = pk
        xo = x0 < 12 - 1e-6 and x1 > 1e-6
        yo = y0 < 12 - 1e-6 and y1 > 1e-6
        axis, pos = key
        if axis == 0:
            return yo and (x1 >= 12 - 1e-6 if pos else x0 <= 1e-6)
        if axis == 2:
            return xo and (y1 >= 12 - 1e-6 if pos else y0 <= 1e-6)
        return (not pos) and xo and yo               # rear face only

    def eye_faces(k):
        """(std, seam) coupled faces of an eye frame cube."""
        ef = eye_frame[k]
        std, seam = [], []
        for key, _ in FACE_KEYS:
            n = (k[0] + DIRS[key][0], k[1] + DIRS[key][1], k[2] + DIRS[key][2])
            if n not in solid:
                continue
            if pocket_hits(ef['pocket'], key):
                if n in eye_frame and eye_frame[n]['side'] == ef['side']:
                    seam.append(key)
            else:
                std.append(key)
        return std, seam

    def blocked_from(n, key_toward_k):
        """True if the eye frame cube n refuses coupling on the face that
        points back at us (pocket crosses it)."""
        opp = (key_toward_k[0], not key_toward_k[1])
        return n in eye_frame and pocket_hits(eye_frame[n]['pocket'], opp)

    for (x, y, z) in sorted(kit):
        if (x, y, z) in patch:
            vmap[f'{x},{y},{z}'] = 'EYEPATCH'
            continue
        if (x, y, z) in eye_frame:
            ef = eye_frame[(x, y, z)]
            std, seam = eye_faces((x, y, z))
            mask = tuple(sorted(std + seam))
            code = f"E-{ef['side']}{ef['i']}{ef['j']}"
            orient = set(mask)          # a pocketed rear still prints fine face-down
            variants.setdefault(code, {'mask': mask, 'count': 0, 'eye': {
                'pocket': ef['pocket'], 'std': [list(k) for k in std],
                'seam': [list(k) for k in seam], 'orient': [list(k) for k in sorted(orient)]}})['count'] += 1
            vmap[f'{x},{y},{z}'] = code
            percube.append({'x': x, 'y': y, 'z': z, 'code': code, 'mask': [list(k) for k in mask],
                            'ci': ci_of[(x, y, z)], 'tag': 'eye',
                            'eye': variants[code]['eye']})
            continue
        # 眼件外侧面带标准耦合,邻居照常算耦合面
        mask = tuple(sorted(
            key for key, _ in FACE_KEYS
            if (x + DIRS[key][0], y + DIRS[key][1], z + DIRS[key][2]) in solid
            and not blocked_from((x + DIRS[key][0], y + DIRS[key][1], z + DIRS[key][2]), key)))
        tag0 = special.get((x, y, z))
        if tag0 in FUNC_VERTICAL:
            # vertical bore through the cube: no magnet pocket on top/bottom
            mask = tuple(k for k in mask if k[0] != 2)
        code = ('C-%02X' if not tag0 else f'{tag0[0]}-%02X') % sum(1 << FACE_BIT[k] for k in mask)
        variants.setdefault(code, {'mask': mask, 'count': 0})['count'] += 1
        tag = special.get((x, y, z))
        vmap[f'{x},{y},{z}'] = f'{code}{"·" + tag if tag else ""}'
        percube.append({'x': x, 'y': y, 'z': z, 'code': code,
                        'mask': [list(k) for k in mask],
                        'ci': ci_of[(x, y, z)], 'tag': tag})

    os.makedirs(out_dir, exist_ok=True)
    lines = [f'{meta["name"]} — exposure-aware cube bill',
             f'kit cubes {len(kit)} · hollowed {len(buried)} · strays dropped {len(strays)} · '
             f'eyepatch cells {sum(1 for v in vmap.values() if v == "EYEPATCH")}'
             f' · variants {len(variants)}', '']
    for code, v in sorted(variants.items(), key=lambda kv: -kv[1]['count']):
        m = cell_mesh(code, v['mask'], v.get('eye'))
        assert m.is_watertight, code
        m, orient = orient_flat_down(m, orient_mask(v['mask'], v.get('eye')))
        m.export(f'{out_dir}/{code}.stl')
        names = [n for k, n in FACE_KEYS if k in v['mask']]
        flat = [n for k, n in FACE_KEYS if k not in v['mask']]
        lines.append(f'{code:6s} × {v["count"]:3d}   {orient:14s} '
                     f'耦合面: {" ".join(names) or "—"}   全平面: {" ".join(flat) or "—"}')
    lines += ['', 'substitutions: ' + ', '.join(
        f'{k[0]},{k[1]},{k[2]} → {t}' for k, t in special.items() if k in kit)]
    open(f'{out_dir}/variant_bill.txt', 'w').write('\n'.join(lines) + '\n')
    json.dump(vmap, open(f'{out_dir}/variant_map.json', 'w'), indent=0)
    json.dump({'colors': plate_colors, 'color_names': color_names, 'cells': percube},
              open(f'{out_dir}/kit_manifest.json', 'w'), indent=0)
    print('\n'.join(lines[:3 + min(len(variants), 40)]))
    print(f'→ {len(variants)} variant STLs in {out_dir}')


if __name__ == '__main__':
    base = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(base) or '.'
    main(base, out)
