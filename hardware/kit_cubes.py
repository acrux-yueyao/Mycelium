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
    patch = {(c, rows - 1 - r, fzall.get((c, rows - 1 - r), zf))
             for c in range(ep_c0, ep_c0 + 3)
             for r in range(er - 1, er + 2)}
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
    for c in sorted(c for c in kit if all(n in kit for n in nb6(c))):
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

    # 颜色量化(与 kit_sheet 同思路,≤8 色 → 每盘一种耗材)
    hexes = {}
    for x, y, z, hx, *_ in meta['voxels']:
        hexes[(x, y, z)] = hx
    import numpy as _np
    kcols = [hexes.get(c, '#b0aca0') for c in sorted(kit)]
    rgbs = _np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
                      for h in kcols], float)
    uq = _np.unique(rgbs, axis=0)
    kq = min(8, len(uq))
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
    for (x, y, z) in sorted(kit):
        if (x, y, z) in patch:
            vmap[f'{x},{y},{z}'] = 'EYEPATCH'
            continue
        # 眼件外侧面带标准耦合,邻居照常算耦合面
        mask = tuple(sorted(
            key for key, _ in FACE_KEYS
            if (x + DIRS[key][0], y + DIRS[key][1], z + DIRS[key][2]) in kit))
        code = 'C-%02X' % sum(1 << FACE_BIT[k] for k in mask)
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
        m = mosaic_cube(faces=list(v['mask']))
        assert m.is_watertight, code
        m, orient = orient_flat_down(m, set(v['mask']))
        m.export(f'{out_dir}/{code}.stl')
        names = [n for k, n in FACE_KEYS if k in v['mask']]
        flat = [n for k, n in FACE_KEYS if k not in v['mask']]
        lines.append(f'{code:6s} × {v["count"]:3d}   {orient:14s} '
                     f'耦合面: {" ".join(names) or "—"}   全平面: {" ".join(flat) or "—"}')
    lines += ['', 'substitutions: ' + ', '.join(
        f'{k[0]},{k[1]},{k[2]} → {t}' for k, t in special.items() if k in kit)]
    open(f'{out_dir}/variant_bill.txt', 'w').write('\n'.join(lines) + '\n')
    json.dump(vmap, open(f'{out_dir}/variant_map.json', 'w'), indent=0)
    json.dump({'colors': plate_colors, 'cells': percube},
              open(f'{out_dir}/kit_manifest.json', 'w'), indent=0)
    print('\n'.join(lines[:3 + min(len(variants), 40)]))
    print(f'→ {len(variants)} variant STLs in {out_dir}')


if __name__ == '__main__':
    base = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(base) or '.'
    main(base, out)
