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

The eye-patch 3×3 footprint is EXCLUDED (printed via eye_patch_kit);
mic/vent cells are listed for manual hole_cube substitution.

Usage: python3 hardware/kit_cubes.py <base> [out_dir]   (expects <base>.json)
Writes out_dir/cube_<mask>.stl, out_dir/variant_bill.txt, out_dir/variant_map.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brick_lib import mosaic_cube

FACE_KEYS = [((0, True), '+x/右'), ((0, False), '-x/左'),
             ((1, True), '+z/前'), ((1, False), '-z/后'),
             ((2, True), '+y/上'), ((2, False), '-y/下')]
DIRS = {(0, True): (1, 0, 0), (0, False): (-1, 0, 0),
        (1, True): (0, 0, 1), (1, False): (0, 0, -1),
        (2, True): (0, 1, 0), (2, False): (0, -1, 0)}


def main(base, out_dir):
    meta = json.load(open(base + '.json'))
    a = meta['anchor']
    rows = a['rows']
    Z = meta['dims'][2]

    vc0 = a.get('voidC0', a['coreC0'] + 1)
    vr0, vr1 = a['eyeRow'] - 2, a['eyeRow'] + 4
    void = lambda x, r, z: (vc0 <= x < vc0 + 6) and (vr0 <= r <= vr1) and 0 < z < Z - 1

    kit = set()
    for x, y, z, *_ in meta['voxels']:
        if not void(x, rows - 1 - y, z):
            kit.add((x, y, z))

    # eye-patch 3×3 footprint on the front layer (printed separately)
    zf = Z - 1
    er = a['eyeRow']
    ep_c0 = a['L0'] + 1                       # patch centred on the eye pair
    patch = {(c, rows - 1 - r, zf) for c in range(ep_c0, ep_c0 + 3)
             for r in range(er - 1, er + 2)}
    # mic / vents (manual hole_cube substitution)
    tcx = vc0 + 3
    special = {(tcx, rows - 1 - (er + 2), zf): 'M-mic',
               (tcx - 1, rows - 1 - (er + 4), 0): 'V-vent',
               (tcx + 1, rows - 1 - (er + 4), 0): 'V-vent'}

    variants, vmap = {}, {}
    for (x, y, z) in sorted(kit):
        if (x, y, z) in patch:
            vmap[f'{x},{y},{z}'] = 'EYEPATCH'
            continue
        mask = tuple(sorted(
            key for key, _ in FACE_KEYS
            if ((x + DIRS[key][0], y + DIRS[key][1], z + DIRS[key][2]) in kit
                and (x + DIRS[key][0], y + DIRS[key][1], z + DIRS[key][2]) not in patch)))
        code = ''.join(f'{a_}{"p" if s else "n"}' for a_, s in mask) or 'loose'
        variants.setdefault(code, {'mask': mask, 'count': 0})['count'] += 1
        tag = special.get((x, y, z))
        vmap[f'{x},{y},{z}'] = f'{code}{"·" + tag if tag else ""}'

    os.makedirs(out_dir, exist_ok=True)
    lines = [f'{meta["name"]} — exposure-aware cube bill',
             f'kit cubes {len(kit)} · eyepatch cells {sum(1 for v in vmap.values() if v == "EYEPATCH")}'
             f' · variants {len(variants)}', '']
    for code, v in sorted(variants.items(), key=lambda kv: -kv[1]['count']):
        m = mosaic_cube(faces=list(v['mask']))
        assert m.is_watertight, code
        m.export(f'{out_dir}/cube_{code}.stl')
        names = [n for k, n in FACE_KEYS if k in v['mask']]
        flat = [n for k, n in FACE_KEYS if k not in v['mask']]
        lines.append(f'cube_{code:14s} × {v["count"]:3d}   '
                     f'耦合面: {" ".join(names) or "—"}   全平面: {" ".join(flat) or "—"}')
    lines += ['', 'substitutions: ' + ', '.join(
        f'{k[0]},{k[1]},{k[2]} → {t}' for k, t in special.items() if k in kit)]
    open(f'{out_dir}/variant_bill.txt', 'w').write('\n'.join(lines) + '\n')
    json.dump(vmap, open(f'{out_dir}/variant_map.json', 'w'), indent=0)
    print('\n'.join(lines[:3 + min(len(variants), 40)]))
    print(f'→ {len(variants)} variant STLs in {out_dir}')


if __name__ == '__main__':
    base = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(base) or '.'
    main(base, out)
